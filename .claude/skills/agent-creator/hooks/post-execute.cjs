#!/usr/bin/env node

/**
 * agent-creator - Post-Execute Hook
 * ==================================
 *
 * Runs after the agent-creator executes to clean up state.
 *
 * CRIT-002 FIX: This hook now properly clears the active-creators.json entry
 * to ensure the creator state is cleaned up after workflow completion.
 *
 * State file: .claude/context/runtime/active-creators.json
 * Actions:
 *   1. Clear this creator's active state
 *   2. Log completion status
 *   3. Handle both success and failure cases
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const CREATOR_NAME = 'agent-creator';

// Parse hook input (result from skill execution)
const result = safeParseJSON(process.argv[2] || '{}');

console.log(`[${CREATOR_NAME.toUpperCase()}] Post-execute: Cleaning up state...`);

/**
 * Find project root by looking for .claude/CLAUDE.md
 * @returns {string} Project root path
 */
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const STATE_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/active-creators.json');

/**
 * Clear this creator's active state from the unified state file.
 * CRIT-002 FIX: This ensures the creator state is properly cleaned up
 * after workflow completion, regardless of success or failure.
 *
 * @returns {boolean} Success status
 */
function clearCreatorActive() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      // State file doesn't exist - nothing to clear
      console.log(`[${CREATOR_NAME.toUpperCase()}] No state file found - nothing to clear`);
      return true;
    }

    // Read existing state
    let state = {};
    try {
      state = safeParseJSON(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (_e) {
      // If file is corrupted, start fresh
      state = {};
    }

    // Clear this creator's active state
    if (state[CREATOR_NAME]) {
      state[CREATOR_NAME].active = false;
      state[CREATOR_NAME].clearedAt = new Date().toISOString();
      state[CREATOR_NAME].clearReason = result.success ? 'completed' : 'failed';
    }

    // Write updated state
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`[${CREATOR_NAME.toUpperCase()}] State cleared in: ${STATE_FILE}`);
    return true;
  } catch (err) {
    console.error(`[${CREATOR_NAME.toUpperCase()}] Failed to clear state:`, err.message);
    return false;
  }
}

/**
 * Process execution result and perform cleanup
 * @param {Object} executionResult - Result from skill execution
 * @returns {{ success: boolean, message?: string }}
 */
function processResult(executionResult) {
  // CRIT-002 FIX: Always clear active state, regardless of success/failure
  const stateCleared = clearCreatorActive();

  if (!stateCleared) {
    return {
      success: false,
      message: 'Failed to clear creator state',
    };
  }

  // Log completion status
  if (executionResult.success) {
    console.log(
      `[${CREATOR_NAME.toUpperCase()}] Agent created successfully: ${executionResult.artifactName || 'unknown'}`
    );
  } else {
    console.warn(
      `[${CREATOR_NAME.toUpperCase()}] Agent creation failed: ${executionResult.error || 'unknown error'}`
    );
  }

  return { success: true };
}

// Run post-processing
const outcome = processResult(result);

if (outcome.success) {
  console.log(`[${CREATOR_NAME.toUpperCase()}] Post-execute complete`);
  process.exit(0);
} else {
  console.error(`[${CREATOR_NAME.toUpperCase()}] Post-execute had issues: ${outcome.message}`);
  process.exit(0); // Still exit 0 - post-execute failures shouldn't block
}
