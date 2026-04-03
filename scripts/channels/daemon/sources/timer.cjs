/**
 * timer.cjs — Proactive timer source (KAIROS-style scheduled check-ins)
 *
 * Emits events on a schedule — morning check-ins, periodic summaries,
 * reminders, etc. Like KAIROS's cron-based permanent tasks.
 */
'use strict';

class TimerSource {
  constructor(config, dispatch) {
    this.dispatch = dispatch;
    this.schedules = config.schedules || [];
    this.running = false;
    this.timers = [];
  }

  start() {
    this.running = true;

    for (const schedule of this.schedules) {
      const timer = setInterval(() => {
        if (!this.running) return;
        this.dispatch({
          type: `timer.${schedule.name}`,
          source: 'timer',
          data: {
            name: schedule.name,
            prompt: schedule.prompt,
            chatIds: schedule.chatIds || [],
          },
          timestamp: new Date().toISOString(),
        });
      }, schedule.intervalMs);

      this.timers.push(timer);
    }
  }

  stop() {
    this.running = false;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
  }
}

module.exports = { TimerSource };
