#!/usr/bin/env node
// @ts-check
/**
 * Error Capture Post-Tool Hook
 *
 * PostToolUse hook that captures errors and persists them to the error log.
 * Implements fail-open behavior with circuit breaker to never block agent execution.
 *
 * Features:
 * - Captures errors from tool failures
 * - Generates unique error IDs (ERR-XXXXXXXX)
 * - Classifies error category and severity
 * - Masks sensitive data before logging
 * - Correlates errors with session/trace/task IDs
 * - Implements circuit breaker for logging failures
 *
 * Security: SEC-LOG-001 (Error logging)
 *
 * @module hooks/safety/error-capture-post-tool
 */

'use strict';

const crypto = require('crypto');
const path = require('path');

// Try to load error sanitizer, fall back to no-op if not available
let sanitizer;
try {
  sanitizer = require('../../lib/utils/error-sanitizer.cjs');
} catch (_e) {
  // Fallback sanitizer
  sanitizer = {
    sanitizeForLogging: obj => obj,
    maskStackTrace: stack => (stack ? stack.split('\n').slice(0, 3) : []),
  };
}

// Try to load error writer, fall back to console if not available
let errorWriter;
try {
  errorWriter = require('../../lib/error-writer.cjs');
} catch (_e) {
  // Fallback writer
  errorWriter = {
    writeError: entry => {
      if (process.env.DEBUG_ERROR_CAPTURE) {
        console.error('[error-capture] Fallback writer:', JSON.stringify(entry));
      }
      return true;
    },
  };
}

// =============================================================================
// Circuit Breaker State
// =============================================================================

const circuitBreaker = {
  state: 'CLOSED', // CLOSED, OPEN, HALF-OPEN
  failures: 0,
  lastFailure: null,
  threshold: 5, // Number of failures before opening circuit
  cooldown: 60000, // Cooldown period in ms (1 minute)
};

/**
 * Get current circuit breaker state
 * @returns {{state: string, failures: number, lastFailure: number|null, threshold: number, cooldown: number}}
 */
function getCircuitState() {
  return { ...circuitBreaker };
}

/**
 * Check if error logging should proceed based on circuit state
 * @returns {boolean}
 */
function shouldLogError() {
  if (circuitBreaker.state === 'OPEN') {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    if (elapsed < circuitBreaker.cooldown) {
      return false; // Circuit open, skip logging
    }
    circuitBreaker.state = 'HALF-OPEN';
  }
  return true;
}

/**
 * Record a logging failure
 */
function recordLoggingFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = 'OPEN';
    console.error('[error-capture] Circuit OPEN - error logging disabled for cooldown');
  }
}

/**
 * Record a logging success
 */
function recordLoggingSuccess() {
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'CLOSED';
}

// =============================================================================
// Error ID Generation
// =============================================================================

/**
 * Generate unique error ID in ERR-XXXXXXXX format
 * Uses crypto random bytes for uniqueness
 *
 * @returns {string} Error ID (e.g., ERR-A1B2C3D4)
 */
function generateErrorId() {
  const bytes = crypto.randomBytes(4);
  const hex = bytes.toString('hex').toUpperCase();
  return `ERR-${hex}`;
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Category patterns for error classification
 */
const CATEGORY_PATTERNS = {
  SECURITY_VIOLATION: [
    /SEC-\d{3}/i,
    /security/i,
    /unauthorized/i,
    /forbidden/i,
    /path traversal/i,
    /injection/i,
  ],
  VALIDATION_ERROR: [/validation/i, /schema/i, /invalid/i, /missing required/i, /malformed/i],
  TIMEOUT_ERROR: [/timeout/i, /timed out/i, /deadline exceeded/i, /ETIMEDOUT/],
  MEMORY_ERROR: [
    /memory/i,
    /file not found/i,
    /ENOENT/,
    /learnings\.md/i,
    /decisions\.md/i,
    /issues\.md/i,
  ],
  EXECUTION_ERROR: [/spawn/i, /task/i, /agent/i, /TaskUpdate/i],
  RESOURCE_ERROR: [/token limit/i, /context limit/i, /quota exceeded/i, /rate limit/i],
};

/**
 * Classify error category based on error message and tool
 *
 * @param {Object} error - Error object
 * @param {string} tool - Tool name
 * @returns {'EXECUTION_ERROR'|'HOOK_FAILURE'|'TOOL_FAILURE'|'VALIDATION_ERROR'|'MEMORY_ERROR'|'SECURITY_VIOLATION'|'TIMEOUT_ERROR'|'RESOURCE_ERROR'}
 */
function classifyCategory(error, tool) {
  const message = error?.message || '';
  const code = error?.code || '';
  const text = `${message} ${code}`;

  // Check each category pattern
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return category;
      }
    }
  }

  // Default classification based on tool
  if (tool === 'Task') {
    return 'EXECUTION_ERROR';
  }

  if (tool && tool.includes('hook')) {
    return 'HOOK_FAILURE';
  }

  return 'TOOL_FAILURE';
}

