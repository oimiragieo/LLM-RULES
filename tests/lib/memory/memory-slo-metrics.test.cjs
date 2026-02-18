#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  recordMemoryOperation,
  summarizeOperationalSLO,
  loadOperationalMetrics,
  getOperationalMetricsPath,
} = require('../../../.claude/lib/memory/memory-slo-metrics.cjs');

const TEST_ROOT = path.join(__dirname, '.test-memory-slo');

function setup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_ROOT, '.claude', 'context', 'memory'), { recursive: true });
}

function cleanup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

test('memory-slo-metrics records write/read/parse and computes SLO summary', () => {
  setup();
  try {
    for (let i = 0; i < 20; i++) {
      recordMemoryOperation({ kind: 'write', writeLatencyMs: 12 + i }, TEST_ROOT);
      recordMemoryOperation({ kind: 'read', readLatencyMs: 4 + (i % 3) }, TEST_ROOT);
    }
    recordMemoryOperation({ parseAttempt: true, parseFailure: false }, TEST_ROOT);
    recordMemoryOperation({ parseAttempt: true, parseFailure: true, ok: false }, TEST_ROOT);
    recordMemoryOperation({ lockWaitMs: 7 }, TEST_ROOT);

    const summary = summarizeOperationalSLO(TEST_ROOT);
    assert.equal(summary.counters.writesTotal, 20);
    assert.equal(summary.counters.readsTotal, 20);
    assert.equal(summary.counters.parseAttempts, 2);
    assert.equal(summary.counters.parseFailures, 1);
    assert.ok(summary.p95.writeLatencyMs >= 25);
    assert.ok(summary.p95.lockWaitMs >= 5);
    assert.ok(summary.parseFailureRate > 0);
  } finally {
    cleanup();
  }
});

test('memory-slo-metrics persists metrics file and reloads state', () => {
  setup();
  try {
    recordMemoryOperation({ kind: 'write', writeLatencyMs: 50 }, TEST_ROOT);
    const metricsPath = getOperationalMetricsPath(TEST_ROOT);
    assert.ok(fs.existsSync(metricsPath));

    const loaded = loadOperationalMetrics(TEST_ROOT);
    assert.equal(loaded.counters.writesTotal, 1);
    assert.ok(Array.isArray(loaded.histograms.writeLatencyMs.counts));
  } finally {
    cleanup();
  }
});

test('memory-slo-metrics records operation even if SharedArrayBuffer throws', () => {
  setup();
  const originalSharedArrayBuffer = global.SharedArrayBuffer;
  try {
    global.SharedArrayBuffer = class BrokenSharedArrayBuffer {
      constructor() {
        throw new Error('SAB unavailable');
      }
    };

    const metrics = recordMemoryOperation({ kind: 'write', writeLatencyMs: 10 }, TEST_ROOT);
    assert.ok(metrics);
    assert.equal(metrics.counters.writesTotal, 1);
  } finally {
    global.SharedArrayBuffer = originalSharedArrayBuffer;
    cleanup();
  }
});
