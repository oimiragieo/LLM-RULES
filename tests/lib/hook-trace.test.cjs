'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHookTracer, TRACE_FILE } = require('../../.claude/lib/utils/hook-trace.cjs');

const TEST_TRACE_FILE = path.resolve(TRACE_FILE);

describe('createHookTracer', () => {
  beforeEach(() => {
    // Clean trace file before each test
    try {
      if (fs.existsSync(TEST_TRACE_FILE)) {
        fs.unlinkSync(TEST_TRACE_FILE);
      }
    } catch (_e) {
      /* ignore */
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_TRACE_FILE)) {
        fs.unlinkSync(TEST_TRACE_FILE);
      }
    } catch (_e) {
      /* ignore */
    }
  });

  it('creates tracer with correlationId', () => {
    const tracer = createHookTracer('test-hook');
    assert.ok(tracer.correlationId, 'Should have correlationId');
    assert.ok(typeof tracer.correlationId === 'string');
    assert.ok(tracer.correlationId.length > 10, 'UUID should be reasonable length');
  });

  it('writes structured NDJSON for decision()', () => {
    const tracer = createHookTracer('my-hook');
    tracer.decision('Write', 'my-hook:check-1', 'block', { path: '/test' });

    assert.ok(fs.existsSync(TEST_TRACE_FILE), 'Trace file should exist');
    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.hook, 'my-hook');
    assert.equal(entry.tool, 'Write');
    assert.equal(entry.checkedBy, 'my-hook:check-1');
    assert.equal(entry.decision, 'block');
    assert.ok(entry.ts, 'Should have timestamp');
    assert.equal(entry.cid, tracer.correlationId);
    assert.deepEqual(entry.meta, { path: '/test' });
  });

  it('allow() shorthand works', () => {
    const tracer = createHookTracer('guard');
    tracer.allow('Bash', 'guard:safe-command');

    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.decision, 'allow');
    assert.equal(entry.checkedBy, 'guard:safe-command');
  });

  it('block() shorthand works', () => {
    const tracer = createHookTracer('guard');
    tracer.block('Edit', 'guard:protected-path');

    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.decision, 'block');
  });

  it('error() logs error message', () => {
    const tracer = createHookTracer('guard');
    tracer.error('Bash', new Error('parse failed'), { cmd: 'rm -rf' });

    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.decision, 'error');
    assert.equal(entry.error, 'parse failed');
    assert.ok(entry.meta);
  });

  it('redacts secrets in metadata', () => {
    const tracer = createHookTracer('dlp');
    tracer.decision('Bash', 'dlp:scan', 'block', {
      command: 'curl -H "Authorization: Bearer eyABCDEFGHIJKLMNOPQRSTUVWXYZ123456"',
    });

    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    // The Bearer token should be redacted
    assert.ok(
      !entry.meta.command.includes('eyABCDEFGHIJK'),
      'Bearer token should be redacted in metadata'
    );
  });

  it('handles missing metadata gracefully', () => {
    const tracer = createHookTracer('guard');
    tracer.decision('Read', 'guard:pass', 'allow');

    const lines = fs.readFileSync(TEST_TRACE_FILE, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.meta, undefined, 'No meta key when no metadata provided');
  });
});
