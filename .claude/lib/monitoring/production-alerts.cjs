/**
 * Production Monitoring & Alerting Configuration
 *
 * Defines alert thresholds and monitoring rules for Phase 4-5 production deployment.
 *
 * Usage:
 *   const alerts = require('./.claude/lib/monitoring/production-alerts.cjs');
 *   const heapAlert = alerts.checkHeapUsage(process.memoryUsage().heapUsed);
 *   if (heapAlert.triggered) {
 *     console.error(heapAlert.message);
 *   }
 */

// ============================================================================
// ALERT THRESHOLDS (from PERFORMANCE_BUDGETS.md + Production Readiness)
// ============================================================================

const ALERT_THRESHOLDS = {
  // Memory Alerts
  memory: {
    warning: 0.7, // 70% of heap limit
    critical: 0.85, // 85% of heap limit
    heapLimit:
      parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || '4096', 10) *
      1024 *
      1024, // bytes
  },

  // ML Feature Health
  ml: {
    patternDetectionLatency: {
      warning: 10, // 10ms
      critical: 100, // 100ms (target threshold)
    },
    costPredictionLatency: {
      warning: 5, // 5ms
      critical: 50, // 50ms (target threshold)
    },
    adaptiveExecutorLatency: {
      warning: 20, // 20ms
      critical: 200, // 200ms (target threshold)
    },
    memoryOverhead: {
      warning: 100 * 1024 * 1024, // 100 MB
      critical: 500 * 1024 * 1024, // 500 MB (target threshold)
    },
  },

  // Error Rate Monitoring
  errors: {
    warningRate: 0.001, // 0.1% error rate
    criticalRate: 0.01, // 1% error rate
    spikeThreshold: 5, // 5 errors in 1 minute
  },

  // Performance Latency
  latency: {
    taskRouting: {
      warning: 5, // 5ms
      critical: 10, // 10ms
    },
    stateSync: {
      warning: 100, // 100ms
      critical: 200, // 200ms
    },
    resultNormalization: {
      warning: 10, // 10ms
      critical: 20, // 20ms
    },
    workflowCheckpoint: {
      warning: 200, // 200ms
      critical: 400, // 400ms
    },
    agentSpawn: {
      warning: 500, // 500ms
      critical: 1000, // 1000ms (1 second)
    },
  },

  // Throughput
  throughput: {
    taskCreation: {
      min: 10, // 10/sec minimum
      max: 100, // 100/sec maximum (before throttling)
    },
    agentSpawning: {
      min: 1, // 1/sec minimum
      max: 10, // 10/sec maximum (budget limit)
    },
  },

  // Concurrent Workflows
  concurrency: {
    warning: 150, // 150 concurrent workflows
    critical: 200, // 200 concurrent workflows (approaching system limits)
    max: 500, // 500 max (load shedding trigger)
  },
};

// ============================================================================
// ALERT CHECKING FUNCTIONS
// ============================================================================

/**
 * Check heap usage against thresholds
 * @param {number} heapUsed - Current heap used in bytes
 * @returns {Object} Alert status
 */
function checkHeapUsage(heapUsed) {
  const { heapLimit, warning, critical } = ALERT_THRESHOLDS.memory;
  const percentage = heapUsed / heapLimit;

  if (percentage >= critical) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `Heap usage CRITICAL: ${(percentage * 100).toFixed(1)}% (${(heapUsed / 1024 / 1024).toFixed(0)} MB / ${(heapLimit / 1024 / 1024).toFixed(0)} MB)`,
      action: 'Restart service, investigate memory leak',
    };
  }

  if (percentage >= warning) {
    return {
      triggered: true,
      level: 'WARNING',
      message: `Heap usage WARNING: ${(percentage * 100).toFixed(1)}% (${(heapUsed / 1024 / 1024).toFixed(0)} MB / ${(heapLimit / 1024 / 1024).toFixed(0)} MB)`,
      action: 'Monitor closely, prepare for scaling',
    };
  }

  return { triggered: false, level: 'OK', percentage };
}

/**
 * Check ML feature latency
 * @param {string} feature - Feature name (patternDetection, costPrediction, adaptiveExecutor)
 * @param {number} latency - Latency in milliseconds
 * @returns {Object} Alert status
 */
function checkMLLatency(feature, latency) {
  const thresholds = ALERT_THRESHOLDS.ml[`${feature}Latency`];
  if (!thresholds) {
    throw new Error(`Unknown ML feature: ${feature}`);
  }

  if (latency >= thresholds.critical) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `${feature} latency CRITICAL: ${latency}ms (threshold: ${thresholds.critical}ms)`,
      action: 'Disable feature, investigate bottleneck',
    };
  }

  if (latency >= thresholds.warning) {
    return {
      triggered: true,
      level: 'WARNING',
      message: `${feature} latency WARNING: ${latency}ms (threshold: ${thresholds.warning}ms)`,
      action: 'Monitor for sustained high latency',
    };
  }

  return { triggered: false, level: 'OK', latency };
}

