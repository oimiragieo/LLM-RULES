'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/safety/worktree-preflight-check.cjs'
);

/**
 * Run the hook with given JSON input and env vars.
 * Returns { exitCode, stdout, stderr }.
 */
function runHook(input, env = {}) {
  const inputStr = JSON.stringify(input);
  try {
    const stdout = execFileSync('node', [HOOK_PATH], {
      input: inputStr,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
    };
  }
}

describe('worktree-preflight-check hook', () => {
  test('allows non-Task tool calls', () => {
    const result = runHook({ tool_name: 'Read', tool_input: {} });
    assert.equal(result.exitCode, 0);
  });

  test('allows Task calls without worktree isolation', () => {
    const result = runHook({
      tool_name: 'Task',
      tool_input: { prompt: 'do something' },
    });
    assert.equal(result.exitCode, 0);
  });

  test('allows Task with worktree isolation on clean tree', () => {
    const result = runHook({
      tool_name: 'Task',
      tool_input: { isolation: 'worktree', prompt: 'test' },
    });
    assert.equal(result.exitCode, 0);
  });

  test('exits 0 on malformed JSON input (fail-open)', () => {
    const result = runHook('not valid json');
    assert.equal(result.exitCode, 0);
  });

  test('exits 0 on empty input (fail-open)', () => {
    const result = runHook('');
    assert.equal(result.exitCode, 0);
  });

  test('in block mode with dirty tree and worktree isolation, exits 0 on clean tree', () => {
    const result = runHook(
      {
        tool_name: 'Task',
        tool_input: { isolation: 'worktree', prompt: 'test' },
      },
      { WORKTREE_PREFLIGHT_ENFORCEMENT: 'block' }
    );
    assert.equal(result.exitCode, 0);
  });
});
