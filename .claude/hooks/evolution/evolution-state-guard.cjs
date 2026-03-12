#!/usr/bin/env node
/**
 * evolution-state-guard.cjs
 * PreToolUse hook for state transitions
 *
 * Enforces: Valid state machine transitions in the EVOLVE workflow.
 * Prevents skipping phases or making invalid state changes.
 *
 * State Machine:
 *   IDLE -> EVALUATING -> VALIDATING -> OBTAINING -> LOCKING -> VERIFYING -> ENABLING -> IDLE
 *
 * ENFORCEMENT MODES (EVOLUTION_STATE_GUARD):
 * - block (default): Invalid transitions are blocked with error message
 * - warn: Invalid transitions produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   EVOLUTION_STATE_GUARD=warn
 *   EVOLUTION_STATE_GUARD=off
 *
 * Exit codes:
 * - 0: Allow operation (valid transition, or warn/off mode)
 * - 2: Block operation (invalid transition in block mode)
 *
 * The hook fails open (exits 0) on errors to avoid blocking legitimate work.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// PERF-006: Use shared hook-input utility
const { parseHookInputAsync, getToolInput } = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// PERF-007: Use shared project-root utility
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// PERF-004: Use state cache to reduce redundant file I/O
const { getCachedState } = require('../../lib/utils/state-cache.cjs');

// SEC-TOCTOU: Use safeParseJSON for lock file parsing (prevents prototype pollution)
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Valid states in the EVOLVE workflow
const VALID_STATES = [
  'idle',
  'evaluating',
  'validating',
  'obtaining',
  'locking',
  'verifying',
  'enabling',
  'aborted',
  'blocked',
  'failed',
];

// Valid state transitions (from -> [allowed to states])
const STATE_TRANSITIONS = {
  idle: ['evaluating'],
  evaluating: ['validating', 'aborted'],
  validating: ['obtaining', 'aborted'],
  obtaining: ['locking', 'obtaining'], // Can loop for more research
  locking: ['verifying', 'locking'], // Can retry on schema failure
  verifying: ['enabling', 'locking'], // Can go back to fix issues
  enabling: ['idle'],
  aborted: [], // Terminal state
  blocked: ['evaluating', 'validating', 'obtaining', 'locking', 'verifying', 'enabling'], // Can resume from blocked
  failed: ['idle'], // Can restart after failure
};

const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const EVOLUTION_LOCK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-lock.json'
);
const EVOLUTION_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Atomically acquire an evolution lock using O_EXCL flag to prevent TOCTOU races.
 * Two concurrent processes calling checkEvolutionLock+writeEvolutionLock could both
 * pass the check before either writes (classic TOCTOU). O_EXCL makes file creation
 * atomic at the OS level — exactly one writer wins.
 *
 * @param {string} owner - Identifier for who is acquiring the lock
 * @returns {boolean} true if lock was acquired, false if held by another process
 */
function acquireEvolutionLock(owner) {
  try {
    const dir = path.dirname(EVOLUTION_LOCK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const lockData = JSON.stringify({ timestamp: Date.now(), pid: process.pid, owner });
    // O_EXCL ensures atomic creation — fails immediately if file exists (EEXIST)
    fs.writeFileSync(EVOLUTION_LOCK_PATH, lockData, { flag: 'wx' });
    return true; // Lock acquired
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock exists — check if it is stale (> 30 min)
      try {
        const raw = fs.readFileSync(EVOLUTION_LOCK_PATH, 'utf8');
        // SEC: Use safeParseJSON to prevent prototype pollution from tampered lock file
        const existing = safeParseJSON(raw, null);
        const age = Date.now() - (existing && existing.timestamp ? Number(existing.timestamp) : 0);
        if (age > EVOLUTION_LOCK_TTL_MS) {
          // Stale lock — remove and retry once
          try {
            fs.unlinkSync(EVOLUTION_LOCK_PATH);
          } catch (_unlinkErr) {
            return false; // Could not remove stale lock — another process may have it
          }
          try {
            const lockData = JSON.stringify({ timestamp: Date.now(), pid: process.pid, owner });
            fs.writeFileSync(EVOLUTION_LOCK_PATH, lockData, { flag: 'wx' });
            return true;
          } catch (_retryErr) {
            return false; // Lost the retry race — another process acquired the lock
          }
        }
      } catch (_readErr) {
        // Cannot read lock file — treat as active to fail safe
      }
      return false; // Active lock held by another process
    }
    // Unexpected error — fail open to avoid blocking legitimate work
    return true;
  }
}

/**
 * Check if an evolution lock is currently active (non-stale).
 * This is a read-only check — does not acquire or modify the lock.
 *
 * @returns {{ locked: boolean, owner?: string, since?: string }}
 */
function checkEvolutionLock() {
  try {
    if (!fs.existsSync(EVOLUTION_LOCK_PATH)) {
      return { locked: false };
    }
    const raw = fs.readFileSync(EVOLUTION_LOCK_PATH, 'utf8');
    // SEC: Use safeParseJSON to prevent prototype pollution from tampered lock file
    const lock = safeParseJSON(raw, null);
    if (!lock || typeof lock !== 'object') {
      return { locked: false };
    }
    const timestamp = lock.timestamp ? Number(lock.timestamp) : 0;
    const age = Date.now() - timestamp;
    if (age < EVOLUTION_LOCK_TTL_MS) {
      return { locked: true, owner: lock.owner, since: new Date(timestamp).toISOString() };
    }
    // Stale lock — treat as expired
    return { locked: false };
  } catch (_err) {
    // If we can't read the lock, fail open to avoid blocking legitimate work
    return { locked: false };
  }
}

