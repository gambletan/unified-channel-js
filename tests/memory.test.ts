import { describe, it, expect, vi } from "vitest";
import { ConversationMemory, InMemoryStore } from "../src/memory.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage } from "../src/types.js";
import type { HistoryEntry } from "../src/memory.js";

function makeMsg(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1",
    channel: "test",
    sender: { id: "user1", displayName: "Alice" },
    content: { type: ContentType.TEXT, text: "hello" },
    timestamp: new Date("2025-01-01T00:00:00Z"),
    chatId: "c1",
    ...overrides,
  };
}

describe("InMemoryStore", () => {
  it("returns empty array for unknown key", async () => {
    const store = new InMemoryStore();
    expect(await store.get("unknown")).toEqual([]);
  });

  it("appends and retrieves entries", async () => {
    const store = new InMemoryStore();
    const entry: HistoryEntry = { role: "user", content: "hi", timestamp: "2025-01-01T00:00:00Z" };
    await store.append("k", entry);
    const result = await store.get("k");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hi");
  });

  it("trims to maxEntries", async () => {
    const store = new InMemoryStore();
    for (let i = 0; i < 10; i++) {
      await store.append("k", { role: "user", content: `msg${i}`, timestamp: "" });
    }
    await store.trim("k", 3);
    const result = await store.get("k");
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe("msg7");
  });

  it("clear removes all entries for key", async () => {
    const store = new InMemoryStore();
    await store.append("k", { role: "user", content: "hi", timestamp: "" });
    await store.clear("k");
    expect(await store.get("k")).toEqual([]);
  });

  it("trim on nonexistent key is a no-op", async () => {
    const store = new InMemoryStore();
    await store.trim("nonexistent", 5);
    expect(await store.get("nonexistent")).toEqual([]);
  });

  it("clear on nonexistent key is a no-op", async () => {
    const store = new InMemoryStore();
    await store.clear("nonexistent");
    expect(await store.get("nonexistent")).toEqual([]);
  });

  it("trim does not remove entries when count is within limit", async () => {
    const store = new InMemoryStore();
    await store.append("k", { role: "user", content: "a", timestamp: "" });
    await store.append("k", { role: "user", content: "b", timestamp: "" });
    await store.trim("k", 5);
    expect(await store.get("k")).toHaveLength(2);
  });
});

describe("ConversationMemory", () => {
  it("injects history into metadata", async () => {
    const mw = new ConversationMemory();
    const msg = makeMsg();
    const next = vi.fn().mockImplementation(async (m: UnifiedMessage) => {
      expect(m.metadata?.history).toEqual([]);
      return "reply";
    });
    await mw.process(msg, next);
    expect(next).toHaveBeenCalled();
  });

  it("records user message and assistant reply", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    const msg = makeMsg();
    const next = vi.fn().mockResolvedValue("bot reply");
    await mw.process(msg, next);

    const history = await store.get("test:c1");
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "hello" });
    expect(history[1]).toMatchObject({ role: "assistant", content: "bot reply" });
  });

  it("does not record assistant entry when result is null", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    const next = vi.fn().mockResolvedValue(null);
    await mw.process(makeMsg(), next);

    const history = await store.get("test:c1");
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("user");
  });

  it("handles OutboundMessage replies", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    const next = vi.fn().mockResolvedValue({ chatId: "c1", text: "outbound reply" });
    await mw.process(makeMsg(), next);

    const history = await store.get("test:c1");
    expect(history[1]).toMatchObject({ role: "assistant", content: "outbound reply" });
  });

  it("accumulates history across multiple messages", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });

    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "msg1" } }), async () => "r1");
    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "msg2" } }), async () => "r2");

    const history = await store.get("test:c1");
    expect(history).toHaveLength(4);
  });

  it("trims to maxTurns", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store, maxTurns: 2 });

    for (let i = 0; i < 5; i++) {
      await mw.process(
        makeMsg({ content: { type: ContentType.TEXT, text: `msg${i}` } }),
        async () => `reply${i}`
      );
    }

    const history = await store.get("test:c1");
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe("msg3");
  });

  it("uses sender.id as fallback when no chatId", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    const msg = makeMsg({ chatId: undefined });
    await mw.process(msg, async () => "ok");

    const history = await store.get("test:user1");
    expect(history).toHaveLength(2);
  });

  it("records sender displayName", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    await mw.process(makeMsg(), async () => "ok");

    const history = await store.get("test:c1");
    expect(history[0].sender).toBe("Alice");
  });

  // --- New tests ---

  it("multiple chats are isolated", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });

    await mw.process(makeMsg({ chatId: "chat-A" }), async () => "replyA");
    await mw.process(makeMsg({ chatId: "chat-B" }), async () => "replyB");

    const historyA = await store.get("test:chat-A");
    const historyB = await store.get("test:chat-B");
    expect(historyA).toHaveLength(2);
    expect(historyB).toHaveLength(2);
    expect(historyA[0].content).toBe("hello");
    expect(historyA[1].content).toBe("replyA");
    expect(historyB[1].content).toBe("replyB");
  });

  it("maxTurns=1 keeps only the last turn", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store, maxTurns: 1 });

    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "first" } }), async () => "r1");
    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "second" } }), async () => "r2");

    const history = await store.get("test:c1");
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("second");
    expect(history[1].content).toBe("r2");
  });

  it("history ordering is chronological", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });

    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "a" } }), async () => "ra");
    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "b" } }), async () => "rb");

    const history = await store.get("test:c1");
    expect(history.map(h => h.content)).toEqual(["a", "ra", "b", "rb"]);
  });

  it("clear and re-add works", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });

    await mw.process(makeMsg(), async () => "r1");
    await store.clear("test:c1");
    expect(await store.get("test:c1")).toEqual([]);

    await mw.process(makeMsg({ content: { type: ContentType.TEXT, text: "fresh" } }), async () => "r2");
    const history = await store.get("test:c1");
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("fresh");
  });

  it("different channels same chatId are separate", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });

    await mw.process(makeMsg({ channel: "telegram" }), async () => "tg-reply");
    await mw.process(makeMsg({ channel: "discord" }), async () => "dc-reply");

    const tgHistory = await store.get("telegram:c1");
    const dcHistory = await store.get("discord:c1");
    expect(tgHistory).toHaveLength(2);
    expect(dcHistory).toHaveLength(2);
    expect(tgHistory[1].content).toBe("tg-reply");
    expect(dcHistory[1].content).toBe("dc-reply");
  });

  it("records username as fallback when no displayName", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    await mw.process(makeMsg({ sender: { id: "u1", username: "bob" } }), async () => "ok");

    const history = await store.get("test:c1");
    expect(history[0].sender).toBe("bob");
  });

  it("records sender.id as last fallback", async () => {
    const store = new InMemoryStore();
    const mw = new ConversationMemory({ store });
    await mw.process(makeMsg({ sender: { id: "u99" } }), async () => "ok");

    const history = await store.get("test:c1");
    expect(history[0].sender).toBe("u99");
  });
});
