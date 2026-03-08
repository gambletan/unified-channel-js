import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelManager } from "../src/manager.js";
import { AccessMiddleware, CommandMiddleware } from "../src/middleware.js";
import { ConversationMemory, InMemoryStore } from "../src/memory.js";
import { ServiceBridge } from "../src/bridge.js";
import { StreamingMiddleware, StreamingReply } from "../src/streaming.js";
import { RichReply } from "../src/rich.js";
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

function makeMsg(channel: string, text: string, overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1",
    channel,
    sender: { id: "admin", displayName: "Admin" },
    content: { type: ContentType.TEXT, text },
    timestamp: new Date(),
    chatId: "c1",
    ...overrides,
  };
}

function makeCmdMsg(channel: string, command: string, args: string[] = [], overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return makeMsg(channel, `/${command} ${args.join(" ")}`.trim(), {
    content: { type: ContentType.COMMAND, text: `/${command}`, command, args },
    ...overrides,
  });
}

describe("Integration: full pipeline", () => {
  it("manager + access + commands + memory processes a command end-to-end", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");
    const store = new InMemoryStore();

    manager
      .addChannel(adapter)
      .addMiddleware(new AccessMiddleware(["admin"]))
      .addMiddleware(new ConversationMemory({ store }));

    const cmdMw = new CommandMiddleware();
    cmdMw.command("ping", async (msg) => {
      const history = msg.metadata?.history as any[];
      return `pong (history: ${history?.length ?? 0})`;
    });
    manager.addMiddleware(cmdMw);

    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    // Send a command
    adapter.triggerMessage(makeCmdMsg("test", "ping"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].text).toBe("pong (history: 0)");

    // Send another command - history should now have previous user+assistant+current user = 3
    // (memory appends user entry before calling next, so history seen by handler includes it)
    adapter.triggerMessage(makeCmdMsg("test", "ping"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages).toHaveLength(2);
    expect(adapter.sentMessages[1].text).toBe("pong (history: 3)");
  });

  it("access middleware blocks unauthorized users in full pipeline", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");

    manager
      .addChannel(adapter)
      .addMiddleware(new AccessMiddleware(["admin"]))
      .onMessage(async () => "should not reach");

    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeMsg("test", "hello", { sender: { id: "stranger" } }));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages).toHaveLength(0);
  });

  it("ServiceBridge expose + trigger + verify", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");
    manager.addChannel(adapter);

    const bridge = new ServiceBridge(manager);
    bridge.expose("status", async () => "all systems operational", { description: "System status" });
    bridge.expose("version", () => "v1.2.3");

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeCmdMsg("test", "status"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[0].text).toBe("all systems operational");

    adapter.triggerMessage(makeCmdMsg("test", "version"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[1].text).toBe("v1.2.3");
  });

  it("broadcast across multiple mock adapters", async () => {
    const manager = new ChannelManager();
    const tgAdapter = createMockAdapter("telegram");
    const dcAdapter = createMockAdapter("discord");
    const slAdapter = createMockAdapter("slack");

    manager
      .addChannel(tgAdapter)
      .addChannel(dcAdapter)
      .addChannel(slAdapter);

    await manager.broadcast("System update: v2.0 released!", {
      telegram: "tg-chat-1",
      discord: "dc-channel-1",
      slack: "sl-channel-1",
    });

    expect(tgAdapter.sentMessages).toHaveLength(1);
    expect(dcAdapter.sentMessages).toHaveLength(1);
    expect(slAdapter.sentMessages).toHaveLength(1);
    expect(tgAdapter.sentMessages[0].text).toBe("System update: v2.0 released!");
    expect(dcAdapter.sentMessages[0].chatId).toBe("dc-channel-1");
    expect(slAdapter.sentMessages[0].chatId).toBe("sl-channel-1");
  });

  it("RichReply through pipeline", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("telegram");

    manager.addChannel(adapter);
    manager.onMessage(async (msg) => {
      const reply = new RichReply()
        .text("Status Report")
        .table(["Service", "State"], [["API", "UP"], ["DB", "UP"]])
        .buttons([[{ label: "Refresh", callbackData: "refresh" }]]);
      return reply.toOutbound(msg.channel);
    });

    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeMsg("telegram", "status"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages).toHaveLength(1);
    const sent = adapter.sentMessages[0];
    expect(sent.parseMode).toBe("HTML");
    expect(sent.text).toContain("Status Report");
    expect(sent.buttons).toBeDefined();
  });

  it("streaming middleware integrates with manager pipeline", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");

    manager.addChannel(adapter).addMiddleware(new StreamingMiddleware());
    manager.onMessage(async () => {
      async function* gen() {
        yield "Hello ";
        yield "World";
      }
      return new StreamingReply(gen());
    });

    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeMsg("test", "hi"));
    await new Promise((r) => setTimeout(r, 100));

    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].text).toBe("Hello World");
  });

  it("memory + commands in ServiceBridge maintain conversation context", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");
    const store = new InMemoryStore();

    manager
      .addChannel(adapter)
      .addMiddleware(new ConversationMemory({ store }));

    const bridge = new ServiceBridge(manager);
    bridge.expose("history", async (args, msg) => {
      const history = msg?.metadata?.history as any[];
      return `History entries: ${history?.length ?? 0}`;
    });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    // First call: no history yet
    adapter.triggerMessage(makeCmdMsg("test", "history"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[0].text).toBe("History entries: 0");

    // Second call: store has [user1, assistant1], but append mutates the same array
    // before handler runs, so handler sees 3 entries (user1 + assistant1 + user2)
    adapter.triggerMessage(makeCmdMsg("test", "history"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[1].text).toBe("History entries: 3");
  });

  it("error in ServiceBridge handler returns error message, does not crash", async () => {
    const manager = new ChannelManager();
    const adapter = createMockAdapter("test");
    manager.addChannel(adapter);

    const bridge = new ServiceBridge(manager);
    bridge.expose("boom", async () => { throw new Error("kaboom"); });

    vi.spyOn(manager, "run").mockResolvedValue(undefined);
    await bridge.run();

    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    adapter.triggerMessage(makeCmdMsg("test", "boom"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.sentMessages[0].text).toContain("Error in /boom");
    expect(adapter.sentMessages[0].text).toContain("kaboom");

    // Manager still works after error
    adapter.triggerMessage(makeCmdMsg("test", "help"));
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.sentMessages[1].text).toContain("Available commands");
  });

  it("full pipeline with multiple adapters processes messages independently", async () => {
    const manager = new ChannelManager();
    const adapter1 = createMockAdapter("ch1");
    const adapter2 = createMockAdapter("ch2");

    manager.addChannel(adapter1).addChannel(adapter2);
    manager.onMessage(async (msg) => `Echo from ${msg.channel}: ${msg.content.text}`);

    await adapter1.connect();
    await adapter2.connect();
    adapter1.onMessage((msg) => (manager as any).handleMessage(adapter1, msg));
    adapter2.onMessage((msg) => (manager as any).handleMessage(adapter2, msg));

    adapter1.triggerMessage(makeMsg("ch1", "hello"));
    adapter2.triggerMessage(makeMsg("ch2", "world"));
    await new Promise((r) => setTimeout(r, 50));

    expect(adapter1.sentMessages[0].text).toBe("Echo from ch1: hello");
    expect(adapter2.sentMessages[0].text).toBe("Echo from ch2: world");
  });
});
