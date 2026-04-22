#!/usr/bin/env node
'use strict';

/**
 * TDD tests for trace-recorder PostToolUse hook
 * RED phase: these tests are written BEFORE the implementation exists.
 *
 * OpenTelemetry GenAI semantic conventions:
 *   gen_ai.tool.name, gen_ai.tool.args_hash, gen_ai.tool.result_hash
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-recorder-test-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime', 'traces'), { recursive: true });
  return root;
}

function sha256trunc(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Build a synthetic PostToolUse hook payload
function buildPayload(overrides = {}) {
  return {
    session_id: 'sess-abc123',
    tool_name: 'Read',
    tool_input: { file_path: '/some/file.ts' },
    tool_output: { content: 'hello world' },
    agent_type: 'developer',
    task_id: 'task-42',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: appends one jsonl line to traces/<session-id>.jsonl
// ---------------------------------------------------------------------------
test('appends one jsonl line to traces/<session-id>.jsonl', () => {
  const projectRoot = mkProjectRoot();
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload();
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-abc123.jsonl'
  );
  assert.ok(fs.existsSync(traceFile), 'trace file should exist');

  const raw = fs.readFileSync(traceFile, 'utf8').trim();
  const lines = raw.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'should have exactly one line');
});

// ---------------------------------------------------------------------------
// Test 2: line contains required OpenTelemetry GenAI keys
// ---------------------------------------------------------------------------
test('trace line contains required OTel GenAI keys', () => {
  const projectRoot = mkProjectRoot();
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload({ session_id: 'sess-keys-test' });
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-keys-test.jsonl'
  );
  const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());

  const requiredKeys = [
    'timestamp',
    'gen_ai.tool.name',
    'gen_ai.tool.args_hash',
    'gen_ai.tool.result_hash',
    'duration_ms',
    'agent_id',
    'task_id',
  ];
  for (const key of requiredKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(line, key), `missing key: ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Test 3: TRACE_RECORDER=off disables emission
// ---------------------------------------------------------------------------
test('TRACE_RECORDER=off disables emission', () => {
  const projectRoot = mkProjectRoot();
  const origEnv = process.env.TRACE_RECORDER;
  process.env.TRACE_RECORDER = 'off';

  try {
    // Re-require with fresh module to pick up env change
    const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
    delete require.cache[modulePath];
    const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

    const payload = buildPayload({ session_id: 'sess-off-test' });
    appendTraceLine(payload, projectRoot);

    const traceFile = path.join(
      projectRoot,
      '.claude',
      'context',
      'runtime',
      'traces',
      'sess-off-test.jsonl'
    );
    assert.ok(!fs.existsSync(traceFile), 'trace file should NOT exist when TRACE_RECORDER=off');
  } finally {
    if (origEnv === undefined) {
      delete process.env.TRACE_RECORDER;
    } else {
      process.env.TRACE_RECORDER = origEnv;
    }
    // Reset module cache so other tests get fresh instance
    const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
    delete require.cache[modulePath];
  }
});

// ---------------------------------------------------------------------------
// Test 4: append-only; repeated calls produce multiple lines
// ---------------------------------------------------------------------------
test('append-only: repeated calls produce multiple lines', () => {
  const projectRoot = mkProjectRoot();
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload({ session_id: 'sess-multi' });
  appendTraceLine(payload, projectRoot);
  appendTraceLine(payload, projectRoot);
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-multi.jsonl'
  );
  const raw = fs.readFileSync(traceFile, 'utf8').trim();
  const lines = raw.split('\n').filter(Boolean);
  assert.equal(lines.length, 3, 'should have 3 lines after 3 calls');
  // Each line must be valid JSON
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), `line should be valid JSON: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// Test 5: args and result are SHA-256 truncated to 16 hex chars, not verbatim
// ---------------------------------------------------------------------------
test('args/result are hashed (SHA-256 trunc 16) not stored verbatim', () => {
  const projectRoot = mkProjectRoot();
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload({ session_id: 'sess-hash-test' });
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-hash-test.jsonl'
  );
  const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());

  // Hash should be exactly 16 hex chars
  assert.match(line['gen_ai.tool.args_hash'], /^[0-9a-f]{16}$/, 'args_hash must be 16-char hex');
  assert.match(
    line['gen_ai.tool.result_hash'],
    /^[0-9a-f]{16}$/,
    'result_hash must be 16-char hex'
  );

  // Verify hash values are correct
  const expectedArgsHash = sha256trunc(payload.tool_input);
  const expectedResultHash = sha256trunc(payload.tool_output);
  assert.equal(line['gen_ai.tool.args_hash'], expectedArgsHash, 'args_hash value mismatch');
  assert.equal(line['gen_ai.tool.result_hash'], expectedResultHash, 'result_hash value mismatch');

  // Ensure verbatim content is NOT stored
  const lineStr = JSON.stringify(line);
  assert.ok(!lineStr.includes('file_path'), 'args must not appear verbatim in trace');
  assert.ok(!lineStr.includes('hello world'), 'result must not appear verbatim in trace');
});

// ---------------------------------------------------------------------------
// Test 6: payload with toolUseResult.usage.total_tokens emits that value
// ---------------------------------------------------------------------------
test('Test 6: payload with usage.total_tokens emits gen_ai.usage.total_tokens', () => {
  const projectRoot = mkProjectRoot();
  // Bust module cache so env changes are reflected
  const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
  delete require.cache[modulePath];
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload({
    session_id: 'sess-tokens-total',
    usage: { total_tokens: 4200 },
  });
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-tokens-total.jsonl'
  );
  const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());

  assert.ok(
    Object.prototype.hasOwnProperty.call(line, 'gen_ai.usage.total_tokens'),
    'gen_ai.usage.total_tokens must be present when usage.total_tokens is in payload'
  );
  assert.equal(line['gen_ai.usage.total_tokens'], 4200, 'must equal payload usage.total_tokens');
});

// ---------------------------------------------------------------------------
// Test 7: payload with input_tokens + output_tokens emits all three usage fields
// ---------------------------------------------------------------------------
test('Test 7: payload with input_tokens+output_tokens emits derived total + sub-fields', () => {
  const projectRoot = mkProjectRoot();
  const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
  delete require.cache[modulePath];
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  const payload = buildPayload({
    session_id: 'sess-tokens-split',
    usage: { input_tokens: 1500, output_tokens: 700 },
  });
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-tokens-split.jsonl'
  );
  const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());

  assert.ok(
    Object.prototype.hasOwnProperty.call(line, 'gen_ai.usage.input_tokens'),
    'gen_ai.usage.input_tokens must be present'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(line, 'gen_ai.usage.output_tokens'),
    'gen_ai.usage.output_tokens must be present'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(line, 'gen_ai.usage.total_tokens'),
    'gen_ai.usage.total_tokens must be derived when only input+output supplied'
  );
  assert.equal(line['gen_ai.usage.input_tokens'], 1500, 'input_tokens value mismatch');
  assert.equal(line['gen_ai.usage.output_tokens'], 700, 'output_tokens value mismatch');
  assert.equal(line['gen_ai.usage.total_tokens'], 2200, 'total_tokens must equal input+output');
});

// ---------------------------------------------------------------------------
// Test 8: payload with no usage data — gen_ai.usage.total_tokens absent (not fabricated)
// ---------------------------------------------------------------------------
test('Test 8: payload with no usage data omits gen_ai.usage.total_tokens entirely', () => {
  const projectRoot = mkProjectRoot();
  const modulePath = require.resolve('../../.claude/hooks/audit/trace-recorder.cjs');
  delete require.cache[modulePath];
  const { appendTraceLine } = require('../../.claude/hooks/audit/trace-recorder.cjs');

  // Standard payload with no usage field at all
  const payload = buildPayload({ session_id: 'sess-tokens-absent' });
  appendTraceLine(payload, projectRoot);

  const traceFile = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'traces',
    'sess-tokens-absent.jsonl'
  );
  const line = JSON.parse(fs.readFileSync(traceFile, 'utf8').trim());

  // Field must be absent (not fabricated as heuristic or zero)
  // This prevents the token-governor from mistaking absent data for 0 tokens spent.
  assert.ok(
    !Object.prototype.hasOwnProperty.call(line, 'gen_ai.usage.total_tokens'),
    'gen_ai.usage.total_tokens must NOT be emitted when no usage data is present — do not fabricate'
  );
});
