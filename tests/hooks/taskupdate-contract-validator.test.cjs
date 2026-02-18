'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../../.claude/hooks/validation/taskupdate-contract-validator.cjs');

test('allows non-TaskUpdate tools', () => {
  const result = hook.runValidation({
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
  });
  assert.equal(result.allow, true);
});

test('blocks TaskUpdate without task id', () => {
  const result = hook.runValidation({
    tool_name: 'TaskUpdate',
    tool_input: { status: 'in_progress' },
  });
  assert.equal(result.allow, false);
  assert.match(result.message, /Missing required field: taskId/);
});

test('blocks TaskUpdate with invalid status', () => {
  const result = hook.runValidation({
    tool_name: 'TaskUpdate',
    tool_input: { taskId: 'task-1', status: 'failed' },
  });
  assert.equal(result.allow, false);
  assert.match(result.message, /Invalid status value/);
});

test('allows valid TaskUpdate payload', () => {
  const result = hook.runValidation({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-1',
      status: 'completed',
      metadata: { summary: 'Done', filesModified: ['src/a.js'] },
    },
  });
  assert.equal(result.allow, true);
});

test('supports legacy hook shape (tool + params)', () => {
  const result = hook.runValidation({
    tool: 'TaskUpdate',
    params: { task_id: 'task-42', status: 'in_progress' },
  });
  assert.equal(result.allow, true);
});

test('blocks completed TaskUpdate without metadata.summary', () => {
  const result = hook.runValidation({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-2',
      status: 'completed',
      metadata: { filesModified: ['src/file.js'] },
    },
  });
  assert.equal(result.allow, false);
  assert.match(result.message, /metadata\.summary/);
});

test('blocks completed TaskUpdate without filesModified/filesCreated', () => {
  const result = hook.runValidation({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-3',
      status: 'completed',
      metadata: { summary: 'Completed work' },
    },
  });
  assert.equal(result.allow, false);
  assert.match(result.message, /filesModified|filesCreated/);
});
