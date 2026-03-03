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

module.exports = { detectDefaultBranch, gitRun };
