/** Unified message types — the core abstraction all channels share. */

export enum ContentType {
  TEXT = "text",
  COMMAND = "command",
  MEDIA = "media",
  REACTION = "reaction",
  EDIT = "edit",
  CALLBACK = "callback",
}

export interface Identity {
  id: string;
  username?: string;
  displayName?: string;
}

export interface MessageContent {
  type: ContentType;
  text: string;
  command?: string;
  args?: string[];
  mediaUrl?: string;
  mediaType?: string;
  callbackData?: string;
}

export interface UnifiedMessage {
  id: string;
  channel: string;
  sender: Identity;
  content: MessageContent;
  timestamp: Date;
  threadId?: string;
  replyToId?: string;
  chatId?: string;
  raw?: unknown;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  chatId: string;
  text: string;
  replyToId?: string;
  mediaUrl?: string;
  mediaType?: string;
  parseMode?: string;
  buttons?: Button[][];
  metadata?: Record<string, unknown>;
}

export interface Button {
  label: string;
  callbackData?: string;
  url?: string;
}

export interface ChannelStatus {
  connected: boolean;
  channel: string;
  accountId?: string;
  error?: string;
  lastActivity?: Date;
}
