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
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKTREE_DIR = path.join(PROJECT_ROOT, '.claude', 'worktrees');
const TIERED_CLAUDE_MD = path.join(WORKTREE_DIR, 'CLAUDE.md');

const SUBAGENT_CLAUDE_MD = `# SUBAGENT EXECUTION CONTEXT

**You are a Subagent. Follow your specific prompt payload.**

You are operating inside an isolated worktree or sub-session.
The Router's CLAUDE.md constraints (e.g. "You are the router. You never execute work") DO NOT APPLY to you.

Follow the instructions provided in your spawn prompt to complete your assigned task.
Use TaskUpdate(in_progress) immediately, and TaskUpdate(completed) when finished.
`;

function ensureSubagentClaudeMd() {
  try {
    if (!fs.existsSync(WORKTREE_DIR)) {
      fs.mkdirSync(WORKTREE_DIR, { recursive: true });
    }
    if (!fs.existsSync(TIERED_CLAUDE_MD)) {
      fs.writeFileSync(TIERED_CLAUDE_MD, SUBAGENT_CLAUDE_MD, 'utf8');
    }
  } catch (_err) {
    // Best effort insertion.
  }
}

function shouldSkipPruneForHookAudit() {
  return process.env.A2A_AUTO_START === 'false' && process.env.CHANNEL_AUTO_START === 'false';
}

function main() {
  try {
    ensureSubagentClaudeMd();

    if (shouldSkipPruneForHookAudit()) {
      return;
    }

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

if (require.main === module) {
  main();
}

// Export for programmatic use by consolidated bundles
module.exports = { main, ensureSubagentClaudeMd, shouldSkipPruneForHookAudit };
