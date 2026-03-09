<div align="center">

# unified-channel

### 19 Channels. 1 API. Ship Your AI Agent Everywhere.

[![npm](https://img.shields.io/npm/v/unified-channel?color=red&label=npm)](https://www.npmjs.com/package/unified-channel)
[![PyPI](https://img.shields.io/pypi/v/unified-channel?color=blue&label=PyPI)](https://pypi.org/project/unified-channel/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue.svg)](https://typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-256%20passing-brightgreen.svg)]()

**Stop writing platform-specific bot code.** Write your agent once, deploy to every messaging platform your users are on.

[Get Started](#quick-start) | [19 Adapters](#supported-channels) | [Middleware](#middleware) | [API Docs](#api-reference)

</div>

---

### The problem

You build a Telegram bot. Then your team uses Slack. Clients want WhatsApp. Discord community needs it too. Now you're maintaining 4 codebases doing the same thing with 4 different APIs.

### The solution

```
npm install unified-channel
```

```typescript
const manager = new ChannelManager();
manager.addChannel(new TelegramAdapter("BOT_TOKEN"));
manager.addChannel(new DiscordAdapter("BOT_TOKEN"));
manager.addChannel(new SlackAdapter("xoxb-...", "xapp-..."));

manager.onMessage(async (msg) => {
  // msg.channel === "telegram" | "discord" | "slack" | ...
  // Same code handles all of them
  return await myAgent.chat(msg.content.text);
});
```

### Why unified-channel

| | Without | With unified-channel |
|---|---|---|
| **Add a channel** | New SDK, new message format, new auth flow | `manager.addChannel(new XAdapter(...))` |
| **Auth/rate-limit** | Implement per-platform | `addMiddleware(new AccessMiddleware(...))` — works everywhere |
| **Send from backend** | Different API per channel | `await manager.send("telegram", chatId, text)` |
| **New adapter** | Days of work | 1 file, 5 methods |

### Built-in batteries

| Feature | What it does |
|---|---|
| **AccessMiddleware** | Allowlist users across all channels |
| **CommandMiddleware** | `/command` routing with argument parsing |
| **RateLimitMiddleware** | Sliding window per-user rate limiting |
| **ConversationMemory** | Per-chat history (InMemory / SQLite / Redis) |
| **StreamingMiddleware** | Typing indicators + chunked LLM delivery |
| **RichReply** | Tables, buttons, code blocks — auto-degrades per platform |
| **ServiceBridge** | Expose any function as a chat command in 1 line |
| **Scheduler** | Cron + interval periodic tasks |
| **Dashboard** | Built-in web UI with message log + API |
| **I18nMiddleware** | Locale detection + translation helpers |
| **VoiceMiddleware** | STT/TTS (OpenAI Whisper + TTS) |
| **YAML/JSON Config** | Load channels from config file, env var interpolation |

TypeScript-first. Zero required dependencies. Tree-shakeable — only import what you use.

### Also available in

| Language | Package | Install |
|---|---|---|
| **TypeScript** | [unified-channel](https://www.npmjs.com/package/unified-channel) | `npm install unified-channel` |
| **Python** | [unified-channel](https://pypi.org/project/unified-channel/) | `pip install unified-channel` |
| **Java** | [unified-channel-java](https://github.com/gambletan/unified-channel-java) | Maven / Gradle |

---

## Supported Channels

| Channel | Adapter | Mode | Public URL |
|---------|---------|------|-----------|
| Telegram | `TelegramAdapter` | Polling / Webhook | No |
| Discord | `DiscordAdapter` | WebSocket | No |
| Slack | `SlackAdapter` | Socket Mode | No |
| WhatsApp | `WhatsAppAdapter` | Webhook | Yes |
| iMessage | `IMessageAdapter` | DB polling (macOS) | No |
| Matrix | `MatrixAdapter` | Sync | No |
| MS Teams | `MSTeamsAdapter` | Webhook | Yes |
| LINE | `LineAdapter` | Webhook | Yes |
| Feishu/Lark | `FeishuAdapter` | Webhook | Yes |
| Mattermost | `MattermostAdapter` | WebSocket | No |
| Google Chat | `GoogleChatAdapter` | Webhook | Yes |
| Nextcloud Talk | `NextcloudAdapter` | Polling | No |
| Synology Chat | `SynologyAdapter` | Webhook | Yes |
| Zalo | `ZaloAdapter` | Webhook | Yes |
| Nostr | `NostrAdapter` | WebSocket (relay) | No |
| BlueBubbles | `BlueBubblesAdapter` | Polling | No |
| Twitch | `TwitchAdapter` | IRC/WebSocket | No |
| IRC | `IRCAdapter` | TCP socket | No |

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

---

## AI Agent Integration

Connect Claude (or any LLM) to Telegram — users chat naturally, and the agent works in your project directory:

```typescript
import { ChannelManager, TelegramAdapter, AccessMiddleware,
         CommandMiddleware, RateLimitMiddleware } from "unified-channel";
import { spawn } from "child_process";

const manager = new ChannelManager();
manager.addChannel(new TelegramAdapter(process.env.TELEGRAM_TOKEN!));
manager.addMiddleware(new AccessMiddleware({ allowedUserIds: new Set([process.env.ADMIN_ID!]) }));
manager.addMiddleware(new RateLimitMiddleware({ maxMessages: 30, windowSeconds: 60 }));

const cmds = new CommandMiddleware();
manager.addMiddleware(cmds);

const histories = new Map<string, Array<{ role: string; content: string }>>();
const tasks = new Map<string, ReturnType<typeof spawn>>();

// Chat with Claude via CLI — runs in your project directory
async function callClaude(text: string, chatId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["--print", "--model", "claude-sonnet-4-20250514"], {
      cwd: process.env.WORK_DIR || process.cwd(),
      env: { ...process.env, CLAUDECODE: undefined },
    });
    tasks.set(chatId, proc);

    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stdin.write(text);
    proc.stdin.end();
    proc.on("close", (code) => {
      tasks.delete(chatId);
      code === 0 ? resolve(stdout.trim()) : reject(new Error("CLI error"));
    });
    setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 120_000);
  });
}

cmds.register("stop", async (msg) => {
  const proc = tasks.get(msg.chatId!);
  if (proc) { proc.kill(); return "Stopped."; }
  return "No active task.";
});

cmds.register("clear", async (msg) => {
  histories.delete(msg.chatId!);
  return "History cleared.";
});

manager.onMessage(async (msg) => {
  const chatId = msg.chatId || "default";
  const history = histories.get(chatId) || [];
  history.push({ role: "user", content: msg.content.text! });
  histories.set(chatId, history.slice(-40));

  await manager.send("telegram", chatId, "💭 Thinking...");
  const reply = await callClaude(msg.content.text!, chatId);
  history.push({ role: "assistant", content: reply });
  return reply;
});

await manager.run();
```

**What this gives you:**
- Chat with Claude via Telegram — Claude can read/edit your project files
- `/stop` kills long-running tasks, `/clear` resets history
- Rate limiting + access control built in
- Set `WORK_DIR` to point Claude at any project

---

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
