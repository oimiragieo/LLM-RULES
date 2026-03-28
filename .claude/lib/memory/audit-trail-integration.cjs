#!/usr/bin/env node
/**
 * Audit Trail Integration for Model Selection
 * ===========================================
 *
 * ADR-075 Phase 4B: Audit trail integration for tracking model selection decisions.
 *
 * @deprecated No active consumers. Retained for potential future model-selection auditing.
 *
 * Provides:
 * - ConfigModelSelection audit event logging
 * - Model selection drift report generation
 * - TaskUpdate metadata helpers
 * - Cost impact calculation
 *
 * Usage:
 *   const { logModelSelection, generateDriftReport, getTaskUpdateMetadata } = require('./audit-trail-integration.cjs');
 *   logModelSelection('planner', 'opus', 'opus', 'config.yaml');
 *   generateDriftReport();
 *
 * @module audit-trail-integration
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Model cost estimates per token (in USD)
 * Based on Anthropic pricing as of 2026-01
 */
const MODEL_COSTS = {
  'claude-opus-4-6': {
    input: 0.015 / 1000, // $15 per 1M input tokens
    output: 0.075 / 1000, // $75 per 1M output tokens
    shorthand: 'opus',
  },
  'claude-opus-4-5-20251101': {
    input: 0.015 / 1000, // Backward-compatible alias for legacy tests/configs
    output: 0.075 / 1000,
    shorthand: 'opus',
  },
  'claude-sonnet-4-6': {
    input: 0.003 / 1000, // $3 per 1M input tokens
    output: 0.015 / 1000, // $15 per 1M output tokens
    shorthand: 'sonnet',
  },
  'claude-sonnet-4-5': {
    input: 0.003 / 1000, // Backward-compatible alias for legacy tests/configs
    output: 0.015 / 1000,
    shorthand: 'sonnet',
  },
  'claude-haiku-4-5-20251001': {
    input: 0.00025 / 1000, // $0.25 per 1M input tokens
    output: 0.00125 / 1000, // $1.25 per 1M output tokens
    shorthand: 'haiku',
  },
  'claude-haiku-4-5': {
    input: 0.00025 / 1000, // Backward-compatible alias for legacy tests/configs
    output: 0.00125 / 1000,
    shorthand: 'haiku',
  },
};

/**
 * Default average tokens per agent spawn (estimate)
 */
const DEFAULT_TOKENS_PER_SPAWN = {
  input: 50000, // Average prompt + context
  output: 10000, // Average response
};

/**
 * Log file paths
 */
const LOG_PATHS = {
  modelSelection: '.claude/context/artifacts/audit-logs/model-selection-audit.log',
  driftReport: '.claude/context/artifacts/reports',
};

// =============================================================================
// AUDIT EVENT LOGGING
// =============================================================================

/**
 * Audit event for model selection decision
 * @typedef {Object} ConfigModelSelectionEvent
 * @property {string} event - Event type: 'ConfigModelSelection'
 * @property {string} timestamp - ISO timestamp
 * @property {string} agent_id - Agent type (e.g., 'planner', 'developer')
 * @property {string} configured_model - Model from configuration
 * @property {string} actual_model - Model used in spawn
 * @property {string} complexity - Complexity level (low/medium/high)
 * @property {string} source - Configuration source (config.yaml|frontmatter|default|explicit)
 * @property {boolean} mismatch - Whether configured != actual
 * @property {number|null} cost_difference - Estimated cost difference (if mismatch)
 */

/**
 * Get the audit log file path
 * @param {string} [projectRoot=process.cwd()] - Project root directory
 * @returns {string} Absolute path to audit log file
 */
function getAuditLogPath(projectRoot = process.cwd()) {
  return path.join(projectRoot, LOG_PATHS.modelSelection);
}

/**
 * Ensure the audit log directory exists
 * @param {string} logPath - Path to log file
 */
