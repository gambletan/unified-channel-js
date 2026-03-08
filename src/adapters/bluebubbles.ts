/** BlueBubbles adapter — REST polling. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class BlueBubblesAdapter implements ChannelAdapter {
  readonly channelId = "bluebubbles";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private polling = false;
  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private serverUrl: string,
    private password: string,
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
    try {
      const since = this.lastActivity ? this.lastActivity.getTime() : Date.now() - 60000;
      const url = `${this.serverUrl}/api/v1/message?password=${encodeURIComponent(this.password)}&after=${since}&sort=asc&limit=50`;
      const resp = await fetch(url);
      const data = await resp.json() as any;

      for (const msg of data.data || []) {
        if (msg.is_from_me || !this.handler) continue;
        const text: string = msg.text || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date(msg.date_created);

        this.handler({
          id: msg.guid, channel: "bluebubbles",
          sender: { id: msg.handle?.address || "" },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(msg.date_created),
          chatId: msg.chat_guid || msg.handle?.address || "", raw: msg,
        });
      }
    } catch { /* poll error, retry next interval */ }
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
    const resp = await fetch(`${this.serverUrl}/api/v1/message/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: this.password, chatGuid: msg.chatId, message: msg.text,
      }),
    });
    const data = await resp.json() as any;
    this.lastActivity = new Date();
    return data.data?.guid;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "bluebubbles", lastActivity: this.lastActivity };
  }
}
