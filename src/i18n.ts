/** I18n middleware — auto-detects user locale and provides translation helpers. */

import type { UnifiedMessage } from "./types.js";
import type { Handler, HandlerResult, Middleware } from "./middleware.js";

/** Translation map: locale -> key -> translated string. */
export type Translations = Record<string, Record<string, string>>;

/** Translate function attached to message metadata. */
export type TranslateFn = (key: string, fallback?: string) => string;

export interface I18nOptions {
  /** Default locale when detection fails. Defaults to "en". */
  defaultLocale?: string;
  /** Custom locale detection function. Receives the message, returns a locale string. */
  detectFn?: (msg: UnifiedMessage) => string | undefined;
}

/**
 * Middleware that detects the user's locale and attaches a translate function
 * to `msg.metadata.t` and the resolved locale to `msg.metadata.locale`.
 *
 * Detection order (default):
 *   1. msg.metadata.locale (if already set upstream)
 *   2. msg.sender.locale (if the identity carries one)
 *   3. options.defaultLocale (defaults to "en")
 */
export class I18nMiddleware implements Middleware {
  private translations: Translations;
  private defaultLocale: string;
  private detectFn: (msg: UnifiedMessage) => string | undefined;

  constructor(translations: Translations, options?: I18nOptions) {
    this.translations = translations;
    this.defaultLocale = options?.defaultLocale ?? "en";
    this.detectFn = options?.detectFn ?? I18nMiddleware.defaultDetect;
  }

  /** Default locale detection: metadata.locale -> sender.locale -> undefined. */
  private static defaultDetect(msg: UnifiedMessage): string | undefined {
    const metaLocale = msg.metadata?.locale;
    if (typeof metaLocale === "string" && metaLocale) return metaLocale;

    const senderLocale = (msg.sender as Record<string, unknown>).locale;
    if (typeof senderLocale === "string" && senderLocale) return senderLocale;

    return undefined;
  }

  /** Resolve the effective locale, falling back to defaultLocale. */
  private resolveLocale(msg: UnifiedMessage): string {
    const detected = this.detectFn(msg);
    if (detected && detected in this.translations) return detected;
    return this.defaultLocale;
  }

  /** Build a translate function bound to a specific locale. */
  private buildTranslateFn(locale: string): TranslateFn {
    return (key: string, fallback?: string): string => {
      const table = this.translations[locale];
      if (table && key in table) return table[key];
      // Fall back to default locale
      const fallbackTable = this.translations[this.defaultLocale];
      if (fallbackTable && key in fallbackTable) return fallbackTable[key];
      return fallback ?? key;
    };
  }

  async process(msg: UnifiedMessage, next: Handler): Promise<HandlerResult> {
    const locale = this.resolveLocale(msg);
    const t = this.buildTranslateFn(locale);

    // Attach locale and translate function to metadata
    if (!msg.metadata) {
      msg.metadata = {};
    }
    msg.metadata.locale = locale;
    msg.metadata.t = t;

    return next(msg);
  }
}