function ensureLogDirectory(logPath) {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get model cost info by model ID or shorthand
 * @param {string} model - Model ID or shorthand
 * @returns {Object|null} Cost info or null if unknown
 */
function getModelCost(model) {
  // Direct lookup by full ID
  if (MODEL_COSTS[model]) {
    return MODEL_COSTS[model];
  }

  // Lookup by shorthand
  for (const [id, cost] of Object.entries(MODEL_COSTS)) {
    if (cost.shorthand === model) {
      return { ...cost, fullId: id };
    }
  }

  return null;
}

/**
 * Calculate cost difference between two models
 * @param {string} configuredModel - Model that should have been used
 * @param {string} actualModel - Model that was actually used
 * @param {Object} [tokens] - Token counts
 * @param {number} [tokens.input] - Input tokens
 * @param {number} [tokens.output] - Output tokens
 * @returns {number|null} Cost difference (positive = more expensive, negative = cheaper)
 */
function calculateCostDifference(configuredModel, actualModel, tokens = DEFAULT_TOKENS_PER_SPAWN) {
  const configuredCost = getModelCost(configuredModel);
  const actualCost = getModelCost(actualModel);

  if (!configuredCost || !actualCost) {
    return null;
  }

  const configuredTotal =
    configuredCost.input * tokens.input + configuredCost.output * tokens.output;
  const actualTotal = actualCost.input * tokens.input + actualCost.output * tokens.output;

  return actualTotal - configuredTotal;
}

/**
 * Map complexity level from agent type
 * @param {string} agentType - Agent type
 * @returns {string} Complexity level
 */
function getComplexity(agentType) {
  const highComplexity = [
    'planner',
    'architect',
    'qa',
    'security-architect',
    'evolution-orchestrator',
    'master-orchestrator',
    'party-orchestrator',
    'swarm-coordinator',
    'reverse-engineer',
    'ai-ml-specialist',
    'web3-blockchain-expert',
  ];

  const lowComplexity = ['context-compressor'];

  if (highComplexity.includes(agentType)) return 'high';
  if (lowComplexity.includes(agentType)) return 'low';
  return 'medium';
}

/**
 * Log a model selection event to the audit log
 *
 * @param {string} agentId - Agent type (e.g., 'planner')
 * @param {string} configuredModel - Model from configuration
 * @param {string} actualModel - Model used in spawn
 * @param {string} source - Configuration source
 * @param {Object} [options] - Additional options
 * @param {string} [options.projectRoot=process.cwd()] - Project root
 * @param {Object} [options.tokens] - Token counts for cost calculation
 * @returns {ConfigModelSelectionEvent} The logged event
 */
function logModelSelection(agentId, configuredModel, actualModel, source, options = {}) {
  const { projectRoot = process.cwd(), tokens = DEFAULT_TOKENS_PER_SPAWN } = options;

  const mismatch = configuredModel !== actualModel;
  const costDifference = mismatch
    ? calculateCostDifference(configuredModel, actualModel, tokens)
    : null;

  const event = {
    event: 'ConfigModelSelection',
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    configured_model: configuredModel,
    actual_model: actualModel,
    complexity: getComplexity(agentId),
    source,
    mismatch,
    cost_difference: costDifference,
  };

  // Write to audit log file
  try {
    const logPath = getAuditLogPath(projectRoot);
    ensureLogDirectory(logPath);
    fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
  } catch (_e) {
    // Best effort - don't fail if logging fails
    process.stderr.write(
      JSON.stringify({
        hook: 'audit-trail-integration',
        event: 'log_error',
        error: _e.message,
      }) + '\n'
    );
  }

  // Also write to stderr for immediate visibility
  process.stderr.write(JSON.stringify(event) + '\n');

  return event;
}

// =============================================================================
// TASK UPDATE METADATA HELPERS
// =============================================================================

/**
 * Generate TaskUpdate metadata for model resolution
 *
 * @param {Object} resolution - Result from resolveAgentModel()
 * @param {string} resolution.model - Full model ID
 * @param {string} resolution.shorthand - Model shorthand
 * @param {string} resolution.source - Resolution source
 * @param {string} [actualModel] - Override if different from configured
 * @returns {Object} Metadata object for TaskUpdate
 */
function getTaskUpdateMetadata(resolution, actualModel = null) {
  const actual = actualModel || resolution.model;

  return {
    modelResolutionSource: resolution.source,
    configuredModel: resolution.model,
    actualModel: actual,
    modelMismatch: resolution.model !== actual,
    modelShorthand: resolution.shorthand,
  };
}

// =============================================================================
// DRIFT REPORT GENERATION
// =============================================================================

/**
 * Parse model selection audit log
 * @param {string} projectRoot - Project root directory
 * @returns {ConfigModelSelectionEvent[]} Array of events
 */
function parseAuditLog(projectRoot) {
  const logPath = getAuditLogPath(projectRoot);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const events = [];
  for (const line of lines) {
    const event = safeParseJSON(line, null);
    if (event && typeof event === 'object' && event.event === 'ConfigModelSelection') {
      events.push(event);
    }
  }

  return events;
}

/**
 * Filter events to today only
 * @param {ConfigModelSelectionEvent[]} events - All events
 * @returns {ConfigModelSelectionEvent[]} Today's events
 */
function filterToday(events) {
  const today = new Date().toISOString().split('T')[0];
  return events.filter(e => e.timestamp && e.timestamp.startsWith(today));
}

/**
 * Calculate total cost impact from mismatches
 * @param {ConfigModelSelectionEvent[]} events - Events with cost_difference
 * @returns {number} Total cost impact in USD
 */
function calculateTotalCostImpact(events) {
  return events
    .filter(e => e.mismatch && e.cost_difference !== null)
    .reduce((sum, e) => sum + (e.cost_difference || 0), 0);
}

/**
 * Generate drift report for model selection
 *
 * @param {Object} [options] - Report options
 * @param {string} [options.projectRoot=process.cwd()] - Project root
 * @param {string} [options.date] - Date to report on (YYYY-MM-DD, default: today)
 * @param {number} [options.alertThreshold=10] - Cost threshold for alert ($)
 * @returns {Object} Drift report
 */
function generateDriftReport(options = {}) {
  const {
    projectRoot = process.cwd(),
    date = new Date().toISOString().split('T')[0],
    alertThreshold = 10,
  } = options;

  const allEvents = parseAuditLog(projectRoot);
  const todayEvents =
    date === new Date().toISOString().split('T')[0]
      ? filterToday(allEvents)
      : allEvents.filter(e => e.timestamp && e.timestamp.startsWith(date));

  const mismatches = todayEvents.filter(e => e.mismatch);
  const totalCostImpact = calculateTotalCostImpact(mismatches);

  const report = {
    reportDate: date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalSpawns: todayEvents.length,
      mismatches: mismatches.length,
      mismatchRate:
        todayEvents.length > 0
          ? ((mismatches.length / todayEvents.length) * 100).toFixed(2) + '%'
          : '0%',
      totalCostImpact: '$' + totalCostImpact.toFixed(4),
      alertTriggered: Math.abs(totalCostImpact) > alertThreshold,
    },
    byAgent: {},
    mismatches: mismatches.map(e => ({
      timestamp: e.timestamp,
      agent_id: e.agent_id,
      configured_model: e.configured_model,
      actual_model: e.actual_model,
      source: e.source,
      cost_difference:
        e.cost_difference !== null && e.cost_difference !== undefined
          ? '$' + e.cost_difference.toFixed(4)
          : 'N/A',
    })),
  };

  // Aggregate by agent
  for (const event of todayEvents) {
    if (!report.byAgent[event.agent_id]) {
      report.byAgent[event.agent_id] = {
        spawns: 0,
        mismatches: 0,
        configuredModel: event.configured_model,
        sources: {},
      };
    }
    const agentStats = report.byAgent[event.agent_id];
    agentStats.spawns++;
    if (event.mismatch) agentStats.mismatches++;
    agentStats.sources[event.source] = (agentStats.sources[event.source] || 0) + 1;
  }

  // Write report to file
  try {
    const reportDir = path.join(projectRoot, LOG_PATHS.driftReport);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = path.join(reportDir, `model-selection-drift-${date}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch (_e) {
    // Best effort
  }

  return report;
}

// =============================================================================
// ALERT INTEGRATION
// =============================================================================

/**
 * Check if drift alert should be triggered
 *
 * @param {Object} [options] - Alert options
 * @param {string} [options.projectRoot=process.cwd()] - Project root
 * @param {number} [options.threshold=10] - Cost threshold in USD
 * @returns {Object} Alert status
 */
function checkDriftAlert(options = {}) {
  const { projectRoot = process.cwd(), threshold = 10 } = options;

  const report = generateDriftReport({ projectRoot, alertThreshold: threshold });

  return {
    triggered: report.summary.alertTriggered,
    costImpact: report.summary.totalCostImpact,
    mismatchCount: report.summary.mismatches,
    threshold: '$' + threshold.toFixed(2),
    message: report.summary.alertTriggered
      ? `ALERT: Model selection drift cost impact (${report.summary.totalCostImpact}) exceeds threshold ($${threshold.toFixed(2)})`
      : 'Model selection within acceptable drift tolerance',
  };
}

// =============================================================================
// CLEANUP UTILITIES
// =============================================================================

/**
 * Rotate old audit logs (keep last N days)
 *
 * @param {Object} [options] - Rotation options
 * @param {string} [options.projectRoot=process.cwd()] - Project root
 * @param {number} [options.keepDays=30] - Days to keep
 */
function rotateAuditLogs(options = {}) {
  const { projectRoot = process.cwd(), keepDays = 30 } = options;

  const logPath = getAuditLogPath(projectRoot);
  if (!fs.existsSync(logPath)) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoff = cutoffDate.toISOString();

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const kept = lines.filter(line => {
    const event = safeParseJSON(line, null);
    return event && typeof event === 'object' && event.timestamp && event.timestamp >= cutoff;
  });

  fs.writeFileSync(logPath, kept.join('\n') + (kept.length > 0 ? '\n' : ''));
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  // Core logging
  logModelSelection,
  getTaskUpdateMetadata,

  // Drift reporting
  generateDriftReport,
  parseAuditLog,
  checkDriftAlert,

  // Utilities
  getModelCost,
  calculateCostDifference,
  getComplexity,
  rotateAuditLogs,
  getAuditLogPath,

  // Constants
  MODEL_COSTS,
  DEFAULT_TOKENS_PER_SPAWN,
  LOG_PATHS,
};
