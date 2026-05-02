#!/usr/bin/env node
'use strict';

/**
 * worktree-prune-on-start.test.cjs
 *
 * Tests for .claude/hooks/startup/worktree-prune-on-start.cjs
 *
 * RED phase: All tests are written before the hook exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/startup/worktree-prune-on-start.cjs');

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

function makeTempDir(prefix = 'wt-prune-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Load an isolated copy of the hook so path-derived side effects land in a
 * temporary project root instead of the real repo.
 */
function loadHookModuleInTempProject() {
  const { dir, cleanup } = makeTempDir('wt-prune-module-');
  const hookDir = path.join(dir, '.claude', 'hooks', 'startup');
  const hookPath = path.join(hookDir, 'worktree-prune-on-start.cjs');
  fs.mkdirSync(hookDir, { recursive: true });
  fs.writeFileSync(hookPath, fs.readFileSync(HOOK, 'utf8'), 'utf8');
  const mod = require(hookPath);
  return {
    dir,
    hookPath,
    mod,
    cleanup: () => {
      delete require.cache[require.resolve(hookPath)];
      cleanup();
    },
  };
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

test('ensureSubagentClaudeMd creates the tiered worktree CLAUDE.md when missing', () => {
  const { dir, mod, cleanup } = loadHookModuleInTempProject();
  try {
    assert.equal(typeof mod.ensureSubagentClaudeMd, 'function', 'helper export must exist');
    const tieredClaudeMd = path.join(dir, '.claude', 'worktrees', 'CLAUDE.md');
    assert.equal(fs.existsSync(tieredClaudeMd), false, 'temp CLAUDE.md should start absent');

    mod.ensureSubagentClaudeMd();

    assert.ok(fs.existsSync(tieredClaudeMd), `CLAUDE.md should exist at ${tieredClaudeMd}`);
    const content = fs.readFileSync(tieredClaudeMd, 'utf8');
    assert.match(content, /You are a Subagent/, 'CLAUDE.md should contain subagent guidance');
  } finally {
    cleanup();
  }
});

test('exports main and ensureSubagentClaudeMd for programmatic use', () => {
  try {
    const exported = require(HOOK);
    assert.equal(typeof exported.main, 'function', 'main export must exist');
    assert.equal(
      typeof exported.ensureSubagentClaudeMd,
      'function',
      'ensureSubagentClaudeMd export must exist'
    );
  } finally {
    delete require.cache[require.resolve(HOOK)];
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
  assert.ok(src.includes('windowsHide: true'), 'Hook must hide Windows console windows');
  assert.ok(src.includes('getPruneTimeoutMs'), 'Hook must use the bounded timeout helper');

  const { getPruneTimeoutMs } = require(HOOK);
  assert.ok(
    getPruneTimeoutMs() <= 5000,
    `Default prune timeout should not block startup for too long: ${getPruneTimeoutMs()}ms`
  );
});
