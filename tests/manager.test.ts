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

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));
    mockAdapter.triggerMessage(makeMsg("test", "hi"));

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

    mockAdapter.triggerMessage(makeMsg("test", "hi", { sender: { id: "stranger" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages).toHaveLength(0);

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

  it("broadcast with partial failures still delivers to other channels", async () => {
    const failAdapter = createMockAdapter("fail");
    failAdapter.send = vi.fn().mockRejectedValue(new Error("network error"));
    const okAdapter = createMockAdapter("ok");

    manager.addChannel(failAdapter).addChannel(okAdapter);
    await manager.broadcast("hello", { fail: "c1", ok: "c2" });
    expect(okAdapter.sentMessages).toHaveLength(1);
    expect(okAdapter.sentMessages[0].text).toBe("hello");
  });

  it("middleware ordering: wrap semantics (before/after)", async () => {
    const trace: string[] = [];
    const mw1 = {
      async process(msg: UnifiedMessage, next: any) {
        trace.push("mw1-before");
        const r = await next(msg);
        trace.push("mw1-after");
        return r;
      }
    };
    const mw2 = {
      async process(msg: UnifiedMessage, next: any) {
        trace.push("mw2-before");
        const r = await next(msg);
        trace.push("mw2-after");
        return r;
      }
    };
    manager.addChannel(mockAdapter).addMiddleware(mw1).addMiddleware(mw2);
    manager.onMessage(async () => { trace.push("handler"); return "ok"; });

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));
    mockAdapter.triggerMessage(makeMsg("test", "hi"));
    await new Promise((r) => setTimeout(r, 50));

    expect(trace).toEqual(["mw1-before", "mw2-before", "handler", "mw2-after", "mw1-after"]);
  });

  it("error in handler does not crash the manager", async () => {
    manager.addChannel(mockAdapter);
    manager.onMessage(async () => { throw new Error("handler crash"); });

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));

    mockAdapter.triggerMessage(makeMsg("test", "hi"));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAdapter.sentMessages).toHaveLength(0);
  });

  it("getStatus returns error status when adapter throws", async () => {
    const errorAdapter = createMockAdapter("broken");
    errorAdapter.getStatus = vi.fn().mockRejectedValue(new Error("status fail"));
    manager.addChannel(errorAdapter);

    const statuses = await manager.getStatus();
    expect(statuses.broken.connected).toBe(false);
    expect(statuses.broken.error).toContain("status fail");
  });

  it("handles multiple concurrent messages without interference", async () => {
    manager.addChannel(mockAdapter);
    let callCount = 0;
    manager.onMessage(async (msg) => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return `reply-${msg.content.text}`;
    });

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));

    mockAdapter.triggerMessage(makeMsg("test", "a"));
    mockAdapter.triggerMessage(makeMsg("test", "b"));
    mockAdapter.triggerMessage(makeMsg("test", "c"));

    await new Promise((r) => setTimeout(r, 100));
    expect(callCount).toBe(3);
    expect(mockAdapter.sentMessages).toHaveLength(3);
    const texts = mockAdapter.sentMessages.map((m) => m.text).sort();
    expect(texts).toEqual(["reply-a", "reply-b", "reply-c"]);
  });

  it("shutdown is idempotent (can be called twice)", async () => {
    manager.addChannel(mockAdapter);
    await manager.shutdown();
    await manager.shutdown();
    expect(mockAdapter.disconnect).toHaveBeenCalled();
  });

  it("send with replyToId option", async () => {
    manager.addChannel(mockAdapter);
    await manager.send("test", "c1", "reply text", { replyToId: "msg-42" });
    expect(mockAdapter.sentMessages[0]).toMatchObject({
      chatId: "c1",
      text: "reply text",
      replyToId: "msg-42",
    });
  });

  it("send with parseMode option", async () => {
    manager.addChannel(mockAdapter);
    await manager.send("test", "c1", "<b>bold</b>", { parseMode: "HTML" });
    expect(mockAdapter.sentMessages[0]).toMatchObject({
      text: "<b>bold</b>",
      parseMode: "HTML",
    });
  });

  it("no reply sent when handler returns null", async () => {
    manager.addChannel(mockAdapter);
    manager.onMessage(async () => null);

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));
    mockAdapter.triggerMessage(makeMsg("test", "hi"));

    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages).toHaveLength(0);
  });

  it("no reply sent when no fallback handler is set", async () => {
    manager.addChannel(mockAdapter);

    await mockAdapter.connect();
    mockAdapter.onMessage((msg) => (manager as any).handleMessage(mockAdapter, msg));
    mockAdapter.triggerMessage(makeMsg("test", "hi"));

    await new Promise((r) => setTimeout(r, 50));
    expect(mockAdapter.sentMessages).toHaveLength(0);
  });

  it("addChannel returns this for fluent chaining", () => {
    const result = manager.addChannel(mockAdapter);
    expect(result).toBe(manager);
  });

  it("addMiddleware returns this for fluent chaining", () => {
    const mw = { async process(msg: UnifiedMessage, next: any) { return next(msg); } };
    const result = manager.addMiddleware(mw);
    expect(result).toBe(manager);
  });

  it("onMessage returns this for fluent chaining", () => {
    const result = manager.onMessage(async () => "ok");
    expect(result).toBe(manager);
  });

  it("getStatus for multiple channels", async () => {
    const adapter2 = createMockAdapter("second");
    manager.addChannel(mockAdapter).addChannel(adapter2);
    const statuses = await manager.getStatus();
    expect(Object.keys(statuses)).toEqual(["test", "second"]);
    expect(statuses.test.connected).toBe(true);
    expect(statuses.second.connected).toBe(true);
  });
});
