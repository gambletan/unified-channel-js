/** Nostr adapter — nostr-tools + WebSocket. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class NostrAdapter implements ChannelAdapter {
  readonly channelId = "nostr";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private ws: any;
  private pubkey?: string;
  private subId?: string;

  constructor(
    private privateKeyHex: string,
    private relays: string[],
    private options: { commandPrefix?: string } = {}
  ) {
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const nostr = await import("nostr-tools");
    const { default: WebSocket } = await import("ws");

    this.pubkey = nostr.getPublicKey(this.privateKeyHex as any);
    // Connect to first relay
    const relay = this.relays[0];
    this.ws = new WebSocket(relay);

    this.ws.on("open", () => {
      this.subId = `uc-${Date.now()}`;
      // Subscribe to DMs (kind 4) addressed to us
      this.ws.send(JSON.stringify(["REQ", this.subId, { kinds: [4], "#p": [this.pubkey] }]));
      this.connected = true;
    });

    this.ws.on("message", (raw: string) => {
      try {
        const data = JSON.parse(raw);
        if (data[0] !== "EVENT" || !this.handler) return;
        const event = data[2];
        if (event.pubkey === this.pubkey) return;

        const text: string = event.content || "";
        const prefix = this.options.commandPrefix!;
        const isCmd = text.startsWith(prefix);
        const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
        this.lastActivity = new Date();

        this.handler({
          id: event.id, channel: "nostr",
          sender: { id: event.pubkey },
          content: isCmd
            ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
            : { type: ContentType.TEXT, text },
          timestamp: new Date(event.created_at * 1000),
          chatId: event.pubkey, raw: event,
        });
      } catch { /* ignore parse errors */ }
    });

    await new Promise<void>((resolve) => this.ws.once("open", resolve));
  }

  async disconnect(): Promise<void> {
    if (this.subId) this.ws?.send(JSON.stringify(["CLOSE", this.subId]));
    this.ws?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const nostr = await import("nostr-tools");
    const event = nostr.finalizeEvent({
      kind: 4, content: msg.text, tags: [["p", msg.chatId]], created_at: Math.floor(Date.now() / 1000),
    } as any, this.privateKeyHex as any);
    this.ws.send(JSON.stringify(["EVENT", event]));
    this.lastActivity = new Date();
    return (event as any).id;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "nostr", accountId: this.pubkey, lastActivity: this.lastActivity };
  }
}