/**
 * Write an evolution lock file (non-atomic — prefer acquireEvolutionLock for new starts).
 * Kept for backward compatibility with callers that do not need atomic acquisition.
 * @param {string} owner - Identifier for who holds the lock
 */
function writeEvolutionLock(owner) {
  try {
    const dir = path.dirname(EVOLUTION_LOCK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      EVOLUTION_LOCK_PATH,
      JSON.stringify({ timestamp: Date.now(), pid: process.pid, owner }, null, 2),
      'utf8'
    );
  } catch (_err) {
    // Best-effort — don't block if write fails
  }
}

/**
 * Get enforcement mode from environment variable
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  const mode = process.env.EVOLUTION_STATE_GUARD || 'block';
  return ['block', 'warn', 'off'].includes(mode) ? mode : 'block';
}

/**
 * Check if a state transition is valid
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean}
 */
function isValidTransition(fromState, toState) {
  // Handle invalid inputs
  if (!fromState || !toState) {
    return false;
  }

  // Check if fromState is known
  if (!STATE_TRANSITIONS[fromState]) {
    return false;
  }

  // Check if toState is in allowed transitions
  return STATE_TRANSITIONS[fromState].includes(toState);
}

/**
 * Get the evolution state from file
 * PERF-004: Uses state cache to reduce redundant file I/O
 * @returns {Object|null}
 */
function getEvolutionState() {
  // Use cached state with 1 second TTL (default)
  const state = getCachedState(EVOLUTION_STATE_PATH, null);
  return state;
}

/**
 * Extract target state from tool input
 * Looks for state transitions in Edit/Write operations to evolution-state.json
 * @param {Object} toolInput - The tool input
 * @returns {string|null}
 */
function extractTargetState(toolInput) {
  // Check if editing evolution-state.json
  const filePath = toolInput.file_path || toolInput.path || '';
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (!normalizedPath.includes('evolution-state.json')) {
    return null;
  }

  // Try to extract target state from content or new_string
  const content = toolInput.content || toolInput.new_string || '';

  // Look for state field in JSON-like content
  const stateMatch = content.match(/"state"\s*:\s*"([^"]+)"/);
  if (stateMatch) {
    return stateMatch[1];
  }

  return null;
}

// PERF-006: Removed duplicated parseHookInput function (40 lines)
// Now using shared parseHookInputAsync from hook-input.cjs

/**
 * Format the violation message for output.
 * @param {string} fromState - Current state
 * @param {string} toState - Attempted target state
 * @returns {string} Formatted violation message
 */
function formatViolationMessage(fromState, toState) {
  const validTargets = STATE_TRANSITIONS[fromState] || [];
  return `[EVOLUTION STATE VIOLATION] Invalid state transition: ${fromState} -> ${toState}
Valid transitions from ${fromState}: ${validTargets.join(', ') || 'none'}
Follow the EVOLVE workflow: E -> V -> O -> L -> V -> E`;
}

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

    // PERF-006: Use shared hook-input utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // Get the tool input using shared helper
    const toolInput = getToolInput(hookInput);

    // Extract target state from tool input
    const targetState = extractTargetState(toolInput);

    if (!targetState) {
      // Not a state transition operation - allow
      process.exit(0);
    }

    // Concurrent evolution prevention: atomically acquire lock when starting (idle -> evaluating).
    // acquireEvolutionLock uses O_EXCL to prevent TOCTOU races — two concurrent processes
    // cannot both pass the old checkEvolutionLock+writeEvolutionLock pair.
    const currentStateForLock = getEvolutionState()?.state || 'idle';
    if (currentStateForLock === 'idle' && targetState === 'evaluating') {
      const acquired = acquireEvolutionLock('evolution-orchestrator');
      if (!acquired) {
        // Failed to acquire — another process holds the lock
        const currentLock = checkEvolutionLock();
        const msg = `[EVOLUTION LOCK] Evolution already in progress (owner: ${currentLock.owner || 'unknown'}, since: ${currentLock.since || 'unknown'}). Cannot start a concurrent evolution run. Wait for the current run to complete or expire (TTL: 30 minutes).`;
        if (enforcement === 'block') {
          console.log(JSON.stringify({ result: 'block', message: msg }));
          process.exit(0);
        } else {
          console.log(JSON.stringify({ result: 'warn', message: msg }));
          process.exit(0);
        }
      }
      // Lock acquired — proceed with the state transition
    }

    // Get current evolution state
    const state = getEvolutionState();
    const currentState = state?.state || 'idle';

    // Check if transition is valid
    if (isValidTransition(currentState, targetState)) {
      process.exit(0);
    }

    // Invalid transition - violation
    const message = formatViolationMessage(currentState, targetState);

    if (enforcement === 'block') {
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Write',
          reason: 'evolution_state_transition_invalid',
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(JSON.stringify({ result: 'block', message }));
      process.exit(0);
    } else {
      // Default to warn
      console.log(JSON.stringify({ result: 'warn', message }));
      process.exit(0);
    }
  } catch (err) {
    // Fail CLOSED on errors (SEC-008 compliance for security hooks)
    if (process.env.DEBUG_HOOKS) {
      console.error('evolution-state-guard error:', err.message);
      console.error('Stack trace:', err.stack);
    }
    process.exit(2);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  parseHookInput: parseHookInputAsync, // PERF-006: Use shared utility
  getEnforcementMode,
  isValidTransition,
  extractTargetState,
  getEvolutionState,
  checkEvolutionLock,
  writeEvolutionLock,
  acquireEvolutionLock, // SEC-TOCTOU: Atomic lock acquisition (replaces checkEvolutionLock+writeEvolutionLock)
  VALID_STATES,
  STATE_TRANSITIONS,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
  EVOLUTION_LOCK_PATH,
  EVOLUTION_LOCK_TTL_MS,
};