/**
 * Classify error severity based on category and context
 *
 * @param {string} category - Error category
 * @param {Object} context - Error context
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'}
 */
function classifySeverity(category, context) {
  const impact = context?.impact || {};

  // CRITICAL: Security violations, data loss
  if (category === 'SECURITY_VIOLATION') return 'CRITICAL';
  if (impact.dataLoss) return 'CRITICAL';

  // HIGH: Task-blocking errors, execution errors, memory errors
  if (category === 'EXECUTION_ERROR') return 'HIGH';
  if (category === 'MEMORY_ERROR') return 'HIGH';
  if (impact.taskBlocked) return 'HIGH';

  // LOW: Recoverable and not user-visible
  if (impact.recoverable && !impact.userVisible) return 'LOW';

  // MEDIUM: Default for tool failures, validation errors, timeouts
  return 'MEDIUM';
}

// =============================================================================
// Error Entry Building
// =============================================================================

/**
 * Build error entry with all required fields
 *
 * @param {Object} error - Error object
 * @param {string} tool - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} context - Execution context
 * @returns {Object} Error entry
 */
function buildErrorEntry(error, tool, params, context) {
  const category = classifyCategory(error, tool);
  const severity = classifySeverity(category, context);

  // Extract source information from stack trace
  const stack = error?.stack || '';
  const sourceMatch = stack.match(/at\s+(?:.*?\s)?\(?([\w/._-]+\.(?:js|cjs|mjs)):(\d+)/);
  const source = {
    component: 'tool',
    location: sourceMatch ? sourceMatch[1] : tool,
    line: sourceMatch ? parseInt(sourceMatch[2], 10) : undefined,
  };

  // Build correlation data
  const correlation = {
    sessionId: process.env.CLAUDE_SESSION_ID || undefined,
    traceId: undefined, // OpenTelemetry integration (future)
    spanId: undefined,
  };

  // Mask sensitive data in params
  const maskedInput = sanitizer.sanitizeForLogging(params || {});

  // Build stack trace (limited to 3 frames)
  const maskedStack = sanitizer.maskStackTrace(stack);

  // Build context
  const errorContext = {
    toolName: tool,
    taskId: context?.taskId,
    agentName: context?.agentName,
    phase: 'post_tool_use',
    recoveryAttempt: false,
  };

  return {
    errorId: generateErrorId(),
    timestamp: new Date().toISOString(),
    category,
    severity,
    source,
    message: sanitizer.sanitizeForLogging(error?.message || 'Unknown error'),
    stack: maskedStack,
    context: errorContext,
    correlation,
    maskedInput,
    impact: context?.impact || {
      taskBlocked: false,
      userVisible: true,
      dataLoss: false,
      recoverable: true,
    },
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * PostToolUse hook for capturing errors
 *
 * @param {string} tool - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} result - Tool result
 * @param {Object} context - Execution context
 * @returns {{tool: string, params: Object, result: Object, error?: Object}}
 */
function postToolUse(tool, params, result, context) {
  try {
    // Pass through if no error
    if (!result?.error) {
      return { tool, params, result };
    }

    // Check circuit breaker
    if (!shouldLogError()) {
      if (process.env.DEBUG_ERROR_CAPTURE) {
        console.error('[error-capture] Circuit open, skipping error logging');
      }
      return { tool, params, result };
    }

    // Build error entry
    const errorEntry = buildErrorEntry(result.error, tool, params, context);

    // Write error to log
    try {
      const success = errorWriter.writeError(errorEntry);
      if (success) {
        recordLoggingSuccess();
      } else {
        recordLoggingFailure();
      }
    } catch (writeErr) {
      recordLoggingFailure();
      if (process.env.DEBUG_ERROR_CAPTURE) {
        console.error('[error-capture] Write failed:', writeErr.message);
      }
      // Fallback to stderr
      console.error(
        '[ERROR-CAPTURE-FALLBACK]',
        JSON.stringify({
          errorId: errorEntry.errorId,
          category: errorEntry.category,
          severity: errorEntry.severity,
          message: errorEntry.message,
        })
      );
    }
  } catch (_e) {
    // Fail-open: never block agent execution
    if (process.env.DEBUG_ERROR_CAPTURE) {
      console.error('[error-capture] Internal error:', _e.message);
    }
  }

  // Always return the original result
  return { tool, params, result };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  postToolUse,
  generateErrorId,
  classifyCategory,
  classifySeverity,
  buildErrorEntry,
  getCircuitState,
  // Internal functions for testing
  shouldLogError,
  recordLoggingFailure,
  recordLoggingSuccess,
};
