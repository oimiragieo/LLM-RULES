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
 * Startup sentinel: sub-functions 2 (startup-failopen-audit) and 3
 * (worktree-prune-on-start) only need to run once per session. They are
 * guarded by a file-based session-scoped sentinel so they skip (<50ms) on
 * subsequent prompts. The sentinel does NOT persist across sessions.
 *
 * Always exits 0 (advisory/fail-open hook).
 * Marked async: true in settings.json.
 *
 * Registration: settings.json UserPromptSubmit (matcher: "")
 *
 * Fulfills: VAL-HO-006, VAL-HO-010, VAL-HO-012
 *
 * @module user-prompt-advisory-bundle
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Startup sentinel ─────────────────────────────────────────────────────────

/**
 * Runtime directory for sentinel files.
 * @type {string}
 */
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

/**
 * Sentinel file path for startup-only sub-functions (failopen-audit, worktree-prune).
 * Scoped to the session: does NOT persist across sessions.
 * @type {string}
 */
const STARTUP_SENTINEL_PATH = path.join(RUNTIME_DIR, 'startup-hooks-bundle.sentinel');

/**
 * Check if the startup sub-functions have already fired for the current session.
 *
 * Uses session_id for exact matching. Falls back to a 1-hour timestamp window
 * when session_id is unknown/null (prevents cross-session carryover).
 *
 * @param {string|null} sessionId - Current session ID (from hook input)
 * @returns {boolean} true if startup hooks already ran this session, false otherwise
 */
function hasStartupAlreadyFired(sessionId) {
  try {
    if (!fs.existsSync(STARTUP_SENTINEL_PATH)) return false;
    const raw = fs.readFileSync(STARTUP_SENTINEL_PATH, 'utf8');
    const data = safeParseJSON(raw, null, null, {});
    if (!data) return false;
    // Unknown session ID: use timestamp-based deduplication (1-hour window)
    if (!sessionId || sessionId === 'default') {
      if (typeof data.firedAt === 'string') {
        const elapsed = Date.now() - new Date(data.firedAt).getTime();
        return elapsed < 60 * 60 * 1000; // 1 hour window
      }
      return false;
    }
    return data.sessionId === sessionId;
  } catch (_err) {
    return false; // Fail-open: if sentinel read fails, run hooks
  }
}

/**
 * Write the startup sentinel so subsequent prompts in this session skip startup hooks.
 *
 * Uses atomic write (tmp + rename) to prevent corruption.
 *
 * @param {string|null} sessionId - Current session ID
 */
function writeStartupSentinel(sessionId) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmp = STARTUP_SENTINEL_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ sessionId: sessionId || 'default', firedAt: new Date().toISOString() }),
      'utf8'
    );
    fs.renameSync(tmp, STARTUP_SENTINEL_PATH);
  } catch (_err) {
    // Non-fatal: if sentinel write fails, hooks may re-run on next prompt
  }
}

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

  // ── Startup sentinel check ────────────────────────────────────────────────
  // Sub-functions 2 and 3 only need to run once per session (startup hooks).
  // On subsequent prompts in the same session, skip them fast (<50ms).
  const startupAlreadyFired = hasStartupAlreadyFired(sessionId);

  if (!startupAlreadyFired) {
    // ── Sub-function 2: startup-failopen-audit ──────────────────────────────
    // Warns via stderr when any *_FAIL_OPEN=true env vars are active.
    try {
      startupFailopenAudit.runCheck();
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }

    // ── Sub-function 3: worktree-prune-on-start ─────────────────────────────
    // Garbage-collects orphaned worktrees and ensures CLAUDE.md exists.
    try {
      worktreePruneOnStart.main();
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }

    // Mark startup hooks as fired for this session
    writeStartupSentinel(sessionId);
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

// ─── Exports for testing ──────────────────────────────────────────────────────
module.exports = {
  hasStartupAlreadyFired,
  writeStartupSentinel,
  STARTUP_SENTINEL_PATH,
};
