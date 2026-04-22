#!/usr/bin/env node
'use strict';

/**
 * TDD RED — OTel GenAI span hierarchy fields for trace-recorder
 * Slice S1 — v2.4.0
 *
 * New fields required in buildTraceRecord output:
 *   parent_span_id — string; equals task_id when present, else session_id
 *   span_type      — string ∈ {"session","task","tool-call"}; default "tool-call"
 *
 * Uses TRACE_DIR_OVERRIDE env for test isolation (no shared global tmpdir).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshModule() {
  const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
  delete require.cache[modulePath];
  return require('../../.claude/hooks/audit/trace-recorder.cjs');
}

function buildPayload(overrides = {}) {
  return {
    session_id: 'sess-span-test',
    tool_name: 'Read',
    tool_input: { file_path: '/foo/bar.ts' },
    tool_output: { content: 'ok' },
    agent_type: 'developer',
    task_id: 'task-77',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: record contains parent_span_id as a string
// ---------------------------------------------------------------------------
test('record contains parent_span_id as a string', () => {
  const { buildTraceRecord } = freshModule();
  const payload = buildPayload();
  const record = buildTraceRecord(payload);

  assert.ok(
    Object.prototype.hasOwnProperty.call(record, 'parent_span_id'),
    'record must have parent_span_id field'
  );
  assert.equal(typeof record.parent_span_id, 'string', 'parent_span_id must be a string');
  assert.ok(record.parent_span_id.length > 0, 'parent_span_id must not be empty');
});

// ---------------------------------------------------------------------------
// Test 2: when no task_id present, parent_span_id === session_id
// ---------------------------------------------------------------------------
test('when no task_id present, parent_span_id equals session_id', () => {
  // Reset TASK_ID env to ensure it doesn't bleed in
  const origTaskId = process.env.TASK_ID;
  delete process.env.TASK_ID;

  try {
    const { buildTraceRecord } = freshModule();
    const payload = buildPayload({ task_id: undefined, session_id: 'sess-no-task' });
    // Remove task_id from payload to simulate absent task
    delete payload.task_id;
    const record = buildTraceRecord(payload);

    assert.equal(
      record.parent_span_id,
      record.session_id,
      'parent_span_id must equal session_id when no task_id present'
    );
  } finally {
    if (origTaskId !== undefined) {
      process.env.TASK_ID = origTaskId;
    }
  }
});

// ---------------------------------------------------------------------------
// Test 3: when task_id is present, parent_span_id === task_id
// ---------------------------------------------------------------------------
test('when task_id is present, parent_span_id equals task_id', () => {
  const origTaskId = process.env.TASK_ID;
  delete process.env.TASK_ID;

  try {
    const { buildTraceRecord } = freshModule();
    const payload = buildPayload({ task_id: 'task-99', session_id: 'sess-with-task' });
    const record = buildTraceRecord(payload);

    assert.equal(
      record.parent_span_id,
      record.task_id,
      'parent_span_id must equal task_id when task_id is present'
    );
    assert.equal(record.task_id, 'task-99', 'task_id must be carried through correctly');
  } finally {
    if (origTaskId !== undefined) {
      process.env.TASK_ID = origTaskId;
    }
  }
});

// ---------------------------------------------------------------------------
// Test 4: record contains span_type ∈ {"session","task","tool-call"}, default "tool-call"
// ---------------------------------------------------------------------------
test('record contains span_type defaulting to "tool-call"', () => {
  const { buildTraceRecord } = freshModule();
  const payload = buildPayload();
  const record = buildTraceRecord(payload);

  assert.ok(
    Object.prototype.hasOwnProperty.call(record, 'span_type'),
    'record must have span_type field'
  );

  const validTypes = new Set(['session', 'task', 'tool-call']);
  assert.ok(
    validTypes.has(record.span_type),
    `span_type must be one of ${[...validTypes].join(', ')}, got: ${record.span_type}`
  );
  assert.equal(record.span_type, 'tool-call', 'default span_type must be "tool-call"');
});

// ---------------------------------------------------------------------------
// Test 5: TRACE_DIR_OVERRIDE env used for test isolation
// ---------------------------------------------------------------------------
test('TRACE_DIR_OVERRIDE env isolates trace output to override directory', () => {
  const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-dir-override-'));
  const origOverride = process.env.TRACE_DIR_OVERRIDE;
  process.env.TRACE_DIR_OVERRIDE = overrideDir;

  try {
    const { appendTraceLine } = freshModule();
    const payload = buildPayload({ session_id: 'sess-override' });
    appendTraceLine(payload, undefined);

    const traceFile = path.join(overrideDir, 'sess-override.jsonl');
    assert.ok(
      fs.existsSync(traceFile),
      `trace file should exist in TRACE_DIR_OVERRIDE dir: ${traceFile}`
    );

    const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());
    assert.ok(
      Object.prototype.hasOwnProperty.call(line, 'parent_span_id'),
      'appended record must contain parent_span_id'
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(line, 'span_type'),
      'appended record must contain span_type'
    );
  } finally {
    if (origOverride !== undefined) {
      process.env.TRACE_DIR_OVERRIDE = origOverride;
    } else {
      delete process.env.TRACE_DIR_OVERRIDE;
    }
    // Clean up
    try {
      fs.rmSync(overrideDir, { recursive: true, force: true });
    } catch (_err) {
      /* cleanup best-effort */
    }
  }
});
