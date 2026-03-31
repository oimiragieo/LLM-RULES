'use strict';

const crypto = require('crypto');
const { ALERT_THRESHOLDS } = require('./production-alerts.cjs');

// ============================================================================
// Deterministic alert ID
// ============================================================================

/**
 * Generate a deterministic alert ID from the alert name and severity.
 * The same (name, severity) pair always produces the same hex string.
 *
 * @param {string} name
 * @param {string} severity
 * @returns {string} 16-character hex string
 */
function makeAlertId(name, severity) {
  return crypto.createHash('sha256').update(`${name}:${severity}`).digest('hex').slice(0, 16);
}

// ============================================================================
// Default alert definitions
// ============================================================================

/**
 * Each alert definition describes a named alert and provides an `evaluate`
 * function that extracts the relevant metric from recent log events and
 * compares it against the passed-in thresholds.
 *
 * evaluate(events, thresholds) returns:
 *   null               — alert not triggered
 *   { value, threshold } — alert triggered; value is the measured metric,
 *                          threshold is the configured limit that was breached
 *
 * Alert definitions for the same metric are EXCLUSIVE at their severity
 * boundaries (warning fires only below critical, critical fires above
 * critical) to avoid double-firing on the same event.
 */
const DEFAULT_ALERT_DEFINITIONS = [
  // ------------------------------------------------------------------
  // Memory / heap usage
  // ------------------------------------------------------------------
  {
    name: 'heap-usage-warning',
    severity: 'warning',
    description: 'Heap memory usage exceeds warning threshold (70% of heap limit)',
    evaluate(events, thresholds) {
      const { heapLimit, warning, critical } = thresholds.memory;
      const memEvents = events.filter(e => e.data && typeof e.data.heapUsed === 'number');
      if (!memEvents.length) return null;
      const latest = memEvents[memEvents.length - 1];
      const pct = latest.data.heapUsed / heapLimit;
      // Only fire warning when strictly below the critical boundary
      if (pct >= warning && pct < critical) {
        return { value: latest.data.heapUsed, threshold: heapLimit * warning };
      }
      return null;
    },
  },

  {
    name: 'heap-usage-critical',
    severity: 'critical',
    description: 'Heap memory usage exceeds critical threshold (85% of heap limit)',
    evaluate(events, thresholds) {
      const { heapLimit, critical } = thresholds.memory;
      const memEvents = events.filter(e => e.data && typeof e.data.heapUsed === 'number');
      if (!memEvents.length) return null;
      const latest = memEvents[memEvents.length - 1];
      const pct = latest.data.heapUsed / heapLimit;
      if (pct >= critical) {
        return { value: latest.data.heapUsed, threshold: heapLimit * critical };
      }
      return null;
    },
  },

  // ------------------------------------------------------------------
  // Error rate
  // ------------------------------------------------------------------
  {
    name: 'error-rate-warning',
    severity: 'warning',
    description: 'Error rate exceeds warning threshold (0.1% of recent operations)',
    evaluate(events, thresholds) {
      const total = events.length;
      if (total === 0) return null;
      const { warningRate, criticalRate } = thresholds.errors;
      const errors = events.filter(e => e.type === 'error' || e.type === 'violation').length;
      const rate = errors / total;
      // Fire warning only when strictly below critical
      if (rate >= warningRate && rate < criticalRate) {
        return { value: rate, threshold: warningRate };
      }
      return null;
    },
  },

  {
    name: 'error-rate-critical',
    severity: 'critical',
    description: 'Error rate exceeds critical threshold (1% of recent operations)',
    evaluate(events, thresholds) {
      const total = events.length;
      if (total === 0) return null;
      const { criticalRate } = thresholds.errors;
      const errors = events.filter(e => e.type === 'error' || e.type === 'violation').length;
      const rate = errors / total;
      if (rate >= criticalRate) {
        return { value: rate, threshold: criticalRate };
      }
      return null;
    },
  },

  // ------------------------------------------------------------------
  // Concurrent workflows
  // ------------------------------------------------------------------
  {
    name: 'concurrent-workflows-warning',
    severity: 'warning',
    description: 'Concurrent workflow count exceeds warning threshold (150)',
    evaluate(events, thresholds) {
      const { warning, critical } = thresholds.concurrency;
      const cwEvents = events.filter(e => e.data && typeof e.data.concurrentWorkflows === 'number');
      if (!cwEvents.length) return null;
      const latest = cwEvents[cwEvents.length - 1];
      const count = latest.data.concurrentWorkflows;
      // Fire warning only when strictly below critical boundary
      if (count >= warning && count < critical) {
        return { value: count, threshold: warning };
      }
      return null;
    },
  },

  {
    name: 'concurrent-workflows-critical',
    severity: 'critical',
    description: 'Concurrent workflow count exceeds critical threshold (200)',
    evaluate(events, thresholds) {
      const { critical } = thresholds.concurrency;
      const cwEvents = events.filter(e => e.data && typeof e.data.concurrentWorkflows === 'number');
      if (!cwEvents.length) return null;
      const latest = cwEvents[cwEvents.length - 1];
      const count = latest.data.concurrentWorkflows;
      if (count >= critical) {
        return { value: count, threshold: critical };
      }
      return null;
    },
  },
];

