// @ts-check
/**
 * Metrics Reader
 *
 * Reads and aggregates metrics from JSONL files.
 * Provides statistics, trends, and filtering capabilities.
 *
 * @module lib/monitoring/metrics-reader
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');

function parseMetricLine(line) {
  const metric = safeParseJSON(line);
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
    return null;
  }

  const timestamp = typeof metric.timestamp === 'string' ? metric.timestamp : '';
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return null;
  }

  return metric;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[index] || 0;
}

/**
 * Read metrics from JSONL file with time filtering
 *
 * @param {string} file - Metrics file path
 * @param {Object} options - Filter options
 * @param {number} [options.hours] - Hours of history to include (default: 24)
 * @param {string} [options.since] - ISO timestamp to start from
 * @returns {Promise<Array>} Array of metric entries
 */
async function readMetrics(file, options = {}) {
  const hours = options.hours || 24;
  const cutoffTime = options.since
    ? new Date(options.since).getTime()
    : Date.now() - hours * 60 * 60 * 1000;

  const metrics = [];

  if (!fs.existsSync(file)) {
    return metrics;
  }

  const fileStream = fs.createReadStream(file);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      if (line.trim()) {
        const metric = parseMetricLine(line);
        if (!metric) {
          continue;
        }
        const metricTime = new Date(metric.timestamp).getTime();

        if (metricTime >= cutoffTime) {
          metrics.push(metric);
        }
      }
    } catch (error) {
      console.error(`[metrics-reader] Failed to parse line: ${error.message}`);
    }
  }

  return metrics;
}

async function readMetricsWithStats(file, options = {}) {
  const hours = options.hours || 24;
  const cutoffTime = options.since
    ? new Date(options.since).getTime()
    : Date.now() - hours * 60 * 60 * 1000;

  const metrics = [];
  let parseErrors = 0;
  let totalLines = 0;

  if (!fs.existsSync(file)) {
    return {
      metrics,
      parseErrors,
      totalLines,
      failedParseRate: 0,
    };
  }

  const fileStream = fs.createReadStream(file);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    totalLines++;
    try {
      if (line.trim()) {
        const metric = parseMetricLine(line);
        if (!metric) {
          parseErrors++;
          continue;
        }
        const metricTime = new Date(metric.timestamp).getTime();

        if (metricTime >= cutoffTime) {
          metrics.push(metric);
        }
      }
    } catch (_error) {
      parseErrors++;
    }
  }

  return {
    metrics,
    parseErrors,
    totalLines,
    failedParseRate: totalLines > 0 ? parseErrors / totalLines : 0,
  };
}

/**
 * Calculate statistics for hook metrics
 */
function calculateHookStats(metrics) {
  // Group by hook
  const byHook = {};

  metrics.forEach(metric => {
    if (!byHook[metric.hook]) {
      byHook[metric.hook] = {
        count: 0,
        totalTime: 0,
        times: [],
        successes: 0,
        failures: 0,
      };
    }

    const stats = byHook[metric.hook];
    stats.count++;
    stats.totalTime += metric.executionTimeMs;
    stats.times.push(metric.executionTimeMs);

    if (metric.status === 'success') {
      stats.successes++;
    } else {
      stats.failures++;
    }
  });

  // Calculate averages and percentiles
  const stats = {};
  for (const [hook, data] of Object.entries(byHook)) {
    data.times.sort((a, b) => a - b);

    const p50Index = Math.floor(data.times.length * 0.5);
    const p95Index = Math.floor(data.times.length * 0.95);
    const p99Index = Math.floor(data.times.length * 0.99);

    stats[hook] = {
      count: data.count,
      avgTime: data.totalTime / data.count,
      p50: data.times[p50Index] || 0,
      p95: data.times[p95Index] || 0,
      p99: data.times[p99Index] || 0,
      successRate: (data.successes / data.count) * 100,
      failures: data.failures,
    };
  }

  return stats;
}

/**
 * Calculate statistics for error metrics
 */
