#!/usr/bin/env node
/**
 * hook-exit-codes.test.cjs
 *
 * TDD tests verifying that hooks emit exit code 2 when blocking.
 *
 * Bug C-3: pre-completion-validation.cjs exits 0 on block (should exit 2)
 * Bug C-4: bash-pretool-bundle.cjs exits 1 on error (should exit 2 or 0)
 * Bug H-9: taskupdate-contract-validator.cjs exits 0 on block (should exit 2)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Spawn a hook as a child process with mock stdin.
 * @param {string} hookPath - Absolute path to hook script
 * @param {object} input - Input object serialized to JSON for stdin
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runHook(hookPath, input) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// Bug C-3: pre-completion-validation.cjs
// ---------------------------------------------------------------------------
describe('pre-completion-validation exit codes (C-3)', () => {
  const HOOK = path.join(
    PROJECT_ROOT,
    '.claude/hooks/validation/pre-completion-validation.cjs'
  );

  it('exits 2 when TaskUpdate has invalid status (block decision)', () => {
    // TASK_STATUS_ENFORCEMENT=block is the default.
    // Send a TaskUpdate with an invalid status — should be blocked.
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-99',
        status: 'invalid-status-xyz',
      },
    };
    process.env.TASK_STATUS_ENFORCEMENT = 'block';
    const result = runHook(HOOK, input);
    // The hook should block (emit block JSON) and exit 2
    assert.strictEqual(
      result.status,
      2,
      `Expected exit code 2 for block decision, got ${result.status}. stdout: ${result.stdout}`
    );
    // stdout should contain block JSON
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok(
      parsed.permissionDecision === 'deny' || parsed.result === 'block',
      `Expected block JSON in stdout, got: ${result.stdout}`
    );
  });

  it('exits 0 when TaskUpdate is allowed (non-block path)', () => {
    // A valid minimal non-completed TaskUpdate — should be allowed
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-99',
        status: 'in_progress',
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      0,
      `Expected exit code 0 for allow decision, got ${result.status}`
    );
  });
});

// ---------------------------------------------------------------------------
// Bug C-4: bash-pretool-bundle.cjs
// ---------------------------------------------------------------------------
describe('bash-pretool-bundle exit codes (C-4)', () => {
  const HOOK = path.join(
    PROJECT_ROOT,
    '.claude/hooks/safety/bash-pretool-bundle.cjs'
  );

  it('exits 2 (not 1) when a sub-hook fails to run (res.error path)', () => {
    // We can test the internal error path by checking the exported main function
    // or by crafting an input that causes a hook to error.
    // Since HOOKS array contains real hooks, we test the exit code contract
    // by verifying what happens when the hook list contains a nonexistent path.
    // We can't easily override HOOKS from outside, so test via the module interface:
    // The bug is: process.exit(1) on res.error should be process.exit(2).
    // We verify the fix by reading the source and checking there's no process.exit(1).
    const fs = require('fs');
    const source = fs.readFileSync(HOOK, 'utf8');
    // After the fix, there should be no bare process.exit(1) calls
    // (the only valid exit codes are 0 and 2)
    assert.ok(
      !source.includes('process.exit(1)'),
      'bash-pretool-bundle.cjs should not contain process.exit(1) — use process.exit(2) for block or process.exit(0) for non-critical'
    );
  });

  it('exits 2 when a sub-hook blocks (propagates sub-hook exit code)', () => {
    // Send a dangerous bash command that bash-command-validator should block
    const input = {
      tool_name: 'Bash',
      tool_input: {
        command: 'rm -rf /',
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      2,
      `Expected exit code 2 for blocked command, got ${result.status}. stdout: ${result.stdout}`
    );
  });

  it('exits 0 when command is allowed', () => {
    const input = {
      tool_name: 'Bash',
      tool_input: {
        command: 'echo hello',
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      0,
      `Expected exit code 0 for allowed command, got ${result.status}. stdout: ${result.stdout}`
    );
  });
});

// ---------------------------------------------------------------------------
// Bug H-9: taskupdate-contract-validator.cjs
// ---------------------------------------------------------------------------
describe('taskupdate-contract-validator exit codes (H-9)', () => {
  const HOOK = path.join(
    PROJECT_ROOT,
    '.claude/hooks/validation/taskupdate-contract-validator.cjs'
  );

  it('exits 2 when TaskUpdate is missing taskId (block decision)', () => {
    // Missing taskId → block → should exit 2
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        status: 'in_progress',
        // taskId is intentionally missing
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      2,
      `Expected exit code 2 for missing taskId, got ${result.status}. stdout: ${result.stdout}`
    );
    // stdout should contain valid block JSON
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok(
      parsed.permissionDecision === 'deny' || parsed.result === 'block' || parsed.allow === false,
      `Expected block JSON, got: ${result.stdout}`
    );
  });

  it('exits 2 when TaskUpdate has invalid status (block decision)', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-1',
        status: 'bogus-status',
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      2,
      `Expected exit code 2 for invalid status, got ${result.status}. stdout: ${result.stdout}`
    );
  });

  it('exits 0 when TaskUpdate is valid (allow decision)', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-1',
        status: 'completed',
      },
    };
    const result = runHook(HOOK, input);
    assert.strictEqual(
      result.status,
      0,
      `Expected exit code 0 for valid TaskUpdate, got ${result.status}`
    );
  });

  it('exits 2 when hook input is missing entirely (missing input path)', () => {
    // When input is empty/null, the hook should block with exit 2
    // We send empty input to simulate missing payload
    const hookPath = HOOK;
    const res = spawnSync(process.execPath, [hookPath], {
      input: '',
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      shell: false,
    });
    // The hook blocks on missing/invalid input, so should exit 2
    assert.strictEqual(
      res.status,
      2,
      `Expected exit code 2 for empty input, got ${res.status}. stdout: ${res.stdout}`
    );
  });
});
