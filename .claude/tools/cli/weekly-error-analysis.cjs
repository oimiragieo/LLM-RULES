#!/usr/bin/env node
/**
 * CLI Tool: weekly-error-analysis.cjs
 * Purpose: Generate weekly error pattern analysis report
 *
 * Phase 4.5 of error logging integration
 *
 * Usage:
 *   node .claude/tools/cli/weekly-error-analysis.cjs
 *   node .claude/tools/cli/weekly-error-analysis.cjs --week 2026-W04
 *   node .claude/tools/cli/weekly-error-analysis.cjs --output /path/to/output.md
 *
 * Output:
 *   .claude/context/artifacts/error-summaries/weekly-analysis-YYYY-WXX.md
 *
 * Contents:
 *   - Total errors this week vs last week (trend)
 *   - Agent performance ranking (fewest errors = best)
 *   - Hook reliability analysis
 *   - Tool reliability analysis
 *   - Recommendations for improvement
 *   - Critical issues requiring action
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');

// Import utilities
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const patternDetector = require('../../lib/error-pattern-detector.cjs');

// Directories
const ERROR_REPORTS_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'error-reports'
);
const ERROR_SUMMARIES_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'error-summaries'
);

// Constants
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const _MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Get ISO week number from date
 * @param {Date} date - Date to analyze
 * @returns {object} { year, week }
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / MS_PER_DAY + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Get week string (YYYY-WXX)
 * @param {Date} date - Date to format
 * @returns {string} Week string
 */
