import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentType } from "../src/types.js";

// Test adapter construction and channelId for every adapter

describe("IRC adapter", () => {
  it("has correct channelId", async () => {
    const { IRCAdapter } = await import("../src/adapters/irc.js");
    const adapter = new IRCAdapter("irc.test.com", "bot", ["#test"]);
    expect(adapter.channelId).toBe("irc");
  });

  it("accepts constructor options", async () => {
    const { IRCAdapter } = await import("../src/adapters/irc.js");
    const adapter = new IRCAdapter("irc.test.com", "bot", ["#a", "#b"], { port: 6697, tls: true });
    expect(adapter.channelId).toBe("irc");
  });
});

describe("Twitch adapter", () => {
  it("has correct channelId", async () => {
    const { TwitchAdapter } = await import("../src/adapters/twitch.js");
    const adapter = new TwitchAdapter("bot", "oauth:test", ["#channel"]);
    expect(adapter.channelId).toBe("twitch");
  });

  it("accepts multiple channels", async () => {
    const { TwitchAdapter } = await import("../src/adapters/twitch.js");
    const adapter = new TwitchAdapter("bot", "oauth:t", ["#ch1", "#ch2", "#ch3"]);
    expect(adapter.channelId).toBe("twitch");
  });
});

describe("Mattermost adapter", () => {
  it("has correct channelId", async () => {
    const { MattermostAdapter } = await import("../src/adapters/mattermost.js");
    const adapter = new MattermostAdapter("https://mm.test.com", "token123");
    expect(adapter.channelId).toBe("mattermost");
  });
});

describe("Zalo adapter", () => {
  it("has correct channelId", async () => {
    const { ZaloAdapter } = await import("../src/adapters/zalo.js");
    const adapter = new ZaloAdapter("token123");
    expect(adapter.channelId).toBe("zalo");
  });
});

describe("BlueBubbles adapter", () => {
  it("has correct channelId", async () => {
    const { BlueBubblesAdapter } = await import("../src/adapters/bluebubbles.js");
    const adapter = new BlueBubblesAdapter("http://localhost:1234", "pass");
    expect(adapter.channelId).toBe("bluebubbles");
  });
});

describe("Nextcloud adapter", () => {
  it("has correct channelId", async () => {
    const { NextcloudAdapter } = await import("../src/adapters/nextcloud.js");
    const adapter = new NextcloudAdapter("https://nc.test.com", "admin", "pass", ["room1"]);
    expect(adapter.channelId).toBe("nextcloud");
  });

  it("accepts multiple rooms", async () => {
    const { NextcloudAdapter } = await import("../src/adapters/nextcloud.js");
    const adapter = new NextcloudAdapter("https://nc.test.com", "admin", "pass", ["room1", "room2"]);
    expect(adapter.channelId).toBe("nextcloud");
  });
});

describe("Synology adapter", () => {
  it("has correct channelId", async () => {
    const { SynologyAdapter } = await import("../src/adapters/synology.js");
    const adapter = new SynologyAdapter("https://nas.test.com", "token", "https://hook.url");
    expect(adapter.channelId).toBe("synology");
  });
});

describe("Google Chat adapter", () => {
  it("has correct channelId", async () => {
    const { GoogleChatAdapter } = await import("../src/adapters/googlechat.js");
    const adapter = new GoogleChatAdapter("/tmp/fake-key.json");
    expect(adapter.channelId).toBe("googlechat");
  });
});

describe("iMessage adapter", () => {
  it("has correct channelId", async () => {
    const { IMessageAdapter } = await import("../src/adapters/imessage.js");
    const adapter = new IMessageAdapter();
    expect(adapter.channelId).toBe("imessage");
  });
});

describe("Nostr adapter", () => {
  it("has correct channelId", async () => {
    const { NostrAdapter } = await import("../src/adapters/nostr.js");
    const adapter = new NostrAdapter("deadbeef", ["wss://relay.test.com"]);
    expect(adapter.channelId).toBe("nostr");
  });

  it("accepts multiple relays", async () => {
    const { NostrAdapter } = await import("../src/adapters/nostr.js");
    const adapter = new NostrAdapter("beef", ["wss://r1.com", "wss://r2.com"]);
    expect(adapter.channelId).toBe("nostr");
  });
});

describe("Feishu adapter", () => {
  it("has correct channelId", async () => {
    const { FeishuAdapter } = await import("../src/adapters/feishu.js");
    const adapter = new FeishuAdapter("appid", "secret");
    expect(adapter.channelId).toBe("feishu");
  });

  it("accepts options", async () => {
    const { FeishuAdapter } = await import("../src/adapters/feishu.js");
    const adapter = new FeishuAdapter("appid", "secret", { port: 9001 });
    expect(adapter.channelId).toBe("feishu");
  });
});

