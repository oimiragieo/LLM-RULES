#!/usr/bin/env node
/**
 * Plan Evolution Guard Hook
 *
 * Trigger: PreToolUse (Write)
 *
 * Enforces that all plans written to .claude/context/plans/ must contain
 * the mandatory "Phase [FINAL]: Evolution & Reflection Check" phase.
 *
 * This is HARD enforcement of the Evolution phase documented in planner.md.
 * Plans without the Evolution phase will be blocked.
 *
 * ENFORCEMENT MODES:
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   PLAN_EVOLUTION_GUARD=warn  (warning only)
 *   PLAN_EVOLUTION_GUARD=off   (disable guard)
 *
 * Exit codes:
 * - 0: Allow operation (not a plan file, has Evolution phase, or enforcement disabled)
 * - 2: Block operation (plan file missing Evolution phase in block mode)
 *
 * SECURITY NOTE (SEC-008 pattern):
 * This hook fails OPEN on errors (exit 0) since it's a validation hook,
 * not a security-critical hook. However, it still logs errors for debugging.
 */

'use strict';

const path = require('path');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { _PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  extractFilePath: sharedExtractFilePath,
  getToolName: sharedGetToolName,
  getToolInput,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

/**
 * Patterns that indicate the Evolution phase is present
 * These patterns are case-insensitive
 */
const EVOLUTION_PATTERNS = [
  /Phase\s*\[?\s*FINAL\s*\]?\s*[:-]?\s*Evolution/i, // Phase [FINAL]: Evolution
  /Evolution\s*[&]?\s*Reflection\s*(Check)?/i, // Evolution & Reflection Check
  /###?\s*Phase.*Evolution/i, // ### Phase X: Evolution
  /reflection[_-]?agent/i, // reflection-agent or reflection_agent
  /subagent_type\s*[:"]?\s*["']?reflection/i, // subagent_type: "reflection
];

/**
 * Check if file path is a plan file in .claude/context/plans/
 * @param {string} filePath - The file path to check
 * @returns {boolean} True if this is a plan markdown file
 */
function isPlanFile(filePath) {
  if (!filePath) return false;

  // Normalize path for cross-platform support
  const normalized = filePath.replace(/\\/g, '/');

  // Check if it's in the plans directory and is a markdown file
  const inPlansDir =
    normalized.includes('.claude/context/plans/') ||
    normalized.includes('.claude\\context\\plans\\');
  const isMarkdown = normalized.endsWith('.md');

  return inPlansDir && isMarkdown;
}

/**
 * Check if plan content contains the Evolution phase
 * @param {string} content - The plan content
 * @returns {boolean} True if Evolution phase is present
 */
function hasEvolutionPhase(content) {
  if (!content) return false;

  return EVOLUTION_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Format the error message when Evolution phase is missing
 * @returns {string} Formatted error message
 */
function formatMissingEvolutionError() {
  return `
========================================================================
  PLAN VALIDATION FAILED - MISSING EVOLUTION PHASE
========================================================================

  Every plan MUST end with "Phase [FINAL]: Evolution & Reflection Check"

  This phase is MANDATORY per .claude/agents/core/planner.md

  Add the following to your plan:

  ### Phase [FINAL]: Evolution & Reflection Check
  **Purpose**: Quality assessment and learning extraction
  **Tasks**:
  1. Spawn reflection-agent to analyze completed work
  2. Extract learnings and update memory files
  3. Check for evolution opportunities

  **Spawn Command**:
  Task({
    subagent_type: "reflection-agent",
    description: "Session reflection and learning extraction",
    prompt: "You are REFLECTION-AGENT..."
  })
========================================================================
`;
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

// PERF-006: extractFilePath is imported as sharedExtractFilePath
// Alias for backward compatibility with exports
const extractFilePath = sharedExtractFilePath;

/**
 * Extract content from hook input
 * @param {Object} hookInput - The hook input object
 * @returns {string|null} Content or null
 */
function extractContent(hookInput) {
  if (!hookInput) return null;

  const toolInput = hookInput.tool_input || hookInput.input || hookInput.parameters || {};

  return toolInput.content || null;
}

// PERF-006: getToolName is imported as sharedGetToolName
// Alias for backward compatibility with exports
const _getToolName = sharedGetToolName;

/**
 * Main execution function (async for proper stdin handling)
 */
async function main() {
  try {
    // Check enforcement mode
    const mode = process.env.PLAN_EVOLUTION_GUARD || 'block';

    // If enforcement is off, allow and audit log
    if (mode === 'off') {
      console.error(
        JSON.stringify({
          hook: 'plan-evolution-guard',
          event: 'security_override_used',
          override: 'PLAN_EVOLUTION_GUARD=off',
          timestamp: new Date().toISOString(),
          warning:
            'Plan Evolution enforcement disabled - plans may be created without Evolution phase',
        })
      );
      process.exit(0);
    }

    // Parse hook input using shared async utility
    const hookInput = await parseHookInputAsync({ timeout: 200 });

    // No input - fail open (not a security hook)
    if (!hookInput) {
      process.exit(0);
    }

    // Check tool name - only validate Write operations
    const toolName = sharedGetToolName(hookInput);
    if (toolName !== 'Write') {
      process.exit(0);
    }

    // Extract file path using shared utility
    const toolInput = getToolInput(hookInput);
    const filePath = sharedExtractFilePath(toolInput);

    // Not a plan file - allow
    if (!isPlanFile(filePath)) {
      process.exit(0);
    }

    // Extract content
    const content = extractContent(hookInput);

    // Check for Evolution phase
    if (hasEvolutionPhase(content)) {
      // Evolution phase found - allow
      process.exit(0);
    }

    // Evolution phase NOT found - block or warn
    if (mode === 'warn') {
      console.error('[WARN] Plan missing Evolution phase - allowing anyway');
      console.error(formatMissingEvolutionError());
      process.exit(0);
    }

    // Block mode (default)
    console.error(formatMissingEvolutionError());
    console.log(
      JSON.stringify({
        result: 'block',
        message: 'Plan missing mandatory Evolution & Reflection phase',
      })
    );
    try {
      await eventBus.emit(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName: 'Write',
        reason: 'missing_evolution_phase',
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  } catch (err) {
    // Fail open for validation hooks (not security-critical)
    // But still log the error for debugging
    console.error(
      JSON.stringify({
        hook: 'plan-evolution-guard',
        event: 'error_fail_open',
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );

    if (process.env.DEBUG_HOOKS) {
      console.error('Plan evolution guard error:', err.message);
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
  isPlanFile,
  hasEvolutionPhase,
  EVOLUTION_PATTERNS,
  extractFilePath,
  extractContent,
  formatMissingEvolutionError,
};
