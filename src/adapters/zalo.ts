/** Zalo adapter — Zalo OA API via webhook + REST. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class ZaloAdapter implements ChannelAdapter {
  readonly channelId = "zalo";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private server: any;

  constructor(
    private oaAccessToken: string,
    private options: { port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 9001;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const http = await import("http");

    this.server = http.createServer(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(404); res.end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      if (body.event_name === "user_send_text" && this.handler) {
        const text: string = body.message?.text || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date();

        this.handler({
          id: body.message?.msg_id || String(Date.now()), channel: "zalo",
          sender: { id: body.sender?.id || "" },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(Number(body.timestamp) || Date.now()),
          chatId: body.sender?.id || "", raw: body,
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: 0 }));
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
    const resp = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: this.oaAccessToken },
      body: JSON.stringify({
        recipient: { user_id: msg.chatId },
        message: { text: msg.text },
      }),
    });
    const data = await resp.json() as any;
    this.lastActivity = new Date();
    return data.data?.message_id;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "zalo", lastActivity: this.lastActivity };
  }
}
