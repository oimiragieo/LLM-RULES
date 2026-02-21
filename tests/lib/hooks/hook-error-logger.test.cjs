'use strict';
const assert = require('assert');
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../../../.claude/context/runtime/hook-errors.jsonl');

test('logHookBlock appends valid JSON entry with all fields', () => {
  const { logHookBlock } = require('../../../.claude/lib/hooks/hook-error-logger.cjs');
  const before = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length
    : 0;

  logHookBlock({ hookName: 'test-hook', tool: 'Write', reason: 'test reason', hint: 'test hint' });

  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, before + 1, 'should append exactly one line');
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.hookName, 'test-hook');
  assert.strictEqual(entry.tool, 'Write');
  assert.ok(entry.timestamp, 'should have timestamp');
  assert.ok(entry.hint, 'should have hint field');
});

test('logHookBlock silently handles null/undefined args without throwing', () => {
  const { logHookBlock } = require('../../../.claude/lib/hooks/hook-error-logger.cjs');
  assert.doesNotThrow(() =>
    logHookBlock({ hookName: null, tool: undefined, reason: null, hint: null })
  );
});

test('logHookBlock includes context fields when provided', () => {
  const { logHookBlock } = require('../../../.claude/lib/hooks/hook-error-logger.cjs');
  logHookBlock({
    hookName: 'ctx-test',
    tool: 'TaskUpdate',
    reason: 'r',
    hint: 'h',
    context: { taskId: 'task-42' },
  });
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.taskId, 'task-42');
});
