/** Google Chat adapter — webhook + REST via service account. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class GoogleChatAdapter implements ChannelAdapter {
  readonly channelId = "googlechat";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private server: any;
  private accessToken?: string;

  constructor(
    private serviceAccountKeyPath: string,
    private options: { port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 9003;
    this.options.commandPrefix ??= "/";
  }

  private async getAccessToken(): Promise<string> {
    const fs = await import("fs");
    const crypto = await import("crypto");
    const key = JSON.parse(fs.readFileSync(this.serviceAccountKeyPath, "utf8"));

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: key.client_email, scope: "https://www.googleapis.com/auth/chat.bot",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })).toString("base64url");
    const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), key.private_key).toString("base64url");

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${signature}`,
    });
    const data = await resp.json() as any;
    return data.access_token;
  }

  async connect(): Promise<void> {
    const http = await import("http");
    this.accessToken = await this.getAccessToken();

    this.server = http.createServer(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(404); res.end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      if (body.type === "MESSAGE" && this.handler) {
        const text: string = body.message?.argumentText?.trim() || body.message?.text || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date();

        this.handler({
          id: body.message?.name || String(Date.now()), channel: "googlechat",
          sender: { id: body.user?.name || "", displayName: body.user?.displayName },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(body.message?.createTime || Date.now()),
          chatId: body.space?.name || "", threadId: body.message?.thread?.name, raw: body,
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
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
    if (!this.accessToken) this.accessToken = await this.getAccessToken();
    const url = `https://chat.googleapis.com/v1/${msg.chatId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text }),
    });
    const data = await resp.json() as any;
    this.lastActivity = new Date();
    return data.name;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "googlechat", lastActivity: this.lastActivity };
  }
}
