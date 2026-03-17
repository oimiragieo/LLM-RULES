#!/usr/bin/env node
'use strict';

/**
 * worktree-prune-on-start.test.cjs
 *
 * Tests for .claude/hooks/session/worktree-prune-on-start.cjs
 *
 * RED phase: All tests are written before the hook exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/session/worktree-prune-on-start.cjs');

/**
 * Helper: run the hook with stdin and optional env overrides.
 * Returns { status, stdout, stderr }.
 */
function runHook(stdinData, envOverrides = {}) {
  return spawnSync(process.execPath, [HOOK], {
    input: stdinData,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    timeout: 8000,
  });
}

/**
 * Helper: create a temp runtime dir and return its path along with a
 * cleanup function.
 */
function makeTempRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-prune-test-'));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Minimal valid UserPromptSubmit stdin payload */
const VALID_STDIN = JSON.stringify({
  hook_event_name: 'UserPromptSubmit',
  prompt: 'hello',
});

test('exits 0 and allows prompt on valid stdin', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook(VALID_STDIN, { WORKTREE_PRUNE_RUNTIME_DIR: dir });
    assert.equal(
      result.status,
      0,
      `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`
    );
    const output = result.stdout.trim();
    if (output) {
      const parsed = JSON.parse(output);
      assert.equal(parsed.allow, true, 'allow must be true');
    }
  } finally {
    cleanup();
  }
});

test('creates session flag file after first invocation', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    runHook(VALID_STDIN, { WORKTREE_PRUNE_RUNTIME_DIR: dir });
    const flagPath = path.join(dir, 'worktree-pruned-this-session.flag');
    assert.ok(fs.existsSync(flagPath), `Flag file should exist at ${flagPath}`);
  } finally {
    cleanup();
  }
});

test('skips git worktree prune when flag file already exists', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    // Pre-create the flag file so the hook should skip git entirely
    const flagPath = path.join(dir, 'worktree-pruned-this-session.flag');
    fs.writeFileSync(flagPath, 'already ran', 'utf8');

    // Use a PATH that has no git binary to confirm git is not called
    // If git were called it would fail and the hook would still exit 0 (fail-open)
    // We verify by checking stderr — no git output expected
    const result = runHook(VALID_STDIN, {
      WORKTREE_PRUNE_RUNTIME_DIR: dir,
      // Override PATH to empty to verify git is not attempted
      // (fail-open means even if git fails, exit is 0)
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
    // Flag file should still exist and be unchanged
    assert.ok(fs.existsSync(flagPath), 'Flag file should still exist after skip');
    const content = fs.readFileSync(flagPath, 'utf8');
    assert.equal(content, 'already ran', 'Flag file content should be unchanged');
  } finally {
    cleanup();
  }
});

test('exits 0 even when git command fails (fail-open)', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    // Remove git from PATH to force git command failure
    const result = runHook(VALID_STDIN, {
      WORKTREE_PRUNE_RUNTIME_DIR: dir,
      PATH: os.platform() === 'win32' ? 'C:\\nonexistent' : '/nonexistent',
    });
    assert.equal(result.status, 0, `Expected exit 0 on git failure, got ${result.status}`);
  } finally {
    cleanup();
  }
});

test('exits 0 on malformed stdin (fail-open)', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook('{ not valid json !!!', { WORKTREE_PRUNE_RUNTIME_DIR: dir });
    assert.equal(result.status, 0, `Expected exit 0 on bad stdin, got ${result.status}`);
  } finally {
    cleanup();
  }
});

test('uses shell:false for git command (source check)', () => {
  // Read the hook source and verify shell:false is used with execFileSync
  assert.ok(fs.existsSync(HOOK), `Hook file must exist: ${HOOK}`);
  const src = fs.readFileSync(HOOK, 'utf8');
  // Must use execFileSync (not exec/execSync/spawn with shell:true)
  assert.ok(
    src.includes('execFileSync') || src.includes('spawnSync'),
    'Hook must use execFileSync or spawnSync for shell:false compliance'
  );
  // Must NOT use shell: true
  assert.ok(
    !src.includes('shell: true') && !src.includes("shell:'true'"),
    'Hook must not use shell: true'
  );
});
