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
      process.exit(2);
    } else {
      // Default to warn
      console.log(JSON.stringify({ result: 'warn', message }));
      process.exit(0);
    }
  } catch (err) {
    // Fail open on errors to avoid blocking legitimate work
    if (process.env.DEBUG_HOOKS) {
      console.error('evolution-state-guard error:', err.message);
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
  parseHookInput: parseHookInputAsync, // PERF-006: Use shared utility
  getEnforcementMode,
  isValidTransition,
  extractTargetState,
  getEvolutionState,
  VALID_STATES,
  STATE_TRANSITIONS,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
};
