#!/usr/bin/env node
/**
 * Hook: error-summary-extractor.cjs
 * Trigger: PreReflectionCycle
 * Purpose: Aggregate errors from logs and prepare summary for reflection workflow
 *
 * Phase 4.1 of error logging integration:
 * 1. Reads error logs from .claude/context/artifacts/error-reports/
 * 2. Extracts errors from last 24 hours (configurable)
 * 3. Aggregates by agent, category, severity
 * 4. Detects patterns (repeated errors, cascades, new error types)
 * 5. Generates summary document: .claude/context/artifacts/error-summaries/
 * 6. Calculates reflection weight (more errors = higher priority)
 *
 * @module hooks/reflection/error-summary-extractor
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import pattern detector
const patternDetector = require('../../lib/error-pattern-detector.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { debugLog } = require('../../lib/utils/hook-input.cjs');

// Configuration - can be overridden for testing
let ERROR_REPORTS_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'error-reports'
);
let ERROR_SUMMARIES_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'error-summaries'
);

// Default time range: 24 hours
const DEFAULT_TIME_RANGE_MS = 24 * 60 * 60 * 1000;

/**
 * Set error reports directory (for testing)
 * @param {string} dir - Directory path
 */
function setErrorReportsDir(dir) {
  ERROR_REPORTS_DIR = dir;
}

/**
 * Set error summaries directory (for testing)
 * @param {string} dir - Directory path
 */
function setErrorSummariesDir(dir) {
  ERROR_SUMMARIES_DIR = dir;
}

/**
 * Read error logs from JSONL file
 * @param {string} errorReportsDir - Directory containing errors.jsonl
 * @returns {Array<object>} Array of error entries
 */
