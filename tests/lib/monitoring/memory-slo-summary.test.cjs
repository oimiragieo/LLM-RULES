'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { saveOperationalMetrics, createDefaultMetrics } = (() => {
  const mod = require('../../../.claude/lib/memory/memory-slo-metrics.cjs');
  return {
    saveOperationalMetrics: mod.saveOperationalMetrics,
    createDefaultMetrics: () => ({
      version: 1,
      windowStartedAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:00:00.000Z',
      counters: {
        writesTotal: 10,
        writesFailed: 0,
        readsTotal: 4,
        parseAttempts: 20,
        parseFailures: 1,
        lockAcquires: 10,
        staleTempCleanups: 0,
        staleTempFilesRemoved: 0,
      },
      histograms: {
        writeLatencyMs: {
          bucketsMs: [1, 5, 10, 25, 50, 100, 250, 500],
          counts: [0, 0, 0, 2, 6, 2, 0, 0, 0],
        },
        readLatencyMs: {
          bucketsMs: [1, 5, 10, 25, 50, 100, 250, 500],
          counts: [0, 0, 0, 1, 3, 0, 0, 0, 0],
        },
        lockWaitMs: {
          bucketsMs: [1, 5, 10, 25, 50, 100, 250, 500],
          counts: [0, 0, 1, 5, 4, 0, 0, 0, 0],
        },
      },
      latest: {
        writeLatencyMs: 50,
        readLatencyMs: 25,
        lockWaitMs: 25,
        lastError: null,
      },
    }),
  };
})();

const summaryCli = require('../../../.claude/tools/cli/memory-slo-summary.cjs');

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-slo-summary-'));
}

function cleanup(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('readCacheStability summarizes churn rate from jsonl', () => {
  const root = createTempProjectRoot();
  try {
    const metricsDir = path.join(root, '.claude', 'context', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    const file = path.join(metricsDir, 'memory-cache-stability.jsonl');
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ timestamp: '2026-02-12T00:00:00.000Z', churned: false }),
        JSON.stringify({ timestamp: '2026-02-12T00:01:00.000Z', churned: true }),
        JSON.stringify({ timestamp: '2026-02-12T00:02:00.000Z', churned: false }),
      ].join('\n') + '\n',
      'utf8'
    );

    const summary = summaryCli.readCacheStability(root);
    assert.equal(summary.total, 3);
    assert.equal(summary.churned, 1);
    assert.equal(summary.stable, 2);
    assert.equal(summary.churnRate, 1 / 3);
  } finally {
    cleanup(root);
  }
});

test('evaluate returns failures when thresholds are exceeded', () => {
  const failures = summaryCli.evaluate(
    {
      operational: {
        p95: { writeLatencyMs: 150, lockWaitMs: 80 },
        parseFailureRate: 0.1,
        counters: { writesTotal: 10, readsTotal: 0, parseAttempts: 0, lockAcquires: 0 },
      },
      cacheStability: {
        total: 10,
        churnRate: 0.8,
      },
    },
    {
      requireData: true,
      assertMaxWriteP95Ms: 120,
      assertMaxLockWaitP95Ms: 40,
      assertMaxParseFailureRate: 0.02,
      assertMaxChurnRate: 0.7,
    }
  );

  assert.equal(failures.length, 4);
});

test('evaluate requireData passes with read-only operational signals', () => {
  const failures = summaryCli.evaluate(
    {
      operational: {
        p95: { writeLatencyMs: 0, lockWaitMs: 0 },
        parseFailureRate: 0,
        counters: { writesTotal: 0, readsTotal: 3, parseAttempts: 0, lockAcquires: 0 },
      },
      cacheStability: {
        total: 0,
        churnRate: 0,
      },
    },
    {
      requireData: true,
      assertMaxWriteP95Ms: 120,
      assertMaxLockWaitP95Ms: 40,
      assertMaxParseFailureRate: 0.02,
      assertMaxChurnRate: 0.8,
    }
  );

  assert.equal(failures.length, 0);
});

test('evaluate requireData fails when all operational counters are zero', () => {
  const failures = summaryCli.evaluate(
    {
      operational: {
        p95: { writeLatencyMs: 0, lockWaitMs: 0 },
        parseFailureRate: 0,
        counters: { writesTotal: 0, readsTotal: 0, parseAttempts: 0, lockAcquires: 0 },
      },
      cacheStability: {
        total: 0,
        churnRate: 0,
      },
    },
    {
      requireData: true,
    }
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /no operational memory samples/i);
});

test('buildSummary combines operational and cache stability sections', () => {
  const root = createTempProjectRoot();
  try {
    saveOperationalMetrics(createDefaultMetrics(), root);
    const cacheMetricsDir = path.join(root, '.claude', 'context', 'metrics');
    fs.mkdirSync(cacheMetricsDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheMetricsDir, 'memory-cache-stability.jsonl'),
      JSON.stringify({ timestamp: '2026-02-12T00:00:00.000Z', churned: false }) + '\n',
      'utf8'
    );

    const summary = summaryCli.buildSummary(root);
    assert.equal(typeof summary.timestamp, 'string');
    assert.equal(typeof summary.operational.p95.writeLatencyMs, 'number');
    assert.equal(summary.cacheStability.total, 1);
    assert.equal(summary.cacheStability.churnRate, 0);
  } finally {
    cleanup(root);
  }
});
