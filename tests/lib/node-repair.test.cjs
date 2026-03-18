'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectRepairStrategy } = require('../../.claude/lib/utils/node-repair.cjs');

describe('node-repair', () => {
  it('returns retry on first failure (attemptCount < maxAttempts)', () => {
    const result = selectRepairStrategy({
      taskId: 'task-1',
      failureType: 'timeout',
      attemptCount: 1,
      maxAttempts: 2,
    });
    assert.equal(result.strategy, 'retry');
    assert.ok(result.reason.length > 0);
  });

  it('returns retry when attemptCount is well below maxAttempts', () => {
    const result = selectRepairStrategy({
      taskId: 'task-2',
      failureType: 'network_error',
      attemptCount: 0,
      maxAttempts: 3,
    });
    assert.equal(result.strategy, 'retry');
  });

  it('returns decompose when maxAttempts reached and failureType is decomposable', () => {
    const result = selectRepairStrategy({
      taskId: 'task-3',
      failureType: 'complexity_overload',
      attemptCount: 2,
      maxAttempts: 2,
    });
    assert.equal(result.strategy, 'decompose');
    assert.ok(result.reason.length > 0);
  });

  it('returns escalate when maxAttempts reached and failureType is not decomposable', () => {
    const result = selectRepairStrategy({
      taskId: 'task-4',
      failureType: 'permission_denied',
      attemptCount: 2,
      maxAttempts: 2,
    });
    assert.equal(result.strategy, 'escalate');
    assert.ok(result.reason.length > 0);
  });

  it('uses default maxAttempts of 2 when not provided', () => {
    const result = selectRepairStrategy({
      taskId: 'task-5',
      failureType: 'timeout',
      attemptCount: 1,
    });
    assert.equal(result.strategy, 'retry');
  });

  it('returns escalate when maxAttempts exceeded (attemptCount > maxAttempts) with non-decomposable', () => {
    const result = selectRepairStrategy({
      taskId: 'task-6',
      failureType: 'unknown',
      attemptCount: 5,
      maxAttempts: 2,
    });
    assert.equal(result.strategy, 'escalate');
  });

  it('returns decompose for task_too_large failure type at maxAttempts', () => {
    const result = selectRepairStrategy({
      taskId: 'task-7',
      failureType: 'task_too_large',
      attemptCount: 2,
      maxAttempts: 2,
    });
    assert.equal(result.strategy, 'decompose');
  });
});
