/** Discord adapter — discord.js. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class DiscordAdapter implements ChannelAdapter {
  readonly channelId = "discord";
  private connected = false;
  private lastActivity?: Date;
  private client: any;
  private handler?: (msg: UnifiedMessage) => void;
  private botUser?: string;

  constructor(
    private token: string,
    private options: { allowedChannelIds?: Set<string>; allowDm?: boolean; commandPrefix?: string } = {}
  ) {
    this.options.allowDm ??= true;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const { Client, GatewayIntentBits } = await import("discord.js");
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    });

    this.client.on("messageCreate", (message: any) => {
      if (message.author.bot || !this.handler) return;
      if (message.channel.isDMBased?.() && !this.options.allowDm) return;
      if (this.options.allowedChannelIds && !message.channel.isDMBased?.() && !this.options.allowedChannelIds.has(message.channelId)) return;

      const text: string = message.content || "";
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();

      this.handler({
        id: message.id, channel: "discord",
        sender: { id: message.author.id, username: message.author.username, displayName: message.author.displayName },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : message.attachments.size
            ? { type: ContentType.MEDIA, text, mediaUrl: message.attachments.first()?.url, mediaType: message.attachments.first()?.contentType }
            : { type: ContentType.TEXT, text },
        timestamp: message.createdAt, chatId: message.channelId,
        replyToId: message.reference?.messageId, raw: message,
      });
    });

    await this.client.login(this.token);
    this.botUser = this.client.user?.tag;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.client?.destroy();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const channel = await this.client.channels.fetch(msg.chatId);
    if (!channel?.isTextBased?.()) return undefined;
    const sent = await channel.send({ content: msg.text });
    this.lastActivity = new Date();
    return sent.id;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "discord", accountId: this.botUser, lastActivity: this.lastActivity };
  }
}
