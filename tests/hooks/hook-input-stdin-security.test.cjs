'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(
  process.cwd(),
  '.claude',
  'hooks',
  'validation',
  'taskupdate-contract-validator.cjs'
);
const ROUTING_GUARD = path.join(process.cwd(), '.claude', 'hooks', 'routing', 'routing-guard.cjs');
const BASH_VALIDATOR = path.join(
  process.cwd(),
  '.claude',
  'hooks',
  'safety',
  'bash-command-validator.cjs'
);

test('taskupdate-contract-validator blocks invalid TaskUpdate when input is provided via stdin only', () => {
  const payload = {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
  };

  const child = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, `hook process failed: ${child.stderr}`);
  const out = JSON.parse((child.stdout || '').trim() || '{}');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.message || out.permissionDecisionReason || '', /taskId|required/i);
});

test('routing-guard blocks router Bash via stdin-only hook input', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'echo "hello"' },
    session_id: 'stdin-routing-guard-test',
  };

  const child = spawnSync(process.execPath, [ROUTING_GUARD], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  assert.equal(child.status, 2, `routing-guard should block (2), stderr: ${child.stderr}`);
  const out = JSON.parse((child.stdout || '').trim() || '{}');
  assert.equal(out.permissionDecision, 'deny');
});

test('bash-command-validator blocks dangerous command via stdin-only hook input', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'echo "x" > .claude/context/memory/learnings.md' },
    session_id: 'stdin-bash-validator-test',
  };

  const child = spawnSync(process.execPath, [BASH_VALIDATOR], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  assert.equal(child.status, 2, `bash-command-validator should block (2), stderr: ${child.stderr}`);
});
