#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.resolve(
  __dirname,
  '../../../.claude/hooks/validation/pre-completion-validation.cjs'
);

function runHook(toolInput, extraEnv = {}) {
  const input = JSON.stringify({ tool_name: 'TaskUpdate', tool_input: toolInput });
  const env = { ...process.env, ...extraEnv };
  if (
    Object.prototype.hasOwnProperty.call(extraEnv, 'CLAUDE_AGENT_ID') &&
    !extraEnv.CLAUDE_AGENT_ID
  ) {
    delete env.CLAUDE_AGENT_ID;
  }

  return spawnSync(process.execPath, [HOOK], {
    input,
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env,
    timeout: 10000,
    shell: false,
    windowsHide: true,
  });
}

test('router in_progress updates always exit 0', () => {
  const result = runHook({ taskId: '1', status: 'in_progress' }, { CLAUDE_AGENT_ID: '' });

  assert.equal(
    result.status,
    0,
    `Expected in_progress router update to exit 0, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('router completed updates bypass agent-only validation', () => {
  const result = runHook(
    {
      taskId: '99',
      status: 'completed',
      metadata: {
        summary: 'router housekeeping completion for drain-gate recovery and session cleanup',
      },
    },
    {
      CLAUDE_AGENT_ID: '',
      TASK_STATUS_ENFORCEMENT: 'off',
      SUMMARY_REQUIRED_ENFORCEMENT: 'off',
      PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'off',
    }
  );

  assert.equal(
    result.status,
    0,
    `Expected router completion to bypass agent-only validation, got ${result.status}. stdout: ${result.stdout}`
  );
});

test('sub-agent completed updates still block on invalid summary', () => {
  const result = runHook(
    { taskId: '5', status: 'completed', metadata: { summary: 'done' } },
    { CLAUDE_AGENT_ID: 'agent-abc123', TASK_STATUS_ENFORCEMENT: 'off' }
  );

  assert.equal(
    result.status,
    2,
    `Expected sub-agent completion with short summary to block, got ${result.status}. stdout: ${result.stdout}`
  );
});
