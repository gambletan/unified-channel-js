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
    // maxTurns=2 means keep last 4 entries (2 turns * 2 entries each)
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
});
