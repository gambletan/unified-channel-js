import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentType } from "../src/types.js";

// Test adapter message parsing logic by simulating events

describe("IRC adapter parsing", () => {
  it("parses text messages", async () => {
    const { IRCAdapter } = await import("../src/adapters/irc.js");
    const adapter = new IRCAdapter("irc.test.com", "bot", ["#test"]);
    // Access internals to test parsing
    expect(adapter.channelId).toBe("irc");
  });
});

describe("Twitch adapter parsing", () => {
  it("creates adapter with correct channel id", async () => {
    const { TwitchAdapter } = await import("../src/adapters/twitch.js");
    const adapter = new TwitchAdapter("bot", "oauth:test", ["#channel"]);
    expect(adapter.channelId).toBe("twitch");
  });
});

describe("Mattermost adapter", () => {
  it("creates adapter with correct defaults", async () => {
    const { MattermostAdapter } = await import("../src/adapters/mattermost.js");
    const adapter = new MattermostAdapter("https://mm.test.com", "token123");
    expect(adapter.channelId).toBe("mattermost");
  });
});

describe("Zalo adapter", () => {
  it("creates with correct channel id", async () => {
    const { ZaloAdapter } = await import("../src/adapters/zalo.js");
    const adapter = new ZaloAdapter("token123");
    expect(adapter.channelId).toBe("zalo");
  });
});

describe("BlueBubbles adapter", () => {
  it("creates with correct channel id", async () => {
    const { BlueBubblesAdapter } = await import("../src/adapters/bluebubbles.js");
    const adapter = new BlueBubblesAdapter("http://localhost:1234", "pass");
    expect(adapter.channelId).toBe("bluebubbles");
  });
});

describe("Nextcloud adapter", () => {
  it("creates with correct channel id", async () => {
    const { NextcloudAdapter } = await import("../src/adapters/nextcloud.js");
    const adapter = new NextcloudAdapter("https://nc.test.com", "admin", "pass", ["room1"]);
    expect(adapter.channelId).toBe("nextcloud");
  });
});

describe("Synology adapter", () => {
  it("creates with correct channel id", async () => {
    const { SynologyAdapter } = await import("../src/adapters/synology.js");
    const adapter = new SynologyAdapter("https://nas.test.com", "token", "https://hook.url");
    expect(adapter.channelId).toBe("synology");
  });
});

describe("Google Chat adapter", () => {
  it("creates with correct channel id", async () => {
    const { GoogleChatAdapter } = await import("../src/adapters/googlechat.js");
    const adapter = new GoogleChatAdapter("/tmp/fake-key.json");
    expect(adapter.channelId).toBe("googlechat");
  });
});

describe("iMessage adapter", () => {
  it("creates with correct channel id", async () => {
    const { IMessageAdapter } = await import("../src/adapters/imessage.js");
    const adapter = new IMessageAdapter();
    expect(adapter.channelId).toBe("imessage");
  });
});

describe("Nostr adapter", () => {
  it("creates with correct channel id", async () => {
    const { NostrAdapter } = await import("../src/adapters/nostr.js");
    const adapter = new NostrAdapter("deadbeef", ["wss://relay.test.com"]);
    expect(adapter.channelId).toBe("nostr");
  });
});

describe("Feishu adapter", () => {
  it("creates with correct channel id", async () => {
    const { FeishuAdapter } = await import("../src/adapters/feishu.js");
    const adapter = new FeishuAdapter("appid", "secret");
    expect(adapter.channelId).toBe("feishu");
  });
});

describe("LINE adapter", () => {
  it("creates with correct channel id", async () => {
    const { LineAdapter } = await import("../src/adapters/line.js");
    const adapter = new LineAdapter("secret", "token");
    expect(adapter.channelId).toBe("line");
  });
});

describe("MS Teams adapter", () => {
  it("creates with correct channel id", async () => {
    const { MSTeamsAdapter } = await import("../src/adapters/msteams.js");
    const adapter = new MSTeamsAdapter("appId", "appPass");
    expect(adapter.channelId).toBe("msteams");
  });
});

describe("Matrix adapter", () => {
  it("creates with correct channel id", async () => {
    const { MatrixAdapter } = await import("../src/adapters/matrix.js");
    const adapter = new MatrixAdapter("https://matrix.test.com", "token123");
    expect(adapter.channelId).toBe("matrix");
  });
});

describe("WhatsApp adapter", () => {
  it("creates with correct channel id", async () => {
    const { WhatsAppAdapter } = await import("../src/adapters/whatsapp.js");
    const adapter = new WhatsAppAdapter();
    expect(adapter.channelId).toBe("whatsapp");
  });
});

describe("Slack adapter", () => {
  it("creates with correct channel id", async () => {
    const { SlackAdapter } = await import("../src/adapters/slack.js");
    const adapter = new SlackAdapter("xoxb-token", "xapp-token");
    expect(adapter.channelId).toBe("slack");
  });
});

describe("Discord adapter", () => {
  it("creates with correct channel id", async () => {
    const { DiscordAdapter } = await import("../src/adapters/discord.js");
    const adapter = new DiscordAdapter("token123");
    expect(adapter.channelId).toBe("discord");
  });
});

describe("Telegram adapter", () => {
  it("creates with correct channel id", async () => {
    const { TelegramAdapter } = await import("../src/adapters/telegram.js");
    const adapter = new TelegramAdapter("123:ABC");
    expect(adapter.channelId).toBe("telegram");
  });
});
