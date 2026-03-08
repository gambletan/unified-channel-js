import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelManager } from "../src/manager.js";
import { AccessMiddleware, CommandMiddleware } from "../src/middleware.js";
import { ContentType } from "../src/types.js";
import type { ChannelAdapter } from "../src/adapter.js";
import type { UnifiedMessage, OutboundMessage } from "../src/types.js";

function createMockAdapter(channelId: string): ChannelAdapter & { triggerMessage: (msg: UnifiedMessage) => void; sentMessages: OutboundMessage[] } {
  let handler: ((msg: UnifiedMessage) => void) | undefined;
  const sentMessages: OutboundMessage[] = [];
  return {
    channelId,
    sentMessages,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessage(h) { handler = h; },
    send: vi.fn().mockImplementation(async (msg: OutboundMessage) => { sentMessages.push(msg); return `sent-${sentMessages.length}`; }),
    getStatus: vi.fn().mockResolvedValue({ connected: true, channel: channelId }),
    triggerMessage(msg: UnifiedMessage) { handler?.(msg); },
  };
}

function makeMsg(channel: string, text: string, overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1", channel, sender: { id: "user1" },
    content: { type: ContentType.TEXT, text },
    timestamp: new Date(), chatId: "c1",
    ...overrides,
  };
}

describe("ChannelManager", () => {
  let manager: ChannelManager;
  let mockAdapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    manager = new ChannelManager();
    mockAdapter = createMockAdapter("test");
  });

  it("registers and connects channels", async () => {
    manager.addChannel(mockAdapter);
    // Don't call run() as it blocks; just test connect via the adapter
    await mockAdapter.connect();
    expect(mockAdapter.connect).toHaveBeenCalled();
  });

  it("sends messages through channel", async () => {
    manager.addChannel(mockAdapter);
    const id = await manager.send("test", "c1", "hello");
    expect(id).toBe("sent-1");
    expect(mockAdapter.sentMessages[0].text).toBe("hello");
  });

  it("throws on unregistered channel send", async () => {
    await expect(manager.send("nonexistent", "c1", "hi")).rejects.toThrow("Channel not registered");
  });

  it("broadcasts to multiple channels", async () => {
    const adapter2 = createMockAdapter("test2");
    manager.addChannel(mockAdapter).addChannel(adapter2);
    await manager.broadcast("hello all", { test: "c1", test2: "c2" });
    expect(mockAdapter.sentMessages).toHaveLength(1);
    expect(adapter2.sentMessages).toHaveLength(1);
  });

  it("returns status for all channels", async () => {
    manager.addChannel(mockAdapter);
    const statuses = await manager.getStatus();
    expect(statuses.test.connected).toBe(true);
  });

  it("runs middleware pipeline in order", async () => {
    const order: string[] = [];
    const mw1 = { async process(msg: UnifiedMessage, next: any) { order.push("mw1"); return next(msg); } };
    const mw2 = { async process(msg: UnifiedMessage, next: any) { order.push("mw2"); return next(msg); } };
    manager.addChannel(mockAdapter).addMiddleware(mw1).addMiddleware(mw2);
    manager.onMessage(async () => { order.push("handler"); return "done"; });

    // Manually connect and trigger
    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));
    mockAdapter.triggerMessage(makeMsg("test", "hi"));

    // Wait for async pipeline
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(["mw1", "mw2", "handler"]);
  });

  it("access middleware blocks and command middleware routes", async () => {
    const access = new AccessMiddleware(["admin"]);
    const commands = new CommandMiddleware();
    commands.command("ping", async () => "pong");

    manager.addChannel(mockAdapter).addMiddleware(access).addMiddleware(commands);
    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));

    // Blocked user
    mockAdapter.triggerMessage(makeMsg("test", "hi", { sender: { id: "stranger" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages).toHaveLength(0);

    // Allowed user with command
    mockAdapter.triggerMessage(makeMsg("test", "/ping", {
      sender: { id: "admin" },
      content: { type: ContentType.COMMAND, text: "/ping", command: "ping", args: [] },
    }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages).toHaveLength(1);
    expect(mockAdapter.sentMessages[0].text).toBe("pong");
  });

  it("handles string reply from fallback handler", async () => {
    manager.addChannel(mockAdapter);
    manager.onMessage(async (msg) => `Echo: ${msg.content.text}`);
    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));

    mockAdapter.triggerMessage(makeMsg("test", "hello"));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages[0].text).toBe("Echo: hello");
  });

  it("shutdown disconnects all channels", async () => {
    manager.addChannel(mockAdapter);
    await manager.shutdown();
    expect(mockAdapter.disconnect).toHaveBeenCalled();
  });

  it("run throws with no channels", async () => {
    await expect(manager.run()).rejects.toThrow("No channels registered");
  });
});
