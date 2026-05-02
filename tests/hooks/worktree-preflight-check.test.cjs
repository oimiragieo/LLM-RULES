'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/safety/worktree-preflight-check.cjs'
);

/**
 * Run the hook with given JSON input and env vars.
 * Returns { exitCode, stdout, stderr }.
 */
function runHook(input, env = {}, options = {}) {
  const inputStr = options.rawInput ? input : JSON.stringify(input);
  try {
    const stdout = execFileSync('node', [HOOK_PATH], {
      input: inputStr,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, ...env },
      cwd: options.cwd,
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

function makeGitRepo({ dirty = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-preflight-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'clean\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  if (dirty) {
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'dirty\n');
  }

  return dir;
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
    const result = runHook('not valid json', {}, { rawInput: true });
    assert.equal(result.exitCode, 0);
  });

  test('exits 0 on empty input (fail-open)', () => {
    const result = runHook('', {}, { rawInput: true });
    assert.equal(result.exitCode, 0);
  });

  test('in block mode with worktree isolation, exits 0 on clean tree', () => {
    const repo = makeGitRepo();
    try {
      const result = runHook(
        {
          tool_name: 'Task',
          tool_input: { isolation: 'worktree', prompt: 'test' },
        },
        { WORKTREE_PREFLIGHT_ENFORCEMENT: 'block' },
        { cwd: repo }
      );
      assert.equal(result.exitCode, 0);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('blocks worktree isolation in block mode when the working tree is dirty', () => {
    const repo = makeGitRepo({ dirty: true });
    try {
      const result = runHook(
        {
          tool_name: 'Task',
          tool_input: { isolation: 'worktree', prompt: 'test' },
        },
        { WORKTREE_PREFLIGHT_ENFORCEMENT: 'block' },
        { cwd: repo }
      );
      assert.equal(result.exitCode, 2);
      assert.match(result.stdout, /"allow":false/);
      assert.match(result.stdout, /uncommitted change/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
