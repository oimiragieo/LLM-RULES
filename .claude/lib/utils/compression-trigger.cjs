/**
 * Auto-Compression Trigger - Phase 2: Framework + Test Only
 *
 * Purpose: Infrastructure to auto-invoke context-compressor skill when memory thresholds hit.
 * This is non-blocking and informational in Phase 2.
 *
 * Usage:
 *   const { checkCompressionNeeded, triggerCompression, getCompressionStats, resetCompressionCounters } = require('./compression-trigger.cjs');
 *
 * Triggers:
 * 1. Budget threshold: Budget > 90% (CRITICAL)
 * 2. Single large read: lastReadSize > 10 KB
 * 3. Single large fetch: lastFetchSize > 5 KB
 * 4. Periodic: operationCount >= 10 (every 10 operations)
 * 5. Urgent pattern: 3+ large operations in last 5 operations
 */

const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('./project-root.cjs');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const COMPRESSION_STATS_PATH = path.join(PROJECT_ROOT, '.claude/context/compression-stats.jsonl');
const COMPRESSION_REMINDER_PATH = path.join(RUNTIME_DIR, 'compression-reminder.txt');
const COMPRESSION_REMINDER_JSON_PATH = path.join(RUNTIME_DIR, 'compression-reminder.json');
const AUTO_COMPRESSION_PHASE_3 =
  process.env.AUTO_COMPRESSION_PHASE_3 === '1' || process.env.AUTO_COMPRESSION_PHASE_3 === 'true';

// Thresholds
const READ_SIZE_THRESHOLD = 10000; // 10 KB
const FETCH_SIZE_THRESHOLD = 5000; // 5 KB
const PERIODIC_INTERVAL = 10; // Every 10 operations

// Operation tracking (in-memory)
let operationCounter = 0;

/**
 * Check if compression should trigger
 *
 * @param {{
 *   tokenBudgetStatus: { percentUsed: number, status: string },
 *   lastReadSize: number,
 *   lastFetchSize: number,
 *   operationCount: number,
 *   largeOperationPattern?: boolean
 * }} context - Current context
 * @returns {{ needed: boolean, reason: string, urgency: "low"|"medium"|"high" }}
 */
function checkCompressionNeeded(context) {
  const {
    tokenBudgetStatus = { percentUsed: 0, status: 'OK' },
    lastReadSize = 0,
    lastFetchSize = 0,
    operationCount = 0,
    largeOperationPattern = false,
  } = context;

  // Trigger 1: Budget threshold (CRITICAL)
  if (tokenBudgetStatus.percentUsed >= 90) {
    return {
      needed: true,
      reason: `Budget > 90% (${tokenBudgetStatus.percentUsed.toFixed(1)}%)`,
      urgency: 'high',
    };
  }

  // Trigger 2: Single large Read
  if (lastReadSize >= READ_SIZE_THRESHOLD) {
    const sizeKB = Math.floor(lastReadSize / 1000);
    return {
      needed: true,
      reason: `Read > 10KB (${sizeKB}KB)`,
      urgency: 'medium',
    };
  }

  // Trigger 3: Single large Fetch
  if (lastFetchSize >= FETCH_SIZE_THRESHOLD) {
    const sizeKB = Math.floor(lastFetchSize / 1000);
    return {
      needed: true,
      reason: `Fetch > 5KB (${sizeKB}KB)`,
      urgency: 'medium',
    };
  }

  // Update operation counter (passed from context or internal)
  operationCounter = operationCount;

  // Trigger 4: Periodic (every 10 operations)
  if (operationCounter >= PERIODIC_INTERVAL) {
    return {
      needed: true,
      reason: `Periodic compression (${operationCounter} ops)`,
      urgency: 'low',
    };
  }

  // Trigger 5: Urgent pattern (3+ large ops in last 5)
  if (largeOperationPattern) {
    return {
      needed: true,
      reason: '3+ large operations detected',
      urgency: 'high',
    };
  }

  return {
    needed: false,
    reason: 'No compression triggers met',
    urgency: 'low',
  };
}

