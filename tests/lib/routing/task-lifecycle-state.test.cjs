'use strict';

const {
  isValidTransition,
  getTransitionError,
} = require('../../../.claude/lib/routing/task-lifecycle-state.cjs');
const assert = require('node:assert');
const test = require('node:test');

test('Task Lifecycle State Machine', async t => {
  await t.test('Valid transitions', async () => {
    // pending -> in_progress
    assert.strictEqual(isValidTransition('pending', 'in_progress'), true);
    // pending -> deleted
    assert.strictEqual(isValidTransition('pending', 'deleted'), true);
    // in_progress -> completed
    assert.strictEqual(isValidTransition('in_progress', 'completed'), true);
    // in_progress -> deleted
    assert.strictEqual(isValidTransition('in_progress', 'deleted'), true);
  });

  await t.test('Invalid transitions', async () => {
    // pending -> completed (Must go through in_progress)
    assert.strictEqual(isValidTransition('pending', 'completed'), false);
    // completed -> in_progress (Terminal state)
    assert.strictEqual(isValidTransition('completed', 'in_progress'), false);
    // deleted -> in_progress (Terminal state)
    assert.strictEqual(isValidTransition('deleted', 'in_progress'), false);
    // completed -> pending
    assert.strictEqual(isValidTransition('completed', 'pending'), false);
  });

  await t.test('Self-transitions (Idempotency)', async () => {
    assert.strictEqual(isValidTransition('pending', 'pending'), true);
    assert.strictEqual(isValidTransition('in_progress', 'in_progress'), true);
    assert.strictEqual(isValidTransition('completed', 'completed'), true);
    assert.strictEqual(isValidTransition('deleted', 'deleted'), true);
  });

  await t.test('Case-insensitivity', async () => {
    assert.strictEqual(isValidTransition('PENDING', 'IN_PROGRESS'), true);
    assert.strictEqual(isValidTransition('in_progress', 'COMPLETED'), true);
  });

  await t.test('Transition Error Messages', async () => {
    const error = getTransitionError('task-1', 'pending', 'completed');
    assert.match(error, /must go through in_progress/);

    const terminalError = getTransitionError('task-1', 'completed', 'in_progress');
    assert.match(terminalError, /already completed/);
  });

  await t.test('Invalid status validation', async () => {
    assert.strictEqual(isValidTransition('pending', 'nonsense'), false);
    assert.strictEqual(isValidTransition('nonsense', 'in_progress'), false);
  });
});
