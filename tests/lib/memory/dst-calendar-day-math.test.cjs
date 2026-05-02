'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
const { evictStaleLTMFiles } = require('../../../.claude/lib/memory/memory-tiers-ltm-helpers.cjs');

function withDateNow(isoString, fn) {
  const originalNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    return fn();
  } finally {
    Date.now = originalNow;
  }
}

function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('ContextualMemory recency treats a spring-forward midnight span as one calendar day', () => {
  withEnv({ MEMORY_RECENCY_DECAY_RATE: '0.1', MEMORY_RECENCY_BOOST: '0.3' }, () => {
    withDateNow('2026-03-09T00:30:00-04:00', () => {
      const memory = new ContextualMemory({
        projectRoot: process.cwd(),
        memoryDir: path.join(os.tmpdir(), 'unused-memory-dir'),
        dbPath: path.join(os.tmpdir(), 'unused-memory.db'),
      });

      const [result] = memory._applyRecencyWeight([
        {
          rrf_score: 1,
          metadata: { timestamp: '2026-03-08T00:30:00-05:00' },
        },
      ]);

      assert.ok(
        Math.abs(result._recency_weight - 1 / 1.1) < 1e-12,
        `expected one calendar day of decay, got ${result._recency_weight}`
      );
    });
  });
});

test('evictStaleLTMFiles uses calendar days for spring-forward staleness thresholds', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-dst-'));
  const oldPath = path.join(tmpDir, 'old.json');
  const freshPath = path.join(tmpDir, 'fresh.json');

  try {
    fs.writeFileSync(
      oldPath,
      JSON.stringify({ created_at: '2026-03-08T00:30:00-05:00', access_count: 1 })
    );
    fs.writeFileSync(
      freshPath,
      JSON.stringify({ created_at: '2026-03-09T00:30:00-04:00', access_count: 1 })
    );

    withEnv(
      {
        LTM_DECAY_FACTOR: '0.1',
        LTM_EVICTION_THRESHOLD: '0.911',
        LTM_MAX_FILES: '1',
      },
      () => {
        withDateNow('2026-03-09T00:30:00-04:00', () => {
          const result = evictStaleLTMFiles(tmpDir);

          assert.equal(result.evicted, 1);
          assert.equal(fs.existsSync(oldPath), false, 'old calendar-day entry should be evicted');
          assert.equal(fs.existsSync(freshPath), true, 'fresh entry should remain');
        });
      }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('calendar day utility counts DST-short and DST-long spans by date boundaries', () => {
  const { calendarDaysBetween } = require('../../../.claude/lib/utils/calendar-days.cjs');

  assert.equal(calendarDaysBetween('2026-03-08T00:30:00-05:00', '2026-03-09T00:30:00-04:00'), 1);
  assert.equal(calendarDaysBetween('2026-11-01T00:30:00-04:00', '2026-11-02T00:30:00-05:00'), 1);
});
