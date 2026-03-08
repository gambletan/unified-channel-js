/** Telegram adapter — grammy. Supports both polling and webhook modes. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export interface TelegramWebhookConfig {
  /** Receive mode: long polling (default) or webhook. */
  mode?: "polling" | "webhook";
  /** Public URL that Telegram will POST updates to (required for webhook mode). */
  webhookUrl?: string;
  /** Local port the HTTP server listens on. Defaults to 8443. */
  port?: number;
  /** URL path for the webhook endpoint. Defaults to `/telegram-webhook`. */
  path?: string;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly channelId = "telegram";
  private connected = false;
  private lastActivity?: Date;
  private bot: any;
  private handler?: (msg: UnifiedMessage) => void;
  private botUsername?: string;
  private readonly config: TelegramWebhookConfig;
  private server?: import("http").Server;

  constructor(private token: string, parseModeOrConfig?: string | TelegramWebhookConfig, config?: TelegramWebhookConfig) {
    // Support both old signature (token, parseMode) and new (token, config)
    if (typeof parseModeOrConfig === "object") {
      this.parseMode = "Markdown";
      this.config = parseModeOrConfig;
    } else {
      this.parseMode = parseModeOrConfig ?? "Markdown";
      this.config = config ?? {};
    }
  }

  private parseMode: string;

  get mode(): "polling" | "webhook" {
    return this.config.mode ?? "polling";
  }

  async connect(): Promise<void> {
    const { Bot } = await import("grammy");
    this.bot = new Bot(this.token);

    this.registerHandlers();

    const me = await this.bot.api.getMe();
    this.botUsername = me.username;

    if (this.mode === "webhook") {
      await this.startWebhook();
    } else {
      this.bot.start({ drop_pending_updates: true });
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.mode === "webhook") {
      await this.stopWebhook();
    } else {
      await this.bot?.stop();
    }
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void {
    this.handler = handler;
  }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const opts: any = {};
    if (msg.parseMode || this.parseMode) opts.parse_mode = msg.parseMode || this.parseMode;
    if (msg.replyToId) opts.reply_to_message_id = Number(msg.replyToId);
    if (msg.buttons) {
      opts.reply_markup = {
        inline_keyboard: msg.buttons.map((row) =>
          row.map((b) => ({ text: b.label, callback_data: b.callbackData, url: b.url }))
        ),
      };
    }
    const sent = await this.bot.api.sendMessage(Number(msg.chatId), msg.text, opts);
    this.lastActivity = new Date();
    return String(sent.message_id);
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "telegram", accountId: this.botUsername, lastActivity: this.lastActivity };
  }

  // -- Private helpers --

  private registerHandlers(): void {
    this.bot.on("message:text", (ctx: any) => {
      if (!this.handler) return;
      const text: string = ctx.message.text;
      const isCmd = text.startsWith("/");
      const parts = isCmd ? text.slice(1).split(/\s+/) : [];

      this.lastActivity = new Date();
      this.handler({
        id: String(ctx.message.message_id),
        channel: "telegram",
        sender: {
          id: String(ctx.from.id),
          username: ctx.from.username,
          displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
        },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0].split("@")[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text },
        timestamp: new Date(ctx.message.date * 1000),
        chatId: String(ctx.chat.id),
        replyToId: ctx.message.reply_to_message ? String(ctx.message.reply_to_message.message_id) : undefined,
        raw: ctx,
      });
    });

    this.bot.on("callback_query:data", (ctx: any) => {
      if (!this.handler) return;
      ctx.answerCallbackQuery();
      this.lastActivity = new Date();
      this.handler({
        id: String(ctx.callbackQuery.id),
        channel: "telegram",
        sender: { id: String(ctx.from.id), username: ctx.from.username },
        content: { type: ContentType.CALLBACK, text: ctx.callbackQuery.data, callbackData: ctx.callbackQuery.data },
        timestamp: new Date(),
        chatId: ctx.callbackQuery.message ? String(ctx.callbackQuery.message.chat.id) : undefined,
        raw: ctx,
      });
    });
  }

  private async startWebhook(): Promise<void> {
    const webhookUrl = this.config.webhookUrl;
    if (!webhookUrl) {
      throw new Error("webhookUrl is required for webhook mode");
    }

    const port = this.config.port ?? 8443;
    const path = this.config.path ?? "/telegram-webhook";

    // Set webhook with Telegram API
    await this.bot.api.setWebhook(webhookUrl + path);

    // Initialize grammy's bot.init() so update handling works
    await this.bot.init();

    // Create HTTP server using Node's built-in http module
    const http = await import("http");
    this.server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === path) {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const update = JSON.parse(body);
            await this.bot.handleUpdate(update);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end("{}");
          } catch {
            res.writeHead(400);
            res.end("Bad Request");
          }
        });
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, () => resolve());
    });
  }

  private async stopWebhook(): Promise<void> {
    // Delete webhook from Telegram
    try {
      await this.bot?.api.deleteWebhook();
    } catch {
      // Best effort
    }

    // Close the HTTP server
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = undefined;
    }
  }
}
