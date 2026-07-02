#!/usr/bin/env node
'use strict';
/**
 * worktree-auto-cleanup.cjs
 *
 * PostToolUse hook: automatically clean up stale agent worktrees when
 * an agent marks its task as completed via TaskUpdate.
 *
 * Trigger: PostToolUse on TaskUpdate where status === 'completed'
 *
 * Algorithm:
 *   1. Read hook input from stdin (JSON protocol)
 *   2. Guard: only act on TaskUpdate events with status === 'completed'
 *   3. Run `git worktree prune` to remove stale administrative entries
 *   4. List worktrees under .claude/worktrees/ and remove any whose branch
 *      has been fully merged into main (zero unique commits)
 *   5. Exit 0 always — this hook MUST NOT block the TaskUpdate pipeline (SE-03)
 *
 * Security:
 *   - SE-01: All paths normalized with .replace(/\\/g, '/')
 *   - SE-02: All execFileSync calls use shell: false with array args
 *   - SE-03: Always exits 0 — errors logged to stderr only
 */

const { execFileSync } = require('child_process');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { detectDefaultBranch } = require('../../lib/worktree/worktree-utils.cjs');

// Git calls in hooks must stay short; cleanup is best-effort and must not block workflows.
const GIT_TIMEOUT_MS = parseInt(process.env.WORKTREE_GIT_TIMEOUT_MS ?? '5000', 10);

// TTL for worktree branches (default 24 hours). Override with WORKTREE_TTL_MS env var.
const WORKTREE_TTL_MS = parseInt(process.env.WORKTREE_TTL_MS ?? '86400000', 10);

// TTL for delegation PID files (default 24 hours).
const DELEGATION_PID_TTL_MS = parseInt(process.env.DELEGATION_PID_TTL_MS ?? '86400000', 10);

// Resolve project root: .claude/hooks/cleanup/ → three levels up
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Resolve memory directory for delegation PID cleanup
const MEMORY_DIR = path.resolve(PROJECT_ROOT, '.claude', 'context', 'memory');

/**
 * Safe stdin reader — returns null if stdin is not available or empty.
 *
 * Uses fd 0 directly (cross-platform). On Windows, /dev/stdin is unavailable
 * (ENOENT), so we always use readFileSync(0) which works on both Windows and Unix.
 *
 * @returns {string|null}
 */
function readStdin() {
  try {
    // fd 0 is the POSIX/Windows standard input file descriptor — works on all platforms.
    // This avoids the /dev/stdin path which fails on Windows with ENOENT.
    return require('fs').readFileSync(0, 'utf8');
  } catch (_e) {
    return null;
  }
}

/**
 * Run a git command with shell: false (SE-02).
 *
 * @param {string[]} gitArgs
 * @param {string} [cwd]
 * @returns {string|null} stdout, or null on error
 */
function git(gitArgs, cwd = PROJECT_ROOT) {
  try {
    return execFileSync('git', gitArgs, {
      cwd,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: Number.isFinite(GIT_TIMEOUT_MS) && GIT_TIMEOUT_MS > 0 ? GIT_TIMEOUT_MS : 5000,
    });
  } catch (_err) {
    return null;
  }
}

/**
 * Parse `git worktree list --porcelain` output.
 * @param {string} raw
 * @returns {{ worktreePath: string, HEAD: string, branch: string, locked: boolean, lockedReason: string }[]}
 */
function parseWorktreeList(raw) {
  if (!raw) return [];
  const blocks = raw.trim().split(/\n\n+/);
  const worktrees = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const wtLine = lines.find(l => l.startsWith('worktree '));
    const headLine = lines.find(l => l.startsWith('HEAD '));
    const branchLine = lines.find(l => l.startsWith('branch '));
    const lockedLine = lines.find(l => l.startsWith('locked'));
    if (!wtLine) continue;
    // SE-01: normalize backslashes
    const worktreePath = wtLine.slice('worktree '.length).trim().replace(/\\/g, '/');
    const HEAD = headLine ? headLine.slice('HEAD '.length).trim() : '';
    const branch = branchLine ? branchLine.slice('branch refs/heads/'.length).trim() : '';
    const lockedReason = lockedLine ? lockedLine.slice('locked'.length).trim() : '';
    worktrees.push({ worktreePath, HEAD, branch, locked: Boolean(lockedLine), lockedReason });
  }
  return worktrees;
}

