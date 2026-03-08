/** Voice middleware — STT/TTS pipeline for voice messages. */

import type { OutboundMessage, UnifiedMessage } from "./types.js";
import { ContentType } from "./types.js";
import type { Middleware, Handler, HandlerResult } from "./middleware.js";

/** Speech-to-text provider interface. */
export interface STTProvider {
  transcribe(audio: Buffer, format?: string): Promise<string>;
}

/** Text-to-speech provider interface. */
export interface TTSProvider {
  synthesize(text: string): Promise<{ audio: Buffer; mimeType: string }>;
}

export interface VoiceMiddlewareOptions {
  stt?: STTProvider;
  tts?: TTSProvider;
  /** Automatically synthesize text replies to voice messages as audio. */
  autoTts?: boolean;
}

const VOICE_MEDIA_TYPES = new Set([
  "voice",
  "audio",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/x-wav",
  "audio/mp4",
  "ogg",
  "mp3",
  "wav",
]);

function isVoiceMedia(msg: UnifiedMessage): boolean {
  if (msg.content.type !== ContentType.MEDIA) return false;
  const mt = msg.content.mediaType?.toLowerCase();
  if (!mt) return false;
  return VOICE_MEDIA_TYPES.has(mt);
}

/** Extract audio format hint from media type. */
function formatFromMediaType(mediaType: string): string {
  const lower = mediaType.toLowerCase();
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp4")) return "mp4";
  return lower;
}

/** Downloads audio from a URL and returns a Buffer. */
async function downloadAudio(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download audio: ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Voice middleware: transcribes incoming voice messages via STT,
 * and optionally synthesizes outbound replies via TTS.
 */
export class VoiceMiddleware implements Middleware {
  private stt: STTProvider | undefined;
  private tts: TTSProvider | undefined;
  private autoTts: boolean;

  constructor(opts: VoiceMiddlewareOptions = {}) {
    this.stt = opts.stt;
    this.tts = opts.tts;
    this.autoTts = opts.autoTts ?? false;
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    const isVoice = isVoiceMedia(msg);

    // Non-voice messages pass through unchanged
    if (!isVoice) {
      return next(msg);
    }

    // Voice message but no STT provider — pass through as-is
    if (!this.stt) {
      return next(msg);
    }

    const mediaUrl = msg.content.mediaUrl;
    if (!mediaUrl) {
      return next(msg);
    }

    const format = msg.content.mediaType
      ? formatFromMediaType(msg.content.mediaType)
      : undefined;

    // Download and transcribe
    const audioBuffer = await downloadAudio(mediaUrl);
    const transcribedText = await this.stt.transcribe(audioBuffer, format);

    // Store original audio info in metadata
    const metadata: Record<string, unknown> = { ...(msg.metadata ?? {}) };
    metadata.voiceOriginal = {
      mediaUrl,
      mediaType: msg.content.mediaType,
      contentType: msg.content.type,
      text: msg.content.text,
    };

    // Replace content with transcribed text
    const transcribedMsg: UnifiedMessage = {
      ...msg,
      metadata,
      content: {
        type: ContentType.TEXT,
        text: transcribedText,
      },
    };

    const result = await next(transcribedMsg);

    // If autoTts is enabled and handler returned a text reply, synthesize audio
    if (this.autoTts && this.tts && result) {
      const replyText = typeof result === "string" ? result : (result as OutboundMessage).text;
      if (replyText) {
        const { audio, mimeType } = await this.tts.synthesize(replyText);
        if (typeof result === "string") {
          // Convert string result to OutboundMessage with audio metadata
          const outbound: OutboundMessage = {
            chatId: msg.chatId ?? "",
            text: replyText,
            metadata: {
              voiceReply: {
                audio: audio.toString("base64"),
                mimeType,
              },
            },
          };
          return outbound;
        } else {
          // Attach audio to existing OutboundMessage
          const outbound = result as OutboundMessage;
          const meta: Record<string, unknown> = { ...(outbound.metadata ?? {}) };
          meta.voiceReply = {
            audio: audio.toString("base64"),
            mimeType,
          };
          return { ...outbound, metadata: meta };
        }
      }
    }

    return result;
  }
}

/**
 * OpenAI Whisper STT provider.
 * Uses the OpenAI audio transcription API.
 */
export class OpenAISTT implements STTProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "whisper-1") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, format?: string): Promise<string> {
    const ext = format ?? "ogg";
    const blob = new Blob([audio], { type: `audio/${ext}` });

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", this.model);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI STT failed: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as { text: string };
    return data.text;
  }
}

/**
 * OpenAI TTS provider.
 * Uses the OpenAI audio speech API.
 */
export class OpenAITTS implements TTSProvider {
  private apiKey: string;
  private model: string;
  private voice: string;

  constructor(apiKey: string, model = "tts-1", voice = "alloy") {
    this.apiKey = apiKey;
    this.model = model;
    this.voice = voice;
  }

  async synthesize(text: string): Promise<{ audio: Buffer; mimeType: string }> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: this.voice,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI TTS failed: ${res.status} ${errText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuf),
      mimeType: "audio/mpeg",
    };
  }
}