/**
 * Check error rate
 * @param {number} errors - Error count in window
 * @param {number} total - Total operations in window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Object} Alert status
 */
function checkErrorRate(errors, total, windowSeconds = 60) {
  const rate = total > 0 ? errors / total : 0;
  const { warningRate, criticalRate, spikeThreshold } = ALERT_THRESHOLDS.errors;

  // Check for error spike (absolute count)
  if (errors >= spikeThreshold && windowSeconds <= 60) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `Error SPIKE: ${errors} errors in ${windowSeconds}s (spike threshold: ${spikeThreshold})`,
      action: 'Investigate root cause immediately',
    };
  }

  // Check for sustained high error rate
  if (rate >= criticalRate) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `Error rate CRITICAL: ${(rate * 100).toFixed(2)}% (${errors}/${total} in ${windowSeconds}s)`,
      action: 'Rollback deployment, investigate',
    };
  }

  if (rate >= warningRate) {
    return {
      triggered: true,
      level: 'WARNING',
      message: `Error rate WARNING: ${(rate * 100).toFixed(2)}% (${errors}/${total} in ${windowSeconds}s)`,
      action: 'Monitor error logs, prepare rollback',
    };
  }

  return { triggered: false, level: 'OK', rate };
}

/**
 * Check concurrent workflow count
 * @param {number} count - Current concurrent workflow count
 * @returns {Object} Alert status
 */
function checkConcurrentWorkflows(count) {
  const { warning, critical, max } = ALERT_THRESHOLDS.concurrency;

  if (count >= max) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `Concurrent workflows MAX: ${count} (max: ${max}) - Load shedding activated`,
      action: 'Reject new workflows (429), scale horizontally',
    };
  }

  if (count >= critical) {
    return {
      triggered: true,
      level: 'CRITICAL',
      message: `Concurrent workflows CRITICAL: ${count} (threshold: ${critical})`,
      action: 'Scale immediately, prepare load shedding',
    };
  }

  if (count >= warning) {
    return {
      triggered: true,
      level: 'WARNING',
      message: `Concurrent workflows WARNING: ${count} (threshold: ${warning})`,
      action: 'Monitor capacity, prepare scaling',
    };
  }

  return { triggered: false, level: 'OK', count };
}

/**
 * Check system health (composite check)
 * @param {Object} metrics - Current system metrics
 * @returns {Object} Health status
 */
function checkSystemHealth(metrics) {
  const alerts = [];

  // Memory
  if (metrics.heapUsed) {
    const memAlert = checkHeapUsage(metrics.heapUsed);
    if (memAlert.triggered) alerts.push({ component: 'memory', ...memAlert });
  }

  // ML Features
  if (metrics.ml) {
    if (metrics.ml.patternDetectionLatency) {
      const mlAlert = checkMLLatency('patternDetection', metrics.ml.patternDetectionLatency);
      if (mlAlert.triggered) alerts.push({ component: 'ml-pattern-detection', ...mlAlert });
    }
    if (metrics.ml.costPredictionLatency) {
      const mlAlert = checkMLLatency('costPrediction', metrics.ml.costPredictionLatency);
      if (mlAlert.triggered) alerts.push({ component: 'ml-cost-prediction', ...mlAlert });
    }
    if (metrics.ml.adaptiveExecutorLatency) {
      const mlAlert = checkMLLatency('adaptiveExecutor', metrics.ml.adaptiveExecutorLatency);
      if (mlAlert.triggered) alerts.push({ component: 'ml-adaptive-executor', ...mlAlert });
    }
  }

  // Error Rate
  if (metrics.errors !== undefined && metrics.totalOperations) {
    const errorAlert = checkErrorRate(
      metrics.errors,
      metrics.totalOperations,
      metrics.windowSeconds || 60
    );
    if (errorAlert.triggered) alerts.push({ component: 'error-rate', ...errorAlert });
  }

  // Concurrency
  if (metrics.concurrentWorkflows) {
    const concurrencyAlert = checkConcurrentWorkflows(metrics.concurrentWorkflows);
    if (concurrencyAlert.triggered) alerts.push({ component: 'concurrency', ...concurrencyAlert });
  }

  return {
    healthy: alerts.length === 0,
    alerts,
    criticalCount: alerts.filter(a => a.level === 'CRITICAL').length,
    warningCount: alerts.filter(a => a.level === 'WARNING').length,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ALERT_THRESHOLDS,
  checkHeapUsage,
  checkMLLatency,
  checkErrorRate,
  checkConcurrentWorkflows,
  checkSystemHealth,
};
