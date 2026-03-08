/** IRC adapter — irc-framework. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class IRCAdapter implements ChannelAdapter {
  readonly channelId = "irc";
  private connected = false;
  private lastActivity?: Date;
  private client: any;
  private handler?: (msg: UnifiedMessage) => void;
  private msgCounter = 0;

  constructor(
    private server: string,
    private nickname: string,
    private channels: string[],
    private options: { port?: number; tls?: boolean; password?: string; commandPrefix?: string } = {}
  ) {
    this.options.port ??= 6667;
    this.options.commandPrefix ??= "!";
  }

  async connect(): Promise<void> {
    const IRC = await import("irc-framework");
    this.client = new IRC.Client();

    this.client.connect({
      host: this.server, port: this.options.port, nick: this.nickname,
      tls: this.options.tls, password: this.options.password,
    });

    this.client.on("registered", () => {
      for (const ch of this.channels) this.client.join(ch);
      this.connected = true;
    });

    this.client.on("privmsg", (event: any) => {
      if (!this.handler || event.nick === this.nickname) return;
      const text: string = event.message;
      const prefix = this.options.commandPrefix!;
      const isCmd = text.startsWith(prefix);
      const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
      this.lastActivity = new Date();
      this.msgCounter++;

      this.handler({
        id: String(this.msgCounter), channel: "irc",
        sender: { id: event.nick, username: event.nick },
        content: isCmd
          ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
          : { type: ContentType.TEXT, text },
        timestamp: new Date(),
        chatId: event.target.startsWith("#") ? event.target : event.nick,
        raw: event,
      });
    });

    await new Promise<void>((resolve) => this.client.once("registered", resolve));
  }

  async disconnect(): Promise<void> {
    this.client?.quit("bye");
    this.connected = false;
  }

  onMessage(handler: (msg: UnifiedMessage) => void): void { this.handler = handler; }

  async send(msg: OutboundMessage): Promise<string | undefined> {
    for (const line of msg.text.split("\n")) {
      if (line.trim()) this.client.say(msg.chatId, line);
    }
    this.lastActivity = new Date();
    return undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "irc", accountId: `${this.nickname}@${this.server}`, lastActivity: this.lastActivity };
  }
}
