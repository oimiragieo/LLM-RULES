'use strict';

/**
 * Observability CLI
 * =================
 *
 * Commander-based CLI for system observability: health status, events,
 * alerts, and cost reporting.
 *
 * Commands:
 *   status   Show system health summary (error count, memory, alerts, top events)
 *   events   List recent events with optional filters (--type, --since, --limit)
 *   alerts   Run AlertManager.evaluate() and show active alerts
 *   costs    Show CostReporter model breakdown table and daily trend
 *
 * Exports:
 *   createObservabilityCLI()   — returns configured Commander program
 *   runStatus(options)         — programmatic status runner
 *   runEvents(options)         — programmatic events runner
 *   runAlerts(options)         — programmatic alerts runner
 *   runCosts(options)          — programmatic costs runner
 *
 * NOTE: chalk v5 is ESM-only; ANSI escape codes are used directly for CJS
 * compatibility, following the existing pattern in this codebase.
 *
 * @module observability-cli
 */

const { Command } = require('commander');

// ─── ANSI color helpers ────────────────────────────────────────────────────────
// chalk v5 is ESM-only; raw ANSI codes for CJS compatibility

const chalk = {
  green: t => `\x1b[32m${t}\x1b[0m`,
  red: t => `\x1b[31m${t}\x1b[0m`,
  yellow: t => `\x1b[33m${t}\x1b[0m`,
  blue: t => `\x1b[34m${t}\x1b[0m`,
  cyan: t => `\x1b[36m${t}\x1b[0m`,
  bold: t => `\x1b[1m${t}\x1b[0m`,
  dim: t => `\x1b[2m${t}\x1b[0m`,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Return a chalk colorizer based on alert severity.
 * @param {string} severity
 * @returns {function(string): string}
 */
function severityColor(severity) {
  if (severity === 'critical') return chalk.red;
  if (severity === 'warning') return chalk.yellow;
  return chalk.green;
}

/**
 * Format bytes as a human-readable MB string.
 * @param {number} bytes
 * @returns {string}
 */
function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extract a brief summary string from a normalized event.
 * Uses data.summary, data.message, or a JSON snippet as fallback.
 * @param {{ type: string, component: string, data: object }} event
 * @returns {string}
 */
function eventSummary(event) {
  const d = event.data || {};
  if (typeof d.summary === 'string') return d.summary;
  if (typeof d.message === 'string') return d.message;
  // Compact JSON of data keys (omit large payloads)
  const keys = Object.keys(d);
  if (keys.length === 0) return '';
  return keys
    .slice(0, 3)
    .map(k => `${k}=${JSON.stringify(d[k])}`)
    .join(' ');
}

/**
 * Pad a string to a minimum width (left-aligned).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padEnd(str, width) {
  const s = String(str);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

// ─── runStatus ────────────────────────────────────────────────────────────────

/**
 * Show system health summary: recent error count, memory usage (if available),
 * active alert count, and top 5 recent events.
 *
 * @param {object} [options={}]
 * @param {object} [options._logAggregator] - Injectable LogAggregator instance
 * @param {object} [options._alertManager]  - Injectable AlertManager instance
 * @param {function} [options._output]      - Injectable output writer fn(string)
 * @returns {{ errorCount: number, alertCount: number, memoryMb: number|null,
 *             recentEvents: Array }}
 */
function runStatus(options) {
  const opts = options || {};
  const write = opts._output || (s => process.stdout.write(s));

  const LogAggregator = opts._LogAggregator || require('./log-aggregator.cjs').LogAggregator;
  const AlertManager = opts._AlertManager || require('./alert-manager.cjs').AlertManager;

  const logAggregator = opts._logAggregator || new LogAggregator();
  const alertManager = opts._alertManager || new AlertManager({ logAggregator });

  // Gather recent events (last 100 for analysis, last 5 for display)
  const recentEvents = logAggregator.getRecentEvents(100);
  const top5 = recentEvents.slice(-5);

  // Count errors and violations
  const errorCount = recentEvents.filter(e => e.type === 'error' || e.type === 'violation').length;

  // Find the most recent memory reading
  let memoryMb = null;
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const ev = recentEvents[i];
    if (ev.data && typeof ev.data.heapUsed === 'number') {
      memoryMb = ev.data.heapUsed / (1024 * 1024);
      break;
    }
  }

  // Evaluate alerts for count
  const { alerts } = alertManager.evaluate();
  const alertCount = alerts.length;

  // ── Output ──────────────────────────────────────────────────────────────────

  write(chalk.bold('=== System Health Status ===') + '\n');
  write('\n');

  // Error count
  const errLabel = errorCount > 0 ? chalk.red(`${errorCount}`) : chalk.green('0');
  write(`  ${chalk.bold('Recent Errors:')}  ${errLabel}\n`);

  // Memory
  if (memoryMb !== null) {
    const memColor = memoryMb > 800 ? chalk.yellow : chalk.green;
    write(`  ${chalk.bold('Memory (heap):')}  ${memColor(formatMb(memoryMb * 1024 * 1024))}\n`);
  } else {
    write(`  ${chalk.bold('Memory (heap):')}  ${chalk.dim('n/a')}\n`);
  }

  // Active alerts
  const alertLabel = alertCount > 0 ? chalk.yellow(`${alertCount}`) : chalk.green('0');
  write(`  ${chalk.bold('Active Alerts:')}  ${alertLabel}\n`);

  // Top 5 recent events
  write('\n');
  write(chalk.bold('  Top Recent Events:') + '\n');
  if (top5.length === 0) {
    write(`    ${chalk.dim('(no events)')}\n`);
  } else {
    for (const ev of top5) {
      const ts = ev.timestamp.replace('T', ' ').slice(0, 19);
      const summary = eventSummary(ev);
      const line =
        `    ${chalk.dim(ts)}  ${chalk.cyan(padEnd(ev.type, 12))}  ` +
        `${padEnd(ev.component, 10)}  ${summary}`;
      write(line + '\n');
    }
  }

  write('\n');

  return { errorCount, alertCount, memoryMb, recentEvents: top5 };
}

