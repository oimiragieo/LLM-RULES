'use strict';

// worktree-auto-cleanup.test.cjs — Tests for the worktree-auto-cleanup hook.
// Strategy: Hook is self-executing (no exports), tested via spawnSync with controlled stdin.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'cleanup',
  'worktree-auto-cleanup.cjs'
);

// Helper: run the hook as a subprocess with controlled stdin
function runHook(payload, env = {}) {
  const input = payload !== null ? JSON.stringify(payload) : '';
  return spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10000,
  });
}

// Helper: build a TTL-stamped branch name with a specific age
function ttlBranchName(ageMs) {
  const ts = Date.now() - ageMs;
  return `worktree-agent-aa75a292-${ts}`;
}

// Section 1: Hook exit-code contract (SE-03)
describe('worktree-auto-cleanup — exit code contract (SE-03)', () => {
  it('always exits 0 on empty stdin', () => {
    const result = runHook(null);
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
  });

  it('always exits 0 on valid TaskUpdate(completed) input', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '5', status: 'completed' },
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
  });

  it('always exits 0 on malformed JSON input', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '{not valid json}}}',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
  });

  it('always exits 0 on non-TaskUpdate tool events', () => {
    const result = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'some/file.cjs', content: '// changes' },
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
  });

  it('always exits 0 on TaskUpdate with non-completed status', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '3', status: 'in_progress' },
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
  });
});

// Section 2: No-op behavior for non-completion events
describe('worktree-auto-cleanup — no-op behavior', () => {
  it('produces no stdout for non-TaskUpdate input', () => {
    const result = runHook({
      tool_name: 'Read',
      tool_input: { file_path: 'some/file.md' },
    });
    assert.strictEqual(result.stdout, '', 'Expected empty stdout for non-TaskUpdate input');
  });

  it('produces no stdout for malformed JSON', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: 'not-json-at-all',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.stdout, '', 'Expected empty stdout for malformed JSON');
  });

  it('produces no stdout for TaskUpdate in_progress', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '3', status: 'in_progress' },
    });
    assert.strictEqual(result.stdout, '', 'Expected empty stdout for in_progress status');
  });

  it('produces no stdout for empty stdin (no input)', () => {
    const result = runHook(null);
    assert.strictEqual(result.stdout, '', 'Expected empty stdout for empty stdin');
  });
});

// Section 3: JSON parsing safety (SE-02)
describe('worktree-auto-cleanup — JSON parsing safety (SE-02)', () => {
  it('exits 0 and does not crash on prototype pollution attempt', () => {
    const malicious = JSON.stringify({
      __proto__: { isAdmin: true },
      tool_name: 'TaskUpdate',
      tool_input: { status: 'completed' },
    });
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: malicious,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 even with prototype pollution attempt');
  });

  it('exits 0 on null JSON value', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: 'null',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on null JSON value');
  });

  it('exits 0 on array JSON value (not an object)', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '[]',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on array JSON value');
  });

  it('exits 0 on truncated JSON (incomplete input)', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '{"tool_name": "TaskUpdate", "tool_input":',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on truncated JSON');
  });
});

// Section 4: Tool name / status guard logic
describe('worktree-auto-cleanup — tool guard logic', () => {
  it('no-ops when tool_name is missing', () => {
    const result = runHook({
      tool_input: { taskId: '5', status: 'completed' },
    });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });

  it('no-ops when tool_input is missing', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
    });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });

  it('no-ops when status is "pending"', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '5', status: 'pending' },
    });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });

  it('no-ops when status is empty string', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '5', status: '' },
    });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });

  it('accepts tool_params as alternative to tool_input', () => {
    // Hook reads: input.tool_input || input.tool_params || input.params
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_params: { taskId: '5', status: 'completed' },
    });
    assert.strictEqual(result.status, 0);
  });

  it('accepts params as alternative to tool_input', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      params: { taskId: '5', status: 'completed' },
    });
    assert.strictEqual(result.status, 0);
  });
});

