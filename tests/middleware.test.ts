import { describe, it, expect, vi } from "vitest";
import { AccessMiddleware, CommandMiddleware } from "../src/middleware.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage } from "../src/types.js";

function makeMsg(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1", channel: "test", sender: { id: "user1" },
    content: { type: ContentType.TEXT, text: "hello" },
    timestamp: new Date(), chatId: "c1",
    ...overrides,
  };
}

describe("AccessMiddleware", () => {
  it("passes through when no allowlist set", async () => {
    const mw = new AccessMiddleware();
    const next = vi.fn().mockResolvedValue("ok");
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("ok");
    expect(next).toHaveBeenCalled();
  });

  it("passes through for allowed user", async () => {
    const mw = new AccessMiddleware(["user1"]);
    const next = vi.fn().mockResolvedValue("ok");
    await mw.process(makeMsg(), next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks unauthorized user", async () => {
    const mw = new AccessMiddleware(["admin"]);
    const next = vi.fn().mockResolvedValue("ok");
    const result = await mw.process(makeMsg(), next);
    expect(result).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("CommandMiddleware", () => {
  it("routes known commands", async () => {
    const mw = new CommandMiddleware();
    mw.command("start", async () => "started!");
    const msg = makeMsg({ content: { type: ContentType.COMMAND, text: "/start", command: "start", args: [] } });
    const next = vi.fn().mockResolvedValue(null);
    const result = await mw.process(msg, next);
    expect(result).toBe("started!");
    expect(next).not.toHaveBeenCalled();
  });

  it("passes unknown commands to next", async () => {
    const mw = new CommandMiddleware();
    mw.command("start", async () => "started!");
    const msg = makeMsg({ content: { type: ContentType.COMMAND, text: "/unknown", command: "unknown", args: [] } });
    const next = vi.fn().mockResolvedValue("fallback");
    const result = await mw.process(msg, next);
    expect(result).toBe("fallback");
    expect(next).toHaveBeenCalled();
  });

  it("passes non-command messages to next", async () => {
    const mw = new CommandMiddleware();
    mw.command("start", async () => "started!");
    const next = vi.fn().mockResolvedValue("text handler");
    const result = await mw.process(makeMsg(), next);
    expect(result).toBe("text handler");
  });

  it("lists registered commands", () => {
    const mw = new CommandMiddleware();
    mw.command("a", async () => null).command("b", async () => null);
    expect(mw.registeredCommands).toEqual(["a", "b"]);
  });

  it("passes args correctly", async () => {
    const mw = new CommandMiddleware();
    mw.command("echo", async (m) => m.content.args?.join(" ") || "");
    const msg = makeMsg({ content: { type: ContentType.COMMAND, text: "/echo hi world", command: "echo", args: ["hi", "world"] } });
    const next = vi.fn();
    const result = await mw.process(msg, next);
    expect(result).toBe("hi world");
  });
});
