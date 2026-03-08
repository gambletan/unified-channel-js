import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimitMiddleware } from "../src/ratelimit.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage } from "../src/types.js";

function makeMsg(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1",
    channel: "test",
    sender: { id: "user1" },
    content: { type: ContentType.TEXT, text: "hello" },
    timestamp: new Date(),
    chatId: "c1",
    ...overrides,
  };
}

describe("RateLimitMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows messages under the limit", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 3, windowMs: 1000 });
    const next = vi.fn().mockResolvedValue("ok");

    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("blocks messages when limit is reached", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 2, windowMs: 10_000 });
    const next = vi.fn().mockResolvedValue("ok");

    await mw.process(makeMsg(), next);
    await mw.process(makeMsg(), next);
    const result = await mw.process(makeMsg(), next);

    expect(result).toBeNull();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("resets after window expires", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 2, windowMs: 1000 });
    const next = vi.fn().mockResolvedValue("ok");

    await mw.process(makeMsg(), next);
    await mw.process(makeMsg(), next);
    // Now at limit
    expect(await mw.process(makeMsg(), next)).toBeNull();

    // Advance past window
    vi.advanceTimersByTime(1001);

    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("tracks multiple users independently", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 1, windowMs: 10_000 });
    const next = vi.fn().mockResolvedValue("ok");

    const r1 = await mw.process(makeMsg({ sender: { id: "alice" } }), next);
    const r2 = await mw.process(makeMsg({ sender: { id: "bob" } }), next);

    expect(r1).toBe("ok");
    expect(r2).toBe("ok");
    expect(next).toHaveBeenCalledTimes(2);

    // Both should now be rate limited
    expect(await mw.process(makeMsg({ sender: { id: "alice" } }), next)).toBeNull();
    expect(await mw.process(makeMsg({ sender: { id: "bob" } }), next)).toBeNull();
  });

  it("supports custom key function", async () => {
    // Key by chatId instead of sender
    const mw = new RateLimitMiddleware({
      maxMessages: 1,
      windowMs: 10_000,
      keyFn: (msg) => msg.chatId ?? "unknown",
    });
    const next = vi.fn().mockResolvedValue("ok");

    await mw.process(makeMsg({ chatId: "room1", sender: { id: "alice" } }), next);
    // Same room, different user — should be rate limited
    const result = await mw.process(makeMsg({ chatId: "room1", sender: { id: "bob" } }), next);
    expect(result).toBeNull();

    // Different room — should pass
    const r2 = await mw.process(makeMsg({ chatId: "room2", sender: { id: "alice" } }), next);
    expect(r2).toBe("ok");
  });

  it("returns custom reply text when rate limited", async () => {
    const mw = new RateLimitMiddleware({
      maxMessages: 1,
      windowMs: 10_000,
      replyText: "Slow down!",
    });
    const next = vi.fn().mockResolvedValue("ok");

    await mw.process(makeMsg(), next);
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("Slow down!");
  });

  it("handles burst at exactly the limit", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 5, windowMs: 10_000 });
    const next = vi.fn().mockResolvedValue("ok");

    // Send exactly 5 — all should pass
    for (let i = 0; i < 5; i++) {
      expect(await mw.process(makeMsg(), next)).toBe("ok");
    }
    expect(next).toHaveBeenCalledTimes(5);

    // 6th should be blocked
    expect(await mw.process(makeMsg(), next)).toBeNull();
    expect(next).toHaveBeenCalledTimes(5);
  });

  it("cleanup removes expired entries", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 1, windowMs: 1000 });
    const next = vi.fn().mockResolvedValue("ok");

    await mw.process(makeMsg({ sender: { id: "alice" } }), next);
    await mw.process(makeMsg({ sender: { id: "bob" } }), next);

    vi.advanceTimersByTime(1001);
    mw.cleanup();

    // After cleanup, both users should be able to send again
    expect(await mw.process(makeMsg({ sender: { id: "alice" } }), next)).toBe("ok");
    expect(await mw.process(makeMsg({ sender: { id: "bob" } }), next)).toBe("ok");
  });

  it("uses sliding window — partial expiry", async () => {
    const mw = new RateLimitMiddleware({ maxMessages: 2, windowMs: 1000 });
    const next = vi.fn().mockResolvedValue("ok");

    // t=0: first message
    await mw.process(makeMsg(), next);

    // t=600: second message
    vi.advanceTimersByTime(600);
    await mw.process(makeMsg(), next);

    // t=600: at limit
    expect(await mw.process(makeMsg(), next)).toBeNull();

    // t=1001: first message expires, second still valid
    vi.advanceTimersByTime(401);
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledTimes(3);
  });
});
