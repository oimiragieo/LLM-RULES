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

// Resolve project root: .claude/hooks/cleanup/ → three levels up
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Safe stdin reader — returns null if stdin is not available or empty.
 * @returns {string|null}
 */
function readStdin() {
  try {
    return require('fs').readFileSync('/dev/stdin', 'utf8');
  } catch (_e) {
    try {
      // Windows fallback: read fd 0 directly
      const buf = Buffer.alloc(65536);
      let total = '';
      let bytesRead;
      const fd = require('fs').openSync('\\\\.\\stdin', 'r');

      while (true) {
        try {
          bytesRead = require('fs').readSync(fd, buf, 0, buf.length, null);
          if (bytesRead === 0) break;
          total += buf.slice(0, bytesRead).toString('utf8');
        } catch (_readErr) {
          break;
        }
      }
      require('fs').closeSync(fd);
      return total || null;
    } catch (_e2) {
      return null;
    }
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
      encoding: 'utf8',
      timeout: 15000,
    });
  } catch (_err) {
    return null;
  }
}

/**
 * Parse `git worktree list --porcelain` output.
 * @returns {{ worktreePath: string, HEAD: string, branch: string }[]}
 */
function listWorktrees() {
  const raw = git(['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const blocks = raw.trim().split(/\n\n+/);
  const worktrees = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const wtLine = lines.find(l => l.startsWith('worktree '));
    const headLine = lines.find(l => l.startsWith('HEAD '));
    const branchLine = lines.find(l => l.startsWith('branch '));
    if (!wtLine) continue;
    // SE-01: normalize backslashes
    const worktreePath = wtLine.slice('worktree '.length).trim().replace(/\\/g, '/');
    const HEAD = headLine ? headLine.slice('HEAD '.length).trim() : '';
    const branch = branchLine ? branchLine.slice('branch refs/heads/'.length).trim() : '';
    worktrees.push({ worktreePath, HEAD, branch });
  }
  return worktrees;
}

/**
 * Check if a branch is stale (fully merged into main).
 * @param {string} branch
 * @returns {boolean}
 */
function isStale(branch) {
  if (!branch) return false;
  const result = git(['log', '--oneline', `main..${branch}`]);
  if (result === null) return false;
  return result.trim().length === 0;
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
    // SE-02: safe parse to avoid prototype pollution
    const parsed = JSON.parse(raw);
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
  const normalizedProjectRoot = PROJECT_ROOT.replace(/\\/g, '/');
  const normalizedWorktreesDir = normalizedProjectRoot + '/.claude/worktrees/';

  // Step 3: git worktree prune (removes admin entries for missing paths)
  git(['worktree', 'prune']);

  // Step 4: List worktrees and remove any stale ones
  const worktrees = listWorktrees();
  const normalizedCwd = process.cwd().replace(/\\/g, '/');

  for (const wt of worktrees) {
    const { worktreePath, branch } = wt;

    // Only process worktrees under .claude/worktrees/
    if (!worktreePath.startsWith(normalizedWorktreesDir)) continue;
    // Safety: never remove main project root
    if (worktreePath === normalizedProjectRoot) continue;
    // Safety: never remove current session's worktree (Windows EBUSY risk)
    if (normalizedCwd.startsWith(worktreePath)) continue;
    // Safety: skip if no branch info
    if (!branch) continue;

    if (isStale(branch)) {
      const nativePath = worktreePath.replace(/\//g, path.sep);
      // SE-02: shell: false with array args
      git(['worktree', 'remove', nativePath, '--force']);
      process.stderr.write(`[worktree-auto-cleanup] Removed ${worktreePath}\n`);
    }
  }
}

// --- Entry point ---
// SE-03: Outer try/catch guarantees exit 0 on any unexpected error
try {
  run();
} catch (_outerErr) {
  // Log to stderr only — never stdout (reserved for JSON hook protocol)
  process.stderr.write(
    `[worktree-auto-cleanup] Non-fatal error: ${_outerErr && _outerErr.message ? _outerErr.message : String(_outerErr)}\n`
  );
}

// SE-03: Always exit 0 — this hook MUST NOT block TaskUpdate
process.exit(0);
