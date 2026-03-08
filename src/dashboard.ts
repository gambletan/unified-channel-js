/** Dashboard — lightweight built-in web UI for monitoring and sending messages. */

import * as http from "node:http";
import type { ChannelManager } from "./manager.js";
import type { UnifiedMessage } from "./types.js";
import type { Middleware } from "./middleware.js";

export interface DashboardOptions {
  port?: number;
  auth?: { username: string; password: string };
}

interface StoredMessage {
  id: string;
  channel: string;
  sender: { id: string; username?: string; displayName?: string };
  text: string;
  timestamp: string;
}

/**
 * Dashboard web UI — shows channel status, recent messages, and send form.
 *
 * Usage:
 *   const dashboard = new Dashboard(manager, { port: 8080 });
 *   await dashboard.start();
 */
export class Dashboard {
  private server: http.Server | null = null;
  private messages: StoredMessage[] = [];
  private readonly maxMessages = 100;
  private readonly port: number;
  private readonly auth: { username: string; password: string } | undefined;
  private readonly manager: ChannelManager;
  private readonly middleware: DashboardMiddleware;

  constructor(manager: ChannelManager, options: DashboardOptions = {}) {
    this.manager = manager;
    this.port = options.port ?? 8080;
    this.auth = options.auth;

    // Install middleware to capture incoming messages
    this.middleware = new DashboardMiddleware((msg) => this.recordMessage(msg));
    manager.addMiddleware(this.middleware);
  }

