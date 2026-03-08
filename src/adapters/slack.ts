/** Slack adapter — @slack/bolt Socket Mode. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class SlackAdapter implements ChannelAdapter {
  readonly channelId = "slack";
  private connected = false;
  private lastActivity?: Date;
  private app: any;
  private handler?: (msg: UnifiedMessage) => void;
  private botUserId?: string;

  constructor(
    private botToken: string,
    private appToken: string,
    private options: { allowedChannelIds?: Set<string>; commandPrefix?: string } = {}
  ) {
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const { App } = await import("@slack/bolt");
    this.app = new App({ token: this.botToken, appToken: this.appToken, socketMode: true });

    this.app.message(async ({ message, say }: any) => {
      if (message.bot_id || message.subtype || !this.handler) return;
      if (this.options.allowedChannelIds && !this.options.allowedChannelIds.has(message.channel)) return;

      const text: string = message.text || "";
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();

      this.handler({
        id: message.ts, channel: "slack",
        sender: { id: message.user },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text },
        timestamp: new Date(Number(message.ts) * 1000),
        chatId: message.channel, threadId: message.thread_ts, replyToId: message.thread_ts,
        raw: message,
      });
    });

    await this.app.start();
    const auth = await this.app.client.auth.test();
    this.botUserId = auth.user_id;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.app?.stop();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const result = await this.app.client.chat.postMessage({
      channel: msg.chatId, text: msg.text, thread_ts: msg.replyToId,
    });
    this.lastActivity = new Date();
    return result.ts;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "slack", accountId: this.botUserId, lastActivity: this.lastActivity };
  }
}
