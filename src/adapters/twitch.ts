/** Twitch adapter — tmi.js. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class TwitchAdapter implements ChannelAdapter {
  readonly channelId = "twitch";
  private connected = false;
  private lastActivity?: Date;
  private client: any;
  private handler?: (msg: UnifiedMessage) => void;
  private msgCounter = 0;

  constructor(
    private username: string,
    private oauthToken: string,
    private channels: string[],
    private options: { commandPrefix?: string } = {}
  ) {
    this.options.commandPrefix ??= "!";
  }

  async connect(): Promise<void> {
    const tmi = await import("tmi.js");
    this.client = new tmi.Client({
      identity: { username: this.username, password: this.oauthToken },
      channels: this.channels,
    });

    this.client.on("message", (channel: string, tags: any, message: string, self: boolean) => {
      if (self || !this.handler) return;
      const prefix = this.options.commandPrefix!;
      const isCmd = message.startsWith(prefix);
      const parts = isCmd ? message.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();
      this.msgCounter++;

      this.handler({
        id: tags.id || String(this.msgCounter), channel: "twitch",
        sender: { id: tags["user-id"] || tags.username, username: tags.username, displayName: tags["display-name"] },
        content: isCmd
          ? { type: ContentType.COMMAND, text: message, command: parts[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text: message },
        timestamp: new Date(), chatId: channel.replace("#", ""), raw: { tags, message },
      });
    });

    await this.client.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.client?.disconnect();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    await this.client.say(msg.chatId, msg.text);
    this.lastActivity = new Date();
    return undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "twitch", accountId: this.username, lastActivity: this.lastActivity };
  }
}
