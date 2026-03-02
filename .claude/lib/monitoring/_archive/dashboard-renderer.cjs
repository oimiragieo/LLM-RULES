// @ts-check
/**
 * Dashboard Renderer
 *
 * Renders monitoring dashboard with ASCII formatting.
 * Supports tables, charts, and alerts.
 *
 * @module lib/monitoring/dashboard-renderer
 */

/**
 * Format number with commas
 */
function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * Format time in milliseconds
 */
function formatTime(ms) {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format percentage
 */
function formatPercent(percent) {
  return `${percent.toFixed(1)}%`;
}

/**
 * Render table with aligned columns
 */
function renderTable(headers, rows) {
  // Calculate column widths
  const widths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map(row => String(row[i] || '').length));
    return Math.max(header.length, maxRowWidth);
  });

  // Render header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');

  const lines = [headerLine, separator];

  // Render rows
  rows.forEach(row => {
    const line = row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('  ');
    lines.push(line);
  });

  return lines.join('\n');
}

/**
 * Render box with border
 */
function renderBox(title, content, width = 70) {
  const top = '╔' + '═'.repeat(width - 2) + '╗';
  const titleLine = '║ ' + title.padEnd(width - 4) + ' ║';
  const separator = '╠' + '═'.repeat(width - 2) + '╣';
  const bottom = '╚' + '═'.repeat(width - 2) + '╝';

  const contentLines = content.split('\n').map(line => '║ ' + line.padEnd(width - 4) + ' ║');

  return [top, titleLine, separator, ...contentLines, bottom].join('\n');
}

/**
 * Render alert with icon
 */
function renderAlert(alert) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟡',
    MEDIUM: '🟠',
    LOW: '🔵',
  };

  const icon = icons[alert.severity] || '⚪';
  return `${icon} [${alert.severity}] ${alert.message}`;
}

/**
 * Render hook performance section
 */
function renderHookPerformance(summary) {
  const lines = [];

  lines.push('HOOK PERFORMANCE:');
  lines.push(`  Total calls:      ${formatNumber(summary.hooks.total)}`);
  lines.push(`  Avg execution:    ${formatTime(summary.hooks.avgTime)}`);
  lines.push(`  Failure rate:     ${formatPercent(summary.hooks.failureRate)}`);
  lines.push('');

  // Top hooks by count
  const topHooks = Object.entries(summary.hooks.byHook)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  if (topHooks.length > 0) {
    lines.push('  Top hooks by frequency:');
    topHooks.forEach(([hook, stats]) => {
      lines.push(
        `    ${hook.padEnd(30)} ${formatTime(stats.avgTime).padStart(8)}  ${formatNumber(stats.count)} calls`
      );
    });
  }

  return lines.join('\n');
}

/**
 * Render error statistics section
 */
function renderErrorStats(summary) {
  const lines = [];

  lines.push('ERROR STATISTICS:');
  lines.push(`  Total errors:     ${formatNumber(summary.errors.total)}`);
  lines.push('');

  // By severity
  if (summary.errors.bySeverity && Object.keys(summary.errors.bySeverity).length > 0) {
    lines.push('  By severity:');
    for (const [severity, count] of Object.entries(summary.errors.bySeverity)) {
      lines.push(`    ${severity.padEnd(12)} ${formatNumber(count)}`);
    }
    lines.push('');
  }

  // Top error types
  if (summary.errors.topErrors && summary.errors.topErrors.length > 0) {
    lines.push('  Top error types:');
    summary.errors.topErrors.forEach(error => {
      lines.push(`    ${error.type.padEnd(25)} ${formatNumber(error.count)} occurrences`);
    });
  }

  return lines.join('\n');
}

/**
 * Render alerts section
 */
function renderAlerts(alerts) {
  if (alerts.length === 0) {
    return 'ALERTS:\n  ✓ No alerts';
  }

  const lines = ['ALERTS:'];
  alerts.forEach(alert => {
    lines.push(`  ${renderAlert(alert)}`);
  });

  return lines.join('\n');
}

/**
 * Render full dashboard
 */
function renderDashboard(summary, alerts = []) {
  const title = `Agent Studio Monitoring Dashboard - Last ${summary.period.hours}h`;

  const sections = [
    '',
    renderHookPerformance(summary),
    '',
    renderErrorStats(summary),
    '',
    renderAlerts(alerts),
    '',
  ];

  const content = sections.join('\n');

  return renderBox(title, content, 80);
}

/**
 * Render compact summary (one line)
 */
function renderCompactSummary(summary) {
  return [
    `Hooks: ${summary.hooks.total} calls`,
    `${formatTime(summary.hooks.avgTime)} avg`,
    `${formatPercent(summary.hooks.failureRate)} fail rate`,
    `| Errors: ${summary.errors.total}`,
  ].join(' | ');
}

module.exports = {
  renderDashboard,
  renderTable,
  renderBox,
  renderAlert,
  renderHookPerformance,
  renderErrorStats,
  renderAlerts,
  renderCompactSummary,
  formatNumber,
  formatTime,
  formatPercent,
};
