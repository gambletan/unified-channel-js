# unified-channel (Node.js/TypeScript)

> **The missing messaging layer for AI Agents.**
> Connect your agent to Telegram, Discord, Slack, WhatsApp, and 15 more channels — with one unified API.

19 messaging channels, 1 unified API. TypeScript-first, zero required dependencies.

Whether you're building an AI assistant, a chatbot, or any agent that needs to talk to humans across platforms — `unified-channel` gives you a single interface to send and receive messages everywhere.

```
npm install unified-channel
```

## Why AI Agents Need This

Most AI agent frameworks handle reasoning well but leave messaging as an afterthought. `unified-channel` fills that gap:

- **One integration, every platform** — write your agent logic once, deploy to 19 channels
- **Middleware pipeline** — add access control, command routing, rate limiting, or custom processing
- **Channel-agnostic** — your agent code never touches platform-specific SDKs
- **Zero lock-in** — add or remove channels without changing agent logic

```
┌─────────────┐     ┌──────────────────────────────────────────────┐     ┌─────────────┐
│  Telegram   │────▶│                                              │     │             │
│  Discord    │────▶│         unified-channel middleware           │────▶│  Your AI    │
│  Slack      │────▶│                                              │     │  Agent      │
│  WhatsApp   │────▶│  AccessMiddleware → CommandMiddleware → ...  │◀────│             │
│  + 15 more  │◀────│                                              │     │             │
└─────────────┘     └──────────────────────────────────────────────┘     └─────────────┘
     Users              Inbound ──────────────────────▶ Outbound           Your Code
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
- **ConversationMemory** — track conversation history per chat (pluggable store)
- **StreamingMiddleware** — typing indicators + streaming reply collection

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

## ServiceBridge — Remote Service Management

`ServiceBridge` makes it dead simple to expose any service's operations as IM commands. Think of it as a CLI for your service, but over Telegram/Discord/Slack.

```typescript
import { ChannelManager, ServiceBridge } from "unified-channel";
import { TelegramAdapter } from "unified-channel/adapters/telegram";

const manager = new ChannelManager();
manager.addChannel(new TelegramAdapter(process.env.BOT_TOKEN!));

const bridge = new ServiceBridge(manager);

bridge
  .expose("deploy", async (args) => {
    const env = args[0] ?? "staging";
    // ... your deploy logic
    return `Deployed to ${env}`;
  }, { description: "Deploy the service" })

  .expose("restart", async () => {
    // ... restart logic
    return "Service restarted";
  }, { description: "Restart the service" })

  .exposeStatus(async () => {
    return "CPU: 23% | Memory: 512MB | Uptime: 3d";
  })

  .exposeLogs(async (args) => {
    const lines = args[0] ?? "20";
    // ... fetch logs
    return `Last ${lines} log lines...`;
  });

await bridge.run();
```

Now from Telegram:
```
/help              → lists all commands
/deploy prod       → "Deployed to prod"
/status            → "CPU: 23% | Memory: 512MB | Uptime: 3d"
/logs 50           → last 50 log lines
```

Features:
- **Auto /help generation** from registered commands
- **Sync or async handlers** — return a string or `Promise<string>`
- **Error handling** — exceptions are caught and returned as error messages
- **Flag parsing** — use `parseFlags(args)` for `--key=value` and `--flag` support
- **Fluent API** — chain `.expose()` calls
- **Built-in /status, /logs, /help** commands

### Config File Support

Load a `ChannelManager` from a YAML or JSON config file with env var interpolation:

```yaml
# unified-channel.yml
channels:
  telegram:
    token: "${UC_TELEGRAM_TOKEN}"
  discord:
    token: "${UC_DISCORD_TOKEN}"
```

```typescript
import { loadConfig, ServiceBridge } from "unified-channel";

const manager = await loadConfig("./unified-channel.yml");
const bridge = new ServiceBridge(manager);
// ... expose commands ...
await bridge.run();
```

Supported formats: `.yml`, `.yaml`, `.json`. Environment variables use `${VAR}` syntax with optional defaults: `${VAR:-fallback}`.

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

## ConversationMemory

Track conversation history per chat so your agent can maintain context across messages.

```typescript
import { ChannelManager, ConversationMemory } from "unified-channel";

const manager = new ChannelManager();

// Add memory middleware (default: in-memory store, 50 turns max)
manager.addMiddleware(new ConversationMemory({ maxTurns: 20 }));

manager.onMessage(async (msg) => {
  // History is injected into metadata by the middleware
  const history = msg.metadata?.history as Array<{ role: string; content: string }>;
  console.log(`${history.length} previous messages in this chat`);
  return `You said: ${msg.content.text}`;
});
```

Bring your own store by implementing `MemoryStore`:

```typescript
import { ConversationMemory, type MemoryStore, type HistoryEntry } from "unified-channel";

class RedisStore implements MemoryStore {
  async get(key: string): Promise<HistoryEntry[]> { /* ... */ }
  async append(key: string, entry: HistoryEntry): Promise<void> { /* ... */ }
  async trim(key: string, maxEntries: number): Promise<void> { /* ... */ }
  async clear(key: string): Promise<void> { /* ... */ }
}

manager.addMiddleware(new ConversationMemory({ store: new RedisStore() }));
```

## RichReply

Build rich, cross-platform replies with a fluent API. Automatically degrades to plain text for unsupported channels.

```typescript
import { RichReply } from "unified-channel";

const reply = new RichReply()
  .text("Server Status")
  .divider()
  .table(["Service", "Status"], [["API", "OK"], ["DB", "Slow"]])
  .code('const health = await check();', "typescript")
  .buttons([[
    { label: "Restart", callbackData: "restart" },
    { label: "Docs", url: "https://docs.example.com" },
  ]]);

// Platform-specific rendering
reply.toTelegram();   // { text: "...", parse_mode: "HTML", reply_markup: {...} }
reply.toDiscord();    // { content: "...", embeds: [...], components: [...] }
reply.toSlack();      // { blocks: [...] }
reply.toPlainText();  // Universal fallback

// Or auto-pick based on channel:
const outbound = reply.toOutbound("telegram"); // OutboundMessage
```

## StreamingMiddleware

Handle streaming LLM responses with typing indicators and chunk-by-chunk delivery.

```typescript
import { ChannelManager, StreamingMiddleware, StreamingReply } from "unified-channel";

const manager = new ChannelManager();
manager.addMiddleware(new StreamingMiddleware({ typingInterval: 3000 }));

manager.onMessage(async (msg) => {
  // Return a StreamingReply from an async generator
  async function* generate() {
    yield "Thinking";
    yield "...";
    yield " Here is the answer.";
  }
  return new StreamingReply(generate());
});

// Works with LLM SDKs too:
manager.onMessage(async (msg) => {
  const stream = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: msg.content.text }],
    stream: true,
  });
  return StreamingReply.fromLLM(stream);
});
```

The middleware collects all chunks into a final string reply. Optionally provide `onTyping` and `onChunk` callbacks via `msg.metadata` for real-time UI updates.

## Testing

```bash
npm test
```

## Also Available In

| Language | Repository | Status |
|----------|-----------|--------|
| **Python** | [gambletan/unified-channel](https://github.com/gambletan/unified-channel) | 19 channels |
| **Java** | [gambletan/unified-channel-java](https://github.com/gambletan/unified-channel-java) | Coming soon |
| **TypeScript** | You are here | 19 channels |

## License

MIT
