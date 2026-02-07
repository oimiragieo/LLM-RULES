// @ts-check
/**
 * Metrics Collector Hook
 *
 * Collects performance metrics for hook execution:
 * - Execution time per hook
 * - Success/failure rates
 * - Hook chain performance
 * - Bottleneck detection
 *
 * Security: SEC-MON-001 (Metrics validation)
 * Performance: <1ms overhead per hook
 *
 * @module hooks/monitoring/metrics-collector
 */

/**
 * @typedef {Object} Metric
 * @property {string} timestamp
 * @property {string} hook
 * @property {string} event
 * @property {string} tool
 * @property {number} executionTimeMs
 * @property {'success'|'failure'} status
 * @property {string} [error]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} HookContext
 * @property {string} [sessionId]
 * @property {number} [sessionDuration]
 * @property {number} [_metricsStartTime]
 */

/**
 * @typedef {Object} HookResult
 * @property {Error|{message:string}} [error]
 * @property {any} [output]
 */

const fs = require('fs');
const path = require('path');
const _crypto = require('crypto');

const { createLogger } = require('../../lib/utils/logger.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const logger = createLogger('metrics-collector');

// Metrics file location
const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const HOOKS_METRICS_FILE = path.join(METRICS_DIR, 'hook-metrics.jsonl');
const HOOK_METRICS_MAX_LINES = Number(process.env.HOOK_METRICS_MAX_LINES || 2000);

// Rate limiting: 10000 metrics per hour (reasonable for hook execution)
const RATE_LIMIT_PER_HOUR = 10000;
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

  // Reset counter if hour changed
  if (currentHour !== rateLimitState.hour) {
    rateLimitState.hour = currentHour;
    rateLimitState.count = 0;
  }

  // Check limit
  if (rateLimitState.count >= RATE_LIMIT_PER_HOUR) {
    logger.warn(`Rate limit exceeded (${RATE_LIMIT_PER_HOUR}/hour)`);
    return false;
  }

  rateLimitState.count++;
  return true;
}

/**
 * Validate metric entry (SEC-MON-001)
 * @param {Metric} metric
 */
function validateMetric(metric) {
  if (!metric.timestamp || typeof metric.timestamp !== 'string') {
    throw new Error('Invalid metric: timestamp must be ISO 8601 string');
  }

  if (!metric.hook || typeof metric.hook !== 'string') {
    throw new Error('Invalid metric: hook must be string');
  }

  if (!metric.event || typeof metric.event !== 'string') {
    throw new Error('Invalid metric: event must be string');
  }

  if (typeof metric.executionTimeMs !== 'number' || metric.executionTimeMs < 0) {
    throw new Error('Invalid metric: executionTimeMs must be non-negative number');
  }

  if (!['success', 'failure'].includes(metric.status)) {
    throw new Error('Invalid metric: status must be "success" or "failure"');
  }

  return true;
}

/**
 * Log metric to JSONL file
 * @param {Metric} metric
 */
function logMetric(metric) {
  try {
    // Check rate limit
    if (!checkRateLimit()) {
      return;
    }

    // Validate metric
    validateMetric(metric);

    // Ensure directory exists
    ensureMetricsDir();

    appendJsonl(HOOKS_METRICS_FILE, metric, { maxLines: HOOK_METRICS_MAX_LINES });
  } catch (error) {
    // Log error but don't throw (monitoring shouldn't break the system)
    const err = /** @type {Error} */ (error);
    logger.error('Failed to log metric', { error: err.message });
  }
}

/**
 * Store start time in context
 * @param {string} tool
 * @param {Object} params
 * @param {HookContext} context
 */
function preToolUse(tool, params, context) {
  // Store start time
  context._metricsStartTime = Date.now();

  return { tool, params };
}

/**
 * Calculate and log metrics
 * @param {string} tool
 * @param {Object} params
 * @param {HookResult} result
 * @param {HookContext} context
 */
function postToolUse(tool, params, result, context) {
  try {
    // Calculate duration
    const startTime = context._metricsStartTime || Date.now();
    const executionTimeMs = Date.now() - startTime;

    // Determine status
    /** @type {'success'|'failure'} */
    const status = result.error ? 'failure' : 'success';

    // Get hook name from stack trace (if available)
    const stack = new Error().stack || '';
    const hookMatch = stack.match(/at\s+.*[/\\](\w+\.cjs)/);
    const hook = hookMatch ? hookMatch[1] : 'unknown';

    // Create metric entry
    const metric = {
      timestamp: new Date().toISOString(),
      hook,
      event: 'PostToolUse',
      tool,
      executionTimeMs: Math.round(executionTimeMs * 100) / 100, // Round to 2 decimals
      status,
      error: result.error
        ? result.error instanceof Error
          ? result.error.message
          : String(result.error)
        : undefined,
      metadata: {
        paramsSize: (() => {
          // SEC-RESTORE-001: Cap JSON.stringify output at 10KB
          const paramsStr = JSON.stringify(params);
          const cappedParams = paramsStr.length > 10240 ? paramsStr.slice(0, 10240) + '...[truncated]' : paramsStr;
          return cappedParams.length;
        })(),
        resultSize: (() => {
          // SEC-RESTORE-001: Cap JSON.stringify output at 10KB
          const resultStr = JSON.stringify(result);
          const cappedResult = resultStr.length > 10240 ? resultStr.slice(0, 10240) + '...[truncated]' : resultStr;
          return cappedResult.length;
        })(),
      },
    };

    // Log metric
    logMetric(metric);
  } catch (error) {
    // Silently fail - monitoring shouldn't break execution
    logger.error('Error in postToolUse', { error: error.message });
  }

  return { tool, params, result };
}

/**
 * Session start tracking
 * @param {HookContext} context
 */
function sessionStart(context) {
  /** @type {Metric} */
  const metric = {
    timestamp: new Date().toISOString(),
    hook: 'metrics-collector.cjs',
    event: 'SessionStart',
    tool: 'N/A',
    executionTimeMs: 0,
    status: 'success',
    metadata: {
      sessionId: context.sessionId || 'unknown',
    },
  };

  logMetric(metric);

  return context;
}

/**
 * Session end tracking
 * @param {HookContext} context
 */
function sessionEnd(context) {
  /** @type {Metric} */
  const metric = {
    timestamp: new Date().toISOString(),
    hook: 'metrics-collector.cjs',
    event: 'SessionEnd',
    tool: 'N/A',
    executionTimeMs: 0,
    status: 'success',
    metadata: {
      sessionId: context.sessionId || 'unknown',
      duration: context.sessionDuration || 'unknown',
    },
  };

  logMetric(metric);

  return context;
}

module.exports = {
  preToolUse,
  postToolUse,
  sessionStart,
  sessionEnd,
};
