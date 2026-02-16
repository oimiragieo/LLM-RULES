#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('event bus sink writes emitted event into flight recorder', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'event-telemetry-'));
  const recorderPath = path.join(tempRoot, 'flight-recorder.jsonl');
  const script = `
    const eventBus = require('./.claude/lib/events/event-bus.cjs');
    eventBus.emit('TASK_COMPLETED', {
      type: 'TASK_COMPLETED',
      taskId: 'task-1',
      result: { ok: true },
      duration: 3,
      traceId: 'trace-it',
      timestamp: new Date().toISOString()
    }).then(() => process.exit(0)).catch(() => process.exit(1));
  `;
  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: {
        ...process.env,
        FLIGHT_RECORDER_PATH: recorderPath,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = fs
      .readFileSync(recorderPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    assert.ok(lines.some(row => row.traceId === 'trace-it' && row.component === 'event_bus'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
