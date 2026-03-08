/** WhatsApp adapter — whatsapp-web.js (headless Chrome). */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelId = "whatsapp";
  private connected = false;
  private lastActivity?: Date;
  private client: any;
  private handler?: (msg: UnifiedMessage) => void;
  private phoneNumber?: string;

  constructor(private options: { authStrategy?: "local" | "none"; commandPrefix?: string } = {}) {
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const { Client, LocalAuth } = await import("whatsapp-web.js");
    this.client = new Client({
      authStrategy: this.options.authStrategy === "none" ? undefined : new LocalAuth(),
    });

    this.client.on("message", (message: any) => {
      if (!this.handler) return;
      const text: string = message.body || "";
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();

      this.handler({
        id: message.id._serialized, channel: "whatsapp",
        sender: { id: message.from, displayName: message._data?.notifyName },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : message.hasMedia
            ? { type: ContentType.MEDIA, text, mediaType: message.type }
            : { type: ContentType.TEXT, text },
        timestamp: new Date(message.timestamp * 1000),
        chatId: message.from, replyToId: message._data?.quotedStanzaID,
        raw: message,
      });
    });

    this.client.on("qr", (qr: string) => console.log("WhatsApp QR:", qr));
    this.client.on("ready", () => { this.connected = true; });

    await this.client.initialize();
    const info = this.client.info;
    this.phoneNumber = info?.wid?.user;
  }

  async disconnect(): Promise<void> {
    await this.client?.destroy();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const sent = await this.client.sendMessage(msg.chatId, msg.text);
    this.lastActivity = new Date();
    return sent?.id?._serialized;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "whatsapp", accountId: this.phoneNumber, lastActivity: this.lastActivity };
  }
}
