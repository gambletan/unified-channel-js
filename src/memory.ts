/** ConversationMemory middleware — track conversation history per chat. */

import type { HandlerResult, Middleware, Handler } from "./middleware.js";
import type { UnifiedMessage } from "./types.js";

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  sender?: string;
  timestamp: string;
}

export interface MemoryStore {
  get(key: string): Promise<HistoryEntry[]>;
  append(key: string, entry: HistoryEntry): Promise<void>;
  trim(key: string, maxEntries: number): Promise<void>;
  clear(key: string): Promise<void>;
}

/** Simple in-process store backed by a Map. */
export class InMemoryStore implements MemoryStore {
  private data = new Map<string, HistoryEntry[]>();

  async get(key: string): Promise<HistoryEntry[]> {
    return this.data.get(key) ?? [];
  }

  async append(key: string, entry: HistoryEntry): Promise<void> {
    const list = this.data.get(key) ?? [];
    list.push(entry);
    this.data.set(key, list);
  }

  async trim(key: string, maxEntries: number): Promise<void> {
    const list = this.data.get(key);
    if (!list) return;
    if (list.length > maxEntries) {
      this.data.set(key, list.slice(list.length - maxEntries));
    }
  }

  async clear(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export interface ConversationMemoryOptions {
  store?: MemoryStore;
  maxTurns?: number;
}

/**
 * Injects `msg.metadata.history` with conversation history,
 * then records the user message and bot reply after processing.
 */
export class ConversationMemory implements Middleware {
  private store: MemoryStore;
  private maxTurns: number;

  constructor(options?: ConversationMemoryOptions) {
    this.store = options?.store ?? new InMemoryStore();
    this.maxTurns = options?.maxTurns ?? 50;
  }

  /** Build a stable key from channel + chatId (or sender id as fallback). */
  private memoryKey(msg: UnifiedMessage): string {
    const scope = msg.chatId ?? msg.sender.id;
    return `${msg.channel}:${scope}`;
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    const key = this.memoryKey(msg);
    const history = await this.store.get(key);

    // Inject history into metadata so downstream handlers can use it
    msg.metadata = msg.metadata ?? {};
    msg.metadata.history = history;

    // Record user message
    const userEntry: HistoryEntry = {
      role: "user",
      content: msg.content.text,
      sender: msg.sender.displayName ?? msg.sender.username ?? msg.sender.id,
      timestamp: msg.timestamp.toISOString(),
    };
    await this.store.append(key, userEntry);

    const result = await next(msg);

    // Record assistant reply if any
    if (result) {
      const replyText = typeof result === "string" ? result : result.text;
      const assistantEntry: HistoryEntry = {
        role: "assistant",
        content: replyText,
        timestamp: new Date().toISOString(),
      };
      await this.store.append(key, assistantEntry);
    }

    // Trim to maxTurns (each turn = 2 entries: user + assistant)
    await this.store.trim(key, this.maxTurns * 2);

    return result;
  }
}
