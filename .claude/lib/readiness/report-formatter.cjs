'use strict';

/**
 * Report Formatter
 * ================
 *
 * Multi-format output for readiness reports.
 *
 * Supported formats:
 * - terminal  — chalk-colored table with aligned columns and progress bars
 * - markdown  — GitHub-flavored markdown table (for CI comments)
 * - json      — JSON.stringify of the full report
 * - summary   — single-line overview (for scripts)
 *
 * NOTE: chalk v5 is ESM-only; ANSI escape codes are used directly for CJS
 * compatibility, following the existing pattern in this codebase.
 *
 * @module report-formatter
 */

// ANSI color helpers (chalk v5 is ESM-only; raw ANSI codes for CJS compatibility)
const ansi = {
  green: t => `\x1b[32m${t}\x1b[0m`,
  red: t => `\x1b[31m${t}\x1b[0m`,
  yellow: t => `\x1b[33m${t}\x1b[0m`,
  blue: t => `\x1b[34m${t}\x1b[0m`,
  cyan: t => `\x1b[36m${t}\x1b[0m`,
  gray: t => `\x1b[90m${t}\x1b[0m`,
  bold: t => `\x1b[1m${t}\x1b[0m`,
};

/** Supported output format names */
const SUPPORTED_FORMATS = ['terminal', 'markdown', 'json', 'summary'];

/**
 * Format a readiness report as a chalk-colored terminal table.
 *
 * @param {object} report - Readiness report from ReadinessScorer
 * @returns {string} Colored terminal string with aligned columns
 */
function formatTerminal(report) {
  const { level, overallScore, pillars, gateStatus, recommendations, repoPath } = report;
  const lines = [];

  lines.push(ansi.bold('\n=== Readiness Report ==='));
  lines.push(`${ansi.blue('Directory')}: ${repoPath}`);
  lines.push(
    `${ansi.blue('Level')}: ${ansi.bold(level)} | ${ansi.blue('Score')}: ${ansi.bold(String(overallScore))}/100`
  );

  const gateLabel = gateStatus.passed ? ansi.green('\u2705 PASS') : ansi.red('\u274c FAIL');
  lines.push(
    `${ansi.blue('Gate')}: ${gateLabel} ${ansi.gray('(threshold: ' + gateStatus.threshold + ')')}`
  );
  lines.push('');

  // Column widths
  const COL_PILLAR = 30;
  const COL_SCORE = 9;
  const COL_STATUS = 12;
  const BAR_WIDTH = 20;

  const header =
    'Pillar'.padEnd(COL_PILLAR) +
    'Score'.padStart(COL_SCORE) +
    '  ' +
    'Status'.padEnd(COL_STATUS) +
    'Progress';
  lines.push(ansi.bold(header));
  lines.push(ansi.gray('\u2500'.repeat(COL_PILLAR + COL_SCORE + 2 + COL_STATUS + BAR_WIDTH)));

  for (const [name, pillar] of Object.entries(pillars)) {
    const scoreStr = `${pillar.score}/100`.padStart(COL_SCORE);
    const statusStr = pillar.passed ? ansi.green('\u2705 PASS') : ansi.red('\u274c FAIL');
    const barLen = Math.round(pillar.score / 5); // 0-20 chars
    const filledBar = '\u2588'.repeat(barLen);
    const emptyBar = '\u2591'.repeat(BAR_WIDTH - barLen);
    const coloredBar = pillar.passed
      ? ansi.green(filledBar) + ansi.gray(emptyBar)
      : ansi.red(filledBar) + ansi.gray(emptyBar);
    lines.push(
      `${name.padEnd(COL_PILLAR)}${scoreStr}  ${statusStr.padEnd(COL_STATUS)}${coloredBar}`
    );
  }

  lines.push('');

  if (recommendations && recommendations.length > 0) {
    lines.push(ansi.bold('Recommendations:'));
    for (const rec of recommendations) {
      lines.push(`  ${ansi.yellow('\u2022')} ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a readiness report as a GitHub-flavored Markdown table.
 *
 * @param {object} report - Readiness report from ReadinessScorer
 * @returns {string} Markdown table string
 */
function formatMarkdown(report) {
  const { level, overallScore, pillars, gateStatus, recommendations, repoPath } = report;
  const lines = [];

  lines.push('## Readiness Report');
  lines.push('');
  lines.push(`**Directory:** ${repoPath}  `);
  lines.push(`**Level:** ${level} | **Score:** ${overallScore}/100  `);
  lines.push(
    `**Gate:** ${gateStatus.passed ? '\u2705 PASS' : '\u274c FAIL'} ` +
      `(threshold: ${gateStatus.threshold})`
  );
  lines.push('');
  lines.push('| Pillar | Score | Status |');
  lines.push('|--------|------:|--------|');

  for (const [name, pillar] of Object.entries(pillars)) {
    const status = pillar.passed ? '\u2705 PASS' : '\u274c FAIL';
    lines.push(`| ${name} | ${pillar.score}/100 | ${status} |`);
  }

  lines.push('');

  if (recommendations && recommendations.length > 0) {
    lines.push('### Recommendations');
    lines.push('');
    for (const rec of recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a readiness report as indented JSON.
 *
 * @param {object} report - Readiness report from ReadinessScorer
 * @returns {string} JSON string
 */
function formatJson(report) {
  return JSON.stringify(report, null, 2);
}

/**
 * Format a readiness report as a single-line summary.
 *
 * Example output:
 *   Readiness: L3 (72/100) — 7/9 pillars passing
 *
 * @param {object} report - Readiness report from ReadinessScorer
 * @returns {string} Single-line summary string
 */
function formatSummary(report) {
  const { level, overallScore, pillars } = report;
  const passingCount = Object.values(pillars).filter(p => p.passed).length;
  const totalCount = Object.keys(pillars).length;
  return `Readiness: ${level} (${overallScore}/100) \u2014 ${passingCount}/${totalCount} pillars passing`;
}

/**
 * ReportFormatter class — dispatches to the correct formatter based on format.
 *
 * @example
 * const formatter = new ReportFormatter('json');
 * const output = formatter.format(report);
 */
class ReportFormatter {
  /**
   * @param {string} fmt - One of 'terminal', 'markdown', 'json', 'summary'
   * @throws {Error} if fmt is not a supported format
   */
  constructor(fmt) {
    if (!SUPPORTED_FORMATS.includes(fmt)) {
      throw new Error(
        `Unknown format '${fmt}'. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`
      );
    }
    this._fmt = fmt;
  }

  /**
   * Format a readiness report.
   *
   * @param {object} report - Readiness report from ReadinessScorer
   * @returns {string} Formatted string
   */
  format(report) {
    switch (this._fmt) {
      case 'terminal':
        return formatTerminal(report);
      case 'markdown':
        return formatMarkdown(report);
      case 'json':
        return formatJson(report);
      case 'summary':
        return formatSummary(report);
      default:
        throw new Error(`Unknown format '${this._fmt}'`);
    }
  }
}

module.exports = {
  formatTerminal,
  formatMarkdown,
  formatJson,
  formatSummary,
  ReportFormatter,
  SUPPORTED_FORMATS,
};
