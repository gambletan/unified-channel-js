/** RichReply — fluent builder for cross-platform rich messages. */

import type { Button, OutboundMessage } from "./types.js";

type SectionType = "text" | "table" | "buttons" | "image" | "code" | "divider";

interface TextSection {
  type: "text";
  text: string;
}

interface TableSection {
  type: "table";
  headers: string[];
  rows: string[][];
}

interface ButtonsSection {
  type: "buttons";
  buttons: Button[][];
}

interface ImageSection {
  type: "image";
  url: string;
  alt?: string;
}

interface CodeSection {
  type: "code";
  code: string;
  language?: string;
}

interface DividerSection {
  type: "divider";
}

type Section =
  | TextSection
  | TableSection
  | ButtonsSection
  | ImageSection
  | CodeSection
  | DividerSection;

/** Build rich replies that auto-degrade to plain text for unsupported platforms. */
export class RichReply {
  private sections: Section[] = [];

  text(text: string): this {
    this.sections.push({ type: "text", text });
    return this;
  }

  table(headers: string[], rows: string[][]): this {
    this.sections.push({ type: "table", headers, rows });
    return this;
  }

  buttons(buttons: Button[][]): this {
    this.sections.push({ type: "buttons", buttons });
    return this;
  }

  image(url: string, alt?: string): this {
    this.sections.push({ type: "image", url, alt });
    return this;
  }

  code(code: string, language?: string): this {
    this.sections.push({ type: "code", code, language });
    return this;
  }

  divider(): this {
    this.sections.push({ type: "divider" });
    return this;
  }

  /** Render as plain text (universal fallback). */
  toPlainText(): string {
    const parts: string[] = [];
    for (const s of this.sections) {
      switch (s.type) {
        case "text":
          parts.push(s.text);
          break;
        case "table": {
          const widths = s.headers.map((h, i) => {
            const colValues = [h, ...s.rows.map((r) => r[i] ?? "")];
            return Math.max(...colValues.map((v) => v.length));
          });
          const pad = (v: string, w: number) => v.padEnd(w);
          parts.push(s.headers.map((h, i) => pad(h, widths[i])).join(" | "));
          parts.push(widths.map((w) => "-".repeat(w)).join("-+-"));
          for (const row of s.rows) {
            parts.push(row.map((c, i) => pad(c, widths[i])).join(" | "));
          }
          break;
        }
        case "buttons":
          for (const row of s.buttons) {
            parts.push(row.map((b) => `[${b.label}]`).join("  "));
          }
          break;
        case "image":
          parts.push(s.alt ? `[Image: ${s.alt}]` : `[Image: ${s.url}]`);
          break;
        case "code":
          parts.push("```" + (s.language ?? ""));
          parts.push(s.code);
          parts.push("```");
          break;
        case "divider":
          parts.push("---");
          break;
      }
    }
    return parts.join("\n");
  }

  /** Render for Telegram (HTML parse mode). */
  toTelegram(): { text: string; parse_mode: string; reply_markup?: Record<string, unknown> } {
    const parts: string[] = [];
    let replyMarkup: Record<string, unknown> | undefined;

    for (const s of this.sections) {
      switch (s.type) {
        case "text":
          parts.push(s.text);
          break;
        case "table": {
          parts.push("<pre>");
          const widths = s.headers.map((h, i) => {
            const colValues = [h, ...s.rows.map((r) => r[i] ?? "")];
            return Math.max(...colValues.map((v) => v.length));
          });
          const pad = (v: string, w: number) => v.padEnd(w);
          parts.push(s.headers.map((h, i) => pad(h, widths[i])).join(" | "));
          parts.push(widths.map((w) => "-".repeat(w)).join("-+-"));
          for (const row of s.rows) {
            parts.push(row.map((c, i) => pad(c, widths[i])).join(" | "));
          }
          parts.push("</pre>");
          break;
        }
        case "buttons": {
          const inlineKeyboard = s.buttons.map((row) =>
            row.map((b) => {
              if (b.url) return { text: b.label, url: b.url };
              return { text: b.label, callback_data: b.callbackData ?? b.label };
            })
          );
          replyMarkup = { inline_keyboard: inlineKeyboard };
          break;
        }
        case "image":
          parts.push(`<a href="${s.url}">${s.alt ?? "Image"}</a>`);
          break;
        case "code":
          parts.push(`<pre><code class="language-${s.language ?? ""}">${s.code}</code></pre>`);
          break;
        case "divider":
          parts.push("—————");
          break;
      }
    }

    const result: { text: string; parse_mode: string; reply_markup?: Record<string, unknown> } = {
      text: parts.join("\n"),
      parse_mode: "HTML",
    };
    if (replyMarkup) result.reply_markup = replyMarkup;
    return result;
  }

