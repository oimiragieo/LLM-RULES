'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DaemonMemory } = require('../../../../scripts/channels/daemon/memory.cjs');
const { TimerSource } = require('../../../../scripts/channels/daemon/sources/timer.cjs');

function withFixedDate(isoString, fn) {
  const RealDate = Date;

  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [isoString] : args));
    }

    static now() {
      return new RealDate(isoString).getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }

  global.Date = FixedDate;
  try {
    return fn();
  } finally {
    global.Date = RealDate;
  }
}

function makeStats(tokens) {
  return { tokens, cost: tokens / 1_000_000, messages: 1, models: { sonnet: 1 } };
}

test('DaemonMemory weekly usage includes entries from the previous six calendar days across DST', () => {
  withFixedDate('2026-03-14T23:30:00-04:00', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-memory-dst-'));
    try {
      const mem = new DaemonMemory(tmpDir, {});
      mem.usage.set('chat1', { dates: { '2026-03-08': makeStats(100) } });

      const usage = mem.getUsage('chat1');

      assert.equal(usage.week.tokens, 100);
      assert.equal(usage.week.messages, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test('DaemonMemory monthly usage includes entries from the previous 29 calendar days across DST', () => {
  withFixedDate('2026-03-31T23:30:00-04:00', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-memory-dst-'));
    try {
      const mem = new DaemonMemory(tmpDir, {});
      mem.usage.set('chat1', { dates: { '2026-03-02': makeStats(200) } });

      const usage = mem.getUsage('chat1');

      assert.equal(usage.month.tokens, 200);
      assert.equal(usage.month.messages, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test('TimerSource cleans seven-calendar-day dedup entries across spring-forward DST', () => {
  withFixedDate('2026-03-15T00:15:00-04:00', () => {
    const source = new TimerSource(
      { schedules: [] },
      () => {},
      () => Infinity
    );
    source.running = true;
    source.lastFired.set('daily:2026-03-08', new Date('2026-03-08T00:30:00-05:00').getTime());

    source._tick();

    assert.equal(source.lastFired.has('daily:2026-03-08'), false);
  });
});
