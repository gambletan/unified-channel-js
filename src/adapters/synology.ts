/** Synology Chat adapter — webhook + REST. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class SynologyAdapter implements ChannelAdapter {
  readonly channelId = "synology";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private server: any;

  constructor(
    private serverUrl: string,
    private incomingWebhookToken: string,
    private outgoingWebhookUrl: string,
    private options: { port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 9002;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const http = await import("http");

    this.server = http.createServer(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(404); res.end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      if (body.token === this.incomingWebhookToken && this.handler) {
        const text: string = body.text || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date();

        this.handler({
          id: String(body.post_id || Date.now()), channel: "synology",
          sender: { id: String(body.user_id || ""), username: body.username },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(), chatId: String(body.channel_id || ""), raw: body,
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
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
    await fetch(this.outgoingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text }),
    });
    this.lastActivity = new Date();
    return undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "synology", lastActivity: this.lastActivity };
  }
}
