'use strict';

/**
 * SE-03 regression test: pre-completion-validation.cjs MUST NEVER exit(1).
 *
 * Per SE-03 (see .claude/rules/safety-rules.md), hooks must exit 0 (allow)
 * or 2 (block). Exit 1 is treated as error by the Claude Code tool pipeline
 * and does NOT block — but it also crashes the hook, leaving behavior
 * ambiguous.
 *
 * This test verifies that even on malformed input, empty input, or unusual
 * TaskUpdate payloads, the hook exits cleanly with 0 or 2.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../../.claude/hooks/validation/pre-completion-validation.cjs'
);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

function runHookRaw(stdinData, envOverrides = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinData,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      TASK_STATUS_ENFORCEMENT: 'off',
      SUMMARY_REQUIRED_ENFORCEMENT: 'off',
      PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'off',
      GIT_COMMIT_VERIFICATION: 'off',
      REFLECTION_SCORE_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'off',
      ...envOverrides,
    },
    timeout: 5000,
    shell: false,
  });
}

test('SE-03: malformed JSON stdin must never exit(1)', () => {
  const result = runHookRaw('{not valid json at all');
  assert.ok(
    result.status === 0 || result.status === 2,
    `Expected exit 0 or 2, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('SE-03: empty stdin must never exit(1)', () => {
  const result = runHookRaw('');
  assert.ok(
    result.status === 0 || result.status === 2,
    `Expected exit 0 or 2, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('SE-03: TaskUpdate for non-existent task must never exit(1)', () => {
  const input = JSON.stringify({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'nonexistent-task-xyz-12345',
      status: 'completed',
      metadata: {
        summary:
          'A reasonably long summary describing the completed work for this non-existent task id.',
      },
    },
  });
  const result = runHookRaw(input);
  assert.ok(
    result.status === 0 || result.status === 2,
    `Expected exit 0 or 2, got ${result.status}. stderr: ${result.stderr}`
  );
});
