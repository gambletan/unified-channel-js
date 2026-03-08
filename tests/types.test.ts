import { describe, it, expect } from "vitest";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage, OutboundMessage, Identity, MessageContent, Button, ChannelStatus } from "../src/types.js";

describe("ContentType enum", () => {
  it("has all expected values", () => {
    expect(ContentType.TEXT).toBe("text");
    expect(ContentType.COMMAND).toBe("command");
    expect(ContentType.MEDIA).toBe("media");
    expect(ContentType.REACTION).toBe("reaction");
    expect(ContentType.EDIT).toBe("edit");
    expect(ContentType.CALLBACK).toBe("callback");
  });
});

describe("UnifiedMessage", () => {
  it("can create a text message", () => {
    const msg: UnifiedMessage = {
      id: "1", channel: "test", sender: { id: "u1" },
      content: { type: ContentType.TEXT, text: "hello" },
      timestamp: new Date(),
    };
    expect(msg.content.type).toBe(ContentType.TEXT);
    expect(msg.content.text).toBe("hello");
  });

  it("can create a command message", () => {
    const msg: UnifiedMessage = {
      id: "2", channel: "test", sender: { id: "u1", username: "alice" },
      content: { type: ContentType.COMMAND, text: "/start", command: "start", args: [] },
      timestamp: new Date(), chatId: "c1",
    };
    expect(msg.content.command).toBe("start");
    expect(msg.sender.username).toBe("alice");
  });

  it("supports optional fields", () => {
    const msg: UnifiedMessage = {
      id: "3", channel: "test", sender: { id: "u1" },
      content: { type: ContentType.TEXT, text: "hi" },
      timestamp: new Date(),
      threadId: "t1", replyToId: "r1", chatId: "c1",
      raw: { foo: 1 }, metadata: { bar: 2 },
    };
    expect(msg.threadId).toBe("t1");
    expect(msg.metadata?.bar).toBe(2);
  });
});

describe("OutboundMessage", () => {
  it("can create with buttons", () => {
    const msg: OutboundMessage = {
      chatId: "c1", text: "Choose:",
      buttons: [[{ label: "A", callbackData: "a" }, { label: "B", url: "https://b.com" }]],
    };
    expect(msg.buttons![0]).toHaveLength(2);
    expect(msg.buttons![0][1].url).toBe("https://b.com");
  });
});

describe("Identity", () => {
  it("supports full identity", () => {
    const id: Identity = { id: "u1", username: "alice", displayName: "Alice" };
    expect(id.displayName).toBe("Alice");
  });
});

describe("ChannelStatus", () => {
  it("represents connected status", () => {
    const s: ChannelStatus = { connected: true, channel: "telegram", accountId: "bot123", lastActivity: new Date() };
    expect(s.connected).toBe(true);
  });

  it("represents error status", () => {
    const s: ChannelStatus = { connected: false, channel: "discord", error: "Auth failed" };
    expect(s.error).toBe("Auth failed");
  });
});
