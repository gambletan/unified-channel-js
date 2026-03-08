/** Rate-limiting middleware — sliding window per sender. */

import type { UnifiedMessage } from "./types.js";
import type { Handler, HandlerResult, Middleware } from "./middleware.js";

export interface RateLimitConfig {
  /** Maximum messages allowed within the window. Default: 10 */
  maxMessages?: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** Custom key function to bucket messages. Default: msg.sender.id */
  keyFn?: (msg: UnifiedMessage) => string;
  /** Optional reply text sent when rate limited. If not set, message is silently dropped. */
  replyText?: string;
}

export class RateLimitMiddleware implements Middleware {
  private readonly maxMessages: number;
  private readonly windowMs: number;
  private readonly keyFn: (msg: UnifiedMessage) => string;
  private readonly replyText: string | undefined;

  /** Sliding window: map of key -> sorted array of timestamps (ms). */
  private readonly windows = new Map<string, number[]>();

  constructor(config: RateLimitConfig = {}) {
    this.maxMessages = config.maxMessages ?? 10;
    this.windowMs = config.windowMs ?? 60_000;
    this.keyFn = config.keyFn ?? ((msg) => msg.sender.id);
    this.replyText = config.replyText;
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    const key = this.keyFn(msg);
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Evict expired entries (sliding window)
    const firstValid = timestamps.findIndex((t) => t > cutoff);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      timestamps.length = 0;
    }

    if (timestamps.length >= this.maxMessages) {
      // Rate limited — short-circuit
      if (this.replyText) {
        return this.replyText;
      }
      return null;
    }

    timestamps.push(now);
    return next(msg);
  }

  /** Remove expired entries from all tracked keys. Call periodically if needed. */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    for (const [key, timestamps] of this.windows) {
      const firstValid = timestamps.findIndex((t) => t > cutoff);
      if (firstValid === -1) {
        this.windows.delete(key);
      } else if (firstValid > 0) {
        timestamps.splice(0, firstValid);
      }
    }
  }

  /** Reset all rate limit state. */
  reset(): void {
    this.windows.clear();
  }
}