// ─── runEvents ────────────────────────────────────────────────────────────────

/**
 * List recent events with optional filters.
 *
 * @param {object} [options={}]
 * @param {string}   [options.type]            - Filter by event type
 * @param {string}   [options.since]           - ISO timestamp lower bound
 * @param {number}   [options.limit]           - Maximum events to show
 * @param {object}   [options._logAggregator]  - Injectable LogAggregator instance
 * @param {function} [options._output]         - Injectable output writer fn(string)
 * @returns {Array} The filtered events
 */
function runEvents(options) {
  const opts = options || {};
  const write = opts._output || (s => process.stdout.write(s));

  const LogAggregator = opts._LogAggregator || require('./log-aggregator.cjs').LogAggregator;
  const logAggregator = opts._logAggregator || new LogAggregator();

  // Build query options
  /** @type {object} */
  const queryOpts = {};

  if (opts.type) {
    queryOpts.eventTypes = [opts.type];
  }

  if (opts.since) {
    queryOpts.timeRange = { start: opts.since };
  }

  const rawLimit = opts.limit != null ? parseInt(String(opts.limit), 10) : null;
  if (rawLimit != null && rawLimit > 0) {
    queryOpts.limit = rawLimit;
  }

  const events = logAggregator.query(queryOpts);

  // ── Output ──────────────────────────────────────────────────────────────────

  write(chalk.bold('=== Recent Events ===') + '\n');

  if (opts.type) {
    write(`  ${chalk.dim(`Filter: type=${opts.type}`)}\n`);
  }
  if (opts.since) {
    write(`  ${chalk.dim(`Filter: since=${opts.since}`)}\n`);
  }
  write('\n');

  if (events.length === 0) {
    write(`  ${chalk.dim('(no events found)')}\n`);
  } else {
    // Header
    write(
      chalk.bold(
        `  ${padEnd('Timestamp', 20)}  ${padEnd('Type', 14)}  ${padEnd('Component', 12)}  Summary`
      ) + '\n'
    );
    write(chalk.dim('  ' + '-'.repeat(78)) + '\n');

    for (const ev of events) {
      const ts = ev.timestamp.replace('T', ' ').slice(0, 19);
      const summary = eventSummary(ev);
      const line =
        `  ${chalk.dim(padEnd(ts, 20))}  ` +
        `${chalk.cyan(padEnd(ev.type, 14))}  ` +
        `${padEnd(ev.component, 12)}  ` +
        summary;
      write(line + '\n');
    }
  }

  write('\n');

  return events;
}

