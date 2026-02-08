#!/usr/bin/env node
/**
 * Self-Healing Dashboard
 * ======================
 *
 * Provides metrics and status display for the self-healing system.
 *
 * Metrics collected:
 * | Metric                | Source                  | Aggregation          |
 * |-----------------------|-------------------------|----------------------|
 * | Anomaly count (24h,7d)| anomaly-log.jsonl       | Count by period      |
 * | Recovery success rate | rollback-log.jsonl      | Success / Total      |
 * | Evolution count       | loop-state.json         | Current / Budget     |
 * | Loop interventions    | loop-state.json         | Count of blocks      |
 * | Rollback history      | rollback-log.jsonl      | Recent entries       |
 *
 * CLI Interface:
 *   node dashboard.cjs status           # Show status overview
 *   node dashboard.cjs anomalies        # Show anomaly details
 *   node dashboard.cjs loops            # Show loop state details
 *   node dashboard.cjs rollbacks        # Show rollback history
 *   node dashboard.cjs status --json    # JSON output
 *
 * Usage:
 *   const { collectMetrics, formatStatus } = require('./dashboard.cjs');
 *   const metrics = collectMetrics();
 *   console.log(formatStatus(metrics));
 */

'use strict';

const fs = require('fs');
const path = require('path');

// BUG-NEW-002 FIX: Import safe JSON utilities for SEC-007 compliance
const { safeParseJSON, safeReadJSON } = require('../utils/safe-json.cjs');

// =============================================================================
// Path Resolution
// =============================================================================

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    // Look for .claude/CLAUDE.md as the definitive marker (not just .claude directory)
    // This avoids false positives when running from inside .claude subdirectories
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) {
      return dir;
    }
    // Also check for package.json as fallback
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// Default file paths
let ANOMALY_LOG = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'anomaly-log.jsonl'
);
let ROLLBACK_LOG = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'rollback-log.jsonl'
);
let LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'loop-state.json'
);

// Default evolution budget (matches loop-prevention.cjs)
const DEFAULT_EVOLUTION_BUDGET = 3;
const DEFAULT_PATTERN_THRESHOLD = 3;

// =============================================================================
// Path Setters (for testing)
// =============================================================================

function setAnomalyLog(filePath) {
  ANOMALY_LOG = filePath;
}

function setRollbackLog(filePath) {
  ROLLBACK_LOG = filePath;
}

function setLoopStateFile(filePath) {
  LOOP_STATE_FILE = filePath;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Read JSONL file and parse entries
 * BUG-NEW-002 FIX: Use safeParseJSON for SEC-007 compliance
 * @param {string} filePath - Path to JSONL file
 * @param {string} [schema] - Optional schema name for validation
 * @returns {Array} Array of parsed objects
 */
function readJSONL(filePath, schema = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      return [];
    }
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // BUG-NEW-002 FIX: Use safeParseJSON instead of raw JSON.parse
        const parsed = safeParseJSON(line, schema);
        return parsed && Object.keys(parsed).length > 0 ? parsed : null;
      })
      .filter(item => item !== null);
  } catch (_e) {
    return [];
  }
}

/**
 * Read JSON file
 * BUG-NEW-002 FIX: Use safeReadJSON for SEC-007 compliance
 * @param {string} filePath - Path to JSON file
 * @param {string} [schema] - Optional schema name for validation
 * @returns {Object} Parsed object or default
 */
function readJSON(filePath, schema = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    // BUG-NEW-002 FIX: Use safeReadJSON instead of raw JSON.parse
    return safeReadJSON(filePath, schema) || {};
  } catch (_e) {
    return {};
  }
}

/**
 * Format relative time from timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Relative time string (e.g., "2h ago")
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'just now';
  }
}

/**
 * Get evolution budget from environment or default
 */
