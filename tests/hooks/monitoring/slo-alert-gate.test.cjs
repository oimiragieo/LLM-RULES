#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GATE = path.resolve(__dirname, '../../../.claude/hooks/monitoring/slo-alert-gate.cjs');

test('slo alert gate exits 4 when p95 exceeds threshold', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slo-alert-'));
  const metricsPath = path.join(tempRoot, 'slo-metrics.json');
  try {
    fs.writeFileSync(
      metricsPath,
      JSON.stringify(
        {
          hookLatency: { p95_ms: 10 },
          recorder: { failureRate: 0 },
        },
        null,
        2
      ),
      'utf8'
    );
    const result = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        SLO_METRICS_PATH: metricsPath,
        HOOK_P95_MAX_MS: '5',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 4);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('slo alert gate exits 0 when metrics are within threshold', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slo-alert-ok-'));
  const metricsPath = path.join(tempRoot, 'slo-metrics.json');
  try {
    fs.writeFileSync(
      metricsPath,
      JSON.stringify(
        {
          hookLatency: { p95_ms: 2 },
          recorder: { failureRate: 0.001 },
        },
        null,
        2
      ),
      'utf8'
    );
    const result = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        SLO_METRICS_PATH: metricsPath,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
