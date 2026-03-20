#!/usr/bin/env node
'use strict';
/**
 * worktree-prune.cjs
 *
 * CLI maintenance tool: prune stale git worktrees under .claude/worktrees/.
 *
 * A worktree is considered stale when its branch has been merged into main
 * (i.e. `git log --oneline main..branch` returns zero lines).
 *
 * Usage:
 *   node .claude/tools/cli/worktree-prune.cjs [--dry-run] [--force]
 *
 * Flags:
 *   --dry-run   Print what would be removed without executing.
 *   --force     Pass --force to `git worktree remove` (default: true).
 *
 * Exit codes:
 *   0  All stale worktrees removed (or dry-run succeeded)
 *   1  One or more errors occurred during removal
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectDefaultBranch } = require('../../lib/worktree/worktree-utils.cjs');

// TTL for worktree branches (default 24 hours). Override with WORKTREE_TTL_MS env var.
const WORKTREE_TTL_MS = parseInt(process.env.WORKTREE_TTL_MS ?? '86400000', 10);
const WORKTREE_SHIELD_MS = parseInt(process.env.WORKTREE_SHIELD_MS ?? '43200000', 10); // 12 hours absolute protection

// Resolve project root from __dirname: .claude/tools/cli/ → three levels up
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKTREES_DIR = path.join(PROJECT_ROOT, '.claude', 'worktrees');

// --- CLI flag parsing ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = !args.includes('--no-force'); // force by default

/**
 * Run a git command with shell: false.
 *
 * @param {string[]} gitArgs - Arguments for git.
 * @param {object} [opts]
 * @param {string} [opts.cwd] - Working directory (defaults to PROJECT_ROOT).
 * @param {boolean} [opts.throws] - If false, return null on error instead of throwing.
 * @returns {string|null}
 */
function git(gitArgs, { cwd = PROJECT_ROOT, throws = true } = {}) {
  try {
    // SE-02: shell: false with array args prevents injection
    const result = execFileSync('git', gitArgs, {
      cwd,
      shell: false,
      encoding: 'utf8',
      timeout: 15000,
    });
    return result;
  } catch (err) {
    if (throws) throw err;
    return null;
  }
}

/**
 * Parse `git worktree list --porcelain` output into an array of worktree objects.
 *
 * Each object has: { worktreePath, HEAD, branch }
 *
 * @returns {{ worktreePath: string, HEAD: string, branch: string }[]}
 */
function listWorktrees() {
  const raw = git(['worktree', 'list', '--porcelain']);
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
  // Match trailing 13-digit unix ms timestamp
  const match = branch.match(/-(\d{13})$/);
  if (!match) return null;
  const ts = parseInt(match[1], 10);
  if (Number.isNaN(ts)) return null;
  return ts;
}

/**
 * Check if a TTL-stamped branch has exceeded its time-to-live.
 *
 * @param {string} branch - Branch name (may contain embedded timestamp).
 * @returns {boolean} true if TTL-stamped and older than WORKTREE_TTL_MS.
 */
function isTTLExpired(branch) {
  const ts = extractBranchTimestamp(branch);
  if (ts === null) return false; // not TTL-managed
  return Date.now() - ts > WORKTREE_TTL_MS;
}

/**
 * Determine whether a worktree branch is stale (fully merged into main OR TTL-expired).
 *
 * A branch is stale when:
 *   - It has an embedded timestamp and is older than WORKTREE_TTL_MS, OR
 *   - `git log --oneline main..<branch>` returns zero lines (fully merged) AND the embedded branch timestamp is older than 12 hours.
 *
 * @param {string} branch - Branch name (short, e.g. "worktree-agent-abc123-1741000000000")
 * @returns {boolean}
 */