/**
 * List git worktrees registered for this repository.
 * @returns {{ worktreePath: string, HEAD: string, branch: string, locked: boolean, lockedReason: string }[]}
 */
function listWorktrees() {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain']));
}

/**
 * Check if a path is inside a directory, respecting path segment boundaries.
 *
 * @param {string} candidatePath
 * @param {string} directoryPath
 * @returns {boolean}
 */
function isPathInsideDirectory(candidatePath, directoryPath) {
  if (!candidatePath || !directoryPath) return false;
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedDirectory = path.resolve(directoryPath);
  const relative = path.relative(resolvedDirectory, resolvedCandidate);

  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Extract the creation timestamp from a TTL-stamped branch name.
 *
 * Convention: `worktree-agent-<id>-<unixTimestampMs>`
 * Example:    `worktree-agent-aa75a292-1741000000000`
 *
 * @param {string} branch - Branch name to inspect.
 * @returns {number|null} Unix timestamp in milliseconds, or null if not TTL-stamped.
 */
function extractBranchTimestamp(branch) {
  if (!branch) return null;
  // Match trailing numeric segment (13-digit unix ms timestamp)
  const match = branch.match(/-(\d{13})$/);
  if (!match) return null;
  const ts = parseInt(match[1], 10);
  if (Number.isNaN(ts)) return null;
  return ts;
}

/**
 * Check if a branch has exceeded the TTL (time-to-live) limit.
 *
 * @param {string} branch - Branch name (may contain embedded timestamp).
 * @returns {boolean} true if TTL-stamped branch is older than WORKTREE_TTL_MS.
 */
function isTTLExpired(branch) {
  const ts = extractBranchTimestamp(branch);
  if (ts === null) return false; // no timestamp → not TTL-managed
  return Date.now() - ts > WORKTREE_TTL_MS;
}

/**
 * Check if a branch is stale (fully merged into the default branch) OR TTL-expired.
 * @param {string} branch
 * @returns {boolean}
 */
function isStale(branch, defaultBranch = detectDefaultBranch(PROJECT_ROOT)) {
  if (!branch) return false;
  // TTL-based check: branch older than WORKTREE_TTL_MS is always stale
  if (isTTLExpired(branch)) return true;
  // Merge-based check: zero unique commits compared to default branch
  const result = git(['log', '--oneline', `${defaultBranch}..${branch}`]);
  if (result === null) return false;
  return result.trim().length === 0;
}

/**
 * Clean up stale delegation PID files older than DELEGATION_PID_TTL_MS (default 24 hours).
 *
 * These files are created during agent task delegation to track subprocess PIDs.
 * They accumulate over time and should be cleaned up to prevent disk bloat.
 *
 * @returns {number} Number of PID files removed
 */
function cleanupStaleDelegationPids() {
  const fs = require('fs');
  let removed = 0;

  try {
    if (!fs.existsSync(MEMORY_DIR)) return removed;

    const entries = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
    const now = Date.now();
    const pidPattern = /^delegations\.pid-.*\.json$/;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!pidPattern.test(entry.name)) continue;

      const filePath = path.join(MEMORY_DIR, entry.name);
      try {
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > DELEGATION_PID_TTL_MS) {
          fs.unlinkSync(filePath);
          removed += 1;
          process.stderr.write(`[worktree-auto-cleanup] Removed stale PID file: ${entry.name}\n`);
        }
      } catch (_statErr) {
        // File may have been removed by another process; ignore
      }
    }
  } catch (_dirErr) {
    // Memory directory may not exist; ignore
  }

  return removed;
}

