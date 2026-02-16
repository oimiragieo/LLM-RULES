#!/usr/bin/env node
// @ts-check
/**
 * Error Report CLI Tool
 *
 * Generate error reports and analysis from error logs.
 *
 * Usage:
 *   node error-report.cjs --summary [--today|--this-week]
 *   node error-report.cjs --agent <name>
 *   node error-report.cjs --category EXECUTION_ERROR
 *   node error-report.cjs --severity CRITICAL
 *   node error-report.cjs --pattern <regex>
 *   node error-report.cjs --export csv
 *
 * Options:
 *   --summary           Generate summary report
 *   --today             Filter to today's errors
 *   --this-week         Filter to this week's errors
 *   --agent <name>      Filter by agent name
 *   --category <cat>    Filter by category
 *   --severity <sev>    Filter by severity
 *   --pattern <regex>   Filter by message pattern
 *   --export <format>   Export format (markdown, csv)
 *   --output <file>     Write to file instead of stdout
 *
 * @module tools/cli/error-report
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');

// =============================================================================
// Dependencies
// =============================================================================

// Try to load error writer, fall back to direct file reading
// NOTE: errorWriter import removed - currently unused in this tool

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get error reports directory
 */
function getErrorReportsDir() {
  if (process.env.ERROR_REPORTS_DIR) {
    return process.env.ERROR_REPORTS_DIR;
  }
  return path.join(process.cwd(), '.claude', 'context', 'artifacts', 'error-reports');
}

// =============================================================================
// Date Parsing
// =============================================================================

/**
 * Parse date string to date range
 *
 * @param {string} dateStr - Date string (today, this-week, YYYY-MM-DD)
 * @returns {{start: Date, end: Date}}
 */
function parseDateRange(dateStr) {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (dateStr === 'today') {
    return {
      start: todayUtc,
      end: new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  if (dateStr === 'this-week') {
    const dayOfWeek = todayUtc.getUTCDay();
    const weekStart = new Date(todayUtc);
    weekStart.setUTCDate(todayUtc.getUTCDate() - dayOfWeek);
    return {
      start: weekStart,
      end: new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // Assume YYYY-MM-DD format
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return {
      start: date,
      end: new Date(date.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // Default to today
  return {
    start: todayUtc,
    end: new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000),
  };
}

// =============================================================================
// Error Reading
// =============================================================================

/**
 * Read all errors from log files
 *
 * @param {Object} options - Filter options
 * @returns {Object[]}
 */
function readErrors(options = {}) {
  const dir = getErrorReportsDir();
  const errors = [];

  if (!fs.existsSync(dir)) {
    return errors;
  }

  // Get date range
  const dateRange = options.date ? parseDateRange(options.date) : null;

  // List log files
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter(f => f.startsWith('errors-') && f.endsWith('.jsonl'))
      .sort()
      .reverse(); // Most recent first
  } catch (_e) {
    return errors;
  }

  // Filter files by date if specified
  if (dateRange) {
    files = files.filter(f => {
      const match = f.match(/errors-(\d{4}-\d{2}-\d{2})\.jsonl/);
      if (!match) return false;
      // Parse file date as UTC to match filename format (YYYY-MM-DD from ISO timestamps)
      const [year, month, day] = match[1].split('-').map(Number);
      const fileDate = new Date(Date.UTC(year, month - 1, day));
      return fileDate >= dateRange.start && fileDate < dateRange.end;
    });
  }

  // Read and parse each file
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = safeParseJSON(line);
          errors.push(entry);
        } catch (_e) {
          // Skip invalid lines
        }
      }
    } catch (_e) {
      // Skip unreadable files
    }
  }

  return errors;
}

// =============================================================================
// Filter Functions
// =============================================================================

/**
 * Filter errors by criteria
 *
 * @param {Object} filter - Filter criteria
 * @param {string} [filter.agentName] - Filter by agent name
 * @param {string} [filter.category] - Filter by category
 * @param {string} [filter.severity] - Filter by severity
 * @param {string} [filter.pattern] - Filter by message pattern (regex)
 * @param {string} [filter.taskId] - Filter by task ID
 * @param {string} [filter.date] - Filter by date (today, this-week, YYYY-MM-DD)
 * @returns {Object[]}
 */
