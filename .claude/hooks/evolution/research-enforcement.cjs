#!/usr/bin/env node
/**
 * research-enforcement.cjs
 * PreToolUse hook for Write/Edit operations
 *
 * Enforces: Cannot create artifact files without completing research phase.
 * The evolution-state.json must have at least 3 research entries before
 * any Write/Edit to agent/skill/workflow files is allowed.
 *
 * ENFORCEMENT MODES (RESEARCH_ENFORCEMENT):
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   RESEARCH_ENFORCEMENT=warn
 *   RESEARCH_ENFORCEMENT=off
 *
 * Exit codes:
 * - 0: Allow operation (research complete, not artifact path, or warn/off mode)
 * - 2: Block operation (artifact creation without research in block mode, or on error - SEC-008 fail-closed)
 *
 * SEC-008: The hook fails CLOSED (exits 2) on errors to prevent security bypass.
 * Set HOOK_FAIL_OPEN=true to override for debugging only.
 */

'use strict';

const path = require('path');
// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  extractFilePath,
  getToolInput,
  getEnforcementMode: getEnfMode,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { getCachedState } = require('../../lib/utils/state-cache.cjs');
// HOOK-003 FIX: Use safeReadJSON for SEC-007 prototype pollution prevention
const { safeReadJSON } = require('../../lib/utils/safe-json.cjs');

// Minimum number of research entries required before artifact creation
const MIN_RESEARCH_ENTRIES = 3;

// Artifact path patterns that require research
const ARTIFACT_PATH_PATTERNS = [
  /\.claude\/agents\//,
  /\.claude\/skills\//,
  /\.claude\/workflows\//,
  /\.claude\/hooks\//,
  /\.claude\/templates\//,
  /\.claude\/schemas\//,
];

const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');

/**
 * Get enforcement mode from environment variable
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  return getEnfMode('RESEARCH_ENFORCEMENT', 'block');
}

/**
 * Check if a file path is an artifact path that requires research
 * @param {string} filePath - The file path to check
 * @returns {boolean}
 */
function isArtifactPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  return ARTIFACT_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Get the evolution state from file
 * PERF-004: Uses state-cache for TTL-based caching of evolution state
 * HOOK-003 FIX: Uses safeReadJSON for SEC-007 prototype pollution prevention
 * @returns {Object|null}
 */
function getEvolutionState() {
  try {
    // PERF-004: Use cached state with 1s TTL
    const cached = getCachedState(EVOLUTION_STATE_PATH, null);
    if (cached !== null) {
      return cached;
    }
    // Fallback to safeReadJSON for validation if cache returned null (new file)
    return safeReadJSON(EVOLUTION_STATE_PATH, 'evolution-state');
  } catch (_e) {
    // File might be corrupted or locked
    return null;
  }
}

/**
 * Check if research phase is complete (3+ entries)
 * @param {Object|null} state - Evolution state
 * @returns {{ complete: boolean, count: number, entries: Array }}
 */
function checkResearchComplete(state) {
  if (!state || !state.currentEvolution) {
    return { complete: false, count: 0, entries: [] };
  }

  const research = state.currentEvolution.research || [];
  const count = research.length;

  return {
    complete: count >= MIN_RESEARCH_ENTRIES,
    count,
    entries: research,
  };
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Format the violation message for output.
 * @param {number} currentCount - Current number of research entries
 * @returns {string} Formatted violation message
 */
function formatViolationMessage(currentCount) {
  return `[EVOLUTION WORKFLOW VIOLATION] Cannot create artifact without completing research.
Phase O (OBTAIN) requires minimum ${MIN_RESEARCH_ENTRIES} research entries. Current: ${currentCount}.
Complete research phase first by invoking: Skill({ skill: "research-synthesis" })`;
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

    // Parse the hook input using shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // PERF-006: Get the file path using shared utility
    const toolInput = getToolInput(hookInput);
    const filePath = extractFilePath(toolInput) || '';

    // Check if this is an artifact path
    if (!isArtifactPath(filePath)) {
      // Not an artifact path - allow
      process.exit(0);
    }

    // Get evolution state and check research
    const state = getEvolutionState();
    const research = checkResearchComplete(state);

    // If research is complete, allow
    if (research.complete) {
      process.exit(0);
    }

    // Research not complete - violation
    const message = formatViolationMessage(research.count);

    if (enforcement === 'block') {
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Write',
          reason: 'research_requirement_not_met',
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
    // SEC-008: Allow debug override for troubleshooting
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      console.error(
        JSON.stringify({
          hook: 'research-enforcement',
          event: 'fail_open_override',
          error: err.message,
        })
      );
      process.exit(0);
    }

    // Audit log the error
    console.error(
      JSON.stringify({
        hook: 'research-enforcement',
        event: 'error_fail_closed',
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );

    // SEC-008: Fail closed - deny when security state unknown
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'research-enforcement',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
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
  getEnforcementMode,
  isArtifactPath,
  checkResearchComplete,
  getEvolutionState,
  MIN_RESEARCH_ENTRIES,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
};
