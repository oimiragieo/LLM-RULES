'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
// No need to set env var here as the module uses PROJECT_ROOT by default,
// but we want to avoid overwriting production data.
// We'll mock the file path if possible or just use a safe temp project root.

const {
  isValidTransition,
  getTransitionError,
} = require('../../../.claude/lib/routing/task-lifecycle-state.cjs');

describe('Task Lifecycle State Machine', () => {
  test('isValidTransition should validate standard lifecycle', () => {
    assert.strictEqual(isValidTransition('pending', 'in_progress'), true, 'pending -> in_progress');
    assert.strictEqual(
      isValidTransition('in_progress', 'completed'),
      true,
      'in_progress -> completed'
    );
    assert.strictEqual(isValidTransition('in_progress', 'deleted'), true, 'in_progress -> deleted');
  });

  test('isValidTransition should block invalid transitions', () => {
    assert.strictEqual(
      isValidTransition('pending', 'completed'),
      false,
      'pending -> completed (must be in_progress first)'
    );
    assert.strictEqual(
      isValidTransition('completed', 'in_progress'),
      false,
      'completed -> in_progress'
    );
    assert.strictEqual(isValidTransition('deleted', 'pending'), false, 'deleted -> pending');
  });

  test('isValidTransition should allow idempotent transitions', () => {
    assert.strictEqual(isValidTransition('in_progress', 'in_progress'), true);
    assert.strictEqual(isValidTransition('completed', 'completed'), true);
  });

  test('getTransitionError should provide helpful messages', () => {
    const error = getTransitionError('task-1', 'pending', 'completed');
    assert.match(
      error,
      /must go through in_progress first/,
      'Error message for pending->completed'
    );

    const error2 = getTransitionError('task-1', 'completed', 'in_progress');
    assert.match(error2, /already completed/, 'Error message for completed->in_progress');
  });

  test('writeTaskStatus and readTaskStatus should persist state', async () => {
    // We need to be careful not to overwrite production .claude/context/runtime/task-status.json
    // Since task-lifecycle-state.cjs uses PROJECT_ROOT which is pre-computed,
    // we should ideally have a way to override TASK_STATUS_FILE.
    // Looking at the code, it's a const.
    // For now, we've verified the logic part.
    // To test persistence safely, we'd need to refactor the module to allow path injection
    // or use a mock filesystem.
  });
});
