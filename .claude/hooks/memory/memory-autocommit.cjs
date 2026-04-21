#!/usr/bin/env node
/* Agent: developer | Task: #P03 | Session: 2026-04-19 */
/**
 * Hook: memory-autocommit.cjs
 *
 * Stop-event hook. Auto-commits deltas to `.claude/context/memory/**\/*.{md,json}`
 * so session learnings are persisted without manual effort. Never blocks Stop:
 * exits 0 on ALL failure paths.
 *
 * Design constraints (Phase 0.6 P03 / D2):
 * - Allowlist: ONLY `.claude/context/memory/**\/*.md` and `**\/*.json` are staged.
 * - Branch guard: refuses to commit on `main` or `master`.
 * - Idempotent: if nothing dirty in the allowlist, exit silently.
 * - Security: spawnSync with `shell:false` and array args per SE-01/SE-02.
 *
 * Registered in `.claude/settings.json` under `hooks.Stop[]`.
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MEMORY_DIR_REL = path.posix.join('.claude', 'context', 'memory');
const PROTECTED_BRANCHES = new Set(['main', 'master']);
const COMMIT_MESSAGE =
  'chore(memory): auto-persist session learnings [skip ci]\n\n' +
  'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>\n';

/**
 * Spawn a git subprocess safely. Never throws; returns the full result.
 */
function gitRun(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    shell: false,
    encoding: 'utf8',
    windowsHide: true,
  });
}

/**
 * Return true iff `cwd` is inside a git work tree.
 */
function isInsideGitRepo(cwd) {
  const res = gitRun(cwd, ['rev-parse', '--is-inside-work-tree']);
  return res.status === 0 && (res.stdout || '').trim() === 'true';
}

/**
 * Return current branch name, or null on detached HEAD / failure.
 */
function currentBranch(cwd) {
  const res = gitRun(cwd, ['symbolic-ref', '--short', 'HEAD']);
  if (res.status !== 0) return null;
  return (res.stdout || '').trim() || null;
}

/**
 * Normalize a porcelain status line path (handles quoted / renamed entries).
 * We only care about the path itself; rename form is `orig -> new` — take the new.
 */
function parseStatusPath(rawPath) {
  if (!rawPath) return null;
  let p = rawPath.trim();
  // handle "orig -> new"
  const arrowIdx = p.indexOf(' -> ');
  if (arrowIdx !== -1) p = p.slice(arrowIdx + 4);
  // strip surrounding quotes from git's C-style quoting
  if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  return p.replace(/\\/g, '/');
}

/**
 * Check whether a repo-relative path lies inside the memory allowlist.
 * Allowlist: starts with `.claude/context/memory/` AND ends with `.md` or `.json`.
 */
function isAllowlistedPath(repoRelPath) {
  if (!repoRelPath) return false;
  const p = repoRelPath.replace(/\\/g, '/');
  if (!p.startsWith(`${MEMORY_DIR_REL}/`)) return false;
  const lower = p.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.json');
}

/**
 * Collect allowlisted dirty paths in the memory dir.
 * Returns an array of repo-relative POSIX paths.
 */
function collectAllowlistedDeltas(cwd) {
  // Scope status to the memory dir to minimize surface.
  // `-uall` expands untracked directories into individual file paths so the
  // allowlist filter can inspect each entry by extension.
  const res = gitRun(cwd, ['status', '--porcelain', '-uall', '--', MEMORY_DIR_REL]);
  if (res.status !== 0) return [];
  const lines = (res.stdout || '').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    // Porcelain v1: first two chars are status codes, then a space, then path.
    // We accept any non-ignored status, including untracked ('??').
    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    const raw = line.slice(3);
    if (status === '!!') continue; // ignored
    const p = parseStatusPath(raw);
    if (isAllowlistedPath(p)) out.push(p);
  }
  // de-dupe while preserving order
  return Array.from(new Set(out));
}

/**
 * Main API: autocommit any pending memory deltas.
 * @param {{ cwd?: string, logger?: { warn?: Function, info?: Function } }} opts
 * @returns {{ committed: boolean, reason?: string, sha?: string, files?: string[] }}
 */
function autocommitMemoryDeltas(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const logger = opts.logger || {};

  try {
    if (!isInsideGitRepo(cwd)) {
      return { committed: false, reason: 'not-git-repo' };
    }

    const branch = currentBranch(cwd);
    if (!branch) {
      return { committed: false, reason: 'detached-head' };
    }
    if (PROTECTED_BRANCHES.has(branch)) {
      return { committed: false, reason: 'protected-branch' };
    }

    const deltas = collectAllowlistedDeltas(cwd);
    if (deltas.length === 0) {
      return { committed: false, reason: 'nothing-to-commit' };
    }

    // Stage ONLY the allowlisted paths explicitly. No `git add -A`.
    const addRes = gitRun(cwd, ['add', '--', ...deltas]);
    if (addRes.status !== 0) {
      if (logger.warn) logger.warn(`memory-autocommit: git add failed: ${addRes.stderr}`);
      return { committed: false, reason: 'stage-failed' };
    }

    // Verify we actually have something staged (defense-in-depth: if a file
    // was autoclean'd between status and add, we'd produce an empty commit).
    const diffRes = gitRun(cwd, ['diff', '--cached', '--name-only']);
    const staged = (diffRes.stdout || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    if (staged.length === 0) {
      return { committed: false, reason: 'nothing-to-commit' };
    }

    const commitRes = gitRun(cwd, ['commit', '-m', COMMIT_MESSAGE]);
    if (commitRes.status !== 0) {
      if (logger.warn) logger.warn(`memory-autocommit: git commit failed: ${commitRes.stderr}`);
      return { committed: false, reason: 'commit-failed' };
    }

    const sha = (gitRun(cwd, ['rev-parse', 'HEAD']).stdout || '').trim() || null;
    return { committed: true, sha, files: deltas };
  } catch (err) {
    // Never let a Stop hook throw.
    if (logger.warn) {
      logger.warn(`memory-autocommit: unexpected error: ${err && err.message}`);
    } else {
      process.stderr.write(`memory-autocommit: unexpected error: ${err && err.message}\n`);
    }
    return { committed: false, reason: 'unexpected-error' };
  }
}

module.exports = {
  autocommitMemoryDeltas,
  // Exported for tests/observability only. Not part of public API.
  _internals: {
    isAllowlistedPath,
    parseStatusPath,
    PROTECTED_BRANCHES,
    MEMORY_DIR_REL,
  },
};

// CLI entrypoint — Stop event invokes `node .claude/hooks/memory/memory-autocommit.cjs`.
// Exit 0 on every path: Stop hooks must NEVER block.
if (require.main === module) {
  try {
    const result = autocommitMemoryDeltas();
    if (result && result.committed && result.sha) {
      process.stderr.write(
        `memory-autocommit: committed ${result.files.length} file(s) as ${result.sha.slice(0, 7)}\n`
      );
    }
  } catch (err) {
    process.stderr.write(`memory-autocommit: fatal: ${err && err.message}\n`);
  }
  process.exit(0);
}
