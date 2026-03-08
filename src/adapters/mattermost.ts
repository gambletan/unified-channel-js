/** Mattermost adapter — WebSocket + REST. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class MattermostAdapter implements ChannelAdapter {
  readonly channelId = "mattermost";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private ws: any;
  private botUserId?: string;

  constructor(
    private url: string,
    private token: string,
    private options: { allowedChannelIds?: Set<string>; commandPrefix?: string } = {}
  ) {
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const baseUrl = this.url.replace(/\/$/, "");

    // Get bot user ID
    const meResp = await fetch(`${baseUrl}/api/v4/users/me`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const me = await meResp.json();
    this.botUserId = me.id;

    // WebSocket
    const { default: WebSocket } = await import("ws");
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/v4/websocket";
    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      this.ws.send(JSON.stringify({ seq: 1, action: "authentication_challenge", data: { token: this.token } }));
      this.connected = true;
    });

    this.ws.on("message", (raw: string) => {
      const event = JSON.parse(raw);
      if (event.event !== "posted" || !this.handler) return;
      const post = JSON.parse(event.data?.post || "{}");
      if (post.user_id === this.botUserId) return;
      if (this.options.allowedChannelIds && !this.options.allowedChannelIds.has(post.channel_id)) return;

      const text: string = post.message || "";
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();

      this.handler({
        id: post.id, channel: "mattermost",
        sender: { id: post.user_id },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text },
        timestamp: new Date(post.create_at), chatId: post.channel_id,
        threadId: post.root_id || undefined, raw: post,
      });
    });

    await new Promise<void>((resolve) => this.ws.once("open", resolve));
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const resp = await fetch(`${this.url.replace(/\/$/, "")}/api/v4/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: msg.chatId, message: msg.text, root_id: msg.replyToId }),
    });
    const data = await resp.json();
    this.lastActivity = new Date();
    return data.id;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "mattermost", accountId: this.botUserId, lastActivity: this.lastActivity };
  }
}