function calculateErrorStats(metrics) {
  // Group by type and severity
  const byType = {};
  const bySeverity = {};
  const bySource = {};

  metrics.forEach(metric => {
    // By type
    byType[metric.errorType] = (byType[metric.errorType] || 0) + 1;

    // By severity
    bySeverity[metric.severity] = (bySeverity[metric.severity] || 0) + 1;

    // By source
    bySource[metric.source] = (bySource[metric.source] || 0) + 1;
  });

  // Top errors
  const topErrors = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const topSources = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  return {
    total: metrics.length,
    byType,
    bySeverity,
    bySource,
    topErrors,
    topSources,
  };
}

/**
 * Get metrics summary for dashboard
 */
async function getMetricsSummary(options = {}) {
  const hours = options.hours || 24;

  // Read metrics files
  const hookMetricsFile = path.join(METRICS_DIR, 'hook-metrics.jsonl');
  const errorMetricsFile = path.join(METRICS_DIR, 'error-metrics.jsonl');

  const [hookMetrics, errorMetrics] = await Promise.all([
    readMetrics(hookMetricsFile, { hours }),
    readMetrics(errorMetricsFile, { hours }),
  ]);

  // Calculate stats
  const hookStats = calculateHookStats(hookMetrics);
  const errorStats = calculateErrorStats(errorMetrics);

  // Overall stats
  const totalHookCalls = hookMetrics.length;
  const avgHookTime =
    hookMetrics.reduce((sum, m) => sum + m.executionTimeMs, 0) / totalHookCalls || 0;
  const hookFailureRate =
    (hookMetrics.filter(m => m.status === 'failure').length / totalHookCalls) * 100 || 0;

  return {
    period: { hours, from: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() },
    hooks: {
      total: totalHookCalls,
      avgTime: avgHookTime,
      failureRate: hookFailureRate,
      byHook: hookStats,
    },
    errors: errorStats,
  };
}

/**
 * Find slowest hooks
 */
function findSlowHooks(stats, threshold = 10) {
  const slow = [];

  for (const [hook, data] of Object.entries(stats)) {
    if (data.avgTime > threshold) {
      slow.push({
        hook,
        avgTime: data.avgTime,
        p95: data.p95,
        count: data.count,
      });
    }
  }

  return slow.sort((a, b) => b.avgTime - a.avgTime);
}

/**
 * Detect alerts based on thresholds
 */
function detectAlerts(summary, thresholds = {}) {
  const alerts = [];

  // Default thresholds
  const defaults = {
    hookExecutionTimeMs: 10,
    hookFailureRate: 5,
    errorRatePerHour: 10,
  };

  const config = { ...defaults, ...thresholds };

  // Check hook execution time
  for (const [hook, stats] of Object.entries(summary.hooks.byHook)) {
    if (stats.avgTime > config.hookExecutionTimeMs) {
      alerts.push({
        severity: 'MEDIUM',
        type: 'SlowHook',
        message: `Hook ${hook} avg execution time ${stats.avgTime.toFixed(2)}ms exceeds threshold ${config.hookExecutionTimeMs}ms`,
      });
    }
  }

  // Check hook failure rate
  if (summary.hooks.failureRate > config.hookFailureRate) {
    alerts.push({
      severity: 'HIGH',
      type: 'HookFailureRate',
      message: `Hook failure rate ${summary.hooks.failureRate.toFixed(2)}% exceeds threshold ${config.hookFailureRate}%`,
    });
  }

  // Check error rate
  const errorRate = summary.errors.total / summary.period.hours;
  if (errorRate > config.errorRatePerHour) {
    alerts.push({
      severity: 'HIGH',
      type: 'ErrorRate',
      message: `Error rate ${errorRate.toFixed(2)}/hour exceeds threshold ${config.errorRatePerHour}/hour`,
    });
  }

  // Check for security violations
  if (summary.errors.bySeverity.CRITICAL > 0) {
    alerts.push({
      severity: 'CRITICAL',
      type: 'SecurityViolation',
      message: `${summary.errors.bySeverity.CRITICAL} security violation(s) detected`,
    });
  }

  return alerts;
}

