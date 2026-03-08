/** Middleware layer — shared logic that channels don't re-implement. */

import type { OutboundMessage, UnifiedMessage } from "./types.js";

export type HandlerResult = string | OutboundMessage | null | undefined;
export type Handler = (msg: UnifiedMessage) => Promise<HandlerResult>;

export interface Middleware {
  process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult>;
}

/** Gate messages by sender allowlist. */
export class AccessMiddleware implements Middleware {
  private allowedUserIds: Set<string> | null;

  constructor(allowedUserIds?: Iterable<string>) {
    this.allowedUserIds = allowedUserIds ? new Set(allowedUserIds) : null;
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    if (this.allowedUserIds && !this.allowedUserIds.has(msg.sender.id)) {
      return null; // silently drop
    }
    return next(msg);
  }
}

/** Route /commands to registered handlers. */
export class CommandMiddleware implements Middleware {
  private commands = new Map<string, (msg: UnifiedMessage) => Promise<HandlerResult>>();

  /** Decorator-style: register a command handler. */
  command(name: string, handler: (msg: UnifiedMessage) => Promise<HandlerResult>): this {
    this.commands.set(name, handler);
    return this;
  }

  get registeredCommands(): string[] {
    return [...this.commands.keys()];
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    if (msg.content.command && this.commands.has(msg.content.command)) {
      const handler = this.commands.get(msg.content.command)!;
      return handler(msg);
    }
    return next(msg);
  }
}
