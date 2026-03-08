/** StreamingMiddleware — typing indicators and chunked reply assembly. */

import type { HandlerResult, Middleware, Handler } from "./middleware.js";
import type { UnifiedMessage } from "./types.js";

/**
 * Wraps an async iterable of string chunks into a complete reply.
 * Downstream handlers return a StreamingReply to signal streaming output.
 */
export class StreamingReply {
  readonly chunks: AsyncIterable<string>;

  constructor(chunks: AsyncIterable<string>) {
    this.chunks = chunks;
  }

  /** Helper: adapt an LLM-style stream (objects with a `.text` / `.content` / `.delta` field). */
  static fromLLM(stream: AsyncIterable<Record<string, unknown>>): StreamingReply {
    async function* extract(): AsyncGenerator<string> {
      for await (const chunk of stream) {
        const text =
          (chunk.text as string | undefined) ??
          (chunk.content as string | undefined) ??
          (chunk.delta as string | undefined);
        if (text) yield text;
      }
    }
    return new StreamingReply(extract());
  }

  /** Collect all chunks into a single string. */
  async collect(): Promise<string> {
    const parts: string[] = [];
    for await (const chunk of this.chunks) {
      parts.push(chunk);
    }
    return parts.join("");
  }
}

export interface StreamingMiddlewareOptions {
  /** How often to fire a typing indicator event (ms). Default: 3000. */
  typingInterval?: number;
  /** Artificial delay between chunks (ms). Default: 0. */
  chunkDelay?: number;
}

/**
 * Middleware that:
 * 1. Emits periodic "typing" events via msg.metadata.onTyping callback (if provided).
 * 2. Detects StreamingReply results and collects them into a final string.
 */
export class StreamingMiddleware implements Middleware {
  private typingInterval: number;
  private chunkDelay: number;

  constructor(options?: StreamingMiddlewareOptions) {
    this.typingInterval = options?.typingInterval ?? 3000;
    this.chunkDelay = options?.chunkDelay ?? 0;
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    msg.metadata = msg.metadata ?? {};

    // Start typing indicator loop
    const onTyping = msg.metadata.onTyping as (() => void) | undefined;
    let typingTimer: ReturnType<typeof setInterval> | undefined;
    if (onTyping) {
      onTyping(); // fire immediately
      typingTimer = setInterval(onTyping, this.typingInterval);
    }

    try {
      const result = await next(msg);

      // If the handler returned a StreamingReply, collect it
      if (result instanceof StreamingReply) {
        const parts: string[] = [];
        const onChunk = msg.metadata.onChunk as ((text: string) => void) | undefined;

        for await (const chunk of result.chunks) {
          parts.push(chunk);
          if (onChunk) onChunk(chunk);
          if (this.chunkDelay > 0) {
            await delay(this.chunkDelay);
          }
        }

        return parts.join("");
      }

      return result;
    } finally {
      if (typingTimer) clearInterval(typingTimer);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
