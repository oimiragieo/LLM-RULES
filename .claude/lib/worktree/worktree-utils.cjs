#!/usr/bin/env node
'use strict';

/**
 * worktree-utils.cjs
 *
 * Shared utilities for worktree management tools and hooks.
 *
 * Security:
 *   - SE-02: All execFileSync calls use shell: false with array args
 *   - SE-01: All paths normalized with .replace(/\\/g, '/')
 */

const { execFileSync } = require('child_process');

/**
 * Run a git command with shell: false (SE-02).
 *
 * @param {string[]} gitArgs
 * @param {string} [cwd]
 * @returns {string|null} stdout trimmed, or null on error
 */
function gitRun(gitArgs, cwd) {
  try {
    const out = execFileSync('git', gitArgs, {
      cwd: cwd || process.cwd(),
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
    });
    return out ? out.trim() : '';
  } catch (_err) {
    return null;
  }
}

/**
 * Detect the default branch for the repository at `cwd`.
 *
 * Strategy (in order):
 *   1. `git symbolic-ref refs/remotes/origin/HEAD` → strips `refs/remotes/origin/`
 *   2. `git rev-parse --abbrev-ref origin/HEAD` → strips `origin/`
 *   3. Probe: if `main` exists as a branch, return 'main'
 *   4. Probe: if `master` exists as a branch, return 'master'
 *   5. Fallback: 'main'
 *
 * @param {string} [cwd] - Working directory (defaults to process.cwd())
 * @returns {string} Branch name, e.g. 'main' or 'master'
 */
function detectDefaultBranch(cwd) {
  // Strategy 1: symbolic-ref
  const symRef = gitRun(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
  if (symRef) {
    const match = symRef.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Strategy 2: rev-parse
  const revParse = gitRun(['rev-parse', '--abbrev-ref', 'origin/HEAD'], cwd);
  if (revParse && revParse !== 'HEAD') {
    const candidate = revParse.replace(/^origin\//, '');
    if (candidate && candidate !== 'HEAD') {
      return candidate;
    }
  }

  // Strategy 3: probe 'main'
  const mainExists = gitRun(['show-ref', '--verify', '--quiet', 'refs/heads/main'], cwd);
  if (mainExists !== null) {
    return 'main';
  }

  // Strategy 4: probe 'master'
  const masterExists = gitRun(['show-ref', '--verify', '--quiet', 'refs/heads/master'], cwd);
  if (masterExists !== null) {
    return 'master';
  }

  // Fallback
  return 'main';
}

/**
 * Detect whether the current process is running inside a git linked worktree.
 *
 * A linked worktree has a `.git` file (not a directory) pointing to its
 * administrative data under the main repo's `.git/worktrees/` folder.
 *
 * @param {string} [cwd] - Working directory to inspect (defaults to process.cwd())
 * @returns {boolean}
 */
function isUnderWorktreesDir(cwd) {
  const checkDir = cwd || process.cwd();
  // SE-01: normalize path
  const normalizedDir = checkDir.replace(/\\/g, '/');
  // A linked worktree always contains `.claude/worktrees/` segment in path
  // OR has a .git file (not directory) pointing back to the main repo
  const fsModule = require('fs');
  const pathModule = require('path');
  const gitPath = pathModule.join(checkDir, '.git');
  try {
    const stat = fsModule.statSync(gitPath);
    if (stat.isFile()) {
      // This is a linked worktree — .git is a file, not a directory
      return true;
    }
  } catch (_err) {
    // No .git entry — could be nested deeper, check path heuristic
  }
  // Heuristic: path contains .claude/worktrees/ segment
  return normalizedDir.includes('/.claude/worktrees/');
}

/**
 * Pre-creation guard: determine whether a new isolated worktree should be created.
 *
 * Returns { ok: true } when safe to create, or { ok: false, reason: string } when
 * a hard-stop condition is detected.
 *
 * Hard-stop checks (in order):
 *   1. Already inside a linked worktree (nested worktrees are unsupported)
 *   2. Shallow clone (`git rev-parse --is-shallow-repository` returns "true")
 *   3. Detached HEAD (`git symbolic-ref HEAD` exits non-zero)
 *   4. Disk space below 500 MB
 *   5. Windows path length: worktree base path + 60 chars would exceed 200 chars
 *
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] - Project root directory (defaults to process.cwd())
 * @param {string} [opts.windowsPathBase] - Base path for Windows path-length check
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function shouldUseWorktree(opts = {}) {
  const { projectRoot = process.cwd(), windowsPathBase = '' } = opts;

  // Check 1: Already inside a linked worktree
  if (isUnderWorktreesDir(projectRoot)) {
    return { ok: false, reason: 'already-in-worktree: nested worktrees are not supported' };
  }

  // Check 2: Shallow clone
  const shallowResult = gitRun(['rev-parse', '--is-shallow-repository'], projectRoot);
  if (shallowResult === 'true') {
    return { ok: false, reason: 'shallow-clone: git worktree add requires full clone history' };
  }

  // Check 3: Detached HEAD
  const headRef = gitRun(['symbolic-ref', '--quiet', 'HEAD'], projectRoot);
  if (headRef === null) {
    return { ok: false, reason: 'detached-head: cannot create worktree from detached HEAD' };
  }

  // Check 4: Disk space (500 MB minimum)
  // Use a cross-platform approach via child_process
  try {
    const { execFileSync: execSync } = require('child_process');
    let freeBytes = Infinity;
    if (process.platform === 'win32') {
      // Use wmic on Windows (SE-02: shell: false, array args)
      const driveId = 'DeviceID="' + projectRoot.slice(0, 2) + '"';
      const wmicOut = execSync(
        'wmic',
        ['logicaldisk', 'where', driveId, 'get', 'FreeSpace', '/value'],
        { shell: false, windowsHide: true, encoding: 'utf8', timeout: 5000 }
      );
      const match = wmicOut.match(/FreeSpace=(\d+)/);
      if (match) {
        freeBytes = parseInt(match[1], 10);
      }
    } else {
      // Use df on Unix (SE-02: shell: false, array args)
      const dfOut = execSync('df', ['-k', '--output=avail', projectRoot], {
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5000,
      });
      const lines = dfOut.trim().split('\n');
      if (lines.length >= 2) {
        const availKb = parseInt(lines[lines.length - 1].trim(), 10);
        freeBytes = availKb * 1024;
      }
    }
    const MIN_FREE_BYTES = 500 * 1024 * 1024; // 500 MB
    if (freeBytes < MIN_FREE_BYTES) {
      const freeMB = Math.round(freeBytes / (1024 * 1024));
      return {
        ok: false,
        reason: `insufficient-disk-space: only ${freeMB}MB free, need at least 500MB`,
      };
    }
  } catch (_diskErr) {
    // Disk check failure is non-fatal — proceed with worktree creation
  }

  // Check 5: Windows path length (> 200 chars for the worktree base path would be problematic)
  if (process.platform === 'win32') {
    const pathBase = windowsPathBase || projectRoot;
    // A worktree path typically adds ~60 chars (/.claude/worktrees/agent-xxxxxxxx)
    const estimatedPathLength = pathBase.length + 60;
    if (estimatedPathLength > 200) {
      return {
        ok: false,
        reason: `windows-path-too-long: estimated path length ${estimatedPathLength} > 200 chars`,
      };
    }
  }

  return { ok: true };
}

module.exports = { detectDefaultBranch, gitRun, isUnderWorktreesDir, shouldUseWorktree };
