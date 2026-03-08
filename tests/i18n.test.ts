import { describe, it, expect, vi } from "vitest";
import { I18nMiddleware } from "../src/i18n.js";
import { ContentType } from "../src/types.js";
import type { UnifiedMessage } from "../src/types.js";
import type { TranslateFn } from "../src/i18n.js";

const translations = {
  en: { greeting: "Hello", rate_limited: "Too fast!", help: "Need help?" },
  zh: { greeting: "你好", rate_limited: "太快了！", help: "需要帮助？" },
  ja: { greeting: "こんにちは", rate_limited: "速すぎます！" },
};

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

describe("I18nMiddleware", () => {
  it("uses defaultLocale when no locale is detected", async () => {
    const mw = new I18nMiddleware(translations, { defaultLocale: "en" });
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();

    await mw.process(msg, next);

    expect(msg.metadata?.locale).toBe("en");
    const t = msg.metadata?.t as TranslateFn;
    expect(t("greeting")).toBe("Hello");
    expect(next).toHaveBeenCalledWith(msg);
  });

  it("detects locale from msg.metadata.locale", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg({ metadata: { locale: "zh" } });

    await mw.process(msg, next);

    expect(msg.metadata?.locale).toBe("zh");
    const t = msg.metadata?.t as TranslateFn;
    expect(t("greeting")).toBe("你好");
    expect(t("rate_limited")).toBe("太快了！");
  });

  it("detects locale from msg.sender.locale", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg({
      sender: { id: "user1", locale: "ja" } as UnifiedMessage["sender"] & { locale: string },
    });

    await mw.process(msg, next);

    expect(msg.metadata?.locale).toBe("ja");
    const t = msg.metadata?.t as TranslateFn;
    expect(t("greeting")).toBe("こんにちは");
  });

  it("falls back to defaultLocale for missing translation keys", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg({ metadata: { locale: "ja" } });

    await mw.process(msg, next);

    const t = msg.metadata?.t as TranslateFn;
    // "help" is not in ja translations, should fall back to en
    expect(t("help")).toBe("Need help?");
  });

  it("returns key itself when no translation exists anywhere", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();

    await mw.process(msg, next);

    const t = msg.metadata?.t as TranslateFn;
    expect(t("nonexistent_key")).toBe("nonexistent_key");
  });

  it("returns explicit fallback when no translation exists", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();

    await mw.process(msg, next);

    const t = msg.metadata?.t as TranslateFn;
    expect(t("missing", "default text")).toBe("default text");
  });

  it("uses custom detectFn when provided", async () => {
    const mw = new I18nMiddleware(translations, {
      detectFn: (_msg) => "zh",
    });
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();

    await mw.process(msg, next);

    expect(msg.metadata?.locale).toBe("zh");
    const t = msg.metadata?.t as TranslateFn;
    expect(t("greeting")).toBe("你好");
  });

  it("falls back to defaultLocale when detectFn returns unknown locale", async () => {
    const mw = new I18nMiddleware(translations, {
      defaultLocale: "en",
      detectFn: (_msg) => "fr", // not in translations
    });
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();

    await mw.process(msg, next);

    expect(msg.metadata?.locale).toBe("en");
    const t = msg.metadata?.t as TranslateFn;
    expect(t("greeting")).toBe("Hello");
  });

  it("initializes metadata if not present", async () => {
    const mw = new I18nMiddleware(translations);
    const next = vi.fn().mockResolvedValue("ok");
    const msg = makeMsg();
    delete msg.metadata;

    await mw.process(msg, next);

    expect(msg.metadata).toBeDefined();
    expect(msg.metadata?.locale).toBe("en");
    expect(typeof msg.metadata?.t).toBe("function");
  });
});
