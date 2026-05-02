/**
 * timer.cjs — KAIROS-style tick/heartbeat engine
 *
 * Fires periodic ticks. On each tick, checks:
 *   1. Is the user active? (last message < 5 min ago → sleep)
 *   2. Does any cron schedule match current time?
 *   3. If match → dispatch proactive event
 *
 * Budget: proactive actions shouldn't spam the user.
 * Max 1 proactive message per schedule per day.
 */
'use strict';

const {
  calendarDaysBetween,
  formatLocalDateKey,
} = require('../../../../.claude/lib/utils/calendar-days.cjs');

class TimerSource {
  constructor(config, dispatch, getLastActivityFn) {
    this.dispatch = dispatch;
    this.schedules = config.schedules || [];
    this.tickIntervalMs = config.tickIntervalMs || 60000; // 1 min default
    this.running = false;
    this.timer = null;
    this.lastFired = new Map(); // scheduleName → timestamp (dedup per day)
    this.getLastActivity = getLastActivityFn || (() => 0); // Returns ms since last user message
  }

  start() {
    this.running = true;
    this.timer = setInterval(() => this._tick(), this.tickIntervalMs);
  }

  _tick() {
    if (!this.running) return;

    // Check if user is active (chatting right now → don't interrupt)
    const idleMs = this.getLastActivity();
    if (idleMs > 0 && idleMs < 300000) return; // <5 min idle → sleep

    const now = new Date();
    const nowMs = Date.now();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...6=Sat
    const today = formatLocalDateKey(now);

    for (const schedule of this.schedules) {
      // Dedup: max 1 fire per schedule per day
      const lastKey = `${schedule.name}:${today}`;
      if (this.lastFired.has(lastKey)) continue;

      // Simple cron matching: "H M * * DOW" or "H M * * *"
      if (this._matchesCron(schedule.cron, hour, minute, dayOfWeek)) {
        this.lastFired.set(lastKey, nowMs);
        this.dispatch({
          type: `timer.${schedule.name}`,
          source: 'timer',
          data: {
            name: schedule.name,
            prompt: schedule.prompt,
            chatIds: schedule.chatIds || [],
          },
          timestamp: now.toISOString(),
        });
      }
    }

    // Clean old dedup entries (keep last 7 days)
    for (const [key, ts] of this.lastFired) {
      const dateStart = key.lastIndexOf(':') + 1;
      const firedDate = dateStart > 0 ? key.slice(dateStart) : new Date(ts);
      let ageDays = calendarDaysBetween(firedDate, now);
      if (!Number.isFinite(ageDays)) ageDays = calendarDaysBetween(new Date(ts), now);
      if (Number.isFinite(ageDays) && ageDays >= 7) {
        this.lastFired.delete(key);
      }
    }
  }

  /**
   * Simple cron match: "M H * * DOW"
   * Supports: exact numbers, * (any), 1-5 (Mon-Fri range for DOW)
   */
  _matchesCron(cron, hour, minute, dayOfWeek) {
    if (!cron) return false;
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return false;

    const [cronMin, cronHour, , , cronDow] = parts;

    if (!this._matchField(cronMin, minute)) return false;
    if (!this._matchField(cronHour, hour)) return false;
    if (!this._matchDow(cronDow, dayOfWeek)) return false;

    return true;
  }

  _matchField(field, value) {
    if (field === '*') return true;
    if (field.includes('/')) {
      const step = parseInt(field.split('/')[1], 10);
      return value % step === 0;
    }
    return parseInt(field, 10) === value;
  }

  _matchDow(field, dow) {
    if (field === '*') return true;
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return dow >= start && dow <= end;
    }
    return parseInt(field, 10) === dow;
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { TimerSource };
