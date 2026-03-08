/** Scheduler — schedule periodic messages or tasks across channels. */

import type { ChannelManager } from "./manager.js";

/** Callback that produces the message text to send. */
export type TaskCallback = string | (() => string | Promise<string>);

export interface ScheduledTask {
  id: string;
  type: "every" | "cron" | "once";
  channelId: string;
  chatId: string;
  /** Interval in ms (for "every"), delay in ms (for "once"), or cron expression (for "cron"). */
  schedule: number | string;
  active: boolean;
}

interface InternalTask extends ScheduledTask {
  callback: TaskCallback;
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;
  cronTimer: ReturnType<typeof setInterval> | null;
}

let taskCounter = 0;

function nextId(): string {
  return `task_${++taskCounter}`;
}

/**
 * Parse a simple cron expression: "min hour dom month dow"
 * Fields: minute(0-59) hour(0-23) dayOfMonth(1-31) month(1-12) dayOfWeek(0-6, 0=Sunday)
 * Supports: exact values, "*" (any), and comma-separated lists (e.g. "1,15").
 * Step syntax (like "* /5") is NOT supported to keep it simple.
 */
export function parseCron(expr: string): { minute: number[]; hour: number[]; dom: number[]; month: number[]; dow: number[] } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expr}": expected 5 fields (min hour dom month dow)`);
  }

  function parseField(field: string, min: number, max: number): number[] {
    if (field === "*") {
      const result: number[] = [];
      for (let i = min; i <= max; i++) result.push(i);
      return result;
    }
    return field.split(",").map((v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < min || n > max) {
        throw new Error(`Invalid cron field value "${v}" (expected ${min}-${max})`);
      }
      return n;
    });
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6),
  };
}

/** Check whether a Date matches a parsed cron schedule. */
export function cronMatches(
  parsed: ReturnType<typeof parseCron>,
  date: Date
): boolean {
  return (
    parsed.minute.includes(date.getMinutes()) &&
    parsed.hour.includes(date.getHours()) &&
    parsed.dom.includes(date.getDate()) &&
    parsed.month.includes(date.getMonth() + 1) &&
    parsed.dow.includes(date.getDay())
  );
}

export class Scheduler {
  private tasks = new Map<string, InternalTask>();
  private manager: ChannelManager;

  constructor(manager: ChannelManager) {
    this.manager = manager;
  }

  /** Schedule a repeating task at a fixed interval. */
  every(intervalMs: number, channelId: string, chatId: string, callback: TaskCallback): string {
    const id = nextId();
    const task: InternalTask = {
      id,
      type: "every",
      channelId,
      chatId,
      schedule: intervalMs,
      active: true,
      callback,
      timer: null,
      cronTimer: null,
    };

    task.timer = setInterval(() => this.execute(task), intervalMs);
    this.tasks.set(id, task);
    return id;
  }

  /** Schedule a task using a cron expression (checked every 60s). */
  cron(cronExpr: string, channelId: string, chatId: string, callback: TaskCallback): string {
    // Validate the expression eagerly
    const parsed = parseCron(cronExpr);

    const id = nextId();
    const task: InternalTask = {
      id,
      type: "cron",
      channelId,
      chatId,
      schedule: cronExpr,
      active: true,
      callback,
      timer: null,
      cronTimer: null,
    };

    // Check every 60 seconds whether the current time matches the cron schedule
    task.cronTimer = setInterval(() => {
      if (cronMatches(parsed, new Date())) {
        this.execute(task);
      }
    }, 60_000);

    this.tasks.set(id, task);
    return id;
  }

  /** Schedule a one-shot delayed task. */
  once(delayMs: number, channelId: string, chatId: string, callback: TaskCallback): string {
    const id = nextId();
    const task: InternalTask = {
      id,
      type: "once",
      channelId,
      chatId,
      schedule: delayMs,
      active: true,
      callback,
      timer: null,
      cronTimer: null,
    };

    task.timer = setTimeout(() => {
      this.execute(task);
      task.active = false;
    }, delayMs);

    this.tasks.set(id, task);
    return id;
  }

  /** Cancel a scheduled task by ID. Returns true if found and cancelled. */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.clearTimers(task);
    task.active = false;
    this.tasks.delete(taskId);
    return true;
  }

  /** List all active scheduled tasks. */
  list(): ScheduledTask[] {
    return [...this.tasks.values()]
      .filter((t) => t.active)
      .map(({ callback, timer, cronTimer, ...rest }) => rest);
  }

  /** Stop all scheduled tasks. */
  stop(): void {
    for (const task of this.tasks.values()) {
      this.clearTimers(task);
      task.active = false;
    }
    this.tasks.clear();
  }

  private clearTimers(task: InternalTask): void {
    if (task.timer !== null) {
      if (task.type === "every") {
        clearInterval(task.timer);
      } else {
        clearTimeout(task.timer as ReturnType<typeof setTimeout>);
      }
      task.timer = null;
    }
    if (task.cronTimer !== null) {
      clearInterval(task.cronTimer);
      task.cronTimer = null;
    }
  }

  private async execute(task: InternalTask): Promise<void> {
    if (!task.active) return;
    try {
      const text =
        typeof task.callback === "function"
          ? await task.callback()
          : task.callback;
      await this.manager.send(task.channelId, task.chatId, text);
    } catch (err) {
      console.error(`Scheduler task ${task.id} failed:`, err);
    }
  }
}
