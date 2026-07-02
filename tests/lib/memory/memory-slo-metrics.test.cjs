#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('node:child_process');

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
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
  if (lastErr) throw lastErr;
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

test('memory-slo-metrics preserves counters across concurrent writer processes', async () => {
  setup();
  try {
    const modulePath = path.join(__dirname, '../../../.claude/lib/memory/memory-slo-metrics.cjs');
    const workerCount = 6;
    const iterations = 20;
    const code = `
      const { recordMemoryOperation } = require(${JSON.stringify(modulePath)});
      const root = ${JSON.stringify(TEST_ROOT)};
      let failures = 0;
      for (let i = 0; i < ${iterations}; i++) {
        if (!recordMemoryOperation({ kind: 'write', writeLatencyMs: 1 }, root)) {
          failures++;
        }
      }
      if (failures > 0) {
        console.error('recordMemoryOperation failures:', failures);
        process.exit(1);
      }
    `;

    await Promise.all(
      Array.from({ length: workerCount }, () => {
        return new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ['-e', code], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          });
          let stderr = '';
          child.stderr.on('data', chunk => {
            stderr += chunk;
          });
          child.on('error', reject);
          child.on('exit', code => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`worker exited ${code}: ${stderr}`));
            }
          });
        });
      })
    );

    const metrics = loadOperationalMetrics(TEST_ROOT);
    assert.equal(metrics.counters.writesTotal, workerCount * iterations);
  } finally {
    cleanup();
  }
});
