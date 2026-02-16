#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../../.claude/tools/cli/trace-query.cjs');

test('trace-query returns timeline for matching trace id', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-query-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-abc',
          component: 'hook',
          event: 'task_start',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          traceId: 'trace-abc',
          component: 'hook',
          event: 'task_end',
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI, '--trace-id', 'trace-abc', '--file', filePath],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.traceId, 'trace-abc');
    assert.equal(parsed.count, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('trace-query exits non-zero when trace id missing', () => {
  const result = spawnSync(process.execPath, [CLI, '--trace-id', 'missing-trace-id'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FLIGHT_RECORDER_PATH: path.join(os.tmpdir(), 'no-such-flight-recorder.jsonl'),
    },
  });
  assert.equal(result.status, 1);
});

test('trace-query --compact prints one-line header + compact timeline lines', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-query-compact-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-compact',
          component: 'workflow',
          event: 'phase_transition',
          phase: 'PHASE_2_IMPLEMENT',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );
    const result = spawnSync(
      process.execPath,
      [CLI, '--trace-id', 'trace-compact', '--file', filePath, '--compact'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout.trim();
    assert.match(output, /^traceId=trace-compact count=1/m);
    assert.match(output, /workflow phase_transition phase=PHASE_2_IMPLEMENT/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('trace-query applies --since filter', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-query-since-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-since',
          component: 'workflow',
          event: 'before',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          traceId: 'trace-since',
          component: 'workflow',
          event: 'after',
          timestamp: '2026-01-01T00:00:10.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI, '--trace-id', 'trace-since', '--file', filePath, '--since', '2026-01-01T00:00:05.000Z'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.timeline[0].event, 'after');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('trace-query applies --limit to most recent events', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-query-limit-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-limit',
          component: 'workflow',
          event: 'e1',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          traceId: 'trace-limit',
          component: 'workflow',
          event: 'e2',
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
        JSON.stringify({
          traceId: 'trace-limit',
          component: 'workflow',
          event: 'e3',
          timestamp: '2026-01-01T00:00:02.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI, '--trace-id', 'trace-limit', '--file', filePath, '--limit', '2'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.count, 2);
    assert.deepEqual(
      parsed.timeline.map(row => row.event),
      ['e2', 'e3']
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('trace-query exits 1 on invalid --since value', () => {
  const result = spawnSync(
    process.execPath,
    [CLI, '--trace-id', 'trace-invalid-since', '--since', 'not-a-date'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --since value/);
});
