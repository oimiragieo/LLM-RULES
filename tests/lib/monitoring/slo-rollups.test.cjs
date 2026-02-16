#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildRollups, generateRollups } = require('../../../.claude/lib/monitoring/slo-rollups.cjs');

test('buildRollups computes p50/p95 and recorder failure rate', () => {
  const rollups = buildRollups([
    { component: 'hook:alpha', event: 'hook_done', duration_ms: 1 },
    { component: 'hook:beta', event: 'hook_done', duration_ms: 5 },
    { component: 'hook:gamma', event: 'hook_done', duration_ms: 9 },
    { component: 'monitoring', event: 'flight_recorder_write' },
    { component: 'monitoring', event: 'flight_recorder_write_failed' },
  ]);

  assert.equal(rollups.hookLatency.count, 3);
  assert.equal(rollups.hookLatency.p50_ms, 5);
  assert.equal(rollups.hookLatency.p95_ms, 9);
  assert.equal(rollups.recorder.writes, 2);
  assert.equal(rollups.recorder.failures, 1);
  assert.equal(rollups.recorder.failureRate, 0.5);
});

test('generateRollups reads recorder and writes slo metrics file', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slo-rollups-'));
  const recorderPath = path.join(tempRoot, 'flight-recorder.jsonl');
  const outputPath = path.join(tempRoot, 'slo-metrics.json');
  try {
    fs.writeFileSync(
      recorderPath,
      [
        JSON.stringify({
          traceId: 'trace-1',
          component: 'hook:alpha',
          event: 'hook_done',
          duration_ms: 3,
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );
    const rollups = generateRollups({ recorderPath, outputPath });
    assert.equal(rollups.hookLatency.count, 1);
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
