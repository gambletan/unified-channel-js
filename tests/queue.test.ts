import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryQueue, QueueMiddleware, QueueProcessor } from "../src/queue.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage } from "../src/types.js";
import type { HandlerResult } from "../src/middleware.js";

function makeMsg(id: string, text: string): UnifiedMessage {
  return {
    id,
    channel: "test",
    sender: { id: "user1" },
    content: { type: ContentType.TEXT, text },
    timestamp: new Date(),
    chatId: "chat1",
  };
}

describe("InMemoryQueue", () => {
  let queue: InMemoryQueue;

  beforeEach(() => {
    queue = new InMemoryQueue({ concurrency: 2, maxSize: 5 });
  });

  it("enqueues and reports size", () => {
    expect(queue.enqueue(makeMsg("1", "a"))).toBe(true);
    expect(queue.enqueue(makeMsg("2", "b"))).toBe(true);
    expect(queue.size()).toBe(2);
  });

  it("rejects when maxSize is reached", () => {
    for (let i = 0; i < 5; i++) {
      expect(queue.enqueue(makeMsg(String(i), `msg${i}`))).toBe(true);
    }
    expect(queue.size()).toBe(5);
    // 6th should be rejected
    expect(queue.enqueue(makeMsg("6", "overflow"))).toBe(false);
    expect(queue.size()).toBe(5);
  });

  it("processes messages when started", async () => {
    const processed: string[] = [];
    queue.onProcess(async (msg) => {
      processed.push(msg.content.text);
      return msg.content.text;
    });

    queue.enqueue(makeMsg("1", "hello"));
    queue.enqueue(makeMsg("2", "world"));
    queue.start();

    await queue.drain();
    expect(processed).toEqual(["hello", "world"]);
    expect(queue.size()).toBe(0);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const resolvers: Array<() => void> = [];

    queue.onProcess(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      concurrent--;
      return null;
    });

    // Enqueue 4 messages with concurrency=2
    for (let i = 0; i < 4; i++) {
      queue.enqueue(makeMsg(String(i), `msg${i}`));
    }
    queue.start();

    // Let first batch start processing
    await new Promise((r) => setTimeout(r, 10));
    expect(maxConcurrent).toBe(2);
    expect(concurrent).toBe(2);

    // Resolve first two — next two should start
    resolvers[0]();
    resolvers[1]();
    await new Promise((r) => setTimeout(r, 10));
    expect(concurrent).toBe(2);

    // Resolve remaining
    resolvers[2]();
    resolvers[3]();
    await queue.drain();
    expect(concurrent).toBe(0);
  });

  it("drain resolves immediately when empty", async () => {
    queue.start();
    // Should not hang
    await queue.drain();
  });

  it("stop prevents further processing", async () => {
    const processed: string[] = [];
    queue.onProcess(async (msg) => {
      processed.push(msg.content.text);
      return null;
    });

    queue.enqueue(makeMsg("1", "before"));
    // Don't start — messages stay queued
    expect(queue.size()).toBe(1);

    queue.start();
    await queue.drain();
    expect(processed).toEqual(["before"]);

    queue.stop();
    queue.enqueue(makeMsg("2", "after-stop"));
    // Message is queued but won't process because stopped
    expect(queue.size()).toBe(1);
    expect(processed).toEqual(["before"]);
  });

  it("handles processing errors gracefully", async () => {
    let callCount = 0;
    queue.onProcess(async (msg) => {
      callCount++;
      if (msg.content.text === "fail") {
        throw new Error("boom");
      }
      return msg.content.text;
    });

    queue.enqueue(makeMsg("1", "fail"));
    queue.enqueue(makeMsg("2", "ok"));
    queue.start();

    await queue.drain();
    // Both processed despite error in first
    expect(callCount).toBe(2);
    expect(queue.size()).toBe(0);
  });

  it("processes items enqueued after start", async () => {
    const processed: string[] = [];
    queue.onProcess(async (msg) => {
      processed.push(msg.content.text);
      return null;
    });
    queue.start();

    queue.enqueue(makeMsg("1", "late1"));
    queue.enqueue(makeMsg("2", "late2"));

    await queue.drain();
    expect(processed).toEqual(["late1", "late2"]);
  });
});

describe("QueueMiddleware", () => {
  it("enqueues messages and returns null", async () => {
    const queue = new InMemoryQueue();
    const mw = new QueueMiddleware(queue);
    const next = vi.fn();

    const msg = makeMsg("1", "hello");
    const result = await mw.process(msg, next);

    expect(result).toBeNull();
    expect(queue.size()).toBe(1);
    // next handler should NOT be called — message is queued
    expect(next).not.toHaveBeenCalled();
  });

  it("returns null when queue is full", async () => {
    const queue = new InMemoryQueue({ maxSize: 1 });
    const mw = new QueueMiddleware(queue);
    const next = vi.fn();

    queue.enqueue(makeMsg("1", "fill"));
    const result = await mw.process(makeMsg("2", "overflow"), next);

    expect(result).toBeNull();
    expect(queue.size()).toBe(1);
  });
});

describe("QueueProcessor", () => {
  it("processes queued messages and sends replies", async () => {
    const queue = new InMemoryQueue({ concurrency: 2 });
    const sentReplies: Array<{ chatId: string; result: HandlerResult }> = [];

    const processor = new QueueProcessor(queue, async (chatId, result) => {
      sentReplies.push({ chatId, result });
    });

    queue.enqueue(makeMsg("1", "hello"));
    queue.enqueue(makeMsg("2", "world"));

    processor.start(async (msg) => `reply: ${msg.content.text}`);
    await queue.drain();

    expect(sentReplies).toHaveLength(2);
    expect(sentReplies[0]).toEqual({ chatId: "chat1", result: "reply: hello" });
    expect(sentReplies[1]).toEqual({ chatId: "chat1", result: "reply: world" });

    processor.stop();
  });
});
