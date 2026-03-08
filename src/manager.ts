/** ChannelManager — ties adapters + middleware together. */

import type { ChannelAdapter } from "./adapter.js";
import type { Handler, HandlerResult, Middleware } from "./middleware.js";
import type { ChannelStatus, OutboundMessage, UnifiedMessage } from "./types.js";

export class ChannelManager {
  private channels = new Map<string, ChannelAdapter>();
  private middlewares: Middleware[] = [];
  private fallbackHandler: Handler | null = null;
  private running = false;

  addChannel(adapter: ChannelAdapter): this {
    this.channels.set(adapter.channelId, adapter);
    return this;
  }

  addMiddleware(mw: Middleware): this {
    this.middlewares.push(mw);
    return this;
  }

  onMessage(handler: Handler): this {
    this.fallbackHandler = handler;
    return this;
  }

  async send(
    channel: string,
    chatId: string,
    text: string,
    options?: { replyToId?: string; parseMode?: string }
  ): Promise<string | undefined> {
    const adapter = this.channels.get(channel);
    if (!adapter) throw new Error(`Channel not registered: ${channel}`);
    return adapter.send({
      chatId,
      text,
      replyToId: options?.replyToId,
      parseMode: options?.parseMode,
    });
  }

  async broadcast(
    text: string,
    chatIds: Record<string, string>
  ): Promise<void> {
    const tasks = Object.entries(chatIds).map(([channel, chatId]) =>
      this.send(channel, chatId, text).catch(() => undefined)
    );
    await Promise.all(tasks);
  }

  async getStatus(): Promise<Record<string, ChannelStatus>> {
    const statuses: Record<string, ChannelStatus> = {};
    for (const [id, adapter] of this.channels) {
      try {
        statuses[id] = await adapter.getStatus();
      } catch (e) {
        statuses[id] = { connected: false, channel: id, error: String(e) };
      }
    }
    return statuses;
  }

  async run(): Promise<void> {
    if (this.channels.size === 0) {
      throw new Error("No channels registered");
    }

    this.running = true;

    for (const adapter of this.channels.values()) {
      await adapter.connect();
      adapter.onMessage((msg) => this.handleMessage(adapter, msg));
    }

    console.log(
      `unified-channel started: channels=[${[...this.channels.keys()].join(", ")}]`
    );

    // Keep alive
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!this.running) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
  }

  async shutdown(): Promise<void> {
    this.running = false;
    for (const adapter of this.channels.values()) {
      try {
        await adapter.disconnect();
      } catch (e) {
        console.error(`Error disconnecting ${adapter.channelId}:`, e);
      }
    }
    console.log("unified-channel shut down");
  }

  private async handleMessage(
    adapter: ChannelAdapter,
    msg: UnifiedMessage
  ): Promise<void> {
    try {
      const reply = await this.runPipeline(msg);
      if (reply && msg.chatId) {
        const out = this.toOutbound(reply, msg);
        await adapter.send(out);
      }
    } catch (e) {
      console.error(`Error processing message ${msg.id} on ${msg.channel}:`, e);
    }
  }

  private async runPipeline(msg: UnifiedMessage): Promise<HandlerResult> {
    let handler: Handler = async (m) => {
      if (this.fallbackHandler) return this.fallbackHandler(m);
      return null;
    };

    // Build chain in reverse so first-added middleware runs first
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      const next = handler;
      handler = async (m) => mw.process(m, next);
    }

    return handler(msg);
  }

  private toOutbound(
    reply: string | OutboundMessage,
    orig: UnifiedMessage
  ): OutboundMessage {
    if (typeof reply === "string") {
      return { chatId: orig.chatId || "", text: reply, replyToId: orig.id };
    }
    if (!reply.chatId) reply.chatId = orig.chatId || "";
    return reply;
  }
}
