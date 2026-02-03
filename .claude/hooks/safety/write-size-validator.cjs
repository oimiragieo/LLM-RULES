#!/usr/bin/env node
/**
 * Write Size Validator - Pre-Write Validation Hook
 * ==================================================
 *
 * Prevents agents from writing content exceeding token limits.
 *
 * Background:
 * Error 2 from agent-error-fixes-plan: devops agent tried to write 41,350 tokens
 * to environment.cjs (limit is 25,000). This hook catches oversized writes BEFORE
 * they fail.
 *
 * Validation:
 * - Token estimation: ~4 chars per token (rough but effective)
 * - WARNING_THRESHOLD: 20,000 tokens (80% of limit) - warns but allows
 * - MAX_TOKENS: 25,000 tokens (hard limit) - blocks operation
 *
 * Triggers on: Write, Edit, NotebookEdit tools
 *
 * Exit codes:
 * - 0: Allow operation (or fail open on error)
 * - 2: Block operation (content exceeds MAX_TOKENS)
 *
 * @module write-size-validator
 */

'use strict';

const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  _formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum allowed tokens for write operations
 * @constant {number}
 */
const MAX_TOKENS = 25000;

/**
 * Warning threshold (80% of max)
 * @constant {number}
 */
const WARNING_THRESHOLD = 20000;

/**
 * Tools to validate
 * @constant {string[]}
 */
const VALIDATED_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimate token count from content
 * Uses rough approximation: ~4 chars per token
 *
 * @param {string} content - Content to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(content) {
  if (!content || typeof content !== 'string') {
    return 0;
  }
  return Math.ceil(content.length / 4);
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

/**
 * Extract content to validate from tool input
 *
 * @param {string} toolName - Tool name
 * @param {Object} toolInput - Tool input object
 * @returns {string|null} Content to validate or null
 */
function extractContent(toolName, toolInput) {
  if (!toolInput) {
    return null;
  }

  switch (toolName) {
    case 'Write':
    case 'NotebookEdit':
      return toolInput.content || null;

    case 'Edit':
      // For Edit, check new_string (the replacement content)
      return toolInput.new_string || null;

    default:
      return null;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate content size
 *
 * @param {Object} input - Hook input
 * @returns {Object} Validation result { decision: 'allow'|'warn'|'block', reason, file, suggestion }
 */
function validateContentSize(input) {
  const toolName = getToolName(input);
  const toolInput = getToolInput(input);

  // Skip validation for non-write tools
  if (!VALIDATED_TOOLS.includes(toolName)) {
    return { decision: 'allow', reason: 'Not a write tool' };
  }

  // Extract content
  const content = extractContent(toolName, toolInput);

  // Allow if no content (empty writes are valid)
  if (!content) {
    return { decision: 'allow', reason: 'No content to validate' };
  }

  // Estimate tokens
  const estimatedTokens = estimateTokens(content);
  const filePath = toolInput.file_path || toolInput.notebook_path || 'unknown';

  // Check against limits
  if (estimatedTokens > MAX_TOKENS) {
    return {
      decision: 'block',
      reason: `Content too large: ~${estimatedTokens} tokens (max: ${MAX_TOKENS})`,
      file: filePath,
      suggestion: 'Split content into multiple smaller files or reduce content size',
      estimatedTokens,
      maxTokens: MAX_TOKENS,
    };
  }

  if (estimatedTokens >= WARNING_THRESHOLD) {
    return {
      decision: 'warn',
      reason: `Large content: ~${estimatedTokens} tokens (warning threshold: ${WARNING_THRESHOLD})`,
      file: filePath,
      estimatedTokens,
      warningThreshold: WARNING_THRESHOLD,
    };
  }

  return { decision: 'allow', reason: `Content size OK: ~${estimatedTokens} tokens` };
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main hook execution
 */
async function main() {
  try {
    // Parse input
    const input = await parseHookInputAsync({ allowEmpty: true });

    // Allow if no input (fail open)
    if (!input) {
      auditLog('write-size-validator', 'No input, allowing');
      process.exit(0);
    }

    // Validate content size
    const result = validateContentSize(input);

    // Log decision
    auditLog('write-size-validator', `Decision: ${result.decision}`, { result });

    // Handle blocking
    if (result.decision === 'block') {
      console.error(
        JSON.stringify({
          decision: result.decision,
          reason: result.reason,
          file: result.file,
          suggestion: result.suggestion,
          estimatedTokens: result.estimatedTokens,
          maxTokens: result.maxTokens,
        })
      );
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Write',
          reason: 'write_size_exceeded',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2); // Block
    }

    // Handle warning
    if (result.decision === 'warn') {
      console.error(
        JSON.stringify({
          decision: result.decision,
          reason: result.reason,
          file: result.file,
          estimatedTokens: result.estimatedTokens,
          warningThreshold: result.warningThreshold,
        })
      );
    }

    // Allow
    process.exit(0);
  } catch (error) {
    // Fail open on error (SEC-008)
    auditLog('write-size-validator', 'Error (fail open)', { error: error.message });
    console.error(`write-size-validator error: ${error.message}`);
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { main, estimateTokens, extractContent, validateContentSize };
