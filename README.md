# unified-channel (Node.js/TypeScript)

> 19 messaging channels, 1 unified API. TypeScript-first, zero required dependencies.

```
npm install unified-channel
```

## Supported Channels

| Channel | Adapter | SDK/Protocol |
|---------|---------|-------------|
| Telegram | `TelegramAdapter` | grammy |
| Discord | `DiscordAdapter` | discord.js |
| Slack | `SlackAdapter` | @slack/bolt |
| WhatsApp | `WhatsAppAdapter` | whatsapp-web.js |
| iMessage | `IMessageAdapter` | macOS native (SQLite + AppleScript) |
| Matrix | `MatrixAdapter` | matrix-bot-sdk |
| MS Teams | `MSTeamsAdapter` | botbuilder + express |
| LINE | `LineAdapter` | @line/bot-sdk + express |
| Feishu/Lark | `FeishuAdapter` | @larksuiteoapi/node-sdk |
| Mattermost | `MattermostAdapter` | WebSocket + fetch |
| Google Chat | `GoogleChatAdapter` | Service account JWT + REST |
| Nextcloud Talk | `NextcloudAdapter` | REST polling |
| Synology Chat | `SynologyAdapter` | Webhook + REST |
| Zalo | `ZaloAdapter` | Zalo OA API webhook |
| Nostr | `NostrAdapter` | nostr-tools + WebSocket |
| BlueBubbles | `BlueBubblesAdapter` | REST polling |
| Twitch | `TwitchAdapter` | tmi.js |
| IRC | `IRCAdapter` | irc-framework |

## Quick Start

```typescript
import { ChannelManager, CommandMiddleware, AccessMiddleware } from "unified-channel";
import { TelegramAdapter } from "unified-channel/adapters/telegram";
import { DiscordAdapter } from "unified-channel/adapters/discord";

const manager = new ChannelManager();

// Add channels
manager.addChannel(new TelegramAdapter("BOT_TOKEN"));
manager.addChannel(new DiscordAdapter("BOT_TOKEN"));

// Add middleware
const access = new AccessMiddleware(["admin_user_id"]);
const commands = new CommandMiddleware();

commands
  .command("ping", async () => "pong!")
  .command("status", async (msg) => `Channel: ${msg.channel}`);

manager
  .addMiddleware(access)
  .addMiddleware(commands)
  .onMessage(async (msg) => `Echo: ${msg.content.text}`);

// Start
await manager.run();
```

## Architecture

```
Incoming Message → [AccessMiddleware] → [CommandMiddleware] → [FallbackHandler]
                                                                     ↓
                        OutboundMessage ← reply string or OutboundMessage
```

### Core Types

```typescript
interface UnifiedMessage {
  id: string;
  channel: string;           // "telegram", "discord", etc.
  sender: Identity;
  content: MessageContent;   // { type, text, command?, args? }
  timestamp: Date;
  chatId?: string;
  threadId?: string;
  raw?: unknown;             // Original platform event
}

interface OutboundMessage {
  chatId: string;
  text: string;
  replyToId?: string;
  buttons?: Button[][];
}
```

### Middleware

Implement the `Middleware` interface:

```typescript
interface Middleware {
  process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult>;
}
```

Built-in middleware:
- **AccessMiddleware** — allowlist by sender ID (silent drop on unauthorized)
- **CommandMiddleware** — route `/commands` to registered handlers

### ChannelAdapter

Each adapter implements:

```typescript
interface ChannelAdapter {
  readonly channelId: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => void): void;
  send(msg: OutboundMessage): Promise<string | undefined>;
  getStatus(): Promise<ChannelStatus>;
}
```

## Install Channel SDKs

Only install the SDKs you need:

```bash
# Telegram
npm install grammy

# Discord
npm install discord.js

# Slack
npm install @slack/bolt

# WhatsApp
npm install whatsapp-web.js

# Matrix
npm install matrix-bot-sdk

# MS Teams
npm install botbuilder express

# LINE
npm install @line/bot-sdk express

# Feishu/Lark
npm install @larksuiteoapi/node-sdk

# Twitch
npm install tmi.js

# IRC
npm install irc-framework

# Nostr
npm install nostr-tools ws
```

Channels like iMessage, Mattermost, Nextcloud, Synology, Zalo, BlueBubbles, and Google Chat use built-in `fetch`/`http`/WebSocket — no extra deps needed (Node 18+).

## API Reference

### ChannelManager

```typescript
manager.addChannel(adapter)       // Register a channel
manager.addMiddleware(mw)         // Add middleware (first-added runs first)
manager.onMessage(handler)        // Set fallback message handler
manager.send(channel, chatId, text, options?)  // Send to specific channel
manager.broadcast(text, { channel: chatId })   // Send to multiple channels
manager.getStatus()               // Get all channel statuses
manager.run()                     // Connect all channels and start listening
manager.shutdown()                // Disconnect all channels
```

## Testing

```bash
npm test
```

## Also Available

- **Python**: [unified-channel](https://github.com/gambletan/unified-channel) (same 19 channels)
- **Java**: [unified-channel-java](https://github.com/gambletan/unified-channel-java) (coming soon)

## License

MIT
