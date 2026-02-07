#!/usr/bin/env node
/**
 * evolution-audit.cjs
 * PostToolUse hook for Task operations
 *
 * Logs completed evolutions to an audit trail for tracking and verification.
 * Triggers after ENABLE phase completes (state transitions to idle).
 *
 * ENFORCEMENT MODES (EVOLUTION_AUDIT):
 * - on (default): Logs all evolutions
 * - off: Auditing disabled
 *
 * Override via environment variable:
 *   EVOLUTION_AUDIT=off
 *
 * Exit codes:
 * - 0: Always (audit is passive, never blocks)
 *
 * The hook fails open (exits 0) on errors to avoid blocking legitimate work.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputAsync } = require('../../lib/utils/hook-input.cjs');
const { getCachedState } = require('../../lib/utils/state-cache.cjs');

const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const AUDIT_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-audit.log');

/**
 * Get enforcement mode from environment variable
 * @returns {'on' | 'off'}
 */
function getEnforcementMode() {
  const mode = process.env.EVOLUTION_AUDIT || 'on';
  return ['on', 'off'].includes(mode) ? mode : 'on';
}

/**
 * Get the evolution state from file
 * PERF-004: Uses state-cache for TTL-based caching
 * @returns {Object|null}
 */
function getEvolutionState() {
  // PERF-004: Use cached state with 1s TTL
  return getCachedState(EVOLUTION_STATE_PATH, null);
}

/**
 * Check if this represents a completed evolution
 * @param {Object|null} state - Evolution state
 * @returns {boolean}
 */
function isEvolutionCompletion(state) {
  if (!state) {
    return false;
  }

  // Check if currentEvolution is in the final 'enable' phase
  // (indicates evolution is completing or just completed)
  if (state.currentEvolution && state.currentEvolution.phase === 'enable') {
    return true;
  }

  // Check for newly completed evolutions in array using createdAt timestamps
  if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
    const lastEvolution = state.evolutions[state.evolutions.length - 1];
    // Check createdAt (when evolution completed) - schema uses createdAt, not completedAt
    const completedTime = lastEvolution.createdAt
      ? new Date(lastEvolution.createdAt).getTime()
      : lastEvolution.completedAt
        ? new Date(lastEvolution.completedAt).getTime()
        : 0;

    if (completedTime > 0) {
      // Check if completed recently (within last 5 minutes)
      const now = Date.now();
      if (now - completedTime < 5 * 60 * 1000) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the most recent completed evolution
 * @param {Object} state - Evolution state
 * @returns {Object|null}
 */
function getLatestEvolution(state) {
  if (!state) {
    return null;
  }

  // Try evolutions array first
  if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
    return state.evolutions[state.evolutions.length - 1];
  }

  // Fall back to currentEvolution
  if (state.currentEvolution) {
    return state.currentEvolution;
  }

  return null;
}

/**
 * Format an audit log entry
 * @param {Object|null} evolution - Evolution data
 * @returns {string}
 */
function formatAuditEntry(evolution) {
  if (!evolution) {
    return (
      '[EVOLUTION] ' +
      new Date().toISOString() +
      ' | type=unknown | name=unknown | status=completed'
    );
  }

  const timestamp = evolution.completedAt || new Date().toISOString();
  const type = evolution.type || 'unknown';
  const name = evolution.name || 'unknown';
  const artifactPath = evolution.path || evolution.artifactPath || 'unknown';
  const researchReport = evolution.researchReport || 'none';

  const parts = [
    '[EVOLUTION]',
    timestamp,
    '| type=' + type,
    '| name=' + name,
    '| path=' + artifactPath,
    '| research=' + researchReport,
    '| status=completed',
  ];

  return parts.join(' ');
}

/**
 * Append an entry to the audit log
 * @param {string} entry - The log entry
 */
function appendToAuditLog(entry) {
  try {
    // Ensure directory exists
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append entry with newline
    fs.appendFileSync(AUDIT_LOG_PATH, entry + '\n');
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('Failed to write audit log:', e.message);
    }
  }
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Main execution function.
 */
async function main() {
  try {
    // Check enforcement mode
    const enforcement = getEnforcementMode();
    if (enforcement === 'off') {
      process.exit(0);
    }

    // Parse the hook input (optional for PostToolUse)
    await parseHookInputAsync();

    // Get evolution state
    const state = getEvolutionState();

    // Check if this is an evolution completion
    if (!isEvolutionCompletion(state)) {
      process.exit(0);
    }

    // Get the latest evolution
    const evolution = getLatestEvolution(state);

    // Format and write audit entry
    const entry = formatAuditEntry(evolution);
    appendToAuditLog(entry);

    if (process.env.DEBUG_HOOKS) {
      console.log('Audit entry written:', entry);
    }

    process.exit(0);
  } catch (err) {
    // Fail open on errors to avoid blocking legitimate work
    if (process.env.DEBUG_HOOKS) {
      console.error('evolution-audit error:', err.message);
      console.error('Stack trace:', err.stack);
    }
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  getEnforcementMode,
  isEvolutionCompletion,
  getLatestEvolution,
  formatAuditEntry,
  appendToAuditLog,
  getEvolutionState,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
  AUDIT_LOG_PATH,
};
