// @ts-check
/**
 * Error Tracker Hook
 *
 * Tracks errors and failures across the system:
 * - Hook failures
 * - Validation errors
 * - Security control violations
 * - System errors
 *
 * Security: SEC-MON-002 (Error logging)
 *
 * @module hooks/monitoring/error-tracker
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');

// Metrics file location
const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const ERROR_METRICS_FILE = path.join(METRICS_DIR, 'error-metrics.jsonl');
const ERROR_METRICS_MAX_LINES = Number(process.env.ERROR_METRICS_MAX_LINES || 2000);

// Rate limiting
const RATE_LIMIT_PER_HOUR = 5000;
const rateLimitState = {
  hour: new Date().getHours(),
  count: 0,
};

/**
 * Ensure metrics directory exists
 */
function ensureMetricsDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

/**
 * Check rate limit
 */
function checkRateLimit() {
  const currentHour = new Date().getHours();

  if (currentHour !== rateLimitState.hour) {
    rateLimitState.hour = currentHour;
    rateLimitState.count = 0;
  }

  if (rateLimitState.count >= RATE_LIMIT_PER_HOUR) {
    return false;
  }

  rateLimitState.count++;
  return true;
}

/**
 * Determine error severity
 */
function determineSeverity(error, source) {
  // CRITICAL: Security violations
  if (source.includes('security') || error.message?.includes('SEC-')) {
    return 'CRITICAL';
  }

  // HIGH: Validation failures, routing errors
  if (source.includes('validation') || source.includes('routing')) {
    return 'HIGH';
  }

  // MEDIUM: Hook failures
  if (source.includes('hook')) {
    return 'MEDIUM';
  }

  // LOW: Other errors
  return 'LOW';
}

/**
 * Classify error type
 */
function classifyErrorType(error, source) {
  if (source.includes('security')) {
    return 'SecurityViolation';
  }

  if (source.includes('validation')) {
    return 'ValidationError';
  }

  if (source.includes('routing')) {
    return 'RoutingError';
  }

  if (error.name === 'TypeError' || error.name === 'ReferenceError') {
    return 'SystemError';
  }

  return 'UnknownError';
}

/**
 * Log error to metrics file
 */
function logError(errorEntry) {
  try {
    if (!checkRateLimit()) {
      return;
    }

    ensureMetricsDir();

    appendJsonl(ERROR_METRICS_FILE, errorEntry, { maxLines: ERROR_METRICS_MAX_LINES });
  } catch (err) {
    console.error('[error-tracker] Failed to log error:', err.message);
  }
}

/**
 * Track errors in PostToolUse
 */
function postToolUse(tool, params, result, _context) {
  try {
    // Only track if there's an error
    if (!result.error) {
      return { tool, params, result };
    }

    // Get source from stack trace
    const stack = result.error.stack || new Error().stack || '';
    const sourceMatch = stack.match(/at\s+.*\/([\w-]+\.cjs)/);
    const source = sourceMatch ? sourceMatch[1] : 'unknown';

    // Create error entry
    const errorEntry = {
      timestamp: new Date().toISOString(),
      errorType: classifyErrorType(result.error, source),
      source,
      message: result.error.message || 'Unknown error',
      severity: determineSeverity(result.error, source),
      tool,
      metadata: {
        errorName: result.error.name,
        stack: result.error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines only
        params: Object.keys(params || {}),
      },
    };

    // Log error
    logError(errorEntry);
  } catch (err) {
    console.error('[error-tracker] Error in postToolUse:', err.message);
  }

  return { tool, params, result };
}

/**
 * Track pre-tool-use errors (validation failures)
 */
function preToolUse(tool, params, _context) {
  // No errors to track yet in preToolUse
  // Errors caught by validation hooks will be tracked in postToolUse
  return { tool, params };
}

module.exports = {
  preToolUse,
  postToolUse,
};