  /** Render for Discord (embeds + components). */
  toDiscord(): { content?: string; embeds?: Record<string, unknown>[]; components?: Record<string, unknown>[] } {
    const textParts: string[] = [];
    const embeds: Record<string, unknown>[] = [];
    const components: Record<string, unknown>[] = [];

    for (const s of this.sections) {
      switch (s.type) {
        case "text":
          textParts.push(s.text);
          break;
        case "table": {
          const widths = s.headers.map((h, i) => {
            const colValues = [h, ...s.rows.map((r) => r[i] ?? "")];
            return Math.max(...colValues.map((v) => v.length));
          });
          const pad = (v: string, w: number) => v.padEnd(w);
          let tbl = "```\n";
          tbl += s.headers.map((h, i) => pad(h, widths[i])).join(" | ") + "\n";
          tbl += widths.map((w) => "-".repeat(w)).join("-+-") + "\n";
          for (const row of s.rows) {
            tbl += row.map((c, i) => pad(c, widths[i])).join(" | ") + "\n";
          }
          tbl += "```";
          textParts.push(tbl);
          break;
        }
        case "buttons": {
          for (const row of s.buttons) {
            const actionRow: Record<string, unknown> = {
              type: 1,
              components: row.map((b, idx) => {
                if (b.url) {
                  return { type: 2, style: 5, label: b.label, url: b.url };
                }
                return { type: 2, style: 1, label: b.label, custom_id: b.callbackData ?? `btn_${idx}` };
              }),
            };
            components.push(actionRow);
          }
          break;
        }
        case "image":
          embeds.push({ image: { url: s.url }, description: s.alt });
          break;
        case "code":
          textParts.push("```" + (s.language ?? "") + "\n" + s.code + "\n```");
          break;
        case "divider":
          textParts.push("---");
          break;
      }
    }

    const result: { content?: string; embeds?: Record<string, unknown>[]; components?: Record<string, unknown>[] } = {};
    if (textParts.length > 0) result.content = textParts.join("\n");
    if (embeds.length > 0) result.embeds = embeds;
    if (components.length > 0) result.components = components;
    return result;
  }

  /** Render for Slack (Block Kit). */
  toSlack(): { blocks: Record<string, unknown>[] } {
    const blocks: Record<string, unknown>[] = [];

    for (const s of this.sections) {
      switch (s.type) {
        case "text":
          blocks.push({ type: "section", text: { type: "mrkdwn", text: s.text } });
          break;
        case "table": {
          const widths = s.headers.map((h, i) => {
            const colValues = [h, ...s.rows.map((r) => r[i] ?? "")];
            return Math.max(...colValues.map((v) => v.length));
          });
          const pad = (v: string, w: number) => v.padEnd(w);
          let tbl = s.headers.map((h, i) => pad(h, widths[i])).join(" | ") + "\n";
          tbl += widths.map((w) => "-".repeat(w)).join("-+-") + "\n";
          for (const row of s.rows) {
            tbl += row.map((c, i) => pad(c, widths[i])).join(" | ") + "\n";
          }
          blocks.push({ type: "section", text: { type: "mrkdwn", text: "```" + tbl + "```" } });
          break;
        }
        case "buttons": {
          const elements = s.buttons.flat().map((b) => {
            if (b.url) {
              return { type: "button", text: { type: "plain_text", text: b.label }, url: b.url };
            }
            return {
              type: "button",
              text: { type: "plain_text", text: b.label },
              action_id: b.callbackData ?? b.label,
            };
          });
          blocks.push({ type: "actions", elements });
          break;
        }
        case "image":
          blocks.push({
            type: "image",
            image_url: s.url,
            alt_text: s.alt ?? "image",
          });
          break;
        case "code":
          blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "```" + s.code + "```" },
          });
          break;
        case "divider":
          blocks.push({ type: "divider" });
          break;
      }
    }

    return { blocks };
  }

  /** Convert to OutboundMessage for a specific channel, with auto-fallback. */
  toOutbound(channel: string): OutboundMessage {
    const base: OutboundMessage = { chatId: "", text: "" };

    switch (channel) {
      case "telegram": {
        const tg = this.toTelegram();
        base.text = tg.text;
        base.parseMode = tg.parse_mode;
        if (tg.reply_markup) {
          base.metadata = { reply_markup: tg.reply_markup };
        }
        // Extract buttons for the OutboundMessage.buttons field
        const btnSection = this.sections.find((s) => s.type === "buttons") as ButtonsSection | undefined;
        if (btnSection) base.buttons = btnSection.buttons;
        break;
      }
      case "discord": {
        const dc = this.toDiscord();
        base.text = dc.content ?? "";
        base.metadata = {};
        if (dc.embeds) base.metadata.embeds = dc.embeds;
        if (dc.components) base.metadata.components = dc.components;
        break;
      }
      case "slack": {
        const sl = this.toSlack();
        base.text = this.toPlainText(); // fallback text
        base.metadata = { blocks: sl.blocks };
        break;
      }
      default:
        // Fall back to plain text for any unsupported channel
        base.text = this.toPlainText();
        break;
    }

    return base;
  }
}