function isStale(branch) {
  if (!branch) return false;
  // TTL-based check: branch older than WORKTREE_TTL_MS is always stale
  if (isTTLExpired(branch)) return true;

  // ZOMBIE PREVENTION (IRON SHIELD): Extract the embedded timestamp from the branch name
  // If the branch name contains a valid timestamp that is less than 12 hours old, it is
  // explicitly protected from deletion. Active agents with 0 commits will fail the git log
  // check below, so they MUST be protected here using their undisputed creation time.
  const branchCreationAgeMs = extractBranchTimestamp(branch);
  if (branchCreationAgeMs !== null) {
    const ageMs = Date.now() - branchCreationAgeMs;
    if (ageMs < WORKTREE_SHIELD_MS) {
      return false; // Age is verified less than 12 hours. SHIELD ENGAGED.
    }
  }

  // DIRECTORY-MTIME FALLBACK: Claude Code's native Agent tool creates branches without
  // embedded timestamps (e.g. "worktree-agent-a1627c08"). For these, fall back to the
  // worktree directory's mtime to determine age. If the directory is older than
  // WORKTREE_TTL_MS, treat as TTL-expired and stale.
  if (branchCreationAgeMs === null) {
    try {
      const wtDir = path.join(WORKTREES_DIR, branch.replace('worktree-', ''));
      if (fs.existsSync(wtDir)) {
        const stat = fs.statSync(wtDir);
        const dirAgeMs = Date.now() - stat.mtimeMs;
        if (dirAgeMs < WORKTREE_SHIELD_MS) {
          return false; // Directory is young — shield engaged
        }
        if (dirAgeMs > WORKTREE_TTL_MS) {
          return true; // Directory is older than TTL — stale
        }
      }
    } catch (_statErr) {
      // Non-fatal — fall through to git-merge check
    }
  }

  try {
    const defaultBranch = detectDefaultBranch(PROJECT_ROOT);
    // SE-02: shell: false, array args
    const uniqueCommits = git(['log', '--oneline', `${defaultBranch}..${branch}`], {
      throws: false,
    });
    if (uniqueCommits === null) return false;
    return uniqueCommits.trim().length === 0;
  } catch (_err) {
    return false;
  }
}

/**
 * Delete a git branch by name.
 *
 * Attempts a safe delete (-d) first; if the branch is not fully merged per git's
 * bookkeeping but has no unique commits vs main, falls back to force-delete (-D).
 *
 * @param {string} branch - Short branch name (e.g. "worktree-agent-abc123").
 * @returns {{ success: boolean, error: string|null }}
 */
function deleteBranch(branch) {
  if (!branch) return { success: true, error: null }; // nothing to delete
  try {
    git(['branch', '-d', branch]);
    return { success: true, error: null };
  } catch (_safeDeleteErr) {
    // Branch may not be recognised as merged — check unique commits before force-delete
    try {
      const defaultBranch = detectDefaultBranch(PROJECT_ROOT);
      const unique = git(['log', '--oneline', `${defaultBranch}..${branch}`], { throws: false });
      if (unique !== null && unique.trim().length === 0) {
        // No unique commits — safe to force-delete
        git(['branch', '-D', branch]);
        return { success: true, error: null };
      }
      return {
        success: false,
        error: `Branch ${branch} has unmerged commits — skipping branch delete`,
      };
    } catch (innerErr) {
      return {
        success: false,
        error: `Branch delete failed: ${innerErr.message || String(innerErr)}`,
      };
    }
  }
}

/**
 * Remove a git worktree by path, then delete its backing branch.
 *
 * @param {string} worktreePath - Forward-slash normalized path.
 * @param {string} branch - Short branch name to delete after worktree removal.
 * @returns {{ success: boolean, error: string|null }}
 */
