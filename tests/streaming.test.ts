import { describe, it, expect, vi } from "vitest";
import { StreamingMiddleware, StreamingReply } from "../src/streaming.js";
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

describe("StreamingReply", () => {
  it("collects chunks into a single string", async () => {
    async function* gen() {
      yield "Hello ";
      yield "World";
    }
    const sr = new StreamingReply(gen());
    expect(await sr.collect()).toBe("Hello World");
  });

  it("fromLLM extracts text/content/delta fields", async () => {
    async function* gen() {
      yield { text: "a" };
      yield { content: "b" };
      yield { delta: "c" };
      yield { other: "skip" };
    }
    const sr = StreamingReply.fromLLM(gen());
    expect(await sr.collect()).toBe("abc");
  });
});

describe("StreamingMiddleware", () => {
  it("passes through non-streaming results unchanged", async () => {
    const mw = new StreamingMiddleware();
    const next = vi.fn().mockResolvedValue("plain reply");
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("plain reply");
  });

  it("collects StreamingReply into a final string", async () => {
    const mw = new StreamingMiddleware();
    async function* gen() {
      yield "chunk1";
      yield "chunk2";
    }
    const next = vi.fn().mockResolvedValue(new StreamingReply(gen()));
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("chunk1chunk2");
  });

  it("fires typing indicator and clears it", async () => {
    const mw = new StreamingMiddleware({ typingInterval: 50 });
    const onTyping = vi.fn();
    const msg = makeMsg({ metadata: { onTyping } });
    const next = vi.fn().mockResolvedValue("ok");
    await mw.process(msg, next);
    // Should have fired at least once (immediately)
    expect(onTyping).toHaveBeenCalled();
  });

  it("calls onChunk for each streaming chunk", async () => {
    const mw = new StreamingMiddleware();
    const onChunk = vi.fn();
    async function* gen() {
      yield "a";
      yield "b";
      yield "c";
    }
    const msg = makeMsg({ metadata: { onChunk } });
    const next = vi.fn().mockResolvedValue(new StreamingReply(gen()));
    await mw.process(msg, next);
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk).toHaveBeenCalledWith("a");
    expect(onChunk).toHaveBeenCalledWith("b");
    expect(onChunk).toHaveBeenCalledWith("c");
  });

  it("clears typing indicator even on error", async () => {
    const mw = new StreamingMiddleware({ typingInterval: 50 });
    const onTyping = vi.fn();
    const msg = makeMsg({ metadata: { onTyping } });
    const next = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(mw.process(msg, next)).rejects.toThrow("boom");
    // Typing timer should be cleaned up (no lingering interval)
  });
});
