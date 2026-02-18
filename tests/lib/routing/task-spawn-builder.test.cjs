'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTaskSpawnInput,
  deriveDescriptionFromPrompt,
} = require('../../../.claude/lib/routing/task-spawn-builder.cjs');

test('deriveDescriptionFromPrompt strips leading "You are" prefix', () => {
  const description = deriveDescriptionFromPrompt('You are DEVELOPER. Fix auth race condition.\nDo work');
  assert.equal(description, 'DEVELOPER. Fix auth race condition.');
});

test('normalizeTaskSpawnInput injects task_id and description when missing', () => {
  const result = normalizeTaskSpawnInput(
    {
      subagent_type: 'developer',
      prompt: 'You are QA. Run regression checks.',
    },
    { session_id: 'session-abc-123' }
  );

  assert.equal(result.modified, true);
  assert.ok(result.taskId.startsWith('task-sessionabc12-'));
  assert.equal(result.toolInput.task_id, result.taskId);
  assert.equal(result.toolInput.description, 'QA. Run regression checks.');
});

test('normalizeTaskSpawnInput preserves explicit description and task_id', () => {
  const result = normalizeTaskSpawnInput(
    {
      task_id: 'task-77',
      subagent_type: 'developer',
      prompt: 'Do work',
      description: 'Existing description',
    },
    { session_id: 'session-keep' }
  );

  assert.equal(result.modified, false);
  assert.equal(result.taskId, 'task-77');
  assert.equal(result.toolInput.description, 'Existing description');
  assert.equal(result.toolInput.task_id, 'task-77');
});
