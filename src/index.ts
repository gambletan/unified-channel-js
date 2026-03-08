/** unified-channel — 19 channels, 1 API. */

// Core
export { ContentType } from "./types.js";
export type { UnifiedMessage, OutboundMessage, Identity, MessageContent, Button, ChannelStatus } from "./types.js";
export type { ChannelAdapter } from "./adapter.js";
export { ChannelManager } from "./manager.js";
export type { Middleware } from "./middleware.js";
export { AccessMiddleware, CommandMiddleware } from "./middleware.js";
export { RateLimitMiddleware } from "./ratelimit.js";
export type { RateLimitConfig } from "./ratelimit.js";
export { ServiceBridge, parseFlags } from "./bridge.js";
export type { CommandHandler } from "./bridge.js";
export { loadConfig, interpolateEnv, parseSimpleYaml } from "./config.js";
export type { ChannelConfig } from "./config.js";

// Memory
export { ConversationMemory, InMemoryStore } from "./memory.js";
export type { MemoryStore, HistoryEntry, ConversationMemoryOptions } from "./memory.js";

// Rich Reply
export { RichReply } from "./rich.js";

// Streaming
export { StreamingMiddleware, StreamingReply } from "./streaming.js";
export type { StreamingMiddlewareOptions } from "./streaming.js";

// I18n
export { I18nMiddleware } from "./i18n.js";
export type { Translations, TranslateFn, I18nOptions } from "./i18n.js";

// Dashboard
export { Dashboard } from "./dashboard.js";
export type { DashboardOptions } from "./dashboard.js";

// Scheduler
export { Scheduler, parseCron, cronMatches } from "./scheduler.js";
export type { TaskCallback, ScheduledTask } from "./scheduler.js";

// Queue
export { InMemoryQueue, QueueMiddleware, QueueProcessor } from "./queue.js";
export type { MessageQueue, QueueOptions } from "./queue.js";

// Voice
export { VoiceMiddleware, OpenAISTT, OpenAITTS } from "./voice.js";
export type { STTProvider, TTSProvider, VoiceMiddlewareOptions } from "./voice.js";

// Adapters — lazy-loaded, import individually:
//   import { TelegramAdapter } from "unified-channel/adapters/telegram"
export { TelegramAdapter } from "./adapters/telegram.js";
export { DiscordAdapter } from "./adapters/discord.js";
export { SlackAdapter } from "./adapters/slack.js";
export { WhatsAppAdapter } from "./adapters/whatsapp.js";
export { MatrixAdapter } from "./adapters/matrix.js";
export { MSTeamsAdapter } from "./adapters/msteams.js";
export { LineAdapter } from "./adapters/line.js";
export { FeishuAdapter } from "./adapters/feishu.js";
export { MattermostAdapter } from "./adapters/mattermost.js";
export { TwitchAdapter } from "./adapters/twitch.js";
export { IRCAdapter } from "./adapters/irc.js";
export { NostrAdapter } from "./adapters/nostr.js";
export { ZaloAdapter } from "./adapters/zalo.js";
export { BlueBubblesAdapter } from "./adapters/bluebubbles.js";
export { NextcloudAdapter } from "./adapters/nextcloud.js";
export { SynologyAdapter } from "./adapters/synology.js";
export { GoogleChatAdapter } from "./adapters/googlechat.js";
export { IMessageAdapter } from "./adapters/imessage.js";