function filterErrors(filter = {}) {
  let errors = readErrors({ date: filter.date });

  if (filter.agentName) {
    errors = errors.filter(e => e.context?.agentName === filter.agentName);
  }

  if (filter.category) {
    errors = errors.filter(e => e.category === filter.category);
  }

  if (filter.severity) {
    errors = errors.filter(e => e.severity === filter.severity);
  }

  if (filter.taskId) {
    errors = errors.filter(e => e.context?.taskId === filter.taskId);
  }

  if (filter.pattern) {
    const regex = new RegExp(filter.pattern, 'i');
    errors = errors.filter(e => regex.test(e.message));
  }

  return errors;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate error summary
 *
 * @param {Object} options - Summary options
 * @param {string} [options.date] - Date filter
 * @returns {Object}
 */
function generateSummary(options = {}) {
  const errors = readErrors(options);

  // Count by severity
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const error of errors) {
    if (error.severity in bySeverity) {
      bySeverity[error.severity]++;
    }
  }

  // Count by category
  const byCategory = {};
  for (const error of errors) {
    byCategory[error.category] = (byCategory[error.category] || 0) + 1;
  }

  // Count by agent
  const byAgent = {};
  for (const error of errors) {
    const agent = error.context?.agentName || 'unknown';
    byAgent[agent] = (byAgent[agent] || 0) + 1;
  }

  // Count by tool
  const byTool = {};
  for (const error of errors) {
    const tool = error.context?.toolName || error.source?.location || 'unknown';
    byTool[tool] = (byTool[tool] || 0) + 1;
  }

  // Find critical errors
  const criticalErrors = errors.filter(e => e.severity === 'CRITICAL');

  // Calculate time range
  const timestamps = errors.map(e => new Date(e.timestamp).getTime()).filter(t => !isNaN(t));
  const earliest = timestamps.length ? new Date(Math.min(...timestamps)) : null;
  const latest = timestamps.length ? new Date(Math.max(...timestamps)) : null;

  return {
    total: errors.length,
    bySeverity,
    byCategory,
    byAgent,
    byTool,
    criticalErrors,
    timeRange: {
      start: earliest?.toISOString(),
      end: latest?.toISOString(),
    },
    generatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Pattern Detection
// =============================================================================

/**
 * Detect repeated error patterns
 *
 * @param {Object[]} errors - Error entries
 * @returns {Object[]}
 */
function detectPatterns(errors) {
  const signatures = new Map();

  for (const error of errors) {
    // Create signature from category, tool, and message pattern
    const msgPattern = error.message?.replace(/\d+/g, 'N').replace(/[a-f0-9]{8}/gi, 'X');
    const signature = `${error.category}:${error.source?.location}:${msgPattern}`;

    if (signatures.has(signature)) {
      signatures.get(signature).count++;
      signatures.get(signature).lastSeen = error.timestamp;
    } else {
      signatures.set(signature, {
        signature,
        category: error.category,
        location: error.source?.location,
        messagePattern: msgPattern,
        count: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
      });
    }
  }

  // Return patterns with count > 1, sorted by count
  return Array.from(signatures.values())
    .filter(p => p.count > 1)
    .sort((a, b) => b.count - a.count);
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format summary as Markdown
 *
 * @param {Object} summary - Summary object
 * @returns {string}
 */
function formatMarkdown(summary) {
  const lines = [];

  lines.push('# Error Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  if (summary.timeRange.start) {
    lines.push(`Time Range: ${summary.timeRange.start} to ${summary.timeRange.end}`);
  }
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`**Total Errors:** ${summary.total}`);
  lines.push('');

  lines.push('### By Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const [severity, count] of Object.entries(summary.bySeverity)) {
    if (count > 0) {
      lines.push(`| ${severity} | ${count} |`);
    }
  }
  lines.push('');

  lines.push('### By Category');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  for (const [category, count] of Object.entries(summary.byCategory)) {
    lines.push(`| ${category} | ${count} |`);
  }
  lines.push('');

  lines.push('### By Agent');
  lines.push('');
  lines.push('| Agent | Count |');
  lines.push('|-------|-------|');
  for (const [agent, count] of Object.entries(summary.byAgent)) {
    lines.push(`| ${agent} | ${count} |`);
  }
  lines.push('');

  if (summary.criticalErrors.length > 0) {
    lines.push('## Critical Errors');
    lines.push('');
    for (const error of summary.criticalErrors) {
      lines.push(`### ${error.errorId}`);
      lines.push('');
      lines.push(`- **Time:** ${error.timestamp}`);
      lines.push(`- **Category:** ${error.category}`);
      lines.push(`- **Message:** ${error.message}`);
      lines.push(`- **Agent:** ${error.context?.agentName || 'unknown'}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format errors as CSV
 *
 * @param {Object[]} errors - Error entries
 * @returns {string}
 */
function formatCsv(errors) {
  const headers = [
    'errorId',
    'timestamp',
    'category',
    'severity',
    'message',
    'agent',
    'tool',
    'taskId',
  ];
  const lines = [headers.join(',')];

  for (const error of errors) {
    const row = [
      error.errorId || '',
      error.timestamp || '',
      error.category || '',
      error.severity || '',
      `"${(error.message || '').replace(/"/g, '""')}"`,
      error.context?.agentName || '',
      error.context?.toolName || error.source?.location || '',
      error.context?.taskId || '',
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// CLI
// =============================================================================

/**
 * Parse command line arguments
 *
 * @param {string[]} args - Command line arguments
 * @returns {Object}
 */
function parseArgs(args) {
  const options = {
    summary: false,
    date: null,
    agent: null,
    category: null,
    severity: null,
    pattern: null,
    export: 'markdown',
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--summary':
        options.summary = true;
        break;
      case '--today':
        options.date = 'today';
        break;
      case '--this-week':
        options.date = 'this-week';
        break;
      case '--agent':
        options.agent = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--severity':
        options.severity = args[++i];
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--export':
        options.export = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--date':
        options.date = args[++i];
        break;
    }
  }

  return options;
}

/**
 * Run CLI
 */
function run() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Error Report CLI Tool

Usage:
  node error-report.cjs --summary [--today|--this-week]
  node error-report.cjs --agent <name>
  node error-report.cjs --category EXECUTION_ERROR
  node error-report.cjs --severity CRITICAL
  node error-report.cjs --pattern <regex>
  node error-report.cjs --export csv

Options:
  --summary           Generate summary report
  --today             Filter to today's errors
  --this-week         Filter to this week's errors
  --agent <name>      Filter by agent name
  --category <cat>    Filter by category
  --severity <sev>    Filter by severity
  --pattern <regex>   Filter by message pattern
  --export <format>   Export format (markdown, csv)
  --output <file>     Write to file instead of stdout
`);
    return;
  }

  const options = parseArgs(args);
  let output;

  if (options.summary) {
    const summary = generateSummary({ date: options.date });
    output = options.export === 'csv' ? formatCsv([]) : formatMarkdown(summary);
  } else {
    const filter = {
      agentName: options.agent,
      category: options.category,
      severity: options.severity,
      pattern: options.pattern,
      date: options.date,
    };
    const errors = filterErrors(filter);

    if (options.export === 'csv') {
      output = formatCsv(errors);
    } else {
      // Format as list
      const lines = ['# Error List', ''];
      for (const error of errors) {
        lines.push(`## ${error.errorId}`);
        lines.push(`- **Time:** ${error.timestamp}`);
        lines.push(`- **Category:** ${error.category}`);
        lines.push(`- **Severity:** ${error.severity}`);
        lines.push(`- **Message:** ${error.message}`);
        lines.push(`- **Agent:** ${error.context?.agentName || 'unknown'}`);
        lines.push('');
      }
      output = lines.join('\n');
    }
  }

  if (options.output) {
    fs.writeFileSync(options.output, output, 'utf8');
    console.log(`Report written to: ${options.output}`);
  } else {
    console.log(output);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  generateSummary,
  filterErrors,
  formatMarkdown,
  formatCsv,
  detectPatterns,
  readErrors,
  parseDateRange,
  parseArgs,
};

// Run CLI if executed directly
const wrappedMain = wrapCLITool(run, 'error-report');

if (require.main === module) {
  wrappedMain();
}
