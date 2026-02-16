#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TRACE_QUERY_CLI = path.resolve(__dirname, '../../.claude/tools/cli/trace-query.cjs');

test('trace-query reconstructs task lifecycle linkage for a trace id', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-linkage-'));
  const recorderPath = path.join(tempRoot, 'flight-recorder.jsonl');
  const traceId = 'trace-linkage-1';
  try {
    const entries = [
      { traceId, timestamp: '2026-01-01T00:00:00.000Z', component: 'router', event: 'task_created', taskId: '1' },
      { traceId, timestamp: '2026-01-01T00:00:01.000Z', component: 'worker', event: 'task_updated', taskId: '1', status: 'in_progress' },
      { traceId, timestamp: '2026-01-01T00:00:02.000Z', component: 'worker', event: 'task_updated', taskId: '1', status: 'completed' },
      { traceId, timestamp: '2026-01-01T00:00:03.000Z', component: 'workflow', event: 'phase_transition', phase: 'PHASE_2_IMPLEMENT' },
    ];
    fs.writeFileSync(recorderPath, entries.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');

    const result = spawnSync(
      process.execPath,
      [TRACE_QUERY_CLI, '--trace-id', traceId, '--file', recorderPath],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    const events = parsed.timeline.map(item => item.event);
    assert.deepEqual(events, ['task_created', 'task_updated', 'task_updated', 'phase_transition']);
    assert.ok(parsed.timeline.every(item => item.traceId === traceId));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