/**
 * Main hook logic — wrapped in outer try/catch so any error exits 0 (SE-03).
 */
function run() {
  // Step 1: Read stdin JSON
  let input;
  try {
    const raw = readStdin();
    if (!raw || !raw.trim()) return; // no input — no-op
    // SE-02: safeParseJSON to avoid prototype pollution
    const parsed = safeParseJSON(raw, null);
    if (!parsed || typeof parsed !== 'object') {
      return; // malformed stdin — no-op
    }
    input = parsed;
  } catch (_parseErr) {
    // malformed stdin — exit 0, no-op
    return;
  }

  // Step 2: Guard — only act on TaskUpdate with status === 'completed'
  const toolName = input.tool_name || '';
  const params = input.tool_input || input.tool_params || input.params || {};
  const status = params.status || '';

  if (toolName !== 'TaskUpdate' || status !== 'completed') {
    return; // not a completion event — no-op
  }

  // SE-01: normalize paths for cross-platform comparisons
  const worktreesDir = path.join(PROJECT_ROOT, '.claude', 'worktrees');

  // Step 3: git worktree prune (removes admin entries for missing paths)
  git(['worktree', 'prune']);

  // Step 4: List worktrees and remove any stale ones
  const worktrees = listWorktrees();
  const defaultBranch = detectDefaultBranch(PROJECT_ROOT);

  for (const wt of worktrees) {
    const { worktreePath, branch, locked } = wt;

    // Use path.resolve() to guarantee absolute, OS-specific path normalization for all sources
    const resolvedWtPath = path.resolve(worktreePath);
    const resolvedCwd = path.resolve(process.cwd());

    // Only process worktrees securely under the designated directory
    if (!isPathInsideDirectory(resolvedWtPath, worktreesDir)) continue;

    // Do not touch explicitly locked worktrees; git uses this for active or protected sessions.
    if (locked) continue;

    // Safety: bulletproof check to ensure we never delete the active session's worktree (Windows EBUSY risk + Stop hook crash)
    const wtLower = resolvedWtPath.replace(/\\/g, '/').toLowerCase();
    const cwdLower = resolvedCwd.replace(/\\/g, '/').toLowerCase();
    if (cwdLower === wtLower || cwdLower.startsWith(wtLower + '/')) {
      continue;
    }

    // Safety: skip if no branch info
    if (!branch) continue;

    // Safety: Never delete a worktree that was created less than 2 hours ago.
    // This prevents agents from deleting OTHER active agents' worktrees that haven't committed yet.
    let ts = extractBranchTimestamp(branch);
    if (!ts) {
      try {
        const stat = require('fs').statSync(resolvedWtPath);
        ts = stat.birthtimeMs || stat.mtimeMs;
      } catch (_statErr) {
        // Ignore stats error
      }
    }
    if (ts && Date.now() - ts < 2 * 60 * 60 * 1000) {
      continue;
    }

    if (isStale(branch, defaultBranch)) {
      const nativePath = worktreePath.replace(/\//g, path.sep);
      // SE-02: shell: false with array args
      const removed = git(['worktree', 'remove', nativePath, '--force']);
      if (removed !== null) {
        process.stderr.write(`[worktree-auto-cleanup] Removed ${worktreePath}\n`);
      }
    }
  }

  // Step 5: Clean up stale delegation PID files (older than 24 hours)
  cleanupStaleDelegationPids();
}

if (require.main === module) {
  // Only run and exit when executed directly (as a hook)
  try {
    run();
  } catch (_outerErr) {
    process.stderr.write(`[worktree-auto-cleanup] Outer error: ${_outerErr.message}\n`);
  }
  process.exit(0);
} else {
  // When required (for testing), export internals only
  module.exports._test_internals = {
    extractBranchTimestamp,
    isTTLExpired,
    isPathInsideDirectory,
    parseWorktreeList,
    readStdin,
  };
}
