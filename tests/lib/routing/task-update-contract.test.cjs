'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_TASK_STATUSES,
  normalizeTaskUpdatePayload,
  parseAndValidateTaskUpdate,
} = require('../../../.claude/lib/routing/task-update-contract.cjs');

test('normalizeTaskUpdatePayload supports task_id alias and status normalization', () => {
  const normalized = normalizeTaskUpdatePayload({
    task_id: 42,
    status: 'In-Progress',
    metadata: { summary: 'ok' },
  });

  assert.equal(normalized.taskId, '42');
  assert.equal(normalized.status, 'in_progress');
  assert.deepEqual(normalized.metadata, { summary: 'ok' });
});

test('parseAndValidateTaskUpdate requires taskId and status', () => {
  const result = parseAndValidateTaskUpdate({}, { requireTaskId: true, requireStatus: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(err => err.includes('taskId')));
  assert.ok(result.errors.some(err => err.includes('status')));
});

test('parseAndValidateTaskUpdate rejects unknown statuses', () => {
  const result = parseAndValidateTaskUpdate(
    { taskId: 'task-1', status: 'failed' },
    { allowedStatuses: VALID_TASK_STATUSES, requireTaskId: true, requireStatus: true }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /Invalid status value/);
});

test('parseAndValidateTaskUpdate allows canonical status set', () => {
  const result = parseAndValidateTaskUpdate(
    { taskId: 'task-1', status: 'completed' },
    { allowedStatuses: VALID_TASK_STATUSES, requireTaskId: true, requireStatus: true }
  );
  assert.equal(result.valid, true);
  assert.equal(result.normalized.taskId, 'task-1');
  assert.equal(result.normalized.status, 'completed');
});
