#!/usr/bin/env node
'use strict';

/**
 * hook-error-detector.test.cjs
 *
 * Tests for .claude/hooks/monitoring/hook-error-detector.cjs
 *
 * RED phase: All tests are written before the hook exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/monitoring/hook-error-detector.cjs');
const PROJECT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const PROJECT_GAP_LOG = path.join(PROJECT_RUNTIME_DIR, 'session-gap-log.jsonl');
const PROJECT_SIGNAL_FILE = path.join(PROJECT_RUNTIME_DIR, 'hook-recovery-needed.txt');

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
 * Helper: create a temp runtime dir.
 */
function makeTempRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-err-det-'));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Normal PostToolUse result (no errors) */
function makeNormalStdin() {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_result: {
      output: 'some output',
      error: null,
    },
  });
}

/** PostToolUse result with MODULE_NOT_FOUND containing worktree path */
function makeWorktreeModuleNotFoundStdin() {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_result: {
      output: '',
      error:
        "Error: Cannot find module '/absolute/project/.claude/worktrees/agent-abc123/some/hook.cjs'\n" +
        'Require stack:\n- /absolute/project/.claude/worktrees/agent-abc123/some/hook.cjs\n' +
        '    at MODULE_NOT_FOUND',
    },
  });
}

/** PostToolUse result with MODULE_NOT_FOUND but NOT a worktree path */
function makeNonWorktreeModuleNotFoundStdin() {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_result: {
      output: '',
      error: "Error: Cannot find module 'some-npm-package'\n" + '    at MODULE_NOT_FOUND',
    },
  });
}

test('exits 0 on normal tool result with no errors', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook(makeNormalStdin(), { HOOK_ERROR_DETECTOR_RUNTIME_DIR: dir });
    assert.equal(
      result.status,
      0,
      `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`
    );
  } finally {
    cleanup();
  }
});

test('detects MODULE_NOT_FOUND with worktree path and exits 0', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook(makeWorktreeModuleNotFoundStdin(), {
      HOOK_ERROR_DETECTOR_RUNTIME_DIR: dir,
    });
    assert.equal(
      result.status,
      0,
      `Expected exit 0 (fail-open), got ${result.status}. stderr: ${result.stderr}`
    );
    // Should have written the gap log entry
    const gapLog = path.join(dir, 'session-gap-log.jsonl');
    assert.ok(
      fs.existsSync(gapLog),
      'Gap log should be written when worktree MODULE_NOT_FOUND detected'
    );
    const lines = fs.readFileSync(gapLog, 'utf8').trim().split('\n');
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    assert.equal(lastEntry.type, 'hook-error', 'Gap log entry type must be hook-error');
    assert.ok(
      lastEntry.description && lastEntry.description.includes('MODULE_NOT_FOUND'),
      'Gap log description must mention MODULE_NOT_FOUND'
    );
  } finally {
    cleanup();
  }
});

test('ignores MODULE_NOT_FOUND that does not contain worktree path', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook(makeNonWorktreeModuleNotFoundStdin(), {
      HOOK_ERROR_DETECTOR_RUNTIME_DIR: dir,
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
    // Should NOT write a gap log entry for non-worktree MODULE_NOT_FOUND
    const gapLog = path.join(dir, 'session-gap-log.jsonl');
    if (fs.existsSync(gapLog)) {
      const content = fs.readFileSync(gapLog, 'utf8').trim();
      if (content) {
        const lines = content.split('\n');
        for (const line of lines) {
          const entry = JSON.parse(line);
          assert.notEqual(
            entry.type,
            'hook-error',
            'Should not write hook-error for non-worktree MODULE_NOT_FOUND'
          );
        }
      }
    }
  } finally {
    cleanup();
  }
});

test('writes hook-recovery-needed.txt signal file on worktree MODULE_NOT_FOUND', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    runHook(makeWorktreeModuleNotFoundStdin(), {
      HOOK_ERROR_DETECTOR_RUNTIME_DIR: dir,
    });
    const signalFile = path.join(dir, 'hook-recovery-needed.txt');
    assert.ok(fs.existsSync(signalFile), 'hook-recovery-needed.txt must be written on detection');
  } finally {
    cleanup();
  }
});

test('exits 0 on malformed stdin (fail-open)', () => {
  const { dir, cleanup } = makeTempRuntime();
  try {
    const result = runHook('{ bad json !!!', { HOOK_ERROR_DETECTOR_RUNTIME_DIR: dir });
    assert.equal(result.status, 0, `Expected exit 0 on bad stdin, got ${result.status}`);
  } finally {
    cleanup();
  }
});

test('uses PROJECT_ROOT runtime directory when cwd is outside repo', () => {
  const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-err-det-outside-cwd-'));
  const gapBackup = fs.existsSync(PROJECT_GAP_LOG)
    ? fs.readFileSync(PROJECT_GAP_LOG, 'utf8')
    : null;
  const signalBackup = fs.existsSync(PROJECT_SIGNAL_FILE)
    ? fs.readFileSync(PROJECT_SIGNAL_FILE, 'utf8')
    : null;

  try {
    fs.mkdirSync(PROJECT_RUNTIME_DIR, { recursive: true });
    fs.rmSync(PROJECT_GAP_LOG, { force: true });
    fs.rmSync(PROJECT_SIGNAL_FILE, { force: true });

    const result = spawnSync(process.execPath, [HOOK], {
      input: makeWorktreeModuleNotFoundStdin(),
      cwd: outsideCwd,
      env: process.env,
      encoding: 'utf8',
      timeout: 8000,
    });

    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
    assert.ok(
      fs.existsSync(PROJECT_SIGNAL_FILE),
      'signal file must be written under PROJECT_ROOT runtime dir'
    );
    assert.ok(
      fs.existsSync(PROJECT_GAP_LOG),
      'gap log must be written under PROJECT_ROOT runtime dir'
    );
    assert.equal(
      fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime')),
      false,
      'hook-error-detector must not create runtime files under process.cwd()'
    );
  } finally {
    if (gapBackup === null) {
      fs.rmSync(PROJECT_GAP_LOG, { force: true });
    } else {
      fs.mkdirSync(PROJECT_RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(PROJECT_GAP_LOG, gapBackup, 'utf8');
    }
    if (signalBackup === null) {
      fs.rmSync(PROJECT_SIGNAL_FILE, { force: true });
    } else {
      fs.mkdirSync(PROJECT_RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(PROJECT_SIGNAL_FILE, signalBackup, 'utf8');
    }
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});