/**
 * Trigger compression skill
 *
 * @param {{
 *   reason: string,
 *   urgency: "low"|"medium"|"high",
 *   maxRetries?: number,
 *   _simulateFailure?: boolean
 * }} options - Compression options
 * @returns {Promise<{ success: boolean, message: string, bytesFreed: number }>}
 */
async function triggerCompression(options) {
  const { reason, urgency, _simulateFailure = false } = options;

  try {
    // Simulate failure if test flag is set
    if (_simulateFailure) {
      throw new Error('Simulated compression failure');
    }

    // In Phase 2, we don't actually invoke the skill
    // We just simulate success and log the event
    const bytesFreed = Math.floor(Math.random() * 50000) + 10000; // Simulate 10-60 KB freed

    // Log compression event
    const logEntry = {
      timestamp: new Date().toISOString(),
      reason,
      urgency,
      bytesFreed,
      success: true,
    };

    // Ensure directory exists
    const logDir = path.dirname(COMPRESSION_STATS_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to JSONL file
    fs.appendFileSync(COMPRESSION_STATS_PATH, JSON.stringify(logEntry) + '\n', 'utf8');

    // Phase 3 (optional): write a reminder file for Router/agents to act on
    if (AUTO_COMPRESSION_PHASE_3) {
      try {
        if (!fs.existsSync(RUNTIME_DIR)) {
          fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        }
        fs.writeFileSync(COMPRESSION_REMINDER_PATH, 'compression_needed\n', 'utf8');
        fs.writeFileSync(
          COMPRESSION_REMINDER_JSON_PATH,
          JSON.stringify(
            {
              reason,
              urgency,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
          'utf8'
        );
      } catch (_err) {
        // Best-effort; reminder is advisory only
      }
    }

    return {
      success: true,
      message: `Compression triggered: ${reason} (${bytesFreed} bytes freed)`,
      bytesFreed,
    };
  } catch (error) {
    // Error handling - don't retry in Phase 2
    return {
      success: false,
      message: `Compression failed: ${error.message}`,
      bytesFreed: 0,
    };
  }
}

/**
 * Get compression statistics
 *
 * @returns {{
 *   totalCompressions: number,
 *   totalBytesSaved: number,
 *   averageReduction: string,
 *   lastCompressionTime: string
 * }}
 */
function getCompressionStats() {
  // Check if stats file exists
  if (!fs.existsSync(COMPRESSION_STATS_PATH)) {
    return {
      totalCompressions: 0,
      totalBytesSaved: 0,
      averageReduction: '0%',
      lastCompressionTime: 'Never',
    };
  }

  try {
    // Read JSONL file
    const logContent = fs.readFileSync(COMPRESSION_STATS_PATH, 'utf8');
    const lines = logContent
      .trim()
      .split('\n')
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return {
        totalCompressions: 0,
        totalBytesSaved: 0,
        averageReduction: '0%',
        lastCompressionTime: 'Never',
      };
    }

    // Parse entries
    const entries = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (_e) {
          return null;
        }
      })
      .filter(entry => entry !== null && entry.success);

    const totalCompressions = entries.length;
    const totalBytesSaved = entries.reduce((sum, entry) => sum + (entry.bytesFreed || 0), 0);
    const averageReduction =
      totalCompressions > 0
        ? Math.floor((totalBytesSaved / totalCompressions / 1000) * 100) / 100 + '%'
        : '0%';
    const lastEntry = entries[entries.length - 1];
    const lastCompressionTime = lastEntry ? lastEntry.timestamp : 'Never';

    return {
      totalCompressions,
      totalBytesSaved,
      averageReduction,
      lastCompressionTime,
    };
  } catch (_error) {
    // Return zeros on error
    return {
      totalCompressions: 0,
      totalBytesSaved: 0,
      averageReduction: '0%',
      lastCompressionTime: 'Never',
    };
  }
}

/**
 * Reset compression counters
 */
function resetCompressionCounters() {
  operationCounter = 0;
}

// Track 1.1: Re-export checkContextPressure from context-pressure module.
// Allows consumers to use a single import for compression-related pressure logic.
const { checkContextPressure } = require('./context-pressure.cjs');

module.exports = {
  checkCompressionNeeded,
  triggerCompression,
  getCompressionStats,
  resetCompressionCounters,
  checkContextPressure,
};
