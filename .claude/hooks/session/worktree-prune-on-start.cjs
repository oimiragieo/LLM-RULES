#!/usr/bin/env node
'use strict';

/**
 * worktree-prune-on-start.cjs — UserPromptSubmit hook
 *
 * Runs `git worktree prune` once per session to remove stale worktree
 * references. This prevents MODULE_NOT_FOUND errors caused by Claude Code
 * caching hook path resolution at session init — when an agent's worktree
 * is deleted, cached absolute paths point to non-existent directories.
 *
 * Behaviour:
 * - Runs FIRST in the UserPromptSubmit chain
 * - Checks for a session flag file; skips git if already pruned this session
 * - Runs `git worktree prune` via execFileSync (shell:false — SE-01 compliant)
 * - Writes session flag file on success to avoid repeated runs
 * - Logs pruned worktree count to stderr when any are pruned
 * - Fails open (exit 0) on ALL errors — must never block user prompts
 * - 5 s timeout on git subprocess
 *
 * Flag file: .claude/context/runtime/worktree-pruned-this-session.flag
 * Override: WORKTREE_PRUNE_RUNTIME_DIR (for testing — overrides runtime dir)
 *
 * Registration: settings.json UserPromptSubmit (first entry, matcher: "")
 *
 * @module worktree-prune-on-start
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Session flag filename */
const FLAG_FILE = 'worktree-pruned-this-session.flag';

/** Git subprocess timeout in milliseconds */
const GIT_TIMEOUT_MS = 5000;

// ─── Main ─────────────────────────────────────────────────────────────────────

function run() {
  try {
    // Determine runtime dir (allow override for testing)
    const projectRoot = process.cwd();
    const runtimeDir =
      process.env.WORKTREE_PRUNE_RUNTIME_DIR ||
      path.join(projectRoot, '.claude', 'context', 'runtime');

    const flagPath = path.join(runtimeDir, FLAG_FILE);

    // Skip if already pruned this session
    if (fs.existsSync(flagPath)) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    // Ensure runtime dir exists (non-fatal if mkdir fails)
    try {
      fs.mkdirSync(runtimeDir, { recursive: true });
    } catch (_e) {
      // Non-fatal — if runtimeDir doesn't exist, flag write will also fail
      // but we still attempt git prune
    }

    // Run git worktree prune (shell:false — security requirement)
    let prunedCount = 0;
    try {
      const result = execFileSync('git', ['worktree', 'prune', '--verbose'], {
        cwd: projectRoot,
        timeout: GIT_TIMEOUT_MS,
        encoding: 'utf8',
        windowsHide: true,
        // shell:false is the default for execFileSync — no shell option needed
      });
      // Count pruned entries from verbose output
      // git worktree prune --verbose prints one line per pruned entry
      if (result && result.trim()) {
        prunedCount = result
          .trim()
          .split('\n')
          .filter(line => line.trim().length > 0).length;
      }
    } catch (gitErr) {
      // git may not be available or may fail — fail-open, continue to write flag
      process.stderr.write(
        `[worktree-prune-on-start] git worktree prune failed (non-fatal): ${gitErr.message || String(gitErr)}\n`
      );
    }

    // Write session flag to prevent re-running
    try {
      fs.writeFileSync(flagPath, new Date().toISOString(), 'utf8');
    } catch (_e) {
      // Non-fatal — flag write failure just means we may re-run next prompt
    }

    // Log to stderr if any worktrees were pruned
    if (prunedCount > 0) {
      process.stderr.write(
        `[worktree-prune-on-start] Pruned ${prunedCount} stale worktree reference(s)\n`
      );
    }

    console.log(JSON.stringify({ allow: true }));
  } catch (_err) {
    // Fail-open: must never block user workflow
    console.log(JSON.stringify({ allow: true }));
  }
}

// Consume stdin (UserPromptSubmit hooks receive JSON via stdin)
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  inputData += chunk;
});
process.stdin.on('end', () => {
  // Parse stdin for completeness but we don't need its content
  safeParseJSON(inputData, {});
  run();
});

// Handle case where stdin closes immediately (e.g., empty pipe)
process.stdin.on('error', () => {
  run();
});
