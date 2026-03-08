/** Matrix adapter — matrix-bot-sdk. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class MatrixAdapter implements ChannelAdapter {
  readonly channelId = "matrix";
  private connected = false;
  private lastActivity?: Date;
  private client: any;
  private handler?: (msg: UnifiedMessage) => void;

  constructor(
    private homeserver: string,
    private accessToken: string,
    private options: { allowedRoomIds?: Set<string>; autoJoin?: boolean; commandPrefix?: string } = {}
  ) {
    this.options.autoJoin ??= true;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin } = await import("matrix-bot-sdk");
    const storage = new SimpleFsStorageProvider("/tmp/unified-channel-matrix.json");
    this.client = new MatrixClient(this.homeserver, this.accessToken, storage);

    if (this.options.autoJoin) AutojoinRoomsMixin.setupOnClient(this.client);

    this.client.on("room.message", (roomId: string, event: any) => {
      if (!this.handler || event.sender === this.client.getUserId()) return;
      if (this.options.allowedRoomIds && !this.options.allowedRoomIds.has(roomId)) return;
      if (event.content?.msgtype !== "m.text") return;

      const text: string = event.content.body || "";
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();

      this.handler({
        id: event.event_id, channel: "matrix",
        sender: { id: event.sender },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text },
        timestamp: new Date(event.origin_server_ts),
        chatId: roomId, raw: event,
      });
    });

    await this.client.start();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.client?.stop();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const eventId = await this.client.sendText(msg.chatId, msg.text);
    this.lastActivity = new Date();
    return eventId;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "matrix", lastActivity: this.lastActivity };
  }
}