function getEvolutionBudget() {
  const envBudget = process.env.LOOP_EVOLUTION_BUDGET;
  if (envBudget) {
    const parsed = parseInt(envBudget, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EVOLUTION_BUDGET;
}

/**
 * Get pattern threshold from environment or default
 */
function getPatternThreshold() {
  const envThreshold = process.env.LOOP_PATTERN_THRESHOLD;
  if (envThreshold) {
    const parsed = parseInt(envThreshold, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_THRESHOLD;
}

// =============================================================================
// Metrics Collection
// =============================================================================

/**
 * Collect all metrics from self-healing system
 * @returns {Object} Metrics object
 */
function collectMetrics() {
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Read data sources
  const anomalyEntries = readJSONL(ANOMALY_LOG);
  const rollbackEntries = readJSONL(ROLLBACK_LOG);
  const loopState = readJSON(LOOP_STATE_FILE);

  // -------------------------
  // Anomaly Metrics
  // -------------------------
  const anomalies24h = anomalyEntries.filter(e => {
    const entryTime = new Date(e.timestamp).getTime();
    return entryTime >= twentyFourHoursAgo && e.detected === true;
  });

  const anomalies7d = anomalyEntries.filter(e => {
    const entryTime = new Date(e.timestamp).getTime();
    return entryTime >= sevenDaysAgo && e.detected === true;
  });

  // Recent anomalies (last 5, newest first)
  const recentAnomalies = anomalyEntries
    .filter(e => e.detected === true)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)
    .map(e => ({
      type: e.type,
      timestamp: e.timestamp,
      relativeTime: formatRelativeTime(e.timestamp),
      ...e,
    }));

  // -------------------------
  // Recovery Metrics
  // -------------------------
  const rollbackOperations = rollbackEntries.filter(
    e => e.operation === 'rollback_completed' || e.operation === 'selective_rollback'
  );

  const successfulRollbacks = rollbackOperations.filter(e => {
    // For rollback_completed: failedCount === 0 means success
    // For selective_rollback: always considered successful if executed
    if (e.operation === 'rollback_completed') {
      return e.failedCount === 0 || e.success === true;
    }
    return true; // selective_rollback is always partial success
  });

  const totalRollbacks = rollbackOperations.length;
  const successRate =
    totalRollbacks > 0 ? Math.round((successfulRollbacks.length / totalRollbacks) * 100) : 0;

  // Rollback history (last 10, newest first)
  const rollbackHistory = rollbackOperations
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
    .map(e => ({
      operation: e.operation,
      checkpointId: e.checkpointId,
      restoredCount: e.restoredCount || 0,
      failedCount: e.failedCount || 0,
      skippedCount: e.skippedCount || 0,
      timestamp: e.timestamp,
      relativeTime: formatRelativeTime(e.timestamp),
    }));

  // -------------------------
  // Evolution Metrics
  // -------------------------
  const evolutionBudget = getEvolutionBudget();
  const evolutionCount = loopState.evolutionCount || 0;
  const lastEvolutions = loopState.lastEvolutions || {};

  // -------------------------
  // Loop Metrics
  // -------------------------
  const actionHistory = loopState.actionHistory || [];
  const patternThreshold = getPatternThreshold();

  // Count interventions (actions that exceeded threshold)
  const interventions = actionHistory.filter(a => a.count > patternThreshold).length;

  const spawnDepth = loopState.spawnDepth || 0;

  return {
    anomalies: {
      last24h: anomalies24h.length,
      last7d: anomalies7d.length,
      recent: recentAnomalies,
    },
    recovery: {
      successRate,
      total: totalRollbacks,
      successful: successfulRollbacks.length,
      history: rollbackHistory,
    },
    evolution: {
      current: evolutionCount,
      budget: evolutionBudget,
      lastEvolutions,
    },
    loops: {
      interventions,
      spawnDepth,
      actionHistory,
    },
    collectedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format status overview as ASCII box
 * @param {Object} metrics - Metrics from collectMetrics()
 * @returns {string} Formatted output
 */
function formatStatus(metrics) {
  const lines = [];

  lines.push('');
  lines.push('+======================================================+');
  lines.push('|           SELF-HEALING SYSTEM STATUS                 |');
  lines.push('+======================================================+');
  lines.push('|                                                      |');
  lines.push(
    `| Anomalies (24h):  ${String(metrics.anomalies.last24h).padStart(3)}  |  Anomalies (7d):   ${String(metrics.anomalies.last7d).padStart(3)}  |`
  );
  lines.push(
    `| Recovery Rate:   ${String(metrics.recovery.successRate).padStart(3)}%  |  Rollbacks:        ${String(metrics.recovery.total).padStart(3)}  |`
  );
  lines.push(
    `| Evolution Budget: ${metrics.evolution.current}/${metrics.evolution.budget}  |  Loop Blocks:      ${String(metrics.loops.interventions).padStart(3)}  |`
  );
  lines.push('|                                                      |');
  lines.push('+------------------------------------------------------+');
  lines.push('| Recent Anomalies:                                    |');

  if (metrics.anomalies.recent.length === 0) {
    lines.push('|   (none)                                             |');
  } else {
    for (const anomaly of metrics.anomalies.recent.slice(0, 3)) {
      const typeStr = anomaly.type.substring(0, 20).padEnd(20);
      const timeStr = anomaly.relativeTime.padEnd(10);
      lines.push(`|   - ${typeStr} - ${timeStr}        |`);
    }
  }

  lines.push('+======================================================+');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format anomaly details
 * @param {Object} metrics - Metrics from collectMetrics()
 * @returns {string} Formatted output
 */
function formatAnomalies(metrics) {
  const lines = [];

  lines.push('');
  lines.push('ANOMALY REPORT');
  lines.push('==============');
  lines.push('');
  lines.push(`Total (24h): ${metrics.anomalies.last24h}`);
  lines.push(`Total (7d):  ${metrics.anomalies.last7d}`);
  lines.push('');
  lines.push('Recent Anomalies:');
  lines.push('-----------------');

  if (metrics.anomalies.recent.length === 0) {
    lines.push('  No anomalies detected.');
  } else {
    for (const anomaly of metrics.anomalies.recent) {
      lines.push(`  - ${anomaly.type} (${anomaly.relativeTime})`);
      if (anomaly.tool) {
        lines.push(`      Tool: ${anomaly.tool}`);
      }
      if (anomaly.current !== undefined && anomaly.average !== undefined) {
        lines.push(`      Current: ${anomaly.current}, Average: ${anomaly.average}`);
      }
      if (anomaly.count !== undefined) {
        lines.push(`      Count: ${anomaly.count}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format loop state details
 * @param {Object} metrics - Metrics from collectMetrics()
 * @returns {string} Formatted output
 */
function formatLoops(metrics) {
  const lines = [];

  lines.push('');
  lines.push('LOOP PREVENTION STATUS');
  lines.push('======================');
  lines.push('');
  lines.push(`Evolution Budget: ${metrics.evolution.current}/${metrics.evolution.budget}`);
  lines.push(`Spawn Depth:      ${metrics.loops.spawnDepth}`);
  lines.push(`Interventions:    ${metrics.loops.interventions}`);
  lines.push('');

  // Last evolutions
  const lastEvolutions = metrics.evolution.lastEvolutions;
  if (Object.keys(lastEvolutions).length > 0) {
    lines.push('Last Evolutions:');
    lines.push('----------------');
    for (const [type, timestamp] of Object.entries(lastEvolutions)) {
      lines.push(`  - ${type}: ${formatRelativeTime(timestamp)}`);
    }
    lines.push('');
  }

  // Action history
  if (metrics.loops.actionHistory.length > 0) {
    lines.push('Action History:');
    lines.push('---------------');
    const sortedActions = [...metrics.loops.actionHistory]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    for (const action of sortedActions) {
      const threshold = getPatternThreshold();
      const indicator = action.count > threshold ? ' (!)' : '';
      lines.push(`  - ${action.action}: ${action.count}${indicator}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format rollback history
 * @param {Object} metrics - Metrics from collectMetrics()
 * @returns {string} Formatted output
 */
function formatRollbacks(metrics) {
  const lines = [];

  lines.push('');
  lines.push('ROLLBACK HISTORY');
  lines.push('================');
  lines.push('');
  lines.push(`Success Rate: ${metrics.recovery.successRate}%`);
  lines.push(`Total:        ${metrics.recovery.total}`);
  lines.push(`Successful:   ${metrics.recovery.successful}`);
  lines.push('');

  if (metrics.recovery.history.length === 0) {
    lines.push('No rollbacks recorded.');
  } else {
    lines.push('Recent Rollbacks:');
    lines.push('-----------------');
    for (const rollback of metrics.recovery.history) {
      lines.push(`  - ${rollback.checkpointId} (${rollback.relativeTime})`);
      lines.push(`      Operation: ${rollback.operation}`);
      lines.push(`      ${rollback.restoredCount} files restored`);
      if (rollback.failedCount > 0) {
        lines.push(`      ${rollback.failedCount} files failed`);
      }
      if (rollback.skippedCount > 0) {
        lines.push(`      ${rollback.skippedCount} files skipped`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * CLI runner
 * @param {string[]} args - Command line arguments
 */
function run(args = process.argv.slice(2)) {
  const command = args[0] || 'status';
  const jsonFlag = args.includes('--json');

  const metrics = collectMetrics();

  if (jsonFlag) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  switch (command) {
    case 'status':
      console.log(formatStatus(metrics));
      break;
    case 'anomalies':
      console.log(formatAnomalies(metrics));
      break;
    case 'loops':
      console.log(formatLoops(metrics));
      break;
    case 'rollbacks':
      console.log(formatRollbacks(metrics));
      break;
    case 'help':
    default:
      console.log(`
Self-Healing Dashboard
======================

Usage:
  node dashboard.cjs status           Show status overview
  node dashboard.cjs anomalies        Show anomaly details
  node dashboard.cjs loops            Show loop state details
  node dashboard.cjs rollbacks        Show rollback history
  node dashboard.cjs status --json    JSON output for programmatic use

Options:
  --json    Output metrics as JSON instead of formatted text
`);
  }
}

// Run if executed directly
if (require.main === module) {
  run();
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Main functions
  collectMetrics,
  formatStatus,
  formatAnomalies,
  formatLoops,
  formatRollbacks,
  run,

  // Path setters (for testing)
  setAnomalyLog,
  setRollbackLog,
  setLoopStateFile,

  // Utilities
  readJSONL,
  readJSON,
  formatRelativeTime,
  getEvolutionBudget,
  getPatternThreshold,

  // Constants
  PROJECT_ROOT,
  get ANOMALY_LOG() {
    return ANOMALY_LOG;
  },
  get ROLLBACK_LOG() {
    return ROLLBACK_LOG;
  },
  get LOOP_STATE_FILE() {
    return LOOP_STATE_FILE;
  },
};