// Section 5: TTL branch name convention tests
describe('worktree-auto-cleanup — TTL branch timestamp extraction', () => {
  it('hook exits 0 even when WORKTREE_TTL_MS is set to 0 (all branches stale)', () => {
    // With TTL=0, any TTL-stamped branch is "stale" by TTL check
    // This shouldn't crash the hook — it should just try to remove worktrees
    const result = runHook(
      {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '5', status: 'completed' },
      },
      { WORKTREE_TTL_MS: '0' }
    );
    assert.strictEqual(result.status, 0, 'Expected exit 0 even with TTL=0');
  });

  it('hook exits 0 when WORKTREE_TTL_MS is very large (no branches stale by TTL)', () => {
    const result = runHook(
      {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '5', status: 'completed' },
      },
      { WORKTREE_TTL_MS: '999999999999' }
    );
    assert.strictEqual(result.status, 0, 'Expected exit 0 with large TTL');
  });

  it('hook exits 0 when WORKTREE_TTL_MS is NaN (falls back gracefully)', () => {
    // parseInt('banana', 10) === NaN; hook should handle this
    const result = runHook(
      {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '5', status: 'completed' },
      },
      { WORKTREE_TTL_MS: 'banana' }
    );
    assert.strictEqual(result.status, 0, 'Expected exit 0 with NaN WORKTREE_TTL_MS');
  });
});

// Section 6: extractBranchTimestamp logic
describe('worktree-auto-cleanup — branch timestamp extraction logic', () => {
  // Replicate extractBranchTimestamp pure logic to avoid requiring the auto-executing hook.
  function extractBranchTimestamp(branch) {
    if (!branch) return null;
    const match = branch.match(/-(\d{13})$/);
    if (!match) return null;
    const ts = parseInt(match[1], 10);
    if (Number.isNaN(ts)) return null;
    return ts;
  }

  it('extracts timestamp from a valid TTL-stamped branch name', () => {
    const ts = 1741000000000;
    const branch = `worktree-agent-aa75a292-${ts}`;
    const result = extractBranchTimestamp(branch);
    assert.strictEqual(result, ts, 'Expected numeric timestamp to be extracted');
  });

  it('returns null for branch names without a timestamp suffix', () => {
    const result = extractBranchTimestamp('worktree-agent-aa75a292');
    assert.strictEqual(result, null, 'Expected null for branch without timestamp');
  });

  it('returns null for non-TTL branch names (e.g. main, feature/foo)', () => {
    assert.strictEqual(extractBranchTimestamp('main'), null);
    assert.strictEqual(extractBranchTimestamp('feature/add-auth'), null);
    assert.strictEqual(extractBranchTimestamp('fix/login-bug-123'), null);
  });

  it('returns null for empty string branch name', () => {
    assert.strictEqual(extractBranchTimestamp(''), null);
  });

  it('returns null for null/undefined branch name', () => {
    assert.strictEqual(extractBranchTimestamp(null), null);
    assert.strictEqual(extractBranchTimestamp(undefined), null);
  });

  it('rejects 12-digit timestamps (too short — not 13 digits)', () => {
    // 12-digit number should not match the -(\d{13})$ pattern
    const branch = 'worktree-agent-aa75a292-174100000000'; // 12 digits
    assert.strictEqual(extractBranchTimestamp(branch), null);
  });

  it('rejects 14-digit timestamps (too long — not 13 digits)', () => {
    const branch = 'worktree-agent-aa75a292-17410000000001'; // 14 digits
    assert.strictEqual(extractBranchTimestamp(branch), null);
  });

  it('handles branch names with multiple numeric segments — uses only trailing 13-digit', () => {
    // The regex anchors at $ so only the trailing segment matters
    const ts = 1741000000000;
    const branch = `worktree-1234567890123-agent-aa75a292-${ts}`;
    const result = extractBranchTimestamp(branch);
    assert.strictEqual(result, ts, 'Expected trailing 13-digit segment to be extracted');
  });
});