// ─── runAlerts ────────────────────────────────────────────────────────────────

/**
 * Evaluate and display active alerts with severity-based coloring.
 *
 * @param {object} [options={}]
 * @param {object}   [options._logAggregator]  - Injectable LogAggregator instance
 * @param {object}   [options._alertManager]   - Injectable AlertManager instance
 * @param {function} [options._output]         - Injectable output writer fn(string)
 * @returns {{ alerts: Array, checkedAt: string }}
 */
function runAlerts(options) {
  const opts = options || {};
  const write = opts._output || (s => process.stdout.write(s));

  const LogAggregator = opts._LogAggregator || require('./log-aggregator.cjs').LogAggregator;
  const AlertManager = opts._AlertManager || require('./alert-manager.cjs').AlertManager;

  const logAggregator = opts._logAggregator || new LogAggregator();
  const alertManager = opts._alertManager || new AlertManager({ logAggregator });

  const result = alertManager.evaluate();
  const { alerts, checkedAt } = result;

  // ── Output ──────────────────────────────────────────────────────────────────

  write(chalk.bold('=== Active Alerts ===') + '\n');
  write(`  ${chalk.dim(`Checked at: ${checkedAt}`)}\n`);
  write('\n');

  if (alerts.length === 0) {
    write(`  ${chalk.green('\u2705 No active alerts \u2014 system healthy')}\n`);
  } else {
    for (const alert of alerts) {
      const colorize = severityColor(alert.severity);
      const badge = colorize(`[${alert.severity.toUpperCase()}]`);
      write(`  ${badge}  ${chalk.bold(alert.name)}\n`);
      write(`           ${alert.description}\n`);
      if (alert.value != null && alert.threshold != null) {
        write(
          `           Value: ${colorize(String(alert.value))}  ` +
            `Threshold: ${String(alert.threshold)}\n`
        );
      }
      write('\n');
    }
  }

  return result;
}

// ─── runCosts ─────────────────────────────────────────────────────────────────

/**
 * Display cost reporting: model breakdown table and daily trend.
 *
 * @param {object} [options={}]
 * @param {object}   [options._costReporter]   - Injectable CostReporter instance
 * @param {object}   [options._tokenAccountant] - Injectable TokenAccountant (for default reporter)
 * @param {function} [options._output]         - Injectable output writer fn(string)
 * @returns {{ modelBreakdown: Array, trend: Array }}
 */
