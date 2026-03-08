import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceBridge, parseFlags } from "../src/bridge.js";
import { ChannelManager } from "../src/manager.js";
import { ContentType } from "../src/types.js";
import type { ChannelAdapter } from "../src/adapter.js";
import type { UnifiedMessage, OutboundMessage } from "../src/types.js";

function createMockAdapter(channelId: string) {
  let handler: ((msg: UnifiedMessage) => void) | undefined;
  const sentMessages: OutboundMessage[] = [];
  return {
    channelId,
    sentMessages,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessage(h: (msg: UnifiedMessage) => void) { handler = h; },
    send: vi.fn().mockImplementation(async (msg: OutboundMessage) => { sentMessages.push(msg); return `sent-${sentMessages.length}`; }),
    getStatus: vi.fn().mockResolvedValue({ connected: true, channel: channelId }),
    triggerMessage(msg: UnifiedMessage) { handler?.(msg); },
  };
}

function makeMsg(text: string, overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1",
    channel: "test",
    sender: { id: "user1" },
    content: { type: ContentType.TEXT, text },
    timestamp: new Date(),
    chatId: "c1",
    ...overrides,
  };
}

function makeCmdMsg(command: string, args: string[] = [], overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return makeMsg(`/${command} ${args.join(" ")}`.trim(), {
    content: { type: ContentType.COMMAND, text: `/${command}`, command, args },
    ...overrides,
  });
}

