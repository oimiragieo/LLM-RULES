#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function runHookWithStdin(hookPath, payload, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('bash-command-validator blocks dangerous command when input arrives only on stdin', () => {
  const hookPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'safety',
    'bash-command-validator.cjs'
  );
  const payload = {
    tool_name: 'Bash',
    tool_input: {
      command: 'echo "bad" > .claude/context/reports/security-bypass.md',
    },
  };

  const result = runHookWithStdin(hookPath, payload);
  assert.equal(result.status, 2, `Expected block exit code 2, got ${result.status}`);
  assert.match(result.stderr, /BLOCKED: Dangerous Command Detected/i);
});

test('routing-guard blocks router Write when input arrives only on stdin', () => {
  const hookPath = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs');
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: 'src/services/user-data.txt',
      content: 'router should not write directly',
    },
    session_id: 'stdin-security-regression',
  };

  const result = runHookWithStdin(hookPath, payload, {
    CLAUDE_AGENT_ID: 'router',
    ROUTER_WRITE_GUARD: 'block',
  });

  assert.equal(result.status, 2, `Expected block exit code 2, got ${result.status}`);
  assert.match(result.stdout, /ROUTER-FIRST PROTOCOL VIOLATION/i);
});
