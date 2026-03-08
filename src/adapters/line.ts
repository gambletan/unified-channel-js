/** LINE adapter — @line/bot-sdk. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class LineAdapter implements ChannelAdapter {
  readonly channelId = "line";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private lineClient: any;
  private server: any;

  constructor(
    private channelSecret: string,
    private channelAccessToken: string,
    private options: { port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 8080;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const line = await import("@line/bot-sdk");
    const express = (await import("express")).default;

    this.lineClient = new line.messagingApi.MessagingApiClient({ channelAccessToken: this.channelAccessToken });
    const app = express();
    app.post("/line/webhook", line.middleware({ channelSecret: this.channelSecret }), (req: any, res: any) => {
      for (const event of req.body.events) {
        if (event.type === "message" && event.message.type === "text" && this.handler) {
          const text: string = event.message.text;
          const prefix = this.options.commandPrefix!;
          const isCmd = text.startsWith(prefix);
          const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
          this.lastActivity = new Date();

          this.handler({
            id: event.message.id, channel: "line",
            sender: { id: event.source.userId },
            content: isCmd
              ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
              : { type: ContentType.TEXT, text },
            timestamp: new Date(event.timestamp),
            chatId: event.source.userId || event.source.groupId, raw: event,
          });
        }
      }
      res.sendStatus(200);
    });

    await new Promise<void>((resolve) => {
      this.server = app.listen(this.options.port, resolve);
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.server?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    await this.lineClient.pushMessage({ to: msg.chatId, messages: [{ type: "text", text: msg.text }] });
    this.lastActivity = new Date();
    return undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "line", lastActivity: this.lastActivity };
  }
}
