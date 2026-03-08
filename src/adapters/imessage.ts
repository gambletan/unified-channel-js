/** iMessage adapter — macOS only, SQLite polling + osascript. */

import type { ChannelAdapter } from "../adapter.js";
import { ContentType, type ChannelStatus, type OutboundMessage, type UnifiedMessage } from "../types.js";

export class IMessageAdapter implements ChannelAdapter {
  readonly channelId = "imessage";
  private connected = false;
  private lastActivity?: Date;
  private handler?: (msg: UnifiedMessage) => void;
  private polling = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private lastRowId = 0;

  constructor(
    private options: { dbPath?: string; pollInterval?: number; commandPrefix?: string } = {}
  ) {
    this.options.dbPath ??= `${process.env.HOME}/Library/Messages/chat.db`;
    this.options.pollInterval ??= 3000;
    this.options.commandPrefix ??= "/";
  }

  async connect(): Promise<void> {
    // Get the latest ROWID to start from
    const { execSync } = await import("child_process");
    try {
      const result = execSync(
        `sqlite3 "${this.options.dbPath}" "SELECT MAX(ROWID) FROM message"`,
        { encoding: "utf8" }
      ).trim();
      this.lastRowId = parseInt(result) || 0;
    } catch { /* start from 0 */ }

    this.connected = true;
    this.polling = true;
    this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;
    try {
      const { execSync } = await import("child_process");
      const query = `SELECT m.ROWID, m.text, m.is_from_me, m.date, h.id as handle_id, c.chat_identifier FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id LEFT JOIN chat c ON cmj.chat_id = c.ROWID WHERE m.ROWID > ${this.lastRowId} AND m.is_from_me = 0 ORDER BY m.ROWID ASC LIMIT 50`;
      const result = execSync(
        `sqlite3 -separator '|' "${this.options.dbPath}" "${query}"`,
        { encoding: "utf8" }
      ).trim();

      if (result && this.handler) {
        for (const line of result.split("\n")) {
          const [rowId, text, , , handleId, chatId] = line.split("|");
          if (!text) continue;
          this.lastRowId = Math.max(this.lastRowId, parseInt(rowId));
          const prefix = this.options.commandPrefix!;
          const isCmd = text.startsWith(prefix);
          const parts = isCmd ? text.slice(prefix.length).split(/\s+/) : [];
          this.lastActivity = new Date();

          this.handler({
            id: rowId, channel: "imessage",
            sender: { id: handleId || "" },
            content: isCmd
              ? { type: ContentType.COMMAND, text, command: parts[0], args: parts.slice(1) }
              : { type: ContentType.TEXT, text },
            timestamp: new Date(), chatId: chatId || handleId || "", raw: { rowId, text, handleId },
          });
        }
      }
    } catch { /* poll error, retry */ }
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
    const { execSync } = await import("child_process");
    const escaped = msg.text.replace(/"/g, '\\"');
    const script = `tell application "Messages" to send "${escaped}" to buddy "${msg.chatId}"`;
    execSync(`osascript -e '${script}'`);
    this.lastActivity = new Date();
    return undefined;
  }

  async getStatus(): Promise<ChannelStatus> {
    return { connected: this.connected, channel: "imessage", lastActivity: this.lastActivity };
  }
}