function readErrorLogs(errorReportsDir = ERROR_REPORTS_DIR) {
  const errorsFile = path.join(errorReportsDir, 'errors.jsonl');

  if (!fs.existsSync(errorsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(errorsFile, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const lines = content.split('\n').filter(line => line.trim());
    const errors = [];

    for (const line of lines) {
      try {
        const error = JSON.parse(line);
        errors.push(error);
      } catch (_parseErr) {
        // Skip malformed JSON lines
        debugLog('error-summary-extractor', `Skipping malformed line: ${line.substring(0, 50)}`);
      }
    }

    return errors;
  } catch (err) {
    debugLog('error-summary-extractor', 'Error reading error logs', err);
    return [];
  }
}

/**
 * Filter errors within time range
 * @param {Array<object>} errors - Array of error entries
 * @param {number} timeRangeMs - Time range in milliseconds
 * @returns {Array<object>} Filtered errors
 */
function filterErrorsByTimeRange(errors, timeRangeMs = DEFAULT_TIME_RANGE_MS) {
  const cutoff = Date.now() - timeRangeMs;

  return errors.filter(error => {
    if (!error.timestamp) return false;
    const errorTime = new Date(error.timestamp).getTime();
    return errorTime >= cutoff;
  });
}

/**
 * Aggregate errors by agent name
 * @param {Array<object>} errors - Array of error entries
 * @returns {object} Agent name -> error count mapping
 */
function aggregateByAgent(errors) {
  const counts = {};

  for (const error of errors) {
    const agentName = error.context?.agentName || 'unknown';
    counts[agentName] = (counts[agentName] || 0) + 1;
  }

  return counts;
}

/**
 * Aggregate errors by category
 * @param {Array<object>} errors - Array of error entries
 * @returns {object} Category -> error count mapping
 */
function aggregateByCategory(errors) {
  const counts = {};

  for (const error of errors) {
    const category = error.category || 'UNKNOWN';
    counts[category] = (counts[category] || 0) + 1;
  }

  return counts;
}

/**
 * Aggregate errors by severity
 * @param {Array<object>} errors - Array of error entries
 * @returns {object} Severity -> error count mapping
 */
function aggregateBySeverity(errors) {
  const counts = {};

  for (const error of errors) {
    const severity = error.severity || 'UNKNOWN';
    counts[severity] = (counts[severity] || 0) + 1;
  }

  return counts;
}

/**
 * Generate comprehensive error summary
 * @param {Array<object>} errors - Array of error entries
 * @returns {object} Summary object
 */
function generateSummary(errors) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // Get critical errors
  const criticalErrors = errors.filter(e => e.severity === 'CRITICAL');

  // Detect patterns using pattern detector
  const patterns = patternDetector.detectPatterns(errors);
  const recommendations = patternDetector.generateRecommendations(patterns);

  return {
    date: dateStr,
    generatedAt: now.toISOString(),
    totalErrors: errors.length,
    bySeverity: aggregateBySeverity(errors),
    byCategory: aggregateByCategory(errors),
    byAgent: aggregateByAgent(errors),
    criticalErrors: criticalErrors.map(e => ({
      errorId: e.errorId,
      message: e.message,
      timestamp: e.timestamp,
      context: e.context,
    })),
    patterns,
    recommendations,
  };
}

/**
 * Generate markdown summary document
 * @param {object} summary - Summary object from generateSummary()
 * @returns {string} Markdown document
 */
function generateSummaryMarkdown(summary) {
  const lines = [];

  lines.push(`# Error Summary - ${summary.date}`);
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Total Errors: ${summary.totalErrors}`);
  lines.push('');

  // Critical Issues
  if (summary.criticalErrors && summary.criticalErrors.length > 0) {
    lines.push(`## Critical Issues (${summary.criticalErrors.length})`);
    lines.push('');
    for (const error of summary.criticalErrors) {
      const context = error.context?.agentName
        ? `Agent: ${error.context.agentName}`
        : '';
      lines.push(`- **${error.errorId}**: ${error.message} ${context ? `(${context})` : ''}`);
    }
    lines.push('');
  }

  // Patterns Detected
  if (summary.patterns) {
    const { repeatedErrors, cascades } = summary.patterns;

    if (repeatedErrors && repeatedErrors.length > 0) {
      lines.push('## Pattern Detected: Repeated Errors');
      lines.push('');
      for (const pattern of repeatedErrors) {
        lines.push(`- **${pattern.count}x**: ${pattern.message?.substring(0, 60) || 'Unknown'}...`);
        if (pattern.lastSeen) {
          lines.push(`  - Last occurrence: ${pattern.lastSeen}`);
        }
      }
      lines.push('');
    }

    if (cascades && cascades.length > 0) {
      lines.push('## Pattern Detected: Error Cascades');
      lines.push('');
      for (const cascade of cascades) {
        lines.push(`- Root: ${cascade.rootErrorId} -> ${cascade.childErrorIds.length} child errors`);
      }
      lines.push('');
    }
  }

  // By Severity
  lines.push('## By Severity');
  lines.push('');
  for (const [severity, count] of Object.entries(summary.bySeverity || {})) {
    lines.push(`- ${severity}: ${count}`);
  }
  lines.push('');

  // By Category
  lines.push('## By Category');
  lines.push('');
  for (const [category, count] of Object.entries(summary.byCategory || {})) {
    lines.push(`- ${category}: ${count}`);
  }
  lines.push('');

  // By Agent
  lines.push('## By Agent');
  lines.push('');
  for (const [agent, count] of Object.entries(summary.byAgent || {})) {
    lines.push(`- ${agent}: ${count} errors`);
  }
  lines.push('');

  // Recommendations
  if (summary.recommendations && summary.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of summary.recommendations) {
      lines.push(`### [${rec.priority}] ${rec.issue}`);
      lines.push(`- Suggestion: ${rec.suggestion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Save summary to file
 * @param {object} summary - Summary object
 * @param {string} errorSummariesDir - Directory to save to
 * @returns {string} Path to saved file
 */
function saveSummary(summary, errorSummariesDir = ERROR_SUMMARIES_DIR) {
  // Ensure directory exists
  if (!fs.existsSync(errorSummariesDir)) {
    fs.mkdirSync(errorSummariesDir, { recursive: true });
  }

  const markdown = generateSummaryMarkdown(summary);
  const filePath = path.join(errorSummariesDir, `summary-${summary.date}.md`);

  fs.writeFileSync(filePath, markdown, 'utf8');

  return filePath;
}

/**
 * Calculate reflection weight based on error summary
 * Higher weight = more errors = higher reflection priority
 * @param {object} summary - Summary object
 * @returns {number} Weight between 0.0 and 1.0
 */
function calculateReflectionWeight(summary) {
  let weight = 0;

  // Base weight from error count (max 0.4)
  const errorCountWeight = Math.min(summary.totalErrors / 50, 0.4);
  weight += errorCountWeight;

  // Severity weight (max 0.4)
  const severityCounts = summary.bySeverity || {};
  const criticalWeight = ((severityCounts.CRITICAL || 0) * 0.15);
  const highWeight = ((severityCounts.HIGH || 0) * 0.05);
  const mediumWeight = ((severityCounts.MEDIUM || 0) * 0.02);
  weight += Math.min(criticalWeight + highWeight + mediumWeight, 0.4);

  // Pattern weight (max 0.2)
  const patterns = summary.patterns || {};
  const hasRepeated = (patterns.repeatedErrors || []).length > 0;
  const hasCascades = (patterns.cascades || []).length > 0;
  if (hasRepeated) weight += 0.1;
  if (hasCascades) weight += 0.1;

  return Math.min(weight, 1.0);
}

/**
 * Generate action items for reflection based on summary
 * @param {object} summary - Summary object
 * @returns {Array<string>} List of action items
 */
function generateActionItems(summary) {
  const items = [];

  // Critical errors need immediate attention
  if (summary.criticalErrors && summary.criticalErrors.length > 0) {
    items.push(`Review ${summary.criticalErrors.length} CRITICAL errors immediately`);
  }

  // Repeated errors suggest systemic issues
  const repeatedErrors = summary.patterns?.repeatedErrors || [];
  for (const repeated of repeatedErrors.slice(0, 3)) {
    items.push(`Investigate repeated error: "${repeated.message?.substring(0, 40)}..." (${repeated.count}x)`);
  }

  // Agent-specific issues
  const agentErrors = Object.entries(summary.byAgent || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  for (const [agent, count] of agentErrors) {
    if (count >= 5) {
      items.push(`Review agent "${agent}" for error patterns (${count} errors)`);
    }
  }

  // Hook failures
  const hookFailures = summary.patterns?.hookFailures || [];
  for (const hookFailure of hookFailures.slice(0, 2)) {
    items.push(`Fix hook "${hookFailure.hookName}" (${hookFailure.count} failures)`);
  }

  return items;
}

/**
 * Main function: Extract error summary for reflection workflow
 * @param {object} options - Options
 * @param {string} [options.errorReportsDir] - Error reports directory
 * @param {string} [options.errorSummariesDir] - Error summaries directory
 * @param {number} [options.hours=24] - Time range in hours
 * @returns {object} Reflection context with summary, path, weight, and action items
 */
function extractSummaryForReflection(options = {}) {
  const {
    errorReportsDir = ERROR_REPORTS_DIR,
    errorSummariesDir = ERROR_SUMMARIES_DIR,
    hours = 24,
  } = options;

  // Read all errors
  const allErrors = readErrorLogs(errorReportsDir);

  // Filter by time range
  const timeRangeMs = hours * 60 * 60 * 1000;
  const recentErrors = filterErrorsByTimeRange(allErrors, timeRangeMs);

  // Generate summary
  const summary = generateSummary(recentErrors);

  // Save summary
  const summaryPath = saveSummary(summary, errorSummariesDir);

  // Calculate reflection weight
  const reflectionWeight = calculateReflectionWeight(summary);

  // Generate action items
  const actionItems = generateActionItems(summary);

  return {
    summary,
    summaryPath,
    reflectionWeight,
    actionItems,
    errorCount: recentErrors.length,
    timeRangeHours: hours,
  };
}

module.exports = {
  // Core functions
  readErrorLogs,
  filterErrorsByTimeRange,
  aggregateByAgent,
  aggregateByCategory,
  aggregateBySeverity,
  generateSummary,
  generateSummaryMarkdown,
  saveSummary,
  calculateReflectionWeight,
  generateActionItems,
  extractSummaryForReflection,

  // Testing helpers
  setErrorReportsDir,
  setErrorSummariesDir,

  // Constants
  DEFAULT_TIME_RANGE_MS,
};
