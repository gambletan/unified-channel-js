/** unified-channel — 19 channels, 1 API. */

// Core
export { ContentType } from "./types.js";
export type { UnifiedMessage, OutboundMessage, Identity, MessageContent, Button, ChannelStatus } from "./types.js";
export type { ChannelAdapter } from "./adapter.js";
export { ChannelManager } from "./manager.js";
export type { Middleware } from "./middleware.js";
export { AccessMiddleware, CommandMiddleware } from "./middleware.js";

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
