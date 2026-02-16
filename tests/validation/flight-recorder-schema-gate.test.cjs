#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GATE = path.resolve(
  __dirname,
  '../../.claude/hooks/validation/flight-recorder-schema-gate.cjs'
);

test('schema gate exits 2 when malformed or invalid rows exist', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-schema-gate-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-1',
          component: 'event_bus',
          event: 'task_created',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          component: 'event_bus',
          event: 'task_created',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );
    const result = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        FLIGHT_RECORDER_PATH: filePath,
        FLIGHT_RECORDER_SCHEMA_GATE_STRICT: 'true',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, result.stderr);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('schema gate exits 0 for valid rows', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-schema-gate-ok-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        traceId: 'trace-1',
        component: 'event_bus',
        event: 'task_created',
        timestamp: '2026-01-01T00:00:00.000Z',
      }) + '\n',
      'utf8'
    );
    const result = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        FLIGHT_RECORDER_PATH: filePath,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
