// @ts-check
/**
 * Router Blacklist Violation Tracker
 *
 * Tracks Router blacklist violations (attempts to use blacklisted tools):
 * - Records violations to JSONL with rotation
 * - Provides statistics and threshold checking
 * - Security constraints: SEC-MON-001, SEC-MON-002
 *
 * @module lib/monitoring/violation-tracker
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const VIOLATIONS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'metrics',
  'router-violations.jsonl'
);
const DEFAULT_MAX_LINES = 2000;
const DEFAULT_RATE_LIMIT = 5000; // per hour
const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60000; // 60 minutes

// SEC-MON-001: Tool name whitelist
const KNOWN_TOOLS = new Set([
  'Bash',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebSearch',
  'WebFetch',
  'Task',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'Read',
  'Skill',
  'SkillCatalog',
  'AvailableAgents',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'MemoryRecord',
  'Orchestrator',
]);

// SEC-MON-002: Secret patterns to scrub
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]+/g, // OpenAI keys (sk-...)
  /ghp_[a-zA-Z0-9]+/g, // GitHub tokens (ghp_...)
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /password=[^\s&]+/gi,
  /secret=[^\s&]+/gi,
  /token=[^\s&]+/gi,
  /apikey=[^\s&]+/gi,
  /api_key=[^\s&]+/gi,
];

// Rate limiting state
const rateLimitState = {
  hour: new Date().getHours(),
  count: 0,
};

/**
 * Check rate limit (5000 violations per hour max)
 */
function checkRateLimit() {
  const currentHour = new Date().getHours();

  if (currentHour !== rateLimitState.hour) {
    rateLimitState.hour = currentHour;
    rateLimitState.count = 0;
  }

  const limit = Number(process.env.VIOLATION_METRICS_RATE_LIMIT || DEFAULT_RATE_LIMIT);
  if (rateLimitState.count >= limit) {
    return false;
  }

  rateLimitState.count++;
  return true;
}

/**
 * Sanitize string (SEC-MON-001: truncate to maxLen)
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return String(str).slice(0, maxLen);
  return str.slice(0, maxLen).replace(/\n/g, ' ');
}

/**
 * Scrub secrets from string (SEC-MON-002)
 * @param {string} str
 * @returns {string}
 */
function scrubSecrets(str) {
  if (typeof str !== 'string') return str;

  let result = str;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Record a router blacklist violation
 *
 * @param {Object} violation
 * @param {string} [metricsFile] - Optional override for testing
 * @returns {void}
 */
function recordViolation(violation, metricsFile) {
  try {
    // Check rate limit
    if (!checkRateLimit()) {
      return;
    }

    // SEC-MON-001: Validate tool name
    const tool = KNOWN_TOOLS.has(violation.tool) ? violation.tool : 'UNKNOWN';

    // SEC-MON-002: Never include raw prompt content
    const sanitized = {
      timestamp: sanitizeString(violation.timestamp || new Date().toISOString(), 100),
      tool: sanitizeString(tool, 500),
      action: sanitizeString(violation.action, 500),
      checkName: sanitizeString(violation.checkName, 500),
      routerMode: sanitizeString(violation.routerMode, 500),
      taskSpawned: Boolean(violation.taskSpawned),
      sessionId: sanitizeString(violation.sessionId || 'unknown', 500),
    };

    // SEC-MON-002: Scrub secrets from command field if present
    if (violation.command) {
      sanitized.command = scrubSecrets(sanitizeString(violation.command, 500));
    }

    // Get max lines from env
    const maxLines = Number(process.env.VIOLATION_METRICS_MAX_LINES || DEFAULT_MAX_LINES);

    // Use appendJsonl with rotation
    const targetFile = metricsFile || VIOLATIONS_FILE;
    appendJsonl(targetFile, sanitized, { maxLines });
  } catch (_err) {
    // Best-effort: never throw
  }
}

/**
 * Get violation statistics
 *
 * @param {Object} [options]
 * @param {number} [options.windowMinutes] - Time window in minutes (default: 60)
 * @param {string} [options.metricsFile] - Optional override for testing
 * @returns {{ total: number, count: number, byTool: Record<string, number>, byAction: Record<string, number>, entries: Array<any>, threshold: { exceeded: boolean, count: number, threshold: number, windowMs: number } }}
 */
function getViolationStats(options = {}) {
  const windowMinutes = options.windowMinutes || 60;
  const metricsFile = options.metricsFile || VIOLATIONS_FILE;

  // Return empty stats if file doesn't exist
  if (!fs.existsSync(metricsFile)) {
    return {
      total: 0,
      count: 0,
      byTool: {},
      byAction: {},
      entries: [],
      threshold: {
        exceeded: false,
        count: 0,
        threshold: DEFAULT_THRESHOLD,
        windowMs: DEFAULT_WINDOW_MS,
      },
    };
  }

  try {
    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Parse all entries
    const allEntries = [];
    for (const line of lines) {
      try {
        allEntries.push(JSON.parse(line));
      } catch (_err) {
        // Skip malformed lines
      }
    }

    // Filter by time window
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const recentEntries = allEntries.filter(entry => {
      const timestamp = new Date(entry.timestamp).getTime();
      return now - timestamp <= windowMs;
    });

    // Aggregate by tool and action
    const byTool = {};
    const byAction = {};
    for (const entry of recentEntries) {
      byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    }

    return {
      total: allEntries.length,
      count: recentEntries.length,
      byTool,
      byAction,
      entries: recentEntries,
      threshold: checkThreshold({ ...options, metricsFile }),
    };
  } catch (_err) {
    // Return empty stats on error
    return {
      total: 0,
      count: 0,
      byTool: {},
      byAction: {},
      entries: [],
      threshold: {
        exceeded: false,
        count: 0,
        threshold: DEFAULT_THRESHOLD,
        windowMs: DEFAULT_WINDOW_MS,
      },
    };
  }
}

/**
 * Check if violations exceed threshold
 *
 * @param {Object} [options]
 * @param {number} [options.threshold] - Max violations before alert (default: 5)
 * @param {number} [options.windowMs] - Time window in milliseconds (default: 60000)
 * @param {string} [options.metricsFile] - Optional override for testing
 * @returns {{ exceeded: boolean, count: number, threshold: number, windowMs: number }}
 */
function checkThreshold(options = {}) {
  const threshold = options.threshold || DEFAULT_THRESHOLD;
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const metricsFile = options.metricsFile || VIOLATIONS_FILE;

  // Return not exceeded if file doesn't exist
  if (!fs.existsSync(metricsFile)) {
    return {
      exceeded: false,
      count: 0,
      threshold,
      windowMs,
    };
  }

  try {
    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Count violations within window
    const now = Date.now();
    let count = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp).getTime();
        if (now - timestamp <= windowMs) {
          count++;
        }
      } catch (_err) {
        // Skip malformed lines
      }
    }

    return {
      exceeded: count > threshold,
      count,
      threshold,
      windowMs,
    };
  } catch (_err) {
    return {
      exceeded: false,
      count: 0,
      threshold,
      windowMs,
    };
  }
}

/**
 * Reset rate limiter state (for testing)
 */
function _resetForTesting() {
  rateLimitState.hour = new Date().getHours();
  rateLimitState.count = 0;
}

module.exports = {
  recordViolation,
  getViolationStats,
  checkThreshold,
  _resetForTesting,
};