  /** Start the HTTP server. */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on("error", reject);
      this.server.listen(this.port, () => resolve());
    });
  }

  /** Stop the HTTP server. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  /** Get recorded messages (for testing). */
  getMessages(): StoredMessage[] {
    return [...this.messages];
  }

  private recordMessage(msg: UnifiedMessage): void {
    const stored: StoredMessage = {
      id: msg.id,
      channel: msg.channel,
      sender: {
        id: msg.sender.id,
        username: msg.sender.username,
        displayName: msg.sender.displayName,
      },
      text: msg.content.text,
      timestamp: msg.timestamp.toISOString(),
    };
    this.messages.push(stored);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  private checkAuth(req: http.IncomingMessage): boolean {
    if (!this.auth) return true;
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Basic ")) return false;
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const [user, pass] = decoded.split(":");
    return user === this.auth.username && pass === this.auth.password;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Auth check
    if (!this.checkAuth(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Dashboard"', "Content-Type": "text/plain" });
      res.end("Unauthorized");
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${this.port}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/") {
        this.serveHtml(res);
      } else if (req.method === "GET" && path === "/api/status") {
        await this.serveStatus(res);
      } else if (req.method === "GET" && path === "/api/messages") {
        this.serveMessages(res);
      } else if (req.method === "POST" && path === "/api/send") {
        await this.handleSend(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  }

  private async serveStatus(res: http.ServerResponse): Promise<void> {
    const statuses = await this.manager.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(statuses));
  }

  private serveMessages(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.messages));
  }

  private async handleSend(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readBody(req);
    let parsed: { channel?: string; chatId?: string; text?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!parsed.channel || !parsed.chatId || !parsed.text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required fields: channel, chatId, text" }));
      return;
    }

    try {
      const messageId = await this.manager.send(parsed.channel, parsed.chatId, parsed.text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, messageId }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  }

  private serveHtml(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
  }
}

/** Middleware that passively records all incoming messages for the dashboard. */
class DashboardMiddleware implements Middleware {
  constructor(private readonly onMsg: (msg: UnifiedMessage) => void) {}

  async process(
    msg: UnifiedMessage,
    next: (msg: UnifiedMessage) => Promise<string | import("./types.js").OutboundMessage | null>
  ) {
    this.onMsg(msg);
    return next(msg);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unified Channel Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    background: #0d1117; color: #c9d1d9;
    line-height: 1.6; padding: 20px;
  }
  h1 { color: #58a6ff; margin-bottom: 24px; font-size: 1.4em; }
  h2 { color: #8b949e; margin-bottom: 12px; font-size: 1.1em; text-transform: uppercase; letter-spacing: 1px; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }

  .card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px;
  }

  /* Channel status cards */
  .channels { display: flex; flex-wrap: wrap; gap: 12px; }
  .ch-card {
    background: #1c2129; border: 1px solid #30363d; border-radius: 6px;
    padding: 12px 16px; min-width: 140px; flex: 1;
  }
  .ch-name { font-weight: 600; color: #e6edf3; margin-bottom: 4px; }
  .ch-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    margin-right: 6px; vertical-align: middle;
  }
  .ch-dot.on { background: #3fb950; }
  .ch-dot.off { background: #f85149; }

  /* Messages */
  .msg-list {
    max-height: 400px; overflow-y: auto; font-size: 0.85em;
  }
  .msg-item {
    padding: 8px 0; border-bottom: 1px solid #21262d;
  }
  .msg-meta { color: #8b949e; font-size: 0.8em; }
  .msg-text { color: #c9d1d9; margin-top: 2px; white-space: pre-wrap; word-break: break-word; }

  /* Send form */
  .send-form { display: flex; flex-direction: column; gap: 10px; }
  .send-form label { color: #8b949e; font-size: 0.85em; }
  .send-form input, .send-form select, .send-form textarea {
    background: #0d1117; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 4px; padding: 8px; font-family: inherit; font-size: 0.9em;
  }
  .send-form textarea { min-height: 60px; resize: vertical; }
  .send-form button {
    background: #238636; color: #fff; border: none; border-radius: 4px;
    padding: 10px; cursor: pointer; font-family: inherit; font-weight: 600;
  }
  .send-form button:hover { background: #2ea043; }
  .send-result { font-size: 0.85em; margin-top: 4px; }
  .send-result.ok { color: #3fb950; }
  .send-result.err { color: #f85149; }

  .empty { color: #484f58; font-style: italic; }
</style>
</head>
<body>
<h1>Unified Channel Dashboard</h1>

<div class="grid">
  <div class="card">
    <h2>Channels</h2>
    <div id="channels" class="channels"><span class="empty">Loading...</span></div>
  </div>
  <div class="card">
    <h2>Send Message</h2>
    <div class="send-form" id="sendForm">
      <label>Channel
        <select id="sendChannel"></select>
      </label>
      <label>Chat ID
        <input id="sendChatId" type="text" placeholder="e.g. 123456789">
      </label>
      <label>Message
        <textarea id="sendText" placeholder="Type your message..."></textarea>
      </label>
      <button onclick="sendMessage()">Send</button>
      <div id="sendResult" class="send-result"></div>
    </div>
  </div>
</div>

<div class="card">
  <h2>Recent Messages</h2>
  <div id="messages" class="msg-list"><span class="empty">No messages yet</span></div>
</div>

<script>
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const el = document.getElementById('channels');
    const sel = document.getElementById('sendChannel');
    const keys = Object.keys(data);
    if (keys.length === 0) {
      el.innerHTML = '<span class="empty">No channels registered</span>';
      return;
    }
    el.innerHTML = keys.map(k => {
      const s = data[k];
      const dot = s.connected ? 'on' : 'off';
      const label = s.connected ? 'Connected' : (s.error || 'Disconnected');
      return '<div class="ch-card"><div class="ch-name">' + esc(k) + '</div><span class="ch-dot ' + dot + '"></span>' + esc(label) + '</div>';
    }).join('');
    sel.innerHTML = keys.map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('');
  } catch (e) { console.error('status fetch failed', e); }
}

async function fetchMessages() {
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    const el = document.getElementById('messages');
    if (data.length === 0) {
      el.innerHTML = '<span class="empty">No messages yet</span>';
      return;
    }
    el.innerHTML = data.slice().reverse().map(m => {
      const t = new Date(m.timestamp).toLocaleTimeString();
      const who = m.sender.displayName || m.sender.username || m.sender.id;
      return '<div class="msg-item"><div class="msg-meta">[' + esc(t) + '] <b>' + esc(m.channel) + '</b> / ' + esc(who) + '</div><div class="msg-text">' + esc(m.text) + '</div></div>';
    }).join('');
  } catch (e) { console.error('messages fetch failed', e); }
}

async function sendMessage() {
  const channel = document.getElementById('sendChannel').value;
  const chatId = document.getElementById('sendChatId').value;
  const text = document.getElementById('sendText').value;
  const result = document.getElementById('sendResult');
  if (!channel || !chatId || !text) { result.className = 'send-result err'; result.textContent = 'All fields required'; return; }
  try {
    const res = await fetch('/api/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, chatId, text })
    });
    const data = await res.json();
    if (data.ok) { result.className = 'send-result ok'; result.textContent = 'Sent (id: ' + (data.messageId || 'n/a') + ')'; document.getElementById('sendText').value = ''; }
    else { result.className = 'send-result err'; result.textContent = data.error || 'Send failed'; }
  } catch (e) { result.className = 'send-result err'; result.textContent = String(e); }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

fetchStatus();
fetchMessages();
setInterval(() => { fetchStatus(); fetchMessages(); }, 5000);
</script>
</body>
</html>`;
