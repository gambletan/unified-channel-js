/** Telegram adapter — grammy. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class TelegramAdapter implements ChannelAdapter {
  readonly channelId = "telegram";
  private connected = false;
  private lastActivity?: Date;
  private bot: any;
  private handler?: (msg: UnifiedMessage) => void;
  private botUsername?: string;

  constructor(private token: string, private parseMode: string = "Markdown") {}

  async connect(): Promise<void> {
    const { Bot } = await import("grammy");
    this.bot = new Bot(this.token);

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

    const me = await this.bot.api.getMe();
    this.botUsername = me.username;
    this.bot.start({ drop_pending_updates: true });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.bot?.stop();
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
}
