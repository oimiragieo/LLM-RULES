'use strict';

/**
 * cli-client.cjs — Programmatic wrapper around the `gh` CLI for PR operations.
 *
 * All GitHub operations are executed via `child_process.execSync` so that:
 *   - No additional npm dependencies are needed (no Octokit, no GitHub API lib).
 *   - The implementation is testable via the `_execSync` injection point.
 *
 * Usage:
 *   const { GitHubCLI } = require('.claude/lib/github/cli-client.cjs');
 *   const gh = new GitHubCLI({ cwd: '/path/to/repo' });
 *   const pr = await gh.createPR({ title: 'My PR', body: '…', base: 'main', head: 'feature' });
 *   console.log(pr.url, pr.number);
 */

const { execSync: _defaultExecSync } = require('node:child_process');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Quote a string argument for safe shell interpolation.
 *
 * On POSIX: wraps in single quotes with internal single-quotes escaped.
 * On Windows (cmd.exe): wraps in double quotes with internal double-quotes
 * escaped using the cmd.exe convention (`""`).
 *
 * @private
 * @param {string} str - Value to quote
 * @returns {string}
 */
function q(str) {
  const s = String(str == null ? '' : str);
  if (process.platform === 'win32') {
    // cmd.exe: double-quote wrapping, internal `"` escaped as `""`
    return '"' + s.replace(/"/g, '""') + '"';
  }
  // POSIX: single-quote wrapping, internal `'` escaped as `'\''`
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Map GitHub review event names to the corresponding gh CLI flag.
 *
 * @private
 * @param {string} event - One of APPROVE, REQUEST_CHANGES, COMMENT
 * @returns {string} - CLI flag, e.g. '--approve'
 */
function reviewEventFlag(event) {
  const map = {
    APPROVE: '--approve',
    REQUEST_CHANGES: '--request-changes',
    COMMENT: '--comment',
  };
  const flag = map[String(event).toUpperCase()];
  if (!flag)
    throw new Error(
      `Unknown review event: ${event}. Expected APPROVE, REQUEST_CHANGES, or COMMENT.`
    );
  return flag;
}

/**
 * Validate a PR number is a positive integer before interpolating it into a
 * command string. Prevents shell injection via a malicious "prNumber" value.
 *
 * @private
 * @param {number|string} value
 * @returns {number}
 */
function prNum(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid PR number: ${value}`);
  }
  return n;
}

/**
 * Map a merge method to its gh CLI flag from a strict allowlist.
 * Prevents injection via a crafted "method" value.
 *
 * @private
 * @param {string} method - One of merge, squash, rebase
 * @returns {string} CLI flag, e.g. '--squash'
 */
function mergeMethodFlag(method) {
  const map = { merge: '--merge', squash: '--squash', rebase: '--rebase' };
  const flag = map[String(method).toLowerCase()];
  if (!flag) {
    throw new Error(`Unknown merge method: ${method}. Expected merge, squash, or rebase.`);
  }
  return flag;
}

// ---------------------------------------------------------------------------
// GitHubCLI class
// ---------------------------------------------------------------------------

class GitHubCLI {
  /**
   * @param {object} [opts]
   * @param {string} [opts.cwd]        - Working directory for gh CLI calls (defaults to process.cwd())
   * @param {Function} [opts._execSync] - Injected execSync for testing (defaults to child_process.execSync)
   */
  constructor({ cwd, _execSync } = {}) {
    this._cwd = cwd || process.cwd();
    this._execSync = _execSync || _defaultExecSync;
  }

  // -------------------------------------------------------------------------
  // Internal execution helper
  // -------------------------------------------------------------------------

  /**
   * Execute a shell command via `_execSync` and return its stdout as a string.
   * On non-zero exit code, throws a structured error with stderr, exitCode, and command.
   *
   * @private
   * @param {string} cmd - Full command string to execute
   * @returns {string} - stdout output
   */
  _exec(cmd) {
    try {
      const result = this._execSync(cmd, {
        cwd: this._cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Handle both string (encoding: 'utf8') and Buffer results
      if (typeof result === 'string') return result;
      if (result && typeof result.toString === 'function') return result.toString('utf8');
      return '';
    } catch (err) {
      // Normalize stderr (may be Buffer or string)
      let stderr = '';
      if (err.stderr) {
        stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr.toString('utf8');
      } else if (err.message) {
        stderr = err.message;
      }

      const ghError = new Error(`gh CLI error: ${stderr || err.message}`);
      ghError.stderr = stderr;
      ghError.exitCode = typeof err.status === 'number' ? err.status : err.code || 1;
      ghError.command = cmd;
      throw ghError;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a pull request via `gh pr create`.
   *
   * @param {object} opts
   * @param {string} opts.title - PR title
   * @param {string} opts.body  - PR description body
   * @param {string} opts.base  - Base branch name
   * @param {string} opts.head  - Head branch name
   * @returns {{ url: string, number: number }}
   */
  createPR({ title, body, base, head }) {
    const cmd = [
      'gh pr create',
      '--title',
      q(title),
      '--body',
      q(body != null ? body : ''),
      '--base',
      q(base),
      '--head',
      q(head),
      '--json',
      'url,number',
    ].join(' ');
    const output = this._exec(cmd);
    return safeParseJSON(output, {});
  }

  /**
   * Add a comment to a pull request via `gh pr comment`.
   *
   * @param {number} prNumber - Pull request number
   * @param {string} body     - Comment body text
   */
  commentOnPR(prNumber, body) {
    const cmd = `gh pr comment ${prNum(prNumber)} --body ${q(body)}`;
    this._exec(cmd);
  }

  /**
   * Retrieve the diff for a pull request via `gh pr diff`.
   *
   * @param {number} prNumber - Pull request number
   * @returns {string} - Raw unified diff text
   */
  getPRDiff(prNumber) {
    const cmd = `gh pr diff ${prNum(prNumber)}`;
    return this._exec(cmd);
  }

  /**
   * List pull requests via `gh pr list --json`.
   *
   * @param {object} [opts]
   * @param {string} [opts.state] - Filter by state: open, closed, merged, all
   * @returns {Array<{number: number, title: string, state: string, author: object}>}
   */
  listPRs({ state } = {}) {
    let cmd = 'gh pr list --json number,title,state,author';
    if (state != null) cmd += ` --state ${q(state)}`;
    const output = this._exec(cmd);
    return safeParseJSON(output, {});
  }

  /**
   * Get a single pull request via `gh pr view --json`.
   *
   * @param {number} number - Pull request number
   * @returns {object} - Full PR object
   */
  getPR(number) {
    const cmd = `gh pr view ${prNum(number)} --json number,title,state,author,body,url,headRefName,baseRefName`;
    const output = this._exec(cmd);
    return safeParseJSON(output, {});
  }

  /**
   * Submit a review on a pull request via `gh pr review`.
   *
   * @param {number} prNumber - Pull request number
   * @param {object} [opts]
   * @param {string} [opts.body]  - Review body text
   * @param {string} [opts.event] - Review event: APPROVE, REQUEST_CHANGES, or COMMENT
   */
  createReview(prNumber, { body, event } = {}) {
    let cmd = `gh pr review ${prNum(prNumber)}`;
    if (event != null) cmd += ` ${reviewEventFlag(event)}`;
    if (body != null) cmd += ` --body ${q(body)}`;
    this._exec(cmd);
  }

  /**
   * Merge a pull request via `gh pr merge`.
   *
   * @param {number} prNumber - Pull request number
   * @param {object} [opts]
   * @param {string} [opts.method] - Merge method: merge, squash, or rebase
   */
  mergePR(prNumber, { method } = {}) {
    let cmd = `gh pr merge ${prNum(prNumber)}`;
    if (method != null) cmd += ` ${mergeMethodFlag(method)}`;
    this._exec(cmd);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { GitHubCLI };
