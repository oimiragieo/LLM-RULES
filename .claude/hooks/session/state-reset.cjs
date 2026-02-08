#!/usr/bin/env node
/**
 * state-reset.cjs
 *
 * UserPromptSubmit hook that resets router state on every user prompt.
 * Prevents stale state from causing enforcement bypasses.
 *
 * WHEN IT RUNS:
 * - On every UserPromptSubmit (before other hooks)
 *
 * WHAT IT DOES:
 * - Resets router-state.json to default state
 * - Preserves sessionId for continuity
 * - Ensures taskSpawned always starts false
 *
 * Part of PROC-007 remediation (Option A).
 * @see .claude/context/memory/issues.md (PROC-007)
 * @see .claude/context/memory/learnings.md (Enforcement Strengthening)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Paths
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');

/**
 * Get current session ID (preserve across resets)
 */
function getCurrentSessionId() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return state.sessionId || null;
    }
  } catch (_err) {
    // Ignore errors
  }
  return null;
}

/**
 * Reset router state to default.
 */
function resetState() {
  const sessionId = getCurrentSessionId();

  const defaultState = {
    mode: 'router',
    lastReset: new Date().toISOString(),
    taskSpawned: false,
    taskSpawnedAt: null,
    taskDescription: null,
    sessionId: sessionId,
    taskListCalledSincePrompt: false,
    complexity: 'trivial',
    requiresPlannerFirst: false,
    plannerSpawned: false,
    requiresSecurityReview: false,
    securitySpawned: false,
    lastTaskUpdateCall: null,
    lastTaskUpdateTaskId: null,
    lastTaskUpdateStatus: null,
    taskUpdatesThisSession: 0,
    currentSpawnTaskId: null,
    version: Date.now() % 10000, // Simple version tracking
  };

  // Ensure directory exists
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write state atomically
  const tmpFile = STATE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(defaultState, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STATE_FILE);
}

/**
 * Main execution.
 */
function main() {
  try {
    resetState();
    // Success - exit 0 (allow prompt to proceed)
    process.exit(0);
  } catch (err) {
    // Error - but don't block user prompt (fail-open for usability)
    // Staleness detection in routing-guard.cjs (Fix 4b) provides safety net
    console.error(`[state-reset.cjs] CRITICAL: State reset failed: ${err.message}`);
    console.error(
      `[state-reset.cjs] Router enforcement may use stale state. Staleness detection active as safety net.`
    );
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { resetState, getCurrentSessionId };