function getWeekString(date) {
  const { year, week } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Get start and end of week for a given date
 * @param {Date} date - Reference date
 * @returns {object} { start, end }
 */
function getWeekBounds(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday = start
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Read all error logs
 * @returns {Array<object>} Array of error entries
 */
function readErrorLogs() {
  const errorsFile = path.join(ERROR_REPORTS_DIR, 'errors.jsonl');

  if (!fs.existsSync(errorsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(errorsFile, 'utf8');
    if (!content.trim()) return [];

    const lines = content.split('\n').filter(line => line.trim());
    const errors = [];

    for (const line of lines) {
      try {
        errors.push(safeParseJSON(line));
      } catch (_e) {
        // Skip malformed
      }
    }

    return errors;
  } catch (_err) {
    return [];
  }
}

/**
 * Filter errors by week
 * @param {Array<object>} errors - All errors
 * @param {Date} weekStart - Week start date
 * @param {Date} weekEnd - Week end date
 * @returns {Array<object>} Filtered errors
 */
function filterByWeek(errors, weekStart, weekEnd) {
  return errors.filter(e => {
    if (!e.timestamp) return false;
    const t = new Date(e.timestamp).getTime();
    return t >= weekStart.getTime() && t <= weekEnd.getTime();
  });
}

/**
 * Calculate agent ranking (fewest errors = best)
 * @param {Array<object>} errors - Week errors
 * @returns {Array<object>} Ranked agents
 */
function rankAgents(errors) {
  const counts = {};
  const severityCounts = {};

  for (const error of errors) {
    const agent = error.context?.agentName || 'unknown';
    counts[agent] = (counts[agent] || 0) + 1;

    if (!severityCounts[agent]) {
      severityCounts[agent] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    }
    if (error.severity) {
      severityCounts[agent][error.severity] = (severityCounts[agent][error.severity] || 0) + 1;
    }
  }

  // Sort by error count (ascending = best first)
  return Object.entries(counts)
    .map(([agent, count]) => ({
      agent,
      errorCount: count,
      severities: severityCounts[agent],
      score: calculateAgentScore(count, severityCounts[agent]),
    }))
    .sort((a, b) => a.errorCount - b.errorCount);
}

/**
 * Calculate agent health score
 * @param {number} count - Error count
 * @param {object} severities - Severity breakdown
 * @returns {number} Score 0-100
 */
function calculateAgentScore(count, severities) {
  let score = 100;
  score -= count * 2;
  score -= (severities.CRITICAL || 0) * 15;
  score -= (severities.HIGH || 0) * 8;
  score -= (severities.MEDIUM || 0) * 3;
  score -= (severities.LOW || 0) * 1;
  return Math.max(0, Math.min(100, score));
}

/**
 * Analyze hook reliability
 * @param {Array<object>} errors - Week errors
 * @returns {Array<object>} Hook reliability stats
 */
function analyzeHookReliability(errors) {
  const hookErrors = errors.filter(e => e.category === 'HOOK_FAILURE');
  const hookCounts = {};

  for (const error of hookErrors) {
    const hook = error.source?.location || 'unknown';
    hookCounts[hook] = (hookCounts[hook] || 0) + 1;
  }

  return Object.entries(hookCounts)
    .map(([hook, count]) => ({ hook, failures: count }))
    .sort((a, b) => b.failures - a.failures);
}

/**
 * Analyze tool reliability
 * @param {Array<object>} errors - Week errors
 * @returns {Array<object>} Tool reliability stats
 */
function analyzeToolReliability(errors) {
  const toolErrors = errors.filter(e => e.category === 'TOOL_FAILURE');
  const toolCounts = {};

  for (const error of toolErrors) {
    const tool = error.context?.toolName || 'unknown';
    toolCounts[tool] = (toolCounts[tool] || 0) + 1;
  }

  return Object.entries(toolCounts)
    .map(([tool, count]) => ({ tool, failures: count }))
    .sort((a, b) => b.failures - a.failures);
}

/**
 * Compare two weeks and generate trend
 * @param {number} thisWeek - This week's count
 * @param {number} lastWeek - Last week's count
 * @returns {object} Trend info
 */
function calculateTrend(thisWeek, lastWeek) {
  if (lastWeek === 0) {
    return {
      direction: thisWeek > 0 ? 'up' : 'stable',
      percentage: thisWeek > 0 ? 100 : 0,
      text: thisWeek > 0 ? `+${thisWeek} new errors` : 'No errors',
    };
  }

  const diff = thisWeek - lastWeek;
  const percentage = Math.round((diff / lastWeek) * 100);

  return {
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable',
    percentage: Math.abs(percentage),
    text:
      diff > 0
        ? `+${percentage}% increase`
        : diff < 0
          ? `-${Math.abs(percentage)}% decrease`
          : 'No change',
  };
}

/**
 * Generate weekly analysis report
 * @param {Date} weekDate - Reference date (any day in the target week)
 * @returns {object} Analysis results
 */
function generateWeeklyAnalysis(weekDate = new Date()) {
  const { start: weekStart, end: weekEnd } = getWeekBounds(weekDate);
  const weekStr = getWeekString(weekDate);

  // Previous week
  const prevWeekDate = new Date(weekStart);
  prevWeekDate.setDate(prevWeekDate.getDate() - 7);
  const { start: prevStart, end: prevEnd } = getWeekBounds(prevWeekDate);
  const prevWeekStr = getWeekString(prevWeekDate);

  // Read all errors
  const allErrors = readErrorLogs();

  // Filter by weeks
  const thisWeekErrors = filterByWeek(allErrors, weekStart, weekEnd);
  const lastWeekErrors = filterByWeek(allErrors, prevStart, prevEnd);

  // Calculate trend
  const trend = calculateTrend(thisWeekErrors.length, lastWeekErrors.length);

  // Detect patterns for this week
  const patterns = patternDetector.detectPatterns(thisWeekErrors);
  const recommendations = patternDetector.generateRecommendations(patterns);

  // Rankings and reliability
  const agentRanking = rankAgents(thisWeekErrors);
  const hookReliability = analyzeHookReliability(thisWeekErrors);
  const toolReliability = analyzeToolReliability(thisWeekErrors);

  // Critical issues
  const criticalErrors = thisWeekErrors.filter(e => e.severity === 'CRITICAL');

  return {
    week: weekStr,
    previousWeek: prevWeekStr,
    generatedAt: new Date().toISOString(),
    period: {
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
    },
    summary: {
      totalErrors: thisWeekErrors.length,
      previousWeekErrors: lastWeekErrors.length,
      trend,
    },
    agentRanking,
    hookReliability,
    toolReliability,
    patterns,
    recommendations,
    criticalIssues: criticalErrors.map(e => ({
      errorId: e.errorId,
      message: e.message,
      timestamp: e.timestamp,
      agent: e.context?.agentName,
    })),
  };
}

/**
 * Generate markdown report
 * @param {object} analysis - Analysis results
 * @returns {string} Markdown content
 */
function generateMarkdown(analysis) {
  const lines = [];

  lines.push(`# Weekly Error Analysis - ${analysis.week}`);
  lines.push('');
  lines.push(`Generated: ${analysis.generatedAt}`);
  lines.push(
    `Period: ${analysis.period.start.split('T')[0]} to ${analysis.period.end.split('T')[0]}`
  );
  lines.push('');

  // Summary with Trend
  lines.push('## Summary');
  lines.push('');
  const trendIcon =
    analysis.summary.trend.direction === 'up'
      ? '↑'
      : analysis.summary.trend.direction === 'down'
        ? '↓'
        : '→';
  lines.push(`| Metric | This Week | Last Week | Trend |`);
  lines.push(`|--------|-----------|-----------|-------|`);
  lines.push(
    `| Total Errors | ${analysis.summary.totalErrors} | ${analysis.summary.previousWeekErrors} | ${trendIcon} ${analysis.summary.trend.text} |`
  );
  lines.push('');

  // Critical Issues
  if (analysis.criticalIssues.length > 0) {
    lines.push('## Critical Issues Requiring Immediate Action');
    lines.push('');
    for (const issue of analysis.criticalIssues) {
      lines.push(`- **${issue.errorId}**: ${issue.message}`);
      if (issue.agent) lines.push(`  - Agent: ${issue.agent}`);
      lines.push(`  - Time: ${issue.timestamp}`);
    }
    lines.push('');
  }

  // Agent Performance Ranking
  lines.push('## Agent Performance Ranking');
  lines.push('');
  lines.push('| Rank | Agent | Errors | Score | Critical | High | Medium | Low |');
  lines.push('|------|-------|--------|-------|----------|------|--------|-----|');
  analysis.agentRanking.forEach((agent, index) => {
    const s = agent.severities;
    lines.push(
      `| ${index + 1} | ${agent.agent} | ${agent.errorCount} | ${agent.score}/100 | ${s.CRITICAL} | ${s.HIGH} | ${s.MEDIUM} | ${s.LOW} |`
    );
  });
  lines.push('');

  // Hook Reliability
  if (analysis.hookReliability.length > 0) {
    lines.push('## Hook Reliability Analysis');
    lines.push('');
    lines.push('| Hook | Failures |');
    lines.push('|------|----------|');
    for (const hook of analysis.hookReliability) {
      lines.push(`| ${hook.hook} | ${hook.failures} |`);
    }
    lines.push('');
  }

  // Tool Reliability
  if (analysis.toolReliability.length > 0) {
    lines.push('## Tool Reliability Analysis');
    lines.push('');
    lines.push('| Tool | Failures |');
    lines.push('|------|----------|');
    for (const tool of analysis.toolReliability) {
      lines.push(`| ${tool.tool} | ${tool.failures} |`);
    }
    lines.push('');
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push('## Recommendations for Improvement');
    lines.push('');
    for (const rec of analysis.recommendations) {
      lines.push(`### [${rec.priority}] ${rec.issue}`);
      lines.push(`- **Suggestion**: ${rec.suggestion}`);
      lines.push('');
    }
  }

  // Pattern Details
  lines.push('## Pattern Analysis');
  lines.push('');
  const p = analysis.patterns;
  lines.push(`- Repeated Errors: ${p.repeatedErrors?.length || 0}`);
  lines.push(`- Error Cascades: ${p.cascades?.length || 0}`);
  lines.push(`- Agent Issues: ${p.agentIssues?.length || 0}`);
  lines.push(`- Hook Failures: ${p.hookFailures?.length || 0}`);
  lines.push(`- Tool Failures: ${p.toolFailures?.length || 0}`);
  lines.push(`- Severity Escalations: ${p.severityEscalations?.length || 0}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Save report to file
 * @param {string} markdown - Report content
 * @param {string} week - Week string
 * @param {string} outputPath - Optional custom output path
 * @returns {string} Path to saved file
 */
function saveReport(markdown, week, outputPath) {
  const dir = outputPath ? path.dirname(outputPath) : ERROR_SUMMARIES_DIR;
  const filePath = outputPath || path.join(ERROR_SUMMARIES_DIR, `weekly-analysis-${week}.md`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/**
 * Parse command line arguments
 * @returns {object} Parsed args
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { week: null, output: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && args[i + 1]) {
      result.week = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * Parse week string to date
 * @param {string} weekStr - Week string (YYYY-WXX)
 * @returns {Date} Start of week
 */
function parseWeekString(weekStr) {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week format: ${weekStr}. Expected YYYY-WXX`);
  }

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // Find the first day of the year
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();

  // Find Monday of week 1
  const week1Monday = new Date(jan1);
  week1Monday.setDate(jan1.getDate() + (jan1Day <= 4 ? 1 - jan1Day : 8 - jan1Day));

  // Add weeks
  const targetDate = new Date(week1Monday);
  targetDate.setDate(week1Monday.getDate() + (week - 1) * 7);

  return targetDate;
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();

  let weekDate = new Date();
  if (args.week) {
    try {
      weekDate = parseWeekString(args.week);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`Generating weekly error analysis for ${getWeekString(weekDate)}...`);

  const analysis = generateWeeklyAnalysis(weekDate);
  const markdown = generateMarkdown(analysis);
  const filePath = saveReport(markdown, analysis.week, args.output);

  console.log(`\nReport generated: ${filePath}`);
  console.log(`\nSummary:`);
  console.log(`  Total errors this week: ${analysis.summary.totalErrors}`);
  console.log(`  Previous week: ${analysis.summary.previousWeekErrors}`);
  console.log(`  Trend: ${analysis.summary.trend.text}`);
  console.log(`  Critical issues: ${analysis.criticalIssues.length}`);
  console.log(`  Recommendations: ${analysis.recommendations.length}`);

  if (analysis.criticalIssues.length > 0) {
    console.log(`\nCritical Issues:`);
    for (const issue of analysis.criticalIssues.slice(0, 3)) {
      console.log(`  - ${issue.errorId}: ${issue.message?.substring(0, 50)}...`);
    }
  }
}

const wrappedMain = wrapCLITool(main, 'weekly-error-analysis');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  generateWeeklyAnalysis,
  generateMarkdown,
  saveReport,
  getISOWeek,
  getWeekString,
  getWeekBounds,
  rankAgents,
  analyzeHookReliability,
  analyzeToolReliability,
  calculateTrend,
  parseWeekString,
};