function calculateRouterRollups({
  spawnRows = [],
  tokenRows = [],
  churnRows = [],
  violationRows = [],
  hours = 24,
}) {
  const spawnEndRows = spawnRows.filter(row => row.event === 'spawn_end');
  const rejected = spawnEndRows.filter(row => row.success === false).length;
  const tokenSeries = tokenRows
    .map(row => Number(row.output_tokens_est))
    .filter(value => Number.isFinite(value) && value >= 0);
  const promptLengths = spawnRows
    .filter(row => row.event === 'spawn_start')
    .map(row => Number(row.prompt_length))
    .filter(value => Number.isFinite(value) && value > 0);

  const violationsByRule = {};
  for (const row of violationRows) {
    const key = row.checkName || 'unknown';
    violationsByRule[key] = (violationsByRule[key] || 0) + 1;
  }
  const topViolationRules = Object.entries(violationsByRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => ({ rule, count }));

  const blockDecisions = churnRows.filter(row => row.event === 'router_guard_decision');
  const blockedCount = blockDecisions.filter(row => row.result === 'block').length;

  return {
    periodHours: hours,
    tokenUsage: {
      sampleSize: tokenSeries.length,
      p50: percentile(tokenSeries, 0.5),
      p95: percentile(tokenSeries, 0.95),
      max: tokenSeries.length ? Math.max(...tokenSeries) : 0,
    },
    promptSize: {
      sampleSize: promptLengths.length,
      p95Chars: percentile(promptLengths, 0.95),
    },
    spawns: {
      total: spawnEndRows.length,
      rejected: rejected,
      rejectRate: spawnEndRows.length > 0 ? rejected / spawnEndRows.length : 0,
    },
    routerDecisions: {
      total: blockDecisions.length,
      blocked: blockedCount,
      blockRate: blockDecisions.length > 0 ? blockedCount / blockDecisions.length : 0,
    },
    violations: {
      total: violationRows.length,
      perHour: hours > 0 ? violationRows.length / hours : 0,
      byRuleTop: topViolationRules,
    },
  };
}

async function getRouterOpsSummary(options = {}) {
  const hours = Number(options.hours || 24);
  const since = options.since;
  const spawnLogFile = path.join(METRICS_DIR, 'spawn-log.jsonl');
  const tokenBurnFile = path.join(METRICS_DIR, 'token-burn-metrics.jsonl');
  const routerChurnFile = path.join(METRICS_DIR, 'router-churn-metrics.jsonl');
  const violationsFile = path.join(METRICS_DIR, 'router-violations.jsonl');

  const [spawn, token, churn, violations] = await Promise.all([
    readMetricsWithStats(spawnLogFile, { hours, since }),
    readMetricsWithStats(tokenBurnFile, { hours, since }),
    readMetricsWithStats(routerChurnFile, { hours, since }),
    readMetricsWithStats(violationsFile, { hours, since }),
  ]);

  return {
    period: {
      hours,
      since: since || new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    },
    rollups: calculateRouterRollups({
      spawnRows: spawn.metrics,
      tokenRows: token.metrics,
      churnRows: churn.metrics,
      violationRows: violations.metrics,
      hours,
    }),
    parseHealth: {
      spawnLog: {
        parseErrors: spawn.parseErrors,
        totalLines: spawn.totalLines,
        failedParseRate: spawn.failedParseRate,
      },
      tokenBurn: {
        parseErrors: token.parseErrors,
        totalLines: token.totalLines,
        failedParseRate: token.failedParseRate,
      },
      routerChurn: {
        parseErrors: churn.parseErrors,
        totalLines: churn.totalLines,
        failedParseRate: churn.failedParseRate,
      },
      violations: {
        parseErrors: violations.parseErrors,
        totalLines: violations.totalLines,
        failedParseRate: violations.failedParseRate,
      },
    },
  };
}

module.exports = {
  readMetrics,
  readMetricsWithStats,
  calculateHookStats,
  calculateErrorStats,
  getMetricsSummary,
  findSlowHooks,
  detectAlerts,
  calculateRouterRollups,
  getRouterOpsSummary,
};
