import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler, parseCron, cronMatches } from "../src/scheduler.js";
import type { ChannelManager } from "../src/manager.js";

function mockManager(): ChannelManager {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChannelManager;
}

describe("Scheduler", () => {
  let manager: ChannelManager;
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = mockManager();
    scheduler = new Scheduler(manager);
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it("every() sends messages at fixed intervals", async () => {
    scheduler.every(1000, "telegram", "chat1", "hello");

    // Advance 3 intervals
    await vi.advanceTimersByTimeAsync(3000);

    expect((manager.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "telegram",
      "chat1",
      "hello"
    );
  });

  it("once() sends a single delayed message then becomes inactive", async () => {
    const taskId = scheduler.once(2000, "discord", "chat2", "one-shot");

    await vi.advanceTimersByTimeAsync(2000);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "discord",
      "chat2",
      "one-shot"
    );

    // Should not fire again
    await vi.advanceTimersByTimeAsync(5000);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("cancel() stops a running task", async () => {
    const taskId = scheduler.every(500, "slack", "chat3", "ping");

    await vi.advanceTimersByTimeAsync(1000);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);

    scheduler.cancel(taskId);

    await vi.advanceTimersByTimeAsync(2000);
    // No additional calls after cancel
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it("cancel() returns false for unknown task ID", () => {
    expect(scheduler.cancel("nonexistent")).toBe(false);
  });

  it("list() returns active tasks only", () => {
    const id1 = scheduler.every(1000, "telegram", "c1", "a");
    const id2 = scheduler.once(5000, "discord", "c2", "b");
    scheduler.cancel(id1);

    const active = scheduler.list();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(id2);
    expect(active[0].type).toBe("once");
    expect(active[0].active).toBe(true);
  });

  it("stop() cancels all tasks", async () => {
    scheduler.every(500, "telegram", "c1", "a");
    scheduler.every(500, "discord", "c2", "b");

    scheduler.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(0);
    expect(scheduler.list()).toEqual([]);
  });

  it("supports async function callbacks", async () => {
    const asyncFn = vi.fn().mockResolvedValue("dynamic text");
    scheduler.every(1000, "telegram", "chat1", asyncFn);

    await vi.advanceTimersByTimeAsync(1000);
    expect(asyncFn).toHaveBeenCalledTimes(1);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "telegram",
      "chat1",
      "dynamic text"
    );
  });

  it("supports sync function callbacks", async () => {
    let counter = 0;
    scheduler.every(1000, "telegram", "chat1", () => `count: ${++counter}`);

    await vi.advanceTimersByTimeAsync(2000);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenNthCalledWith(
      1,
      "telegram",
      "chat1",
      "count: 1"
    );
    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenNthCalledWith(
      2,
      "telegram",
      "chat1",
      "count: 2"
    );
  });
});

describe("parseCron", () => {
  it("parses a standard cron expression", () => {
    const parsed = parseCron("0 9 * * *");
    expect(parsed.minute).toEqual([0]);
    expect(parsed.hour).toEqual([9]);
    expect(parsed.dom.length).toBe(31);
    expect(parsed.month.length).toBe(12);
    expect(parsed.dow.length).toBe(7);
  });

  it("parses comma-separated values", () => {
    const parsed = parseCron("0,30 9,17 * * 1,5");
    expect(parsed.minute).toEqual([0, 30]);
    expect(parsed.hour).toEqual([9, 17]);
    expect(parsed.dow).toEqual([1, 5]);
  });

  it("throws on invalid expression", () => {
    expect(() => parseCron("0 9 *")).toThrow("expected 5 fields");
  });

  it("throws on out-of-range value", () => {
    expect(() => parseCron("60 9 * * *")).toThrow("expected 0-59");
  });
});

describe("cronMatches", () => {
  it("matches when date fits the schedule", () => {
    const parsed = parseCron("30 14 * * *");
    // Wednesday 2026-03-04 14:30
    const date = new Date(2026, 2, 4, 14, 30, 0);
    expect(cronMatches(parsed, date)).toBe(true);
  });

  it("does not match when minute differs", () => {
    const parsed = parseCron("30 14 * * *");
    const date = new Date(2026, 2, 4, 14, 31, 0);
    expect(cronMatches(parsed, date)).toBe(false);
  });
});

describe("Scheduler cron integration", () => {
  it("cron() fires when time matches", async () => {
    vi.useFakeTimers();
    const manager = mockManager();
    const scheduler = new Scheduler(manager);

    // Set fake time to 14:29:00 — advanceTimersByTime will advance from here
    vi.setSystemTime(new Date(2026, 2, 4, 14, 29, 0));
    scheduler.cron("30 14 * * *", "telegram", "chat1", "cron-msg");

    // Advance 60s — Date.now() will move to 14:30, which matches cron
    await vi.advanceTimersByTimeAsync(60_000);

    expect((manager.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "telegram",
      "chat1",
      "cron-msg"
    );

    scheduler.stop();
    vi.useRealTimers();
  });
});