// ============================================================================
// AlertManager class
// ============================================================================

/**
 * AlertManager evaluates production alert thresholds against recent log events
 * and maintains an in-memory record of triggered alerts.
 *
 * Alert state is NOT persisted — it resets when a new instance is created.
 *
 * @example
 * const { AlertManager } = require('.claude/lib/monitoring/alert-manager.cjs');
 * const { LogAggregator } = require('.claude/lib/monitoring/log-aggregator.cjs');
 *
 * const logAggregator = new LogAggregator();
 * const manager = new AlertManager({ logAggregator });
 * const { alerts, checkedAt } = manager.evaluate();
 */
class AlertManager {
  /**
   * @param {Object} options
   * @param {Object} [options.alertConfig]          - Optional configuration override.
   * @param {Object} [options.alertConfig.thresholds] - Threshold object (defaults to ALERT_THRESHOLDS).
   * @param {Array}  [options.alertConfig.alertDefinitions] - Custom alert definition list.
   * @param {Object}  options.logAggregator         - LogAggregator instance used to read events.
   */
  constructor({ alertConfig, logAggregator } = {}) {
    this._thresholds = (alertConfig && alertConfig.thresholds) || ALERT_THRESHOLDS;
    this._alertDefinitions =
      (alertConfig && alertConfig.alertDefinitions) || DEFAULT_ALERT_DEFINITIONS;
    this._logAggregator = logAggregator;

    /**
     * In-memory alert state.
     * Key: alertId (deterministic hash of name+severity)
     * Value: AlertRecord { id, severity, name, description, triggeredAt, value, threshold, status }
     *
     * @type {Map<string, Object>}
     */
    this._alertState = new Map();
  }

  /**
   * Evaluate all alert definitions against recent events from the LogAggregator.
   *
   * Each triggered alert is added to (or updated in) the in-memory alert state.
   * Already-acknowledged alerts are re-activated if the condition still holds.
   *
   * @returns {{ alerts: Array<Object>, checkedAt: string }}
   *   alerts   — list of alerts triggered in this evaluation
   *   checkedAt — ISO timestamp of when the check ran
   */
  evaluate() {
    const checkedAt = new Date().toISOString();
    const recentEvents = this._logAggregator.getRecentEvents(1000);

    const triggeredAlerts = [];

    for (const def of this._alertDefinitions) {
      const alertId = makeAlertId(def.name, def.severity);
      const result = def.evaluate(recentEvents, this._thresholds);

      if (result !== null) {
        const alert = {
          id: alertId,
          severity: def.severity,
          name: def.name,
          description: def.description,
          triggeredAt: checkedAt,
          value: result.value,
          threshold: result.threshold,
        };

        // Update state: always set to active (re-activates acknowledged alerts)
        this._alertState.set(alertId, { ...alert, status: 'active' });
        triggeredAlerts.push(alert);
      }
    }

    return { alerts: triggeredAlerts, checkedAt };
  }

  /**
   * Return all alerts that are currently active (not acknowledged).
   *
   * @returns {Array<Object>} Active alert records (each has a `status: 'active'` field).
   */
  getActiveAlerts() {
    return Array.from(this._alertState.values()).filter(a => a.status === 'active');
  }

  /**
   * Acknowledge an alert by ID, marking it as resolved in memory.
   * Acknowledged alerts are excluded from `getActiveAlerts()` until the next
   * `evaluate()` re-triggers them.
   *
   * @param {string} alertId - The deterministic alert ID returned by `evaluate()`.
   * @returns {boolean} `true` if the alert was found and acknowledged, `false` otherwise.
   */
  acknowledge(alertId) {
    const record = this._alertState.get(alertId);
    if (!record) return false;
    record.status = 'acknowledged';
    return true;
  }

  /**
   * Return the full alert history (all alerts ever triggered on this instance),
   * optionally filtered by a time range based on `triggeredAt`.
   *
   * @param {{ start?: string, end?: string }} [timeRange]
   *   start — ISO timestamp lower bound (inclusive)
   *   end   — ISO timestamp upper bound (inclusive)
   * @returns {Array<Object>} Alert records with `status` field (active | acknowledged).
   */
  getAlertHistory(timeRange) {
    let history = Array.from(this._alertState.values());

    if (timeRange) {
      const startMs = timeRange.start != null ? new Date(timeRange.start).getTime() : -Infinity;
      const endMs = timeRange.end != null ? new Date(timeRange.end).getTime() : Infinity;

      history = history.filter(a => {
        const ts = new Date(a.triggeredAt).getTime();
        return ts >= startMs && ts <= endMs;
      });
    }

    return history;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  AlertManager,
  makeAlertId,
  DEFAULT_ALERT_DEFINITIONS,
};
