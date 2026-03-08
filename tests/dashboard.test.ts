import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import { Dashboard } from "../src/dashboard.js";
import { ChannelManager } from "../src/manager.js";
import { ContentType } from "../src/types.js";
import type { ChannelAdapter } from "../src/adapter.js";
import type { UnifiedMessage, OutboundMessage } from "../src/types.js";

function createMockAdapter(channelId: string): ChannelAdapter & { triggerMessage: (msg: UnifiedMessage) => void; sentMessages: OutboundMessage[] } {
  let handler: ((msg: UnifiedMessage) => void) | undefined;
  const sentMessages: OutboundMessage[] = [];
  return {
    channelId,
    sentMessages,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessage(h) { handler = h; },
    send: vi.fn().mockImplementation(async (msg: OutboundMessage) => { sentMessages.push(msg); return `sent-${sentMessages.length}`; }),
    getStatus: vi.fn().mockResolvedValue({ connected: true, channel: channelId }),
    triggerMessage(msg: UnifiedMessage) { handler?.(msg); },
  };
}

function makeMsg(channel: string, text: string, overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: `msg-${Date.now()}`,
    channel,
    sender: { id: "user1", username: "testuser" },
    content: { type: ContentType.TEXT, text },
    timestamp: new Date(),
    chatId: "c1",
    ...overrides,
  };
}

/** Helper to make HTTP requests to the dashboard. */
function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, method, path, headers: { ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.setHeader("Content-Type", "application/json");
      req.write(body);
    }
    req.end();
  });
}

describe("Dashboard", () => {
  let manager: ChannelManager;
  let adapter: ReturnType<typeof createMockAdapter>;
  let dashboard: Dashboard;
  let port: number;

  beforeEach(async () => {
    manager = new ChannelManager();
    adapter = createMockAdapter("telegram");
    manager.addChannel(adapter);
    // Use port 0 to get a random available port
    port = 0;
    dashboard = new Dashboard(manager, { port: 0 });
    await dashboard.start();
    // Get the actual port from the server
    const addr = (dashboard as any).server?.address();
    port = typeof addr === "object" ? addr.port : 0;
  });

  afterEach(async () => {
    await dashboard.stop();
  });

  it("GET / returns HTML dashboard page", async () => {
    const res = await request(port, "GET", "/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Unified Channel Dashboard");
    expect(res.body).toContain("/api/status");
    expect(res.body).toContain("/api/messages");
  });

  it("GET /api/status returns channel statuses as JSON", async () => {
    const res = await request(port, "GET", "/api/status");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.telegram).toBeDefined();
    expect(data.telegram.connected).toBe(true);
    expect(data.telegram.channel).toBe("telegram");
  });

  it("GET /api/messages returns empty array initially", async () => {
    const res = await request(port, "GET", "/api/messages");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toEqual([]);
  });

  it("GET /api/messages returns recorded messages after middleware capture", async () => {
    // Simulate incoming message through the adapter -> manager pipeline
    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));
    adapter.triggerMessage(makeMsg("telegram", "hello world"));
    await new Promise((r) => setTimeout(r, 50));

    const res = await request(port, "GET", "/api/messages");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(1);
    expect(data[0].text).toBe("hello world");
    expect(data[0].channel).toBe("telegram");
    expect(data[0].sender.username).toBe("testuser");
  });

  it("POST /api/send sends message through the manager", async () => {
    const res = await request(port, "POST", "/api/send", JSON.stringify({
      channel: "telegram", chatId: "c1", text: "outgoing message",
    }));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.messageId).toBe("sent-1");
    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].text).toBe("outgoing message");
  });

  it("POST /api/send returns 400 for missing fields", async () => {
    const res = await request(port, "POST", "/api/send", JSON.stringify({
      channel: "telegram",
    }));
    expect(res.status).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Missing required fields");
  });

  it("POST /api/send returns 400 for invalid JSON", async () => {
    const res = await request(port, "POST", "/api/send", "not json");
    expect(res.status).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Invalid JSON");
  });

  it("GET /unknown returns 404", async () => {
    const res = await request(port, "GET", "/unknown");
    expect(res.status).toBe(404);
  });

  it("POST /api/send returns error for unregistered channel", async () => {
    const res = await request(port, "POST", "/api/send", JSON.stringify({
      channel: "nonexistent", chatId: "c1", text: "hello",
    }));
    expect(res.status).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("not registered");
  });

  it("limits stored messages to 100", async () => {
    await adapter.connect();
    adapter.onMessage((msg) => (manager as any).handleMessage(adapter, msg));

    for (let i = 0; i < 110; i++) {
      adapter.triggerMessage(makeMsg("telegram", `msg-${i}`, { id: `id-${i}` }));
    }
    await new Promise((r) => setTimeout(r, 100));

    const messages = dashboard.getMessages();
    expect(messages.length).toBeLessThanOrEqual(100);
  });
});

describe("Dashboard with auth", () => {
  let manager: ChannelManager;
  let dashboard: Dashboard;
  let port: number;

  beforeEach(async () => {
    manager = new ChannelManager();
    manager.addChannel(createMockAdapter("test"));
    dashboard = new Dashboard(manager, { port: 0, auth: { username: "admin", password: "secret" } });
    await dashboard.start();
    const addr = (dashboard as any).server?.address();
    port = typeof addr === "object" ? addr.port : 0;
  });

  afterEach(async () => {
    await dashboard.stop();
  });

  it("returns 401 without auth header", async () => {
    const res = await request(port, "GET", "/");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("Basic");
  });

  it("returns 401 with wrong credentials", async () => {
    const creds = Buffer.from("wrong:creds").toString("base64");
    const res = await request(port, "GET", "/", undefined, { Authorization: `Basic ${creds}` });
    expect(res.status).toBe(401);
  });

  it("allows access with correct credentials", async () => {
    const creds = Buffer.from("admin:secret").toString("base64");
    const res = await request(port, "GET", "/api/status", undefined, { Authorization: `Basic ${creds}` });
    expect(res.status).toBe(200);
  });
});
