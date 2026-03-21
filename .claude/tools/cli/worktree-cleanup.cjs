#!/usr/bin/env node
'use strict';

/**
 * worktree-cleanup.cjs
 *
 * CLI maintenance tool: comprehensive cleanup for stale agent worktrees and
 * orphaned worktree branches.
 *
 * This tool addresses the full stale-worktree lifecycle:
 *   1. ORPHANED BRANCHES — `worktree-agent-*` branches with no active worktree
 *      directory (the branch was left behind after the worktree was deleted).
 *   2. STALE WORKTREE DIRECTORIES — `.claude/worktrees/` directories that are
 *      fully merged into main or older than TTL.
 *
 * Root cause analysis (why stale branches persist):
 *   - `worktree-auto-cleanup.cjs` removes worktree directories but may miss
 *     branches when branches lack TTL timestamps (e.g. `worktree-agent-<8char>`).
 *   - `worktree-prune-on-start.cjs` runs `git worktree prune` (admin entries only)
 *     but does NOT delete the backing branches.
 *   - Result: orphaned branches accumulate over sessions.
 *
 * Safety rules:
 *   - Never deletes branches that have unique commits vs main (unless --force).
 *   - Never deletes branches newer than MIN_AGE_MS (2 hours default) as a shield
 *     against deleting active agents' branches.
 *   - Never deletes the branch of the current checked-out worktree.
 *   - Dry-run by default unless --execute is passed.
 *
 * Usage:
 *   node .claude/tools/cli/worktree-cleanup.cjs [options]
 *
 * Options:
 *   --execute     Actually delete branches and worktrees (default: dry-run)
 *   --dry-run     Explicit dry-run (default)
 *   --force       Delete branches even with unique commits (DANGEROUS)
 *   --age <ms>    Minimum branch age in ms before eligible for cleanup (default: 7200000 = 2h)
 *   --verbose     Show detailed output
 *   --help        Show this help
 *
 * Exit codes:
 *   0  Success (or dry-run completed)
 *   1  One or more errors occurred
 *
 * Security:
 *   SE-01: All paths normalized with .replace(/\\/g, '/')
 *   SE-02: All execFileSync calls use shell: false with array args
 *   SE-03: Always exits 0 on unexpected errors — errors logged to stderr
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Project root: .claude/tools/cli/ → three levels up */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Location of agent worktree directories */
const WORKTREES_DIR = path.join(PROJECT_ROOT, '.claude', 'worktrees');

/** Default minimum age (ms) before a branch is eligible for cleanup: 2 hours */
const DEFAULT_MIN_AGE_MS = 2 * 60 * 60 * 1000;

/** Branch name pattern for agent worktree branches */
const WORKTREE_BRANCH_PATTERN = /^worktree-agent-/;

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`worktree-cleanup.cjs — Comprehensive agent worktree cleanup

Usage:
  node .claude/tools/cli/worktree-cleanup.cjs [options]

Options:
  --execute     Actually delete branches and worktrees (default: dry-run)
  --dry-run     Explicit dry-run (default, shows what WOULD be deleted)
  --force       Delete branches even with unique commits (DANGEROUS)
  --age <ms>    Min branch age in ms before eligible (default: 7200000 = 2h)
  --verbose     Show detailed output including kept items
  --help        Show this help

Examples:
  # Preview what would be cleaned up (safe)
  node .claude/tools/cli/worktree-cleanup.cjs

  # Actually clean up stale branches and worktrees
  node .claude/tools/cli/worktree-cleanup.cjs --execute

  # Clean up with longer protection window (24 hours)
  node .claude/tools/cli/worktree-cleanup.cjs --execute --age 86400000

What it cleans:
  1. Orphaned branches (worktree-agent-* branches with no worktree directory)
  2. Stale worktree directories (merged into main OR older than 24h TTL)
`);
  process.exit(0);
}

/** If true, actually perform deletions. If false (default), only print what would happen. */
const DRY_RUN = !args.includes('--execute');

/** If true, force-delete branches even if they have unique commits (use with care). */
const FORCE_DELETE = args.includes('--force');

