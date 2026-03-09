'use strict';

/**
 * worktree-context.cjs
 *
 * Utilities for detecting Claude worktree context in hook scripts.
 * Used to determine if a hook is running inside a subagent worktree,
 * and to measure nesting depth and active worktree count.
 *
 * @module worktree-context
 */

const path = require('path');
const fs = require('fs');

/**
 * Get the worktree nesting depth of a given CWD path.
 *
 * Depth 0 = not in a worktree (router context)
 * Depth 1 = in a level-1 worktree (normal subagent)
 * Depth 2+ = nested worktrees (dangerous — recursive nesting)
 *
 * Detection relies on the canonical Claude worktree path segment:
 *   `/.claude/worktrees/`
 *
 * @param {string} [cwd] - Current working directory (defaults to process.cwd())
 * @returns {number} Worktree nesting depth
 */
function getWorktreeDepth(cwd = process.cwd()) {
  if (!cwd) return 0;
  // SE-01: Normalize backslashes to forward slashes for cross-platform safety
  const normalized = String(cwd).replace(/\\/g, '/');
  const matches = normalized.match(/\/\.claude\/worktrees\//g);
  return matches ? matches.length : 0;
}

/**
 * Returns true if cwd is inside any Claude worktree (depth >= 1).
 *
 * @param {string} [cwd] - Current working directory (defaults to process.cwd())
 * @returns {boolean}
 */
function isInWorktree(cwd = process.cwd()) {
  return getWorktreeDepth(cwd) >= 1;
}

/**
 * Find the project root by stripping the worktree path from cwd.
 * If not in a worktree, returns the normalized cwd unchanged.
 *
 * @param {string} [cwd] - Current working directory (defaults to process.cwd())
 * @returns {string} Project root path (forward-slash normalized)
 */
function findProjectRoot(cwd = process.cwd()) {
  if (!cwd) return '';
  // SE-01: Normalize backslashes first
  const normalized = String(cwd).replace(/\\/g, '/');
  const worktreesIdx = normalized.indexOf('/.claude/worktrees/');
  if (worktreesIdx !== -1) {
    return normalized.slice(0, worktreesIdx);
  }
  return normalized;
}

/**
 * Count active worktrees (subdirectories in .claude/worktrees/).
 *
 * @param {string|undefined} [projectRoot] - Explicit project root path.
 *   If undefined, auto-detected from cwd.
 * @param {string} [cwd] - Used to auto-detect project root when projectRoot is omitted.
 *   Defaults to process.cwd().
 * @returns {number} Number of active worktree directories (0 on any error)
 */
function getActiveWorktreeCount(projectRoot, cwd = process.cwd()) {
  try {
    if (projectRoot === null) return 0;
    const root = projectRoot || findProjectRoot(cwd);
    if (!root) return 0;
    // Reconstruct OS-native path from forward-slash normalized root
    const worktreesDir = path.join(root.replace(/\//g, path.sep), '.claude', 'worktrees');
    if (!fs.existsSync(worktreesDir)) return 0;
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).length;
  } catch (_err) {
    return 0;
  }
}

module.exports = {
  getWorktreeDepth,
  isInWorktree,
  findProjectRoot,
  getActiveWorktreeCount,
};
