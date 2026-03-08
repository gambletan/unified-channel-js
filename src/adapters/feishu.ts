/** Feishu/Lark adapter — @larksuiteoapi/node-sdk. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class FeishuAdapter implements ChannelAdapter {
  readonly channelId = "feishu";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private larkClient: any;
  private server: any;

  constructor(
    private appId: string,
    private appSecret: string,
    private options: { verificationToken?: string; port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 9000;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const lark = await import("@larksuiteoapi/node-sdk");
    const http = await import("http");

    this.larkClient = new lark.Client({ appId: this.appId, appSecret: this.appSecret });

    this.server = http.createServer(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(404); res.end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      if (body.type === "url_verification") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: body.challenge }));
        return;
      }

      const event = body.event;
      if (body.header?.event_type === "im.message.receive_v1" && event && this.handler) {
        const message = event.message;
        const content = JSON.parse(message.content || "{}");
        const text: string = content.text || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date();

        this.handler({
          id: message.message_id, channel: "feishu",
          sender: { id: event.sender?.sender_id?.open_id || "" },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(Number(message.create_time) || Date.now()),
          chatId: message.chat_id, raw: body,
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0 }));
    });

    await new Promise<void>((resolve) => this.server.listen(this.options.port, resolve));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.server?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const resp = await this.larkClient.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: { receive_id: msg.chatId, msg_type: "text", content: JSON.stringify({ text: msg.text }) },
    });
    this.lastActivity = new Date();
    return resp?.data?.message_id;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "feishu", accountId: this.appId, lastActivity: this.lastActivity };
  }
}
