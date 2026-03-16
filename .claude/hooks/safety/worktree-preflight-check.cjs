#!/usr/bin/env node
'use strict';

/**
 * worktree-preflight-check.cjs
 *
 * PreToolUse hook for Task tool.
 * Blocks agent spawns that use worktree isolation when the working tree has
 * uncommitted changes. Worktrees clone from committed HEAD — uncommitted
 * fixes do NOT propagate, causing agents to run on stale/broken code.
 *
 * Fail policy: WARN (exit 0 with stderr warning). Set
 * WORKTREE_PREFLIGHT_ENFORCEMENT=block to hard-block.
 *
 * Regression origin: 2026-03-16 — bash-command-validator fix was uncommitted,
 * spawned agents got old broken HEAD, self-deleted their worktrees.
 */

const { execSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});
process.stdin.on('end', () => {
  try {
    const { success, data } = safeParseJSON(inputData, {});
    if (!success) {
      process.exit(0); // fail-open on parse error
    }

    // Only check Task tool calls
    const toolName = data.tool_name || data.toolName || '';
    if (toolName !== 'Task') {
      process.exit(0);
    }

    // Check if the spawn uses worktree isolation
    const input = data.tool_input || data.input || {};
    const isolation = input.isolation || '';
    if (isolation !== 'worktree') {
      process.exit(0); // no worktree isolation — allow
    }

    // Check for uncommitted changes
    let gitOutput = '';
    try {
      gitOutput = execSync('git status --porcelain', {
        shell: false,
        timeout: 5000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim();
    } catch (_gitErr) {
      // Not a git repo or git not available — allow
      process.exit(0);
    }

    if (!gitOutput) {
      // Clean working tree — allow
      process.exit(0);
    }

    // Dirty tree detected — count changed files
    const changedFiles = gitOutput.split('\n').filter(Boolean);
    const modifiedCount = changedFiles.length;

    const enforcement = process.env.WORKTREE_PREFLIGHT_ENFORCEMENT || 'warn';

    const message = `[worktree-preflight] Working tree has ${modifiedCount} uncommitted change(s). Worktree agents will clone stale HEAD, not your local changes. Commit first or spawn without worktree isolation.`;

    if (enforcement === 'block') {
      // Hard block
      const result = JSON.stringify({ allow: false, message });
      process.stdout.write(result);
      process.exit(2);
    }

    // Warn mode (default) — allow but emit warning
    process.stderr.write(message + '\n');
    process.exit(0);
  } catch (_err) {
    // Fail-open on any unexpected error
    process.exit(0);
  }
});
