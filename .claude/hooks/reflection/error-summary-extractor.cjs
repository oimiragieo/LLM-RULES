'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

let ERROR_REPORTS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts', 'error-reports');
let ERROR_SUMMARIES_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'error-summaries'
);

const DEFAULT_TIME_RANGE_MS = 24 * 60 * 60 * 1000;

function setErrorReportsDir(dir) {
  ERROR_REPORTS_DIR = dir;
}

function setErrorSummariesDir(dir) {
  ERROR_SUMMARIES_DIR = dir;
}

function readErrorLogs(errorReportsDir = ERROR_REPORTS_DIR) {
  const errorsFile = path.join(errorReportsDir, 'errors.jsonl');
  if (!fs.existsSync(errorsFile)) return [];
  const content = fs.readFileSync(errorsFile, 'utf8');
  if (!content.trim()) return [];
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => safeParseJSON(line, null))
    .filter(entry => entry && typeof entry === 'object');
}

function filterErrorsByTimeRange(errors, timeRangeMs = DEFAULT_TIME_RANGE_MS) {
  const cutoff = Date.now() - timeRangeMs;
  return errors.filter(error => {
    const ts = Date.parse(error?.timestamp || '');
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function aggregateByField(errors, selector) {
  const out = {};
  for (const error of errors) {
    const key = selector(error);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function detectPatterns(errors) {
  const byMessage = aggregateByField(errors, error => String(error?.message || 'unknown').trim());
  const repeatedErrors = Object.entries(byMessage)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));
  return { repeatedErrors, cascades: [] };
}

function generateSummary(errors) {
  const nowIso = new Date().toISOString();
  return {
    generatedAt: nowIso,
    totalErrors: errors.length,
    bySeverity: aggregateByField(errors, error => String(error?.severity || 'UNKNOWN')),
    byCategory: aggregateByField(errors, error => String(error?.category || 'UNKNOWN')),
    byAgent: aggregateByField(errors, error => String(error?.context?.agentName || 'unknown')),
    criticalErrors: errors
      .filter(error => String(error?.severity || '').toUpperCase() === 'CRITICAL')
      .map(error => ({
        errorId: error?.errorId || null,
        message: error?.message || 'Unknown error',
        timestamp: error?.timestamp || null,
        context: error?.context || null,
      })),
    patterns: detectPatterns(errors),
  };
}

function generateSummaryMarkdown(summary) {
  const lines = [];
  lines.push(`# Error Summary`);
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Total Errors: ${summary.totalErrors}`);
  lines.push('');
  lines.push(`## By Severity`);
  for (const [severity, count] of Object.entries(summary.bySeverity || {})) {
    lines.push(`- ${severity}: ${count}`);
  }
  lines.push('');
  if (summary.criticalErrors.length > 0) {
    lines.push(`## Critical Issues (${summary.criticalErrors.length})`);
    for (const issue of summary.criticalErrors) {
      lines.push(`- ${issue.message}`);
    }
    lines.push('');
  }
  const repeated = summary?.patterns?.repeatedErrors || [];
  if (repeated.length > 0) {
    lines.push('## Repeated Errors');
    for (const pattern of repeated) {
      lines.push(`- ${pattern.count}x ${pattern.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function saveSummary(summary, errorSummariesDir = ERROR_SUMMARIES_DIR) {
  fs.mkdirSync(errorSummariesDir, { recursive: true });
  const datePart = String(summary.generatedAt || new Date().toISOString()).slice(0, 10);
  const filePath = path.join(errorSummariesDir, `summary-${datePart}.md`);
  fs.writeFileSync(filePath, generateSummaryMarkdown(summary), 'utf8');
  return filePath;
}

function calculateReflectionWeight(summary) {
  const total = Number(summary?.totalErrors || 0);
  const critical = Number(summary?.criticalErrors?.length || 0);
  const repeated = Number(summary?.patterns?.repeatedErrors?.length || 0);
  return Math.min(1, total / 50 + critical * 0.08 + repeated * 0.03);
}

function generateActionItems(summary) {
  const items = [];
  if ((summary?.criticalErrors || []).length > 0) {
    items.push(`Review ${summary.criticalErrors.length} critical errors immediately`);
  }
  for (const pattern of (summary?.patterns?.repeatedErrors || []).slice(0, 3)) {
    items.push(`Investigate repeated error (${pattern.count}x): ${pattern.message}`);
  }
  return items;
}

function extractSummaryForReflection(options = {}) {
  const {
    errorReportsDir = ERROR_REPORTS_DIR,
    errorSummariesDir = ERROR_SUMMARIES_DIR,
    hours = 24,
  } = options;
  const allErrors = readErrorLogs(errorReportsDir);
  const recentErrors = filterErrorsByTimeRange(allErrors, Number(hours) * 60 * 60 * 1000);
  const summary = generateSummary(recentErrors);
  const summaryPath = recentErrors.length > 0 ? saveSummary(summary, errorSummariesDir) : null;
  return {
    errorCount: recentErrors.length,
    summaryPath,
    reflectionWeight: calculateReflectionWeight(summary),
    actionItems: generateActionItems(summary),
    summary: {
      criticalErrors: summary.criticalErrors,
      patterns: summary.patterns,
    },
  };
}

module.exports = {
  setErrorReportsDir,
  setErrorSummariesDir,
  readErrorLogs,
  filterErrorsByTimeRange,
  generateSummary,
  generateSummaryMarkdown,
  saveSummary,
  calculateReflectionWeight,
  generateActionItems,
  extractSummaryForReflection,
  DEFAULT_TIME_RANGE_MS,
};