function removeWorktree(worktreePath, branch) {
  // Convert back to OS-native path for git command
  const nativePath = worktreePath.replace(/\//g, path.sep);
  const removeArgs = ['worktree', 'remove', nativePath];
  if (FORCE) removeArgs.push('--force');
  try {
    git(removeArgs);
  } catch (_worktreeRemoveErr) {
    // Windows file-lock fallback: aggressively rm the directory
    // Increased maxRetries to 10 and retryDelay to 1000 (10 seconds total) for aggressive Defender lockouts
    try {
      if (fs.existsSync(nativePath)) {
        fs.rmSync(nativePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
        // Clean up git's internal state after brute-force removal
        pruneGitWorktrees();
      }
    } catch (rmErr) {
      return {
        success: false,
        error: `Git worktree remove failed: ${_worktreeRemoveErr.message || String(_worktreeRemoveErr)} AND fallback rmSync failed: ${rmErr.message || String(rmErr)}`,
      };
    }
  }

  // Delete the backing branch now that the worktree is gone
  const branchResult = deleteBranch(branch);
  if (!branchResult.success) {
    // Non-fatal: worktree is removed, but log the branch warning
    console.warn(`  WARN  Could not delete branch ${branch}: ${branchResult.error}`);
  }

  return { success: true, error: null };
}

/**
 * Run git worktree prune as a backstop cleanup.
 */
function pruneGitWorktrees() {
  try {
    git(['worktree', 'prune']);
  } catch (_err) {
    // non-fatal backstop
  }
}

// ---- Main ----------------------------------------------------------------

function main() {
  console.log('Worktree Pruner');
  console.log('================');
  if (DRY_RUN) console.log('[DRY RUN] No changes will be made.\n');

  // Step 1: Check if worktrees directory exists
  if (!fs.existsSync(WORKTREES_DIR)) {
    console.log('No .claude/worktrees/ directory found. Nothing to prune.');
    console.log('\nSummary: 0 removed, 0 skipped, 0 errors');
    process.exit(0);
  }

  // Step 2: Get all active worktrees from git
  let allWorktrees;
  try {
    allWorktrees = listWorktrees();
  } catch (err) {
    console.error('ERROR: Failed to list worktrees:', err.message);
    process.exit(1);
  }

  // SE-01: normalize cwd for comparison
  const normalizedCwd = process.cwd().replace(/\\/g, '/');
  // SE-01: normalize project root for comparison
  const normalizedProjectRoot = PROJECT_ROOT.replace(/\\/g, '/');

  // Step 3: Filter to only worktrees under .claude/worktrees/
  // SE-01: normalize WORKTREES_DIR for path matching
  // Ensure trailing slash to prevent false prefix matches (e.g. worktrees-backup/)
  const normalizedWorktreesDir = WORKTREES_DIR.replace(/\\/g, '/').replace(/\/?$/, '/');
  const subagentWorktrees = allWorktrees.filter(wt => {
    return (
      wt.worktreePath.startsWith(normalizedWorktreesDir) &&
      wt.worktreePath !== normalizedProjectRoot
    );
  });

  if (subagentWorktrees.length === 0) {
    console.log('No subagent worktrees found under .claude/worktrees/.');
    console.log('\nRunning git worktree prune as backstop...');
    pruneGitWorktrees();
    console.log('\nSummary: 0 removed, 0 skipped, 0 errors');
    process.exit(0);
  }

  console.log(`Found ${subagentWorktrees.length} subagent worktree(s):\n`);

  let removed = 0;
  let skipped = 0;
  let errors = 0;

  // Step 4: For each worktree, check staleness and optionally remove
  for (const wt of subagentWorktrees) {
    const { worktreePath, branch } = wt;
    const shortPath = worktreePath.replace(normalizedProjectRoot + '/', '');

    // Safety guard: never remove the current session's worktree
    if (normalizedCwd.startsWith(worktreePath)) {
      console.log(`  SKIP  ${shortPath}  (current session worktree)`);
      skipped++;
      continue;
    }

    // Safety guard: never remove a worktree with no branch info
    if (!branch) {
      console.log(`  SKIP  ${shortPath}  (no branch info — run git worktree prune manually)`);
      skipped++;
      continue;
    }

    const ttlExpired = isTTLExpired(branch);
    const stale = isStale(branch);
    if (!stale) {
      console.log(
        `  KEEP  ${shortPath}  [${branch}]  (has unique commits not in main OR is inside 12-hour age shield)`
      );
      skipped++;
      continue;
    }

    const staleReason = ttlExpired ? 'TTL expired' : 'merged into main';

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] REMOVE  ${shortPath}  [${branch}]  (${staleReason})`);
      removed++;
    } else {
      const result = removeWorktree(worktreePath, branch);
      if (result.success) {
        console.log(`  REMOVED  ${shortPath}  [${branch}]  (${staleReason})`);
        removed++;
      } else {
        console.log(`  ERROR    ${shortPath}  [${branch}]  — ${result.error}`);
        errors++;
      }
    }
  }

  // Step 5: Run git worktree prune as backstop
  if (!DRY_RUN) {
    console.log('\nRunning git worktree prune as backstop...');
    pruneGitWorktrees();
  }

  // Step 6: Print summary
  console.log(`\nSummary: ${removed} removed, ${skipped} skipped, ${errors} errors`);

  process.exit(errors > 0 ? 1 : 0);
}

main();
