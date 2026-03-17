#!/usr/bin/env node
'use strict';

/**
 * Startup Hook: Pre-flight Worktree Garbage Collection
 *
 * Runs as the very first step in UserPromptSubmit to ensure the CWD is safe.
 * If the orchestrator previously died or left behind orphaned worktrees,
 * this cleans them up before Claude Code fully initializes and caches broken paths.
 */

const cp = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function main() {
  try {
    // We reuse the existing CLI worktree prune script since it already contains
    // the complex timestamp staleness logic and OS file-lock bypasses.
    // However, we run it entirely silently to avoid polluting the hook output stream.
    const pruneScript = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'worktree-prune.cjs');

    cp.execFileSync(process.execPath, [pruneScript], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore', // Must not emit any output; this is a side-effect startup hook
      windowsHide: true,
      timeout: 15000, // Don't block startup forever if git hangs
    });
  } catch (_err) {
    // Fail-open: If pruning fails (e.g., git is locked), just ignore it and let the session continue.
    // The background cron will eventually clean it up.
  }
}

main();
