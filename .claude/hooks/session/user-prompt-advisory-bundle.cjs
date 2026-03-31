#!/usr/bin/env node
'use strict';

/**
 * user-prompt-advisory-bundle.cjs — UserPromptSubmit consolidated advisory hook
 *
 * Consolidates 6 advisory UserPromptSubmit hooks into a single process to
 * reduce process-spawn overhead per user prompt:
 *
 *   1. ccusage-statusline.cjs         — display today's token usage/cost (kill-switch: CCUSAGE_STATUSLINE=off)
 *   2. startup-failopen-audit.cjs     — warn when fail-open env var overrides are active
 *   3. worktree-prune-on-start.cjs    — garbage-collect orphaned worktrees on startup
 *   4. session-budget-watchdog.cjs    — warn at 70/80/90% context budget thresholds
 *   5. drift-detector.cjs             — detect session intent drift after 6+ edits
 *   6. stale-task-detector.cjs        — warn about tasks left in_progress too long
 *
 * Error isolation: each sub-function is wrapped in its own try/catch.
 * A throw in one sub-function NEVER prevents others from executing.
 * Kill-switch env vars are respected per sub-function.
 *
 * Always exits 0 (advisory/fail-open hook).
 * Marked async: true in settings.json.
 *
 * Registration: settings.json UserPromptSubmit (matcher: "")
 *
 * Fulfills: VAL-HO-006, VAL-HO-012
 *
 * @module user-prompt-advisory-bundle
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Shared utilities ─────────────────────────────────────────────────────────

const { parseHookInputAsync } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'hook-input.cjs')
);

// ─── Sub-module imports ───────────────────────────────────────────────────────

// Sub-module 1: ccusage-statusline — token usage/cost status line
// Kill-switch: CCUSAGE_STATUSLINE=off suppresses all output
const ccusageStatusline = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'monitoring', 'ccusage-statusline.cjs')
);

// Sub-module 2: startup-failopen-audit — warn when fail-open overrides are active
const startupFailopenAudit = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'startup', 'startup-failopen-audit.cjs')
);

// Sub-module 3: worktree-prune-on-start — garbage-collect orphaned worktrees
const worktreePruneOnStart = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'startup', 'worktree-prune-on-start.cjs')
);

// Sub-module 4: session-budget-watchdog — context budget threshold warnings
const sessionBudgetWatchdog = require('./session-budget-watchdog.cjs');

// Sub-module 5: drift-detector — session intent drift detection
const driftDetector = require('./drift-detector.cjs');

// Sub-module 6: stale-task-detector — stale in_progress task detection
const staleTaskDetector = require('./stale-task-detector.cjs');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let hookInput = null;

  try {
    hookInput = await parseHookInputAsync();
  } catch (_err) {
    // Fail-open: malformed stdin must not crash the bundle
  }

  // Extract prompt and session_id for sub-functions that need them
  const userPrompt = (hookInput && (hookInput.prompt || hookInput.message)) || '';
  const sessionId =
    (hookInput && hookInput.session_id) || process.env.CLAUDE_SESSION_ID || 'default';

  // ── Sub-function 1: ccusage-statusline ───────────────────────────────────
  // Displays today's token usage and cost to stderr.
  // Kill-switch: CCUSAGE_STATUSLINE=off suppresses all output.
  if (process.env.CCUSAGE_STATUSLINE !== 'off') {
    try {
      ccusageStatusline._run();
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }
  }

  // ── Sub-function 2: startup-failopen-audit ────────────────────────────────
  // Warns via stderr when any *_FAIL_OPEN=true env vars are active.
  try {
    startupFailopenAudit.runCheck();
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 3: worktree-prune-on-start ───────────────────────────────
  // Garbage-collects orphaned worktrees and ensures CLAUDE.md exists.
  try {
    worktreePruneOnStart.main();
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 4: session-budget-watchdog ───────────────────────────────
  // Warns via stderr at 70/80/90% context budget thresholds (once per tier per session).
  try {
    sessionBudgetWatchdog.runBundled();
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 5: drift-detector ───────────────────────────────────────
  // Detects session intent drift and warns via stderr after 6+ edits.
  try {
    if (userPrompt && typeof userPrompt === 'string') {
      driftDetector.processPrompt(userPrompt, sessionId);
    }
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 6: stale-task-detector ──────────────────────────────────
  // Detects tasks left in_progress too long and warns via stderr.
  try {
    staleTaskDetector.runDetection();
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ─── Output ───────────────────────────────────────────────────────────────
  process.stdout.write(JSON.stringify({ allow: true }) + '\n');
  process.exit(0);
}

main();