/** Minimum branch age before eligible for cleanup */
const ageArgIdx = args.indexOf('--age');
const MIN_AGE_MS =
  ageArgIdx !== -1 && args[ageArgIdx + 1]
    ? parseInt(args[ageArgIdx + 1], 10) || DEFAULT_MIN_AGE_MS
    : DEFAULT_MIN_AGE_MS;

/** Verbose output */
const VERBOSE = args.includes('--verbose');

// ─── Git Helpers ──────────────────────────────────────────────────────────────

/**
 * Run a git command with shell: false (SE-02).
 *
 * @param {string[]} gitArgs
 * @param {string} [cwd]
 * @returns {string|null} stdout trimmed, or null on error
 */
function git(gitArgs, cwd = PROJECT_ROOT) {
  try {
    const out = execFileSync('git', gitArgs, {
      cwd,
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
 * Detect the default branch (main or master).
 * @returns {string}
 */
function detectDefaultBranch() {
  const symRef = git(['symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (symRef) {
    const match = symRef.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match && match[1]) return match[1];
  }
  const revParse = git(['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  if (revParse && revParse !== 'HEAD') {
    const candidate = revParse.replace(/^origin\//, '');
    if (candidate && candidate !== 'HEAD') return candidate;
  }
  // Probe main/master
  if (git(['show-ref', '--verify', '--quiet', 'refs/heads/main']) !== null) return 'main';
  if (git(['show-ref', '--verify', '--quiet', 'refs/heads/master']) !== null) return 'master';
  return 'main';
}

/**
 * Get all local branches matching the worktree pattern.
 * @returns {string[]}
 */
function listWorktreeBranches() {
  const raw = git(['branch', '--format=%(refname:short)']);
  if (!raw) return [];
  return raw
    .split('\n')
    .map(b => b.trim())
    .filter(b => WORKTREE_BRANCH_PATTERN.test(b));
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
 * Get the commit date of the most recent commit on a branch (ms since epoch).
 * Falls back to null if the branch doesn't exist or has no commits.
 *
 * @param {string} branch
 * @returns {number|null}
 */
function getBranchAge(branch) {
  const raw = git(['log', '-1', '--format=%ct', branch]);
  if (!raw) return null;
  const ts = parseInt(raw.trim(), 10);
  return Number.isNaN(ts) ? null : ts * 1000;
}

/**
 * Check if a branch has zero unique commits vs the default branch.
 *
 * @param {string} branch
 * @param {string} defaultBranch
 * @returns {boolean}
 */
function hasNoUniqueCommits(branch, defaultBranch) {
  const result = git(['log', '--oneline', `${defaultBranch}..${branch}`]);
  if (result === null) return false; // error → assume unique (safe default)
  return result.trim().length === 0;
}

/**
 * Delete a branch. Attempts safe delete first, falls back to force-delete when
 * the branch has no unique commits.
 *
 * @param {string} branch
 * @param {string} defaultBranch
 * @returns {{ success: boolean, method: string, error?: string }}
 */
function deleteBranch(branch, defaultBranch) {
  // Attempt safe delete
  const safeResult = git(['branch', '-d', branch]);
  if (safeResult !== null) {
    return { success: true, method: 'safe-delete' };
  }

  // Safe delete failed — check if branch truly has no unique commits
  if (hasNoUniqueCommits(branch, defaultBranch)) {
    const forceResult = git(['branch', '-D', branch]);
    if (forceResult !== null) {
      return { success: true, method: 'force-delete (no unique commits)' };
    }
    return { success: false, method: 'force-delete', error: 'git branch -D failed' };
  }

  if (FORCE_DELETE) {
    const forceResult = git(['branch', '-D', branch]);
    if (forceResult !== null) {
      return { success: true, method: 'force-delete (--force flag)' };
    }
    return { success: false, method: 'force-delete', error: 'git branch -D failed with --force' };
  }

  return {
    success: false,
    method: 'skipped',
    error: 'Branch has unique commits. Use --force to delete anyway.',
  };
}

// ─── Phase Helpers ────────────────────────────────────────────────────────────

function runPhase1(activeWorktreeBranches, defaultBranch) {
  console.log('Phase 1: Orphaned Branch Cleanup');
  console.log('---------------------------------');

  const allWorktreeBranches = listWorktreeBranches();
  const orphanedBranches = allWorktreeBranches.filter(b => !activeWorktreeBranches.has(b));

  if (orphanedBranches.length === 0) {
    console.log('No orphaned worktree branches found.\n');
  } else {
    console.log(`Found ${orphanedBranches.length} orphaned branch(es):\n`);
  }

  let removed = 0;
  let skipped = 0;
  let errors = 0;
  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

  for (const branch of orphanedBranches) {
    if (currentBranch && currentBranch.trim() === branch) {
      console.log(`  SKIP  ${branch}  (current session branch)`);
      skipped++;
      continue;
    }
    const branchAgeMs = getBranchAge(branch);
    const ageMs = branchAgeMs !== null ? Date.now() - branchAgeMs : Infinity;
    if (ageMs < MIN_AGE_MS) {
      const ageMin = Math.round(ageMs / 60000);
      console.log(
        `  SKIP  ${branch}  (too young: ${ageMin}min < ${Math.round(MIN_AGE_MS / 60000)}min threshold)`
      );
      skipped++;
      continue;
    }
    const noUnique = hasNoUniqueCommits(branch, defaultBranch);
    const ageHours = Math.round(ageMs / 3600000);
    if (!noUnique && !FORCE_DELETE) {
      console.log(`  SKIP  ${branch}  (has unique commits — use --force to override)`);
      skipped++;
      continue;
    }
    const label = noUnique ? 'no unique commits' : 'has unique commits (--force)';
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] DELETE  ${branch}  (${label}, ${ageHours}h old)`);
      removed++;
    } else {
      const result = deleteBranch(branch, defaultBranch);
      if (result.success) {
        console.log(`  DELETED  ${branch}  via ${result.method}  (${label}, ${ageHours}h old)`);
        removed++;
      } else {
        console.log(`  ERROR    ${branch}  — ${result.error}`);
        errors++;
      }
    }
  }
  console.log(`\nPhase 1 summary: ${removed} deleted, ${skipped} skipped, ${errors} errors\n`);
}

function _runPhase2(
  activeWorktrees,
  defaultBranch,
  normalizedCwd,
  normalizedProjectRoot,
  normalizedWorktreesDir
) {
  console.log('Phase 2: Stale Worktree Directory Cleanup');
  console.log('------------------------------------------');

  if (!fs.existsSync(WORKTREES_DIR)) {
    console.log('No .claude/worktrees/ directory found. Skipping.\n');
    return;
  }

  const subagentWorktrees = activeWorktrees.filter(wt => {
    const normalized = wt.worktreePath.replace(/\\/g, '/');
    return normalized.startsWith(normalizedWorktreesDir) && normalized !== normalizedProjectRoot;
  });

  if (subagentWorktrees.length === 0) {
    console.log('No subagent worktrees found under .claude/worktrees/.\n');
  } else {
    console.log(`Found ${subagentWorktrees.length} subagent worktree(s):\n`);
  }

  let removed = 0;
  let skipped = 0;
  let errors = 0;

  for (const wt of subagentWorktrees) {
    const { worktreePath, branch } = wt;
    const shortPath = worktreePath.replace(normalizedProjectRoot + '/', '');
    if (normalizedCwd.startsWith(worktreePath)) {
      if (VERBOSE) console.log(`  SKIP  ${shortPath}  (current session worktree)`);
      skipped++;
      continue;
    }
    if (!branch) {
      if (VERBOSE) console.log(`  SKIP  ${shortPath}  (no branch info)`);
      skipped++;
      continue;
    }
    let dirAgeMs = Infinity;
    try {
      const stat = fs.statSync(worktreePath.replace(/\//g, path.sep));
      dirAgeMs = Date.now() - stat.mtimeMs;
    } catch (_e) {
      // Non-fatal
    }
    if (dirAgeMs < MIN_AGE_MS) {
      const ageMin = Math.round(dirAgeMs / 60000);
      if (VERBOSE) console.log(`  SKIP  ${shortPath}  (too young: ${ageMin}min)`);
      skipped++;
      continue;
    }
    const noUnique = hasNoUniqueCommits(branch, defaultBranch);
    const ageHours = Math.round(dirAgeMs / 3600000);
    if (!noUnique && !FORCE_DELETE) {
      if (VERBOSE) console.log(`  KEEP  ${shortPath}  [${branch}]  (has unique commits)`);
      skipped++;
      continue;
    }
    const label = noUnique ? 'merged into main' : 'has unique commits (--force)';
    if (DRY_RUN) {
      console.log(
        `  [DRY-RUN] REMOVE  ${shortPath}  [${branch}]  (${label}, dir ${ageHours}h old)`
      );
      removed++;
    } else {
      try {
        const nativePath = worktreePath.replace(/\//g, path.sep);
        const removeResult = git(['worktree', 'remove', nativePath, '--force']);
        if (removeResult === null) {
          if (fs.existsSync(nativePath)) {
            fs.rmSync(nativePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
          }
          git(['worktree', 'prune']);
        }
        const branchResult = deleteBranch(branch, defaultBranch);
        if (branchResult.success) {
          console.log(
            `  REMOVED  ${shortPath}  [${branch}]  (${label}, dir ${ageHours}h old) + branch deleted`
          );
        } else {
          console.log(
            `  REMOVED  ${shortPath}  [${branch}]  (${label}) — WARN: branch delete: ${branchResult.error}`
          );
        }
        removed++;
      } catch (err) {
        console.log(`  ERROR    ${shortPath}  [${branch}]  — ${err.message || String(err)}`);
        errors++;
      }
    }
  }
  console.log(`\nPhase 2 summary: ${removed} removed, ${skipped} skipped, ${errors} errors\n`);
}

// ─── Main Logic ───────────────────────────────────────────────────────────────

function main() {
  const startTime = Date.now();

  console.log('Worktree Cleanup');
  console.log('=================');
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be made. Pass --execute to actually clean up.\n');
  } else {
    console.log('[EXECUTE MODE] Changes will be applied.\n');
  }

  const defaultBranch = detectDefaultBranch();
  if (VERBOSE) console.log(`Default branch: ${defaultBranch}\n`);

  // SE-01: normalize current working directory
  const normalizedCwd = process.cwd().replace(/\\/g, '/');
  const normalizedProjectRoot = PROJECT_ROOT.replace(/\\/g, '/');
  const normalizedWorktreesDir = WORKTREES_DIR.replace(/\\/g, '/').replace(/\/?$/, '/');

  // Step 1: Get all active worktrees (with directories)
  const activeWorktrees = listWorktrees();
  // Build a Set of branches that currently have active worktree directories
  const activeWorktreeBranches = new Set(
    activeWorktrees
      .filter(wt => wt.branch && WORKTREE_BRANCH_PATTERN.test(wt.branch))
      .map(wt => wt.branch)
  );
  if (VERBOSE) {
    console.log(`Active worktrees (with directories): ${activeWorktrees.length}`);
    activeWorktrees.forEach(wt => console.log(`  ${wt.worktreePath} [${wt.branch || 'detached'}]`));
    console.log('');
  }

  runPhase1(activeWorktreeBranches, defaultBranch);

  // ── Phase 2: Stale worktree directory cleanup ────────────────────────────────
  console.log('Phase 2: Stale Worktree Directory Cleanup');
  console.log('------------------------------------------');

  if (!fs.existsSync(WORKTREES_DIR)) {
    console.log('No .claude/worktrees/ directory found. Skipping.\n');
  } else {
    const subagentWorktrees = activeWorktrees.filter(wt => {
      // SE-01: normalize path comparison
      const normalized = wt.worktreePath.replace(/\\/g, '/');
      return normalized.startsWith(normalizedWorktreesDir) && normalized !== normalizedProjectRoot;
    });

    if (subagentWorktrees.length === 0) {
      console.log('No subagent worktrees found under .claude/worktrees/.\n');
    } else {
      console.log(`Found ${subagentWorktrees.length} subagent worktree(s):\n`);
    }

    let phase2Removed = 0;
    let phase2Skipped = 0;
    let phase2Errors = 0;

    for (const wt of subagentWorktrees) {
      const { worktreePath, branch } = wt;
      const shortPath = worktreePath.replace(normalizedProjectRoot + '/', '');

      // Guard: never remove the current session's worktree
      if (normalizedCwd.startsWith(worktreePath)) {
        if (VERBOSE) console.log(`  SKIP  ${shortPath}  (current session worktree)`);
        phase2Skipped++;
        continue;
      }

      if (!branch) {
        if (VERBOSE) console.log(`  SKIP  ${shortPath}  (no branch info)`);
        phase2Skipped++;
        continue;
      }

      // Check age using directory mtime as fallback
      let dirAgeMs = Infinity;
      try {
        const stat = fs.statSync(worktreePath.replace(/\//g, path.sep));
        dirAgeMs = Date.now() - stat.mtimeMs;
      } catch (_e) {
        // Non-fatal
      }

      if (dirAgeMs < MIN_AGE_MS) {
        const ageMin = Math.round(dirAgeMs / 60000);
        if (VERBOSE) console.log(`  SKIP  ${shortPath}  (too young: ${ageMin}min)`);
        phase2Skipped++;
        continue;
      }

      const noUnique = hasNoUniqueCommits(branch, defaultBranch);
      const ageHours = Math.round(dirAgeMs / 3600000);

      if (!noUnique && !FORCE_DELETE) {
        if (VERBOSE) console.log(`  KEEP  ${shortPath}  [${branch}]  (has unique commits)`);
        phase2Skipped++;
        continue;
      }

      const label = noUnique ? 'merged into main' : 'has unique commits (--force)';

      if (DRY_RUN) {
        console.log(
          `  [DRY-RUN] REMOVE  ${shortPath}  [${branch}]  (${label}, dir ${ageHours}h old)`
        );
        phase2Removed++;
      } else {
        try {
          const nativePath = worktreePath.replace(/\//g, path.sep);
          const removeArgs = ['worktree', 'remove', nativePath, '--force'];
          const removeResult = git(removeArgs);
          if (removeResult === null) {
            // Fallback: brute-force remove directory
            if (fs.existsSync(nativePath)) {
              fs.rmSync(nativePath, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 500,
              });
            }
            // Prune admin entries
            git(['worktree', 'prune']);
          }

          // Delete backing branch
          const branchResult = deleteBranch(branch, defaultBranch);
          if (branchResult.success) {
            console.log(
              `  REMOVED  ${shortPath}  [${branch}]  (${label}, dir ${ageHours}h old) + branch deleted`
            );
          } else {
            console.log(
              `  REMOVED  ${shortPath}  [${branch}]  (${label}) — WARN: branch delete: ${branchResult.error}`
            );
          }
          phase2Removed++;
        } catch (err) {
          console.log(`  ERROR    ${shortPath}  [${branch}]  — ${err.message || String(err)}`);
          phase2Errors++;
        }
      }
    }

    console.log(
      `\nPhase 2 summary: ${phase2Removed} removed, ${phase2Skipped} skipped, ${phase2Errors} errors\n`
    );
  }

  // ── Final: git worktree prune backstop ──────────────────────────────────────
  if (!DRY_RUN) {
    console.log('Running git worktree prune as backstop...');
    git(['worktree', 'prune']);
    console.log('Done.\n');
  }

  // ── Final branch state ──────────────────────────────────────────────────────
  console.log('Current worktree-agent branches:');
  const remainingBranches = listWorktreeBranches();
  if (remainingBranches.length === 0) {
    console.log('  (none)');
  } else {
    remainingBranches.forEach(b => console.log(`  ${b}`));
  }

  const elapsed = Math.round((Date.now() - startTime) / 10) / 100;
  console.log(`\nCompleted in ${elapsed}s`);

  process.exit(0);
}

main();
