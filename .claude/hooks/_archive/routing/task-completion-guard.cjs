#!/usr/bin/env node
'use strict';

/**
 * task-completion-guard.cjs
 *
 * PostToolUse hook that warns when Task output indicates completion
 * but no TaskUpdate was recorded recently.
 *
 * Trigger: PostToolUse(Task)
 *
 * ENFORCEMENT MODES (via TASK_COMPLETION_GUARD env var):
 * - warn (default): Prints warning but allows
 * - off: Disables checking
 */

const routerState = require('./router-state.cjs');

// PERF-006/PERF-007: Use shared hook-input.cjs utility
const { parseHookInputAsync, getToolOutput } = require('../../lib/utils/hook-input.cjs');

// Phrases that indicate task completion
const COMPLETION_INDICATORS = [
  /task.*(?:complete|completed|done|finished)/i,
  /(?:complete|completed|done|finished).*task/i,
  /successfully.*(?:complete|created|implemented|fixed)/i,
  /all.*(?:tests|checks).*pass/i,
  /implementation.*complete/i,
  /changes.*made/i,
  /summary.*(?:of|:)/i,
  /## Summary/i,
  /Task \d+ (?:is )?(?:now )?complete/i,
  /I have (?:successfully )?(?:completed|finished|done)/i,
];

/**
 * Get enforcement mode from environment variable.
 * @returns {'warn' | 'off'}
 */
function getEnforcementMode() {
  const mode = process.env.TASK_COMPLETION_GUARD || 'warn';
  return ['warn', 'off'].includes(mode) ? mode : 'warn';
}

/**
 * Check if output text indicates task completion.
 * @param {any} output - The output to check
 * @returns {boolean} True if completion indicators found
 */
function detectsCompletion(output) {
  if (!output || typeof output !== 'string') return false;
  return COMPLETION_INDICATORS.some(pattern => pattern.test(output));
}

/**
 * Format the warning message.
 * @param {string} output - The task output
 * @returns {string} Formatted warning message
 */
function formatWarning(output) {
  // Extract first 200 chars of output for context
  const snippet = output.substring(0, 200).replace(/\n/g, ' ');

  return `
+======================================================================+
|  WARNING: TASK COMPLETION DETECTED WITHOUT TaskUpdate                |
+======================================================================+
|  Agent output indicates task completion, but no TaskUpdate was       |
|  recorded recently.                                                  |
|                                                                      |
|  Output snippet: "${snippet.substring(0, 50)}..."                    |
|                                                                      |
|  AGENTS MUST call TaskUpdate({ status: "completed" }) when done!     |
|                                                                      |
|  This may indicate the agent ignored task tracking instructions.     |
+======================================================================+
`;
}

// parseHookInput removed - now using parseHookInputAsync from shared hook-input.cjs
// PERF-006/PERF-007: Eliminated ~35 lines of duplicated parsing code

/**
 * Main execution function.
 */
async function main() {
  const enforcement = getEnforcementMode();

  if (enforcement === 'off') {
    process.exit(0);
    return;
  }

  // PERF-006/PERF-007: Use shared hook-input.cjs utility
  const input = await parseHookInputAsync();

  if (!input) {
    process.exit(0);
    return;
  }

  // Use shared helper to extract tool output
  const output = getToolOutput(input);
  if (!output) {
    process.exit(0);
    return;
  }

  // Check if output indicates completion
  if (!detectsCompletion(output)) {
    process.exit(0);
    return;
  }

  // Check if TaskUpdate was called recently
  const wasUpdated = routerState.wasTaskUpdateCalledRecently();

  if (wasUpdated) {
    // Good - agent followed protocol
    if (process.env.DEBUG_HOOKS) {
      console.error('[task-completion-guard] Agent properly called TaskUpdate');
    }
    process.exit(0);
    return;
  }

  // Warning - completion detected but no TaskUpdate
  console.error(formatWarning(output));
  process.exit(0); // Warn only, don't block
}

// Run if this is the main module
if (require.main === module) {
  main().catch(err => {
    if (process.env.DEBUG_HOOKS) {
      console.error('task-completion-guard error:', err.message);
    }
    process.exit(0);
  });
}

module.exports = { main, detectsCompletion, COMPLETION_INDICATORS };
