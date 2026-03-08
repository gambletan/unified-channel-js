/** Base channel adapter — each channel implements this interface. */

import type { ChannelStatus, OutboundMessage, UnifiedMessage } from "./types.js";

export interface ChannelAdapter {
  readonly channelId: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => void): void;
  send(msg: OutboundMessage): Promise<string | undefined>;
  getStatus(): Promise<ChannelStatus>;
}
