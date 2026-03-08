/** Nextcloud Talk adapter — REST polling. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class NextcloudAdapter implements ChannelAdapter {
  readonly channelId = "nextcloud";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private polling = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private lastKnownId = 0;

  constructor(
    private serverUrl: string,
    private username: string,
    private password: string,
    private roomTokens: string[],
    private options: { pollInterval?: number; commandPrefix?: string } = {}
  ) {
    this.options.pollInterval ??= 5000;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.polling = true;
    this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;
    const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    try {
      for (const room of this.roomTokens) {
        const url = `${this.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${room}?lookIntoFuture=0&limit=20&setReadMarker=0&lastKnownMessageId=${this.lastKnownId}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Basic ${auth}`, "OCS-APIRequest": "true", Accept: "application/json" },
        });
        const data = await resp.json() as any;
        for (const msg of data.ocs?.data || []) {
          if (msg.actorId === this.username || msg.id <= this.lastKnownId) continue;
          this.lastKnownId = Math.max(this.lastKnownId, msg.id);
          if (!this.handler) continue;
          const text: string = msg.message || "";
          const prefix = this.options.commandPrefix!;
          const isCmd = text.startsWith(prefix);
          const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
          this.lastActivity = new Date(msg.timestamp * 1000);

          this.handler({
            id: String(msg.id), channel: "nextcloud",
            sender: { id: msg.actorId, displayName: msg.actorDisplayName },
            content: isCmd
              ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
              : { type: ContentType.TEXT, text },
            timestamp: new Date(msg.timestamp * 1000),
            chatId: room, raw: msg,
          });
        }
      }
    } catch { /* retry next poll */ }
    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), this.options.pollInterval);
    }
  }

  async disconnect(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    const resp = await fetch(`${this.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${msg.chatId}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`, "OCS-APIRequest": "true",
        "Content-Type": "application/json", Accept: "application/json",
      },
      body: JSON.stringify({ message: msg.text }),
    });
    const data = await resp.json() as any;
    this.lastActivity = new Date();
    return data.ocs?.data?.id ? String(data.ocs.data.id) : undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "nextcloud", accountId: `${this.username}@${this.serverUrl}`, lastActivity: this.lastActivity };
  }
}