function runCosts(options) {
  const opts = options || {};
  const write = opts._output || (s => process.stdout.write(s));

  let costReporter = opts._costReporter;
  if (!costReporter) {
    const CostReporter = require('./cost-reporter.cjs').CostReporter;
    const TokenAccountant =
      opts._TokenAccountant || require('../metrics/token-accountant.cjs').TokenAccountant;
    const accountant = opts._tokenAccountant || new TokenAccountant();
    costReporter = new CostReporter(accountant);
  }

  const modelBreakdown = costReporter.getModelBreakdown();
  const trend = costReporter.getTrend(7);

  // ── Output ──────────────────────────────────────────────────────────────────

  write(chalk.bold('=== Cost Report ===') + '\n');
  write('\n');

  // ── Model Breakdown ────────────────────────────────────────────────────────

  write(chalk.bold('  Model Breakdown:') + '\n');
  if (modelBreakdown.length === 0) {
    write(`    ${chalk.dim('(no cost data available)')}\n`);
  } else {
    // Table header
    write(
      chalk.bold(
        `    ${padEnd('Model', 30)}  ${padEnd('Cost (USD)', 12)}  ${padEnd('%', 7)}  Tasks`
      ) + '\n'
    );
    write(chalk.dim('    ' + '-'.repeat(62)) + '\n');

    for (const row of modelBreakdown) {
      const costStr = `$${row.cost.toFixed(4)}`;
      const pctStr = `${row.percentage.toFixed(1)}%`;
      // Color high-cost models in yellow, others in green
      const costColor = row.percentage >= 50 ? chalk.yellow : chalk.green;
      write(
        `    ${padEnd(row.model, 30)}  ` +
          `${costColor(padEnd(costStr, 12))}  ` +
          `${padEnd(pctStr, 7)}  ` +
          `${row.taskCount}\n`
      );
    }
  }

  write('\n');

  // ── Daily Trend ────────────────────────────────────────────────────────────

  write(chalk.bold('  Daily Cost Trend (last 7 days):') + '\n');
  if (trend.length === 0) {
    write(`    ${chalk.dim('(no trend data available)')}\n`);
  } else {
    const maxCost = Math.max(...trend.map(d => d.cost), 0.001);
    const barWidth = 20;

    for (const day of trend) {
      const dateStr = day.date;
      const costStr = `$${day.cost.toFixed(4)}`;
      const barLen = Math.round((day.cost / maxCost) * barWidth);
      const bar = '\u2588'.repeat(Math.max(barLen, day.cost > 0 ? 1 : 0));
      const barColored = day.cost > 0 ? chalk.cyan(bar) : chalk.dim('-');
      write(`    ${dateStr}  ${padEnd(costStr, 10)}  ${barColored}\n`);
    }
  }

  write('\n');

  return { modelBreakdown, trend };
}

// ─── createObservabilityCLI ───────────────────────────────────────────────────

/**
 * Create and return a configured Commander program for observability.
 *
 * @returns {Command} Configured Commander program
 */
function createObservabilityCLI() {
  const program = new Command();

  program.name('observability').description('Observability CLI for system health and monitoring');

  // ── status ──────────────────────────────────────────────────────────────────

  program
    .command('status')
    .description(
      'Show system health: recent error count, memory usage, active alert count, top events'
    )
    .action(() => {
      try {
        runStatus();
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── events ──────────────────────────────────────────────────────────────────

  program
    .command('events')
    .description('List recent events with optional filters')
    .option('--type <type>', 'Filter by event type (e.g. error, spawn, health)')
    .option('--since <iso>', 'Show events since ISO timestamp (e.g. 2026-01-01T00:00:00.000Z)')
    .option('--limit <n>', 'Maximum number of events to show', '50')
    .action(cmdOpts => {
      try {
        const limit = parseInt(cmdOpts.limit, 10);
        runEvents({
          type: cmdOpts.type,
          since: cmdOpts.since,
          limit: isNaN(limit) ? 50 : limit,
        });
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── alerts ──────────────────────────────────────────────────────────────────

  program
    .command('alerts')
    .description('Evaluate alert thresholds and show active alerts with severity coloring')
    .action(() => {
      try {
        runAlerts();
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  // ── costs ────────────────────────────────────────────────────────────────────

  program
    .command('costs')
    .description('Show token cost breakdown by model and daily cost trend')
    .action(() => {
      try {
        runCosts();
      } catch (err) {
        process.stderr.write(chalk.red(`Error: ${err.message}`) + '\n');
        process.exit(1);
      }
    });

  return program;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createObservabilityCLI,
  runStatus,
  runEvents,
  runAlerts,
  runCosts,
};
