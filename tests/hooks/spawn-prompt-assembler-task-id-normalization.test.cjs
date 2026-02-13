const { test } = require('node:test');
const assert = require('node:assert');

const {
  normalizeTaskIdReferences,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('normalizeTaskIdReferences rewrites hardcoded task placeholders to active task id', () => {
  const input = [
    '**Task ID**: task-1',
    'Task ID: task-1',
    "TaskUpdate({ taskId: 'task-1', status: 'in_progress' })",
    "TaskUpdate({ task_id: 'task-1', status: 'completed' })",
  ].join('\n');

  const output = normalizeTaskIdReferences(input, 'task-real-123');
  assert.ok(output.includes('**Task ID**: task-real-123'));
  assert.ok(output.includes('Task ID: task-real-123'));
  assert.ok(output.includes("taskId: 'task-real-123'"));
  assert.ok(output.includes("task_id: 'task-real-123'"));
  assert.equal(output.includes('task-1'), false);
});