describe("ServiceBridge", () => {
  let manager: ChannelManager;
  let adapter: ReturnType<typeof createMockAdapter>;
  let bridge: ServiceBridge;

  beforeEach(() => {
    manager = new ChannelManager();
    adapter = createMockAdapter("test");
    manager.addChannel(adapter);
    bridge = new ServiceBridge(manager);
  });

  it("expose() registers a command and returns this for fluent chaining", () => {
    const result = bridge
      .expose("deploy", async () => "deployed")
      .expose("rollback", async () => "rolled back");
    expect(result).toBe(bridge);
    expect(bridge.registeredCommands).toContain("deploy");
    expect(bridge.registeredCommands).toContain("rollback");
  });

  it("exposeStatus() registers a /status command", () => {
    bridge.exposeStatus(() => "all good");
    expect(bridge.registeredCommands).toContain("status");
  });

  it("exposeLogs() registers a /logs command", () => {
    bridge.exposeLogs((args) => `logs: ${args.join(", ")}`);
    expect(bridge.registeredCommands).toContain("logs");
  });

  it("run() wires commands into manager and triggers /help", async () => {
    bridge.expose("ping", async () => "pong", { description: "Ping test" });

    const runSpy = vi.spyOn(manager, "run").mockResolvedValue(undefined);

    await bridge.run();
    expect(runSpy).toHaveBeenCalled();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("help"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages.length).toBeGreaterThan(0);
    const helpText = adapter.sentMessages[0].text;
    expect(helpText).toContain("Available commands");
    expect(helpText).toContain("/ping");
    expect(helpText).toContain("Ping test");
    expect(helpText).toContain("/help");
  });

  it("exposed command handler receives args and msg", async () => {
    const received: { args: string[]; msg?: UnifiedMessage } = { args: [] };
    bridge.expose("deploy", async (args, msg) => {
      received.args = args;
      received.msg = msg;
      return "ok";
    });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("deploy", ["prod", "--force"]));
    await new Promise((r) => setTimeout(r, 50));

    expect(received.args).toEqual(["prod", "--force"]);
    expect(received.msg?.channel).toBe("test");
    expect(adapter.sentMessages[0].text).toBe("ok");
  });

  it("command handler errors are caught and returned as error messages", async () => {
    bridge.expose("fail", async () => {
      throw new Error("something broke");
    });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("fail"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toContain("Error in /fail");
    expect(adapter.sentMessages[0].text).toContain("something broke");
  });

  it("unknown commands get a help hint from fallback handler", async () => {
    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeMsg("random text"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toContain("Unknown command");
    expect(adapter.sentMessages[0].text).toContain("/help");
  });

  it("sync handlers work (not just async)", async () => {
    bridge.expose("sync-cmd", () => "sync result");

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("sync-cmd"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toBe("sync result");
  });

  it("custom prefix is reflected in help output", async () => {
    const customBridge = new ServiceBridge(manager, { prefix: "!" });
    customBridge.expose("ping", async () => "pong");

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await customBridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("help"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toContain("!ping");
    expect(adapter.sentMessages[0].text).toContain("!help");
  });

  // --- New tests ---

  it("exception in handler returns error message (non-Error throw)", async () => {
    bridge.expose("bad", async () => {
      throw "string error";
    });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("bad"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toContain("Error in /bad");
    expect(adapter.sentMessages[0].text).toContain("string error");
  });

  it("handler with empty args receives empty array", async () => {
    let receivedArgs: string[] = [];
    bridge.expose("noargs", async (args) => {
      receivedArgs = args;
      return "ok";
    });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("noargs", []));
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedArgs).toEqual([]);
    expect(adapter.sentMessages[0].text).toBe("ok");
  });

  it("multiple commands registered, correct routing", async () => {
    bridge
      .expose("cmd1", async () => "result1")
      .expose("cmd2", async () => "result2")
      .expose("cmd3", async () => "result3");

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeCmdMsg("cmd2"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[0].text).toBe("result2");

    adapter.triggerMessage(makeCmdMsg("cmd3"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[1].text).toBe("result3");

    adapter.triggerMessage(makeCmdMsg("cmd1"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[2].text).toBe("result1");
  });

  it("exposeStatus handler is callable", async () => {
    bridge.exposeStatus(async () => "status: OK");

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("status"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toBe("status: OK");
  });

  it("exposeLogs handler receives args", async () => {
    bridge.exposeLogs(async (args) => `logs for ${args.join(",")}`);

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("logs", ["--tail", "50"]));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toBe("logs for --tail,50");
  });

  it("registeredCommands returns all exposed commands", () => {
    bridge
      .expose("a", async () => "a")
      .expose("b", async () => "b")
      .exposeStatus(() => "ok")
      .exposeLogs(() => "logs");
    expect(bridge.registeredCommands).toEqual(["a", "b", "status", "logs"]);
  });

  it("help output includes all exposed command descriptions", async () => {
    bridge
      .expose("start", async () => "started", { description: "Start service" })
      .expose("stop", async () => "stopped", { description: "Stop service" });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeCmdMsg("help"));
    await new Promise((r) => setTimeout(r, 50));

    const helpText = adapter.sentMessages[0].text;
    expect(helpText).toContain("Start service");
    expect(helpText).toContain("Stop service");
    expect(helpText).toContain("/start");
    expect(helpText).toContain("/stop");
  });
});

describe("parseFlags", () => {
  it("parses --key=value flags", () => {
    const result = parseFlags(["--env=prod", "--count=3"]);
    expect(result.flags).toEqual({ env: "prod", count: "3" });
    expect(result.positional).toEqual([]);
  });

  it("parses --key value flags", () => {
    const result = parseFlags(["--env", "prod"]);
    expect(result.flags).toEqual({ env: "prod" });
    expect(result.positional).toEqual([]);
  });

  it("parses boolean flags", () => {
    const result = parseFlags(["--force", "--verbose"]);
    expect(result.flags).toEqual({ force: true, verbose: true });
  });

  it("separates positional args from flags", () => {
    const result = parseFlags(["deploy", "prod", "--force", "--tag=v1"]);
    expect(result.positional).toEqual(["deploy", "prod"]);
    expect(result.flags).toEqual({ force: true, tag: "v1" });
  });

  it("handles empty args", () => {
    const result = parseFlags([]);
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
  });

  it("handles only flags, no positional", () => {
    const result = parseFlags(["--a", "--b=c"]);
    expect(result.positional).toEqual([]);
    expect(result.flags).toEqual({ a: true, b: "c" });
  });

  it("handles only positional, no flags", () => {
    const result = parseFlags(["foo", "bar", "baz"]);
    expect(result.positional).toEqual(["foo", "bar", "baz"]);
    expect(result.flags).toEqual({});
  });

  it("handles --flag followed by non-flag arg (treated as value)", () => {
    // parseFlags treats the next non-flag token as the value for --verbose
    const result = parseFlags(["--verbose", "deploy", "--env=prod"]);
    expect(result.positional).toEqual([]);
    expect(result.flags).toEqual({ verbose: "deploy", env: "prod" });
  });

  it("handles --key=value with empty value", () => {
    const result = parseFlags(["--name="]);
    expect(result.flags).toEqual({ name: "" });
  });

  it("handles --key=value with equals in value", () => {
    const result = parseFlags(["--filter=key=val"]);
    expect(result.flags).toEqual({ filter: "key=val" });
  });

  it("boolean flag at end of args", () => {
    const result = parseFlags(["file.txt", "--dry-run"]);
    expect(result.positional).toEqual(["file.txt"]);
    expect(result.flags["dry-run"]).toBe(true);
  });
});
