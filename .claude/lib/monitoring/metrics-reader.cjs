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

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');

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
        const metric = JSON.parse(line);
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

module.exports = {
  readMetrics,
  calculateHookStats,
  calculateErrorStats,
  getMetricsSummary,
  findSlowHooks,
  detectAlerts,
};
