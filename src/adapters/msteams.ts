/** Microsoft Teams adapter — botbuilder. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class MSTeamsAdapter implements ChannelAdapter {
  readonly channelId = "msteams";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private conversations = new Map<string, any>();
  private server: any;

  constructor(
    private appId: string,
    private appPassword: string,
    private options: { port?: number; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 3978;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    const { BotFrameworkAdapter } = await import("botbuilder");
    const express = (await import("express")).default;

    const adapter = new BotFrameworkAdapter({ appId: this.appId, appPassword: this.appPassword });

    const app = express();
    app.post("/api/messages", (req: any, res: any) => {
      adapter.processActivity(req, res, async (context: any) => {
        const ref = context.activity.getConversationReference();
        this.conversations.set(ref.conversation.id, { adapter, ref });

        if (context.activity.type === "message" && this.handler) {
          const text: string = context.activity.text || "";
          const prefix = this.options.commandPrefix!;
          const isCmd = text.startsWith(prefix);
          const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
          this.lastActivity = new Date();

          this.handler({
            id: context.activity.id, channel: "msteams",
            sender: { id: context.activity.from.id, displayName: context.activity.from.name },
            content: isCmd
              ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
              : { type: ContentType.TEXT, text },
            timestamp: new Date(context.activity.timestamp),
            chatId: context.activity.conversation.id, raw: context.activity,
          });
        }
      });
    });

    await new Promise<void>((resolve) => {
      this.server = app.listen(this.options.port, resolve);
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.server?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    const entry = this.conversations.get(msg.chatId);
    if (!entry) return undefined;
    let sentId: string | undefined;
    await entry.adapter.continueConversation(entry.ref, async (ctx: any) => {
      const resp = await ctx.sendActivity(msg.text);
      sentId = resp?.id;
    });
    this.lastActivity = new Date();
    return sentId;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "msteams", accountId: this.appId, lastActivity: this.lastActivity };
  }
}