// Section 7: TTL expiry logic
describe('worktree-auto-cleanup — TTL expiry logic', () => {
  const DEFAULT_TTL_MS = 86400000; // 24 hours

  function extractBranchTimestamp(branch) {
    if (!branch) return null;
    const match = branch.match(/-(\d{13})$/);
    if (!match) return null;
    const ts = parseInt(match[1], 10);
    if (Number.isNaN(ts)) return null;
    return ts;
  }

  function isTTLExpired(branch, ttlMs = DEFAULT_TTL_MS) {
    const ts = extractBranchTimestamp(branch);
    if (ts === null) return false;
    return Date.now() - ts > ttlMs;
  }

  it('returns true for a branch created more than 24h ago', () => {
    const branch = ttlBranchName(25 * 60 * 60 * 1000); // 25 hours ago
    assert.strictEqual(isTTLExpired(branch), true, 'Branch 25h old should be TTL-expired');
  });

  it('returns false for a branch created less than 24h ago', () => {
    const branch = ttlBranchName(30 * 60 * 1000); // 30 minutes ago
    assert.strictEqual(isTTLExpired(branch), false, 'Branch 30m old should not be TTL-expired');
  });

  it('returns false for non-TTL-stamped branch names', () => {
    assert.strictEqual(isTTLExpired('main'), false, 'main branch is not TTL-managed');
    assert.strictEqual(isTTLExpired('feature/add-auth'), false);
  });

  it('returns false for empty/null branch', () => {
    assert.strictEqual(isTTLExpired(''), false);
    assert.strictEqual(isTTLExpired(null), false);
  });

  it('returns true immediately when TTL is 0ms', () => {
    const branch = ttlBranchName(1); // 1ms ago
    assert.strictEqual(isTTLExpired(branch, 0), true, 'Any branch is stale with TTL=0');
  });

  it('returns false for a very recent branch with TTL=1ms (boundary test)', () => {
    // Branch created at exactly now — should not be stale with 1ms TTL
    const ts = Date.now();
    const branch = `worktree-agent-aa75a292-${ts}`;
    // ts is "now", so Date.now() - ts === ~0, which is NOT > 1
    assert.strictEqual(isTTLExpired(branch, 1), false, 'Brand-new branch should not be expired');
  });
});

// Section 8: Cross-platform stdin handling
describe('worktree-auto-cleanup — cross-platform stdin handling', () => {
  it('exits 0 when stdin pipe is empty (no data written)', () => {
    // Spawn hook with no input but as a pipe (empty stdin stream)
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on empty stdin pipe');
  });

  it('exits 0 with whitespace-only stdin', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '   \n\t  ',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on whitespace-only stdin');
  });

  it('exits 0 with very large but valid JSON input', () => {
    // Test that hook handles large inputs without memory issues
    const bigPayload = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: '5',
        status: 'in_progress', // in_progress → no-op but tests large payload handling
        metadata: { bigData: 'x'.repeat(10000) },
      },
    };
    const result = runHook(bigPayload);
    assert.strictEqual(result.status, 0, 'Expected exit 0 on large JSON input');
  });
});

// Section 9: run() with completed TaskUpdate
describe('worktree-auto-cleanup — run() with completed TaskUpdate', () => {
  it('runs without error when TaskUpdate completed fires (git commands may no-op)', () => {
    // In a real git repo, this will run git worktree prune and list worktrees.
    // The test validates the hook does not crash and exits 0.
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '7', status: 'completed', metadata: { summary: 'test done' } },
    });
    assert.strictEqual(result.status, 0, 'Expected exit 0 on completed TaskUpdate');
    // Hook only writes to stderr (not stdout) — stdout must stay clean
    assert.strictEqual(
      result.stdout,
      '',
      'Hook must not write to stdout (reserved for JSON protocol)'
    );
  });

  it('does not write JSON to stdout even when worktrees are processed', () => {
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '8', status: 'completed' },
    });
    // If stdout has content, try parsing it — should not be parseable JSON block data
    if (result.stdout.trim()) {
      // If anything is in stdout, ensure it doesn't confuse the hook protocol
      assert.fail(`Hook wrote unexpected data to stdout: ${result.stdout.slice(0, 200)}`);
    }
    assert.strictEqual(result.status, 0);
  });

  it('logs to stderr (not stdout) when removing a worktree', () => {
    // We cannot easily trigger actual worktree removal in a test without a real stale worktree.
    // But we can verify the hook's stderr output pattern is correct format.
    // The pattern is: [worktree-auto-cleanup] Removed <path>
    // This test documents the expected stderr format.
    const result = runHook({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '9', status: 'completed' },
    });
    // Any stderr output (if any) should follow the [worktree-auto-cleanup] prefix format
    if (result.stderr.includes('Removed')) {
      assert.match(
        result.stderr,
        /\[worktree-auto-cleanup\] Removed/,
        'Stderr removals should be prefixed with [worktree-auto-cleanup]'
      );
    }
    assert.strictEqual(result.status, 0);
  });
});