describe("LINE adapter", () => {
  it("has correct channelId", async () => {
    const { LineAdapter } = await import("../src/adapters/line.js");
    const adapter = new LineAdapter("secret", "token");
    expect(adapter.channelId).toBe("line");
  });

  it("accepts port option", async () => {
    const { LineAdapter } = await import("../src/adapters/line.js");
    const adapter = new LineAdapter("secret", "token", { port: 9090 });
    expect(adapter.channelId).toBe("line");
  });
});

describe("MS Teams adapter", () => {
  it("has correct channelId", async () => {
    const { MSTeamsAdapter } = await import("../src/adapters/msteams.js");
    const adapter = new MSTeamsAdapter("appId", "appPass");
    expect(adapter.channelId).toBe("msteams");
  });

  it("accepts port option", async () => {
    const { MSTeamsAdapter } = await import("../src/adapters/msteams.js");
    const adapter = new MSTeamsAdapter("appId", "appPass", { port: 4000 });
    expect(adapter.channelId).toBe("msteams");
  });
});

describe("Matrix adapter", () => {
  it("has correct channelId", async () => {
    const { MatrixAdapter } = await import("../src/adapters/matrix.js");
    const adapter = new MatrixAdapter("https://matrix.test.com", "token123");
    expect(adapter.channelId).toBe("matrix");
  });

  it("accepts options with allowed rooms", async () => {
    const { MatrixAdapter } = await import("../src/adapters/matrix.js");
    const adapter = new MatrixAdapter("https://matrix.test.com", "token", { allowedRoomIds: new Set(["!room:test"]) });
    expect(adapter.channelId).toBe("matrix");
  });
});

describe("WhatsApp adapter", () => {
  it("has correct channelId", async () => {
    const { WhatsAppAdapter } = await import("../src/adapters/whatsapp.js");
    const adapter = new WhatsAppAdapter();
    expect(adapter.channelId).toBe("whatsapp");
  });

  it("accepts options", async () => {
    const { WhatsAppAdapter } = await import("../src/adapters/whatsapp.js");
    const adapter = new WhatsAppAdapter({ commandPrefix: "!" });
    expect(adapter.channelId).toBe("whatsapp");
  });
});

describe("Slack adapter", () => {
  it("has correct channelId", async () => {
    const { SlackAdapter } = await import("../src/adapters/slack.js");
    const adapter = new SlackAdapter("xoxb-token", "xapp-token");
    expect(adapter.channelId).toBe("slack");
  });

  it("accepts options with allowed channels", async () => {
    const { SlackAdapter } = await import("../src/adapters/slack.js");
    const adapter = new SlackAdapter("xoxb-token", "xapp-token", { allowedChannelIds: new Set(["C123"]) });
    expect(adapter.channelId).toBe("slack");
  });
});

describe("Discord adapter", () => {
  it("has correct channelId", async () => {
    const { DiscordAdapter } = await import("../src/adapters/discord.js");
    const adapter = new DiscordAdapter("token123");
    expect(adapter.channelId).toBe("discord");
  });

  it("accepts options", async () => {
    const { DiscordAdapter } = await import("../src/adapters/discord.js");
    const adapter = new DiscordAdapter("token", { allowDm: false, commandPrefix: "!" });
    expect(adapter.channelId).toBe("discord");
  });
});

describe("Telegram adapter", () => {
  it("has correct channelId", async () => {
    const { TelegramAdapter } = await import("../src/adapters/telegram.js");
    const adapter = new TelegramAdapter("123:ABC");
    expect(adapter.channelId).toBe("telegram");
  });

  it("accepts custom parse mode", async () => {
    const { TelegramAdapter } = await import("../src/adapters/telegram.js");
    const adapter = new TelegramAdapter("123:ABC", "HTML");
    expect(adapter.channelId).toBe("telegram");
  });
});

// Cross-adapter verification: all adapters implement ChannelAdapter interface
describe("Adapter interface compliance", () => {
  it("all adapters have required methods", async () => {
    const adapters = [
      (await import("../src/adapters/irc.js")).IRCAdapter.prototype,
      (await import("../src/adapters/telegram.js")).TelegramAdapter.prototype,
      (await import("../src/adapters/discord.js")).DiscordAdapter.prototype,
      (await import("../src/adapters/slack.js")).SlackAdapter.prototype,
      (await import("../src/adapters/matrix.js")).MatrixAdapter.prototype,
      (await import("../src/adapters/whatsapp.js")).WhatsAppAdapter.prototype,
    ];
    for (const proto of adapters) {
      expect(typeof proto.connect).toBe("function");
      expect(typeof proto.disconnect).toBe("function");
      expect(typeof proto.onMessage).toBe("function");
      expect(typeof proto.send).toBe("function");
      expect(typeof proto.getStatus).toBe("function");
    }
  });
});
