/** ServiceBridge — expose service operations as IM commands. */

import type { ChannelManager } from "./manager.js";
import type { UnifiedMessage } from "./types.js";
import { CommandMiddleware } from "./middleware.js";
import { ContentType } from "./types.js";

export type CommandHandler = (args: string[], msg?: UnifiedMessage) => Promise<string> | string;

interface CommandEntry {
  name: string;
  handler: CommandHandler;
  description: string;
}

/**
 * Parse simple --flag and --key=value from args.
 * Returns { flags, positional }.
 */
export function parseFlags(args: string[]): { flags: Record<string, string | true>; positional: string[] } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        // Check if next arg is a value (not a flag)
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export class ServiceBridge {
  private commands = new Map<string, CommandEntry>();
  private manager: ChannelManager;
  private prefix: string;

  constructor(manager: ChannelManager, options?: { prefix?: string }) {
    this.manager = manager;
    this.prefix = options?.prefix ?? "/";
  }

  /**
   * Expose a function as a chat command.
   */
  expose(name: string, handler: CommandHandler, options?: { description?: string }): this {
    this.commands.set(name, {
      name,
      handler,
      description: options?.description ?? "",
    });
    return this;
  }

  /** Register a status check, auto-mapped to /status */
  exposeStatus(handler: () => Promise<string> | string): this {
    this.commands.set("status", {
      name: "status",
      handler: async () => handler(),
      description: "Show service status",
    });
    return this;
  }

  /** Register log viewer, auto-mapped to /logs */
  exposeLogs(handler: (args: string[]) => Promise<string> | string): this {
    this.commands.set("logs", {
      name: "logs",
      handler: async (args) => handler(args),
      description: "View service logs",
    });
    return this;
  }

  /** Build /help output from registered commands. */
  private buildHelp(): string {
    const lines = ["Available commands:"];
    for (const [name, entry] of this.commands) {
      const desc = entry.description ? ` — ${entry.description}` : "";
      lines.push(`  ${this.prefix}${name}${desc}`);
    }
    lines.push(`  ${this.prefix}help — Show this help message`);
    return lines.join("\n");
  }

  /** Start the bridge — wires commands into the ChannelManager and calls run(). */
  async run(): Promise<void> {
    const cmdMiddleware = new CommandMiddleware();

    // Register /help
    cmdMiddleware.command("help", async () => this.buildHelp());

    // Register all exposed commands with error wrapping
    for (const [name, entry] of this.commands) {
      cmdMiddleware.command(name, async (msg) => {
        try {
          const args = msg.content.args ?? [];
          return await Promise.resolve(entry.handler(args, msg));
        } catch (err) {
          return `Error in ${this.prefix}${name}: ${err instanceof Error ? err.message : String(err)}`;
        }
      });
    }

    this.manager.addMiddleware(cmdMiddleware);

    // If no explicit onMessage handler, add a default that shows help hint
    this.manager.onMessage(async () => {
      return `Unknown command. Type ${this.prefix}help for available commands.`;
    });

    await this.manager.run();
  }

  /** Get the list of registered command names (for testing). */
  get registeredCommands(): string[] {
    return [...this.commands.keys()];
  }
}
