import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceMiddleware } from "../src/voice.js";
import type { STTProvider, TTSProvider } from "../src/voice.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage, OutboundMessage } from "../src/types.js";
import type { Handler } from "../src/middleware.js";

function makeMsg(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: "1",
    channel: "test",
    sender: { id: "user1" },
    content: { type: ContentType.TEXT, text: "hello" },
    timestamp: new Date(),
    chatId: "c1",
    ...overrides,
  };
}

function makeVoiceMsg(mediaType = "audio/ogg", mediaUrl = "https://example.com/voice.ogg"): UnifiedMessage {
  return makeMsg({
    content: {
      type: ContentType.MEDIA,
      text: "",
      mediaUrl,
      mediaType,
    },
  });
}

function mockSTT(text = "transcribed text"): STTProvider {
  return {
    transcribe: vi.fn().mockResolvedValue(text),
  };
}

function mockTTS(mimeType = "audio/mpeg"): TTSProvider {
  return {
    synthesize: vi.fn().mockResolvedValue({
      audio: Buffer.from("fake-audio"),
      mimeType,
    }),
  };
}

// Mock global fetch for audio download
function mockFetch(audioData = "fake-audio-data") {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(Buffer.from(audioData).buffer),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("VoiceMiddleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes non-voice messages through unchanged", async () => {
    const stt = mockSTT();
    const mw = new VoiceMiddleware({ stt });
    const msg = makeMsg(); // TEXT type
    const next: Handler = vi.fn().mockResolvedValue("ok");

    const result = await mw.process(msg, next);

    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledWith(msg);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("passes non-audio media through unchanged", async () => {
    const stt = mockSTT();
    const mw = new VoiceMiddleware({ stt });
    const msg = makeMsg({
      content: { type: ContentType.MEDIA, text: "", mediaUrl: "https://x.com/img.png", mediaType: "image/png" },
    });
    const next: Handler = vi.fn().mockResolvedValue("ok");

    const result = await mw.process(msg, next);

    expect(result).toBe("ok");
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("transcribes voice messages and replaces content", async () => {
    const fetchMock = mockFetch();
    const stt = mockSTT("hello world");
    const mw = new VoiceMiddleware({ stt });
    const msg = makeVoiceMsg("audio/ogg", "https://example.com/voice.ogg");
    const next: Handler = vi.fn().mockResolvedValue("reply");

    const result = await mw.process(msg, next);

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/voice.ogg");
    expect(stt.transcribe).toHaveBeenCalled();
    expect(result).toBe("reply");

    // Verify next was called with transcribed message
    const transcribedMsg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as UnifiedMessage;
    expect(transcribedMsg.content.type).toBe(ContentType.TEXT);
    expect(transcribedMsg.content.text).toBe("hello world");
  });

  it("stores original voice info in metadata", async () => {
    mockFetch();
    const stt = mockSTT("transcribed");
    const mw = new VoiceMiddleware({ stt });
    const msg = makeVoiceMsg("audio/ogg", "https://example.com/voice.ogg");
    const next: Handler = vi.fn().mockResolvedValue(null);

    await mw.process(msg, next);

    const transcribedMsg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as UnifiedMessage;
    expect(transcribedMsg.metadata?.voiceOriginal).toEqual({
      mediaUrl: "https://example.com/voice.ogg",
      mediaType: "audio/ogg",
      contentType: ContentType.MEDIA,
      text: "",
    });
  });

  it("passes through voice messages when no STT provider", async () => {
    const mw = new VoiceMiddleware();
    const msg = makeVoiceMsg();
    const next: Handler = vi.fn().mockResolvedValue("ok");

    const result = await mw.process(msg, next);

    expect(result).toBe("ok");
    // next should be called with original message (no transcription)
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(msg);
  });

  it("passes through voice messages with no mediaUrl", async () => {
    const stt = mockSTT();
    const mw = new VoiceMiddleware({ stt });
    const msg = makeMsg({
      content: { type: ContentType.MEDIA, text: "", mediaType: "audio/ogg" },
    });
    const next: Handler = vi.fn().mockResolvedValue("ok");

    const result = await mw.process(msg, next);

    expect(result).toBe("ok");
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("recognizes multiple voice media types", async () => {
    mockFetch();
    const stt = mockSTT("text");
    const mw = new VoiceMiddleware({ stt });
    const next: Handler = vi.fn().mockResolvedValue(null);

    for (const mediaType of ["voice", "audio", "audio/ogg", "audio/mp3", "audio/wav", "ogg", "mp3", "wav"]) {
      const msg = makeVoiceMsg(mediaType);
      await mw.process(msg, next);
    }

    expect(stt.transcribe).toHaveBeenCalledTimes(8);
  });

  it("synthesizes TTS for string replies when autoTts enabled", async () => {
    mockFetch();
    const stt = mockSTT("hello");
    const tts = mockTTS();
    const mw = new VoiceMiddleware({ stt, tts, autoTts: true });
    const msg = makeVoiceMsg();
    const next: Handler = vi.fn().mockResolvedValue("reply text");

    const result = await mw.process(msg, next);

    expect(tts.synthesize).toHaveBeenCalledWith("reply text");
    // Result should be an OutboundMessage with voice metadata
    const outbound = result as OutboundMessage;
    expect(outbound.text).toBe("reply text");
    expect(outbound.metadata?.voiceReply).toBeDefined();
    const voiceReply = outbound.metadata!.voiceReply as { audio: string; mimeType: string };
    expect(voiceReply.mimeType).toBe("audio/mpeg");
    expect(voiceReply.audio).toBe(Buffer.from("fake-audio").toString("base64"));
  });

  it("synthesizes TTS for OutboundMessage replies when autoTts enabled", async () => {
    mockFetch();
    const stt = mockSTT("hello");
    const tts = mockTTS();
    const mw = new VoiceMiddleware({ stt, tts, autoTts: true });
    const msg = makeVoiceMsg();
    const outboundReply: OutboundMessage = {
      chatId: "c1",
      text: "outbound reply",
    };
    const next: Handler = vi.fn().mockResolvedValue(outboundReply);

    const result = await mw.process(msg, next);

    expect(tts.synthesize).toHaveBeenCalledWith("outbound reply");
    const outbound = result as OutboundMessage;
    expect(outbound.text).toBe("outbound reply");
    expect(outbound.metadata?.voiceReply).toBeDefined();
  });

  it("does not synthesize TTS when autoTts is disabled", async () => {
    mockFetch();
    const stt = mockSTT("hello");
    const tts = mockTTS();
    const mw = new VoiceMiddleware({ stt, tts, autoTts: false });
    const msg = makeVoiceMsg();
    const next: Handler = vi.fn().mockResolvedValue("reply text");

    const result = await mw.process(msg, next);

    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(result).toBe("reply text");
  });

  it("does not synthesize TTS when handler returns null", async () => {
    mockFetch();
    const stt = mockSTT("hello");
    const tts = mockTTS();
    const mw = new VoiceMiddleware({ stt, tts, autoTts: true });
    const msg = makeVoiceMsg();
    const next: Handler = vi.fn().mockResolvedValue(null);

    const result = await mw.process(msg, next);

    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("preserves existing metadata on transcribed messages", async () => {
    mockFetch();
    const stt = mockSTT("transcribed");
    const mw = new VoiceMiddleware({ stt });
    const msg = makeVoiceMsg();
    msg.metadata = { customField: "custom-value" };
    const next: Handler = vi.fn().mockResolvedValue(null);

    await mw.process(msg, next);

    const transcribedMsg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as UnifiedMessage;
    expect(transcribedMsg.metadata?.customField).toBe("custom-value");
    expect(transcribedMsg.metadata?.voiceOriginal).toBeDefined();
  });

  it("passes correct audio format to STT provider", async () => {
    mockFetch();
    const stt = mockSTT("text");
    const mw = new VoiceMiddleware({ stt });

    const msg = makeVoiceMsg("audio/mp3");
    const next: Handler = vi.fn().mockResolvedValue(null);
    await mw.process(msg, next);

    expect(stt.transcribe).toHaveBeenCalledWith(expect.any(Buffer), "mp3");
  });
});
