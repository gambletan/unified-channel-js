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
    const text = reply.toPlainText();
    expect(text).toContain("a");
    expect(text).toContain("[B]");
    expect(text).toContain("---");
  });

  // --- New tests ---

  it("empty RichReply produces empty string", () => {
    const reply = new RichReply();
    expect(reply.toPlainText()).toBe("");
  });

  it("empty RichReply telegram has empty text", () => {
    const reply = new RichReply();
    const tg = reply.toTelegram();
    expect(tg.text).toBe("");
    expect(tg.parse_mode).toBe("HTML");
    expect(tg.reply_markup).toBeUndefined();
  });

  it("table with no rows renders headers and separator only", () => {
    const reply = new RichReply().table(["Col1", "Col2"], []);
    const text = reply.toPlainText();
    expect(text).toContain("Col1");
    expect(text).toContain("Col2");
    // Should have header separator
    expect(text).toContain("----");
  });

  it("unknown channel fallback in toOutbound uses plain text", () => {
    const reply = new RichReply()
      .text("Hello")
      .code("x = 1", "python")
      .divider();
    const out = reply.toOutbound("somecustomchannel");
    expect(out.text).toContain("Hello");
    expect(out.text).toContain("```python");
    expect(out.text).toContain("---");
    expect(out.parseMode).toBeUndefined();
  });

  it("all section types combined in plain text", () => {
    const reply = new RichReply()
      .text("Title")
      .divider()
      .table(["K", "V"], [["a", "1"]])
      .code("fn()", "js")
      .image("https://img.png")
      .buttons([[{ label: "Go" }]]);
    const text = reply.toPlainText();
    expect(text).toContain("Title");
    expect(text).toContain("---");
    expect(text).toContain("K");
    expect(text).toContain("```js");
    expect(text).toContain("[Image: https://img.png]");
    expect(text).toContain("[Go]");
  });

  it("Telegram image renders as HTML link", () => {
    const reply = new RichReply().image("https://pic.png", "My Photo");
    const tg = reply.toTelegram();
    expect(tg.text).toContain('<a href="https://pic.png">My Photo</a>');
  });

  it("Telegram image without alt uses 'Image' label", () => {
    const reply = new RichReply().image("https://pic.png");
    const tg = reply.toTelegram();
    expect(tg.text).toContain('<a href="https://pic.png">Image</a>');
  });

  it("Telegram code block uses language class", () => {
    const reply = new RichReply().code("print('hi')", "python");
    const tg = reply.toTelegram();
    expect(tg.text).toContain('class="language-python"');
    expect(tg.text).toContain("print('hi')");
  });

  it("Telegram divider renders as em dashes", () => {
    const reply = new RichReply().divider();
    const tg = reply.toTelegram();
    // Uses em-dash divider
    expect(tg.text.length).toBeGreaterThan(0);
  });

  it("Slack blocks has proper structure for text", () => {
    const reply = new RichReply().text("Hello Slack");
    const sl = reply.toSlack();
    expect(sl.blocks).toHaveLength(1);
    expect(sl.blocks[0]).toMatchObject({
      type: "section",
      text: { type: "mrkdwn", text: "Hello Slack" },
    });
  });

  it("Slack blocks for buttons use actions type", () => {
    const reply = new RichReply().buttons([
      [{ label: "Click", callbackData: "click" }, { label: "Link", url: "https://x.com" }],
    ]);
    const sl = reply.toSlack();
    expect(sl.blocks).toHaveLength(1);
    expect(sl.blocks[0]).toMatchObject({ type: "actions" });
    const elements = (sl.blocks[0] as any).elements;
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({ type: "button", text: { type: "plain_text", text: "Click" } });
    expect(elements[1]).toMatchObject({ type: "button", url: "https://x.com" });
  });

  it("Slack image block", () => {
    const reply = new RichReply().image("https://img.png", "photo");
    const sl = reply.toSlack();
    expect(sl.blocks[0]).toMatchObject({
      type: "image",
      image_url: "https://img.png",
      alt_text: "photo",
    });
  });

  it("Discord embed for image", () => {
    const reply = new RichReply().image("https://img.png", "photo");
    const dc = reply.toDiscord();
    expect(dc.embeds).toBeDefined();
    expect(dc.embeds![0]).toMatchObject({ image: { url: "https://img.png" }, description: "photo" });
  });

  it("Discord URL button uses style 5", () => {
    const reply = new RichReply().buttons([[{ label: "Visit", url: "https://x.com" }]]);
    const dc = reply.toDiscord();
    const btn = (dc.components![0] as any).components[0];
    expect(btn).toMatchObject({ type: 2, style: 5, label: "Visit", url: "https://x.com" });
  });

  it("toOutbound for discord sets metadata", () => {
    const reply = new RichReply().text("Hi").image("https://img.png");
    const out = reply.toOutbound("discord");
    expect(out.text).toContain("Hi");
    expect(out.metadata).toBeDefined();
    expect(out.metadata!.embeds).toBeDefined();
  });

  it("toOutbound for slack sets blocks in metadata", () => {
    const reply = new RichReply().text("Hi");
    const out = reply.toOutbound("slack");
    expect(out.metadata).toBeDefined();
    expect(out.metadata!.blocks).toBeDefined();
    // Fallback text is also set
    expect(out.text).toContain("Hi");
  });

  it("plain text image without alt uses URL", () => {
    const reply = new RichReply().image("https://example.com/pic.png");
    expect(reply.toPlainText()).toContain("[Image: https://example.com/pic.png]");
  });

  it("toOutbound telegram with buttons sets buttons field", () => {
    const reply = new RichReply().buttons([[{ label: "OK", callbackData: "ok" }]]);
    const out = reply.toOutbound("telegram");
    expect(out.buttons).toBeDefined();
    expect(out.buttons![0][0].label).toBe("OK");
  });
});
