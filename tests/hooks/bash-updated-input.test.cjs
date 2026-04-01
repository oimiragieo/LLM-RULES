'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'bash-command-validator.cjs'
);

function runHook(command) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    windowsHide: true,
  });

  const stdout = (result.stdout || '').trim();
  return {
    status: result.status,
    stdout,
    stderr: result.stderr || '',
    parsed: stdout ? JSON.parse(stdout) : null,
  };
}

test('multi-line bash scripts without error handling get updatedInput safety prefix', () => {
  const command = 'echo first\necho second';
  const result = runHook(command);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.parsed, 'Expected hook JSON output');
  assert.equal(
    result.parsed?.hookSpecificOutput?.updatedInput?.command,
    `set -euo pipefail\n${command}`
  );
});

test('single-line commands do not get updatedInput', () => {
  const result = runHook('git status');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.parsed?.hookSpecificOutput?.updatedInput, undefined);
});

test('already-safe multi-line commands do not get updatedInput', () => {
  const command = 'set -euo pipefail\necho first\necho second';
  const result = runHook(command);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.parsed?.hookSpecificOutput?.updatedInput, undefined);
});

test('blocked commands include suppressOutput true and keep verbose block text on stderr only', () => {
  const result = runHook('sudo whoami');

  assert.equal(result.status, 2, `stdout=${result.stdout}\nstderr=${result.stderr}`);
  assert.equal(result.parsed?.suppressOutput, true);
  assert.match(result.stderr, /BLOCKED/i);
  assert.doesNotMatch(result.stdout, /\+--------------------------------------------------\+/);
  assert.doesNotMatch(result.stdout, /Dangerous Command Detected/i);
});

test('allowed commands do not include suppressOutput', () => {
  const result = runHook('git status');

  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(result.parsed?.suppressOutput, true);
});
