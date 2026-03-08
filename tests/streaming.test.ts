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

  it("collects empty async iterator to empty string", async () => {
    async function* gen() {
      // yields nothing
    }
    const sr = new StreamingReply(gen());
    expect(await sr.collect()).toBe("");
  });

  it("fromLLM with all empty fields produces empty string", async () => {
    async function* gen() {
      yield { unrelated: "foo" };
      yield { nope: "bar" };
    }
    const sr = StreamingReply.fromLLM(gen());
    expect(await sr.collect()).toBe("");
  });

  it("collects single chunk", async () => {
    async function* gen() {
      yield "only";
    }
    const sr = new StreamingReply(gen());
    expect(await sr.collect()).toBe("only");
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
  });

  it("handles empty streaming reply", async () => {
    const mw = new StreamingMiddleware();
    async function* gen() {
      // empty
    }
    const next = vi.fn().mockResolvedValue(new StreamingReply(gen()));
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("");
  });

  it("error during iteration propagates", async () => {
    const mw = new StreamingMiddleware();
    async function* gen() {
      yield "ok";
      throw new Error("stream error");
    }
    const next = vi.fn().mockResolvedValue(new StreamingReply(gen()));
    await expect(mw.process(makeMsg(), next)).rejects.toThrow("stream error");
  });

  it("onChunk callback with multiple chunks accumulates correctly", async () => {
    const mw = new StreamingMiddleware();
    const chunks: string[] = [];
    async function* gen() {
      yield "Hello";
      yield " ";
      yield "World";
      yield "!";
    }
    const msg = makeMsg({ metadata: { onChunk: (c: string) => chunks.push(c) } });
    const next = vi.fn().mockResolvedValue(new StreamingReply(gen()));
    const result = await mw.process(msg, next);
    expect(result).toBe("Hello World!");
    expect(chunks).toEqual(["Hello", " ", "World", "!"]);
  });

  it("passes through null results", async () => {
    const mw = new StreamingMiddleware();
    const next = vi.fn().mockResolvedValue(null);
    const result = await mw.process(makeMsg(), next);
    expect(result).toBeNull();
  });

  it("passes through OutboundMessage results", async () => {
    const mw = new StreamingMiddleware();
    const outbound = { chatId: "c1", text: "hi" };
    const next = vi.fn().mockResolvedValue(outbound);
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe(outbound);
  });
});
