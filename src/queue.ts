/** MessageQueue middleware — decouples message receiving from processing via async queues. */

import type { UnifiedMessage } from "./types.js";
import type { Handler, HandlerResult, Middleware } from "./middleware.js";

export interface QueueOptions {
  /** Max concurrent processors (default: 5). */
  concurrency?: number;
  /** Max queue size; enqueue rejects when full (default: 1000). */
  maxSize?: number;
}

export interface MessageQueue {
  /** Push a message onto the queue. Rejects if full. */
  enqueue(msg: UnifiedMessage): boolean;
  /** Register the processing callback. */
  onProcess(handler: (msg: UnifiedMessage) => Promise<HandlerResult>): void;
  /** Start consuming. */
  start(): void;
  /** Stop consuming (in-flight items finish). */
  stop(): void;
  /** Current number of queued (unprocessed) items. */
  size(): number;
  /** Returns a promise that resolves when queue is empty and all in-flight work completes. */
  drain(): Promise<void>;
}

type ProcessHandler = (msg: UnifiedMessage) => Promise<HandlerResult>;

/**
 * Simple in-memory async queue with bounded concurrency.
 */
export class InMemoryQueue implements MessageQueue {
  private readonly concurrency: number;
  private readonly maxSize: number;
  private readonly items: UnifiedMessage[] = [];
  private handler: ProcessHandler | null = null;
  private running = false;
  private active = 0;
  private drainResolvers: Array<() => void> = [];

  constructor(opts: QueueOptions = {}) {
    this.concurrency = opts.concurrency ?? 5;
    this.maxSize = opts.maxSize ?? 1000;
  }

  enqueue(msg: UnifiedMessage): boolean {
    if (this.items.length >= this.maxSize) {
      return false;
    }
    this.items.push(msg);
    this.pump();
    return true;
  }

  onProcess(handler: ProcessHandler): void {
    this.handler = handler;
  }

  start(): void {
    this.running = true;
    this.pump();
  }

  stop(): void {
    this.running = false;
  }

  size(): number {
    return this.items.length;
  }

  async drain(): Promise<void> {
    if (this.items.length === 0 && this.active === 0) return;
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  /** Internal: pull items off the queue up to concurrency limit. */
  private pump(): void {
    if (!this.running || !this.handler) return;
    while (this.active < this.concurrency && this.items.length > 0) {
      const msg = this.items.shift()!;
      this.active++;
      this.processOne(msg);
    }
  }

  private processOne(msg: UnifiedMessage): void {
    // handler guaranteed non-null by pump() guard
    this.handler!(msg)
      .catch(() => {
        // errors are swallowed; callers can wrap handler for logging
      })
      .finally(() => {
        this.active--;
        this.checkDrain();
        this.pump();
      });
  }

  private checkDrain(): void {
    if (this.items.length === 0 && this.active === 0 && this.drainResolvers.length > 0) {
      for (const resolve of this.drainResolvers) resolve();
      this.drainResolvers = [];
    }
  }
}

/**
 * Middleware that intercepts messages and enqueues them instead of processing inline.
 * The actual processing happens asynchronously via the queue's onProcess callback.
 */
export class QueueMiddleware implements Middleware {
  constructor(private readonly queue: MessageQueue) {}

  async process(msg: UnifiedMessage, _next: Handler): Promise<HandlerResult> {
    const accepted = this.queue.enqueue(msg);
    if (!accepted) {
      // Queue full — drop the message (caller can log via metadata)
      return null;
    }
    // Message will be processed asynchronously; return null (no inline reply)
    return null;
  }
}

/**
 * Convenience: creates a processor that pulls from the queue and sends replies
 * through the provided send function.
 */
export class QueueProcessor {
  constructor(
    private readonly queue: MessageQueue,
    private readonly sendReply: (chatId: string, result: HandlerResult) => Promise<void>,
  ) {}

  /** Wire up a handler and start the queue. */
  start(handler: ProcessHandler): void {
    this.queue.onProcess(async (msg) => {
      const result = await handler(msg);
      if (result != null && msg.chatId) {
        await this.sendReply(msg.chatId, result);
      }
      return result;
    });
    this.queue.start();
  }

  stop(): void {
    this.queue.stop();
  }
}
