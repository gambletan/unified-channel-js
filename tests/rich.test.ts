import { describe, it, expect } from "vitest";
import { RichReply } from "../src/rich.js";

describe("RichReply", () => {
  it("builds plain text from text sections", () => {
    const reply = new RichReply().text("Hello").text("World");
    expect(reply.toPlainText()).toBe("Hello\nWorld");
  });

  it("renders a table in plain text", () => {
    const reply = new RichReply().table(["Name", "Age"], [["Alice", "30"], ["Bob", "25"]]);
    const text = reply.toPlainText();
    expect(text).toContain("Name");
    expect(text).toContain("Alice");
    expect(text).toContain("---");
  });

  it("renders buttons in plain text as bracketed labels", () => {
    const reply = new RichReply().buttons([[{ label: "Yes" }, { label: "No" }]]);
    expect(reply.toPlainText()).toContain("[Yes]");
    expect(reply.toPlainText()).toContain("[No]");
  });

  it("renders image placeholder in plain text", () => {
    const reply = new RichReply().image("https://img.png", "cat photo");
    expect(reply.toPlainText()).toContain("[Image: cat photo]");
  });

  it("renders code block in plain text", () => {
    const reply = new RichReply().code("const x = 1;", "typescript");
    const text = reply.toPlainText();
    expect(text).toContain("```typescript");
    expect(text).toContain("const x = 1;");
  });

  it("renders divider in plain text", () => {
    const reply = new RichReply().text("above").divider().text("below");
    expect(reply.toPlainText()).toContain("---");
  });

  it("generates Telegram HTML with inline keyboard", () => {
    const reply = new RichReply()
      .text("Choose:")
      .buttons([[{ label: "A", callbackData: "a" }, { label: "Link", url: "https://x.com" }]]);
    const tg = reply.toTelegram();
    expect(tg.parse_mode).toBe("HTML");
    expect(tg.text).toContain("Choose:");
    expect(tg.reply_markup).toBeDefined();
    const kb = (tg.reply_markup as Record<string, unknown>).inline_keyboard as Record<string, unknown>[][];
    expect(kb[0]).toHaveLength(2);
    expect(kb[0][0]).toMatchObject({ text: "A", callback_data: "a" });
    expect(kb[0][1]).toMatchObject({ text: "Link", url: "https://x.com" });
  });

  it("generates Discord components for buttons", () => {
    const reply = new RichReply()
      .text("Pick one")
      .buttons([[{ label: "OK", callbackData: "ok" }]]);
    const dc = reply.toDiscord();
    expect(dc.content).toContain("Pick one");
    expect(dc.components).toBeDefined();
    expect(dc.components![0]).toMatchObject({ type: 1 });
  });

  it("generates Slack Block Kit blocks", () => {
    const reply = new RichReply()
      .text("Status report")
      .divider()
      .code("console.log('hi')");
    const sl = reply.toSlack();
    expect(sl.blocks).toHaveLength(3);
    expect(sl.blocks[0]).toMatchObject({ type: "section" });
    expect(sl.blocks[1]).toMatchObject({ type: "divider" });
  });

  it("toOutbound falls back to plain text for unknown channel", () => {
    const reply = new RichReply().text("hello").divider();
    const out = reply.toOutbound("irc");
    expect(out.text).toBe("hello\n---");
  });

  it("toOutbound generates telegram-specific output", () => {
    const reply = new RichReply().text("hi");
    const out = reply.toOutbound("telegram");
    expect(out.parseMode).toBe("HTML");
    expect(out.text).toBe("hi");
  });

  it("supports fluent chaining", () => {
    const reply = new RichReply()
      .text("a")
      .table(["H"], [["v"]])
      .buttons([[{ label: "B" }]])
      .image("url")
      .code("x")
      .divider();
    // Should not throw; plain text should include all sections
    const text = reply.toPlainText();
    expect(text).toContain("a");
    expect(text).toContain("[B]");
    expect(text).toContain("---");
  });
});
