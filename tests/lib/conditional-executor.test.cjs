'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCondition,
  shouldExecuteTask,
  ConditionType,
} = require('../../.claude/lib/orchestration/conditional-executor.cjs');

// ─── ConditionType constants ────────────────────────────────────────────────

describe('ConditionType', () => {
  it('exports condition type constants', () => {
    assert.equal(ConditionType.ALWAYS, 'always');
    assert.equal(ConditionType.IF_SUCCESS, 'if_success');
    assert.equal(ConditionType.IF_FAILURE, 'if_failure');
    assert.equal(ConditionType.IF_OUTPUT_MATCHES, 'if_output_matches');
    assert.equal(ConditionType.CUSTOM, 'custom');
  });
});

// ─── evaluateCondition ──────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('ALWAYS returns true regardless of context', () => {
    const result = evaluateCondition({ type: ConditionType.ALWAYS }, {});
    assert.equal(result.execute, true);
    assert.equal(result.reason, 'always');
  });

  it('no condition defaults to ALWAYS', () => {
    const result = evaluateCondition(null, {});
    assert.equal(result.execute, true);
    assert.equal(result.reason, 'no condition (default: always)');
  });

  it('undefined condition defaults to ALWAYS', () => {
    const result = evaluateCondition(undefined, {});
    assert.equal(result.execute, true);
  });

  it('IF_SUCCESS returns true when previous task succeeded', () => {
    const ctx = {
      previousTask: { status: 'completed', metadata: { summary: 'done' } },
    };
    const result = evaluateCondition({ type: ConditionType.IF_SUCCESS, taskId: 'prev-1' }, ctx);
    assert.equal(result.execute, true);
  });

  it('IF_SUCCESS returns false when previous task failed', () => {
    const ctx = {
      previousTask: { status: 'failed', metadata: {} },
    };
    const result = evaluateCondition({ type: ConditionType.IF_SUCCESS, taskId: 'prev-1' }, ctx);
    assert.equal(result.execute, false);
    assert.ok(result.reason.includes('not completed'));
  });

  it('IF_SUCCESS returns false when no previous task', () => {
    const result = evaluateCondition({ type: ConditionType.IF_SUCCESS, taskId: 'prev-1' }, {});
    assert.equal(result.execute, false);
  });

  it('IF_FAILURE returns true when previous task failed', () => {
    const ctx = { previousTask: { status: 'failed' } };
    const result = evaluateCondition({ type: ConditionType.IF_FAILURE, taskId: 'prev-1' }, ctx);
    assert.equal(result.execute, true);
  });

  it('IF_FAILURE returns false when previous task succeeded', () => {
    const ctx = { previousTask: { status: 'completed' } };
    const result = evaluateCondition({ type: ConditionType.IF_FAILURE, taskId: 'prev-1' }, ctx);
    assert.equal(result.execute, false);
  });

  it('IF_OUTPUT_MATCHES returns true when pattern matches', () => {
    const ctx = {
      previousTask: {
        status: 'completed',
        metadata: { summary: 'Tests passed: 42 assertions' },
      },
    };
    const condition = {
      type: ConditionType.IF_OUTPUT_MATCHES,
      pattern: 'Tests passed',
    };
    const result = evaluateCondition(condition, ctx);
    assert.equal(result.execute, true);
  });

  it('IF_OUTPUT_MATCHES returns false when pattern does not match', () => {
    const ctx = {
      previousTask: {
        status: 'completed',
        metadata: { summary: 'Build failed with errors' },
      },
    };
    const condition = {
      type: ConditionType.IF_OUTPUT_MATCHES,
      pattern: 'Tests passed',
    };
    const result = evaluateCondition(condition, ctx);
    assert.equal(result.execute, false);
  });

  it('IF_OUTPUT_MATCHES with regex pattern', () => {
    const ctx = {
      previousTask: {
        status: 'completed',
        metadata: { summary: 'Coverage: 85.3%' },
      },
    };
    const condition = {
      type: ConditionType.IF_OUTPUT_MATCHES,
      pattern: 'Coverage:\\s*\\d+',
      regex: true,
    };
    const result = evaluateCondition(condition, ctx);
    assert.equal(result.execute, true);
  });

  it('CUSTOM evaluates function', () => {
    const condition = {
      type: ConditionType.CUSTOM,
      evaluate: ctx => ctx.fileCount > 5,
    };
    assert.equal(evaluateCondition(condition, { fileCount: 10 }).execute, true);
    assert.equal(evaluateCondition(condition, { fileCount: 2 }).execute, false);
  });

  it('CUSTOM with non-function evaluate returns false', () => {
    const condition = { type: ConditionType.CUSTOM, evaluate: 'not-a-function' };
    const result = evaluateCondition(condition, {});
    assert.equal(result.execute, false);
    assert.ok(result.reason.includes('not a function'));
  });

  it('CUSTOM catches evaluation errors gracefully', () => {
    const condition = {
      type: ConditionType.CUSTOM,
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const result = evaluateCondition(condition, {});
    assert.equal(result.execute, false);
    assert.ok(result.reason.includes('error'));
  });

  it('unknown condition type returns false', () => {
    const result = evaluateCondition({ type: 'unknown_type' }, {});
    assert.equal(result.execute, false);
    assert.ok(result.reason.includes('unknown'));
  });
});

// ─── shouldExecuteTask ──────────────────────────────────────────────────────

describe('shouldExecuteTask', () => {
  it('returns execute=true for task with no condition', () => {
    const task = { id: 'task-1' };
    const result = shouldExecuteTask(task, {});
    assert.equal(result.execute, true);
    assert.equal(result.taskId, 'task-1');
  });

  it('returns execute=true for task with satisfied condition', () => {
    const task = {
      id: 'task-2',
      condition: { type: ConditionType.IF_SUCCESS, taskId: 'task-1' },
    };
    const ctx = { previousTask: { status: 'completed' } };
    const result = shouldExecuteTask(task, ctx);
    assert.equal(result.execute, true);
    assert.equal(result.taskId, 'task-2');
  });

  it('returns execute=false for task with unsatisfied condition', () => {
    const task = {
      id: 'task-2',
      condition: { type: ConditionType.IF_SUCCESS, taskId: 'task-1' },
    };
    const ctx = { previousTask: { status: 'failed' } };
    const result = shouldExecuteTask(task, ctx);
    assert.equal(result.execute, false);
    assert.equal(result.taskId, 'task-2');
    assert.ok(result.skipped);
  });

  it('includes condition type in result', () => {
    const task = {
      id: 'task-3',
      condition: { type: ConditionType.IF_FAILURE },
    };
    const result = shouldExecuteTask(task, { previousTask: { status: 'failed' } });
    assert.equal(result.conditionType, ConditionType.IF_FAILURE);
  });
});
