'use strict';

const assert = require('assert');
const test = require('node:test');
const { inferTaskOutputStatus } = require('../../.claude/hooks/routing/post-task-unified.cjs');

test('inferTaskOutputStatus', async t => {
  await t.test('should return null for null input', () => {
    assert.strictEqual(inferTaskOutputStatus(null), null);
  });

  await t.test('should return null for empty object', () => {
    assert.strictEqual(inferTaskOutputStatus({}), null);
  });

  await t.test('should infer status from object properties', () => {
    assert.strictEqual(inferTaskOutputStatus({ status: 'completed' }), 'completed');
    assert.strictEqual(inferTaskOutputStatus({ task_status: 'in_progress' }), 'in_progress');
    assert.strictEqual(inferTaskOutputStatus({ state: 'failed' }), 'failed');
  });

  await t.test('should infer status from string JSON', () => {
    assert.strictEqual(inferTaskOutputStatus('{"status": "completed"}'), 'completed');
  });

  // The "issue" is likely that we want to know if it *failed* to infer when it *should* have.
  // But without context, we can't know.
  
  // If the instruction is "fix inferTaskOutputStatus() to handle null results", maybe it means
  // the caller should handle it? 
  
  // Let's assume we want it to return 'unknown' instead of null so we can log it?
  // Or maybe we want to log a warning inside the function?
  
  // Let's verify the current behavior is indeed returning null.
});
