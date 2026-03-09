'use strict';

const { isSubagentPrompt } = require('./router-identity-reminder.cjs');
const assert = require('assert');

// --- isSubagentPrompt: should return false for router (human) prompts ---

assert.strictEqual(
  isSubagentPrompt('fix the bug in auth.cjs'),
  false,
  'plain user request should NOT be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('help me introduce some new features'),
  false,
  'feature request should NOT be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('what does the heartbeat orchestrator do?'),
  false,
  'question should NOT be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('task_id: this is not a task'),
  false,
  'task_id without numeric suffix should NOT match'
);

assert.strictEqual(
  isSubagentPrompt(''),
  false,
  'empty string should NOT be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt(null),
  false,
  'null should NOT throw and should return false'
);

// --- isSubagentPrompt: should return true for subagent task prompts ---

assert.strictEqual(
  isSubagentPrompt('task_id: task-1\n\nYou are a developer agent.'),
  true,
  'task_id: task-N pattern should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('task_id: task-42\nCall TaskUpdate(in_progress)'),
  true,
  'task_id with large numeric ID should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('You are a developer agent. Call TaskUpdate(in_progress)'),
  true,
  'agent identity header should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('You are a code-reviewer agent.\n\nReview the following:'),
  true,
  'hyphenated agent type in identity header should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('Call TaskUpdate({ taskId: "5", status: "in_progress" })'),
  true,
  'direct TaskUpdate call pattern should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('[Task #3] Please implement the feature'),
  true,
  'bracketed task reference should be detected as subagent'
);

assert.strictEqual(
  isSubagentPrompt('<!-- Agent: developer | Task: #5 | Session: 2026-03-09 -->'),
  true,
  'provenance header should be detected as subagent'
);

// --- leading whitespace tolerance ---
assert.strictEqual(
  isSubagentPrompt('  \ntask_id: task-7\n\nYou are a planner agent.'),
  true,
  'leading whitespace before task_id should still be detected'
);

console.log('All tests passed ✓');
