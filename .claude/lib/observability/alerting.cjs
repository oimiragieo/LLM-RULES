/**
 * @file Alerting System
 * @description Threshold-based alerting with deduplication and history
 * Part of SPEC-016: Observability & Monitoring Dashboard
 */

class AlertingSystem {
  constructor() {
    this.alerts = [];
    this.alertHistory = [];
    this.lastTriggered = new Map(); // For deduplication
  }

  /**
   * Add alert definition
   * @param {string} name - Alert name
   * @param {object} config - Alert configuration
   * @param {Function} config.condition - Condition function (metrics) => boolean
   * @param {number} config.threshold - Threshold value
   * @param {Array} config.actions - Actions to execute when triggered
   * @param {string} config.severity - Severity level (critical, warning, info)
   * @param {number} config.deduplicationWindow - Time window for deduplication (ms)
   * @param {object} config.metadata - Additional metadata (runbook, team, etc.)
   */
  addAlert(name, config) {
    const alert = {
      name,
      condition: config.condition,
      threshold: config.threshold,
      actions: config.actions || [],
      severity: config.severity || 'warning',
      deduplicationWindow: config.deduplicationWindow || 0,
      metadata: config.metadata || {},
    };

    this.alerts.push(alert);
  }

  /**
   * Evaluate all alerts against current metrics
   * @param {object} metrics - Current metrics
   * @param {object} options - Options (executeActions, etc.)
   * @returns {Array} Triggered alerts
   */
  evaluateAlerts(metrics, options = {}) {
    const { executeActions = false } = options;
    const triggered = [];

    for (const alert of this.alerts) {
      try {
        // Check if condition is met
        const conditionMet = alert.condition(metrics);

        if (conditionMet) {
          // Check deduplication
          if (this._isDuplicate(alert.name, alert.deduplicationWindow)) {
            continue;
          }

          const triggeredAlert = {
            name: alert.name,
            triggered: true,
            timestamp: Date.now(),
            threshold: alert.threshold,
            severity: alert.severity,
            metadata: alert.metadata,
          };

          triggered.push(triggeredAlert);

          // Record in history
          this.recordAlert(triggeredAlert);

          // Execute actions if requested
          if (executeActions && alert.actions.length > 0) {
            this._executeActions(alert.actions, triggeredAlert);
          }
        }
      } catch (error) {
        console.error(`Error evaluating alert ${alert.name}:`, error);
      }
    }

    return triggered;
  }

  /**
   * Check if alert is duplicate within deduplication window
   * @private
   */
  _isDuplicate(alertName, windowMs) {
    if (windowMs === 0) return false;

    const lastTime = this.lastTriggered.get(alertName);
    const now = Date.now();

    if (lastTime && now - lastTime < windowMs) {
      return true;
    }

    this.lastTriggered.set(alertName, now);
    return false;
  }

  /**
   * Execute alert actions
   * @private
   */
  _executeActions(actions, alert) {
    for (const action of actions) {
      try {
        if (typeof action === 'function') {
          action(alert);
        } else if (typeof action === 'string') {
          // Handle string actions (log, notify, page, email)
          this._handleStringAction(action, alert);
        }
      } catch (error) {
        console.error(`Error executing alert action:`, error);
      }
    }
  }

  /**
   * Handle string action types
   * @private
   */
  _handleStringAction(action, alert) {
    switch (action) {
      case 'log':
        console.log(`[ALERT] ${alert.name} - Severity: ${alert.severity}`);
        break;
      case 'notify':
        // Placeholder for notification system
        console.log(`[NOTIFY] ${alert.name}`);
        break;
      case 'page':
        // Placeholder for paging system
        console.log(`[PAGE] ${alert.name}`);
        break;
      case 'email':
        // Placeholder for email system
        console.log(`[EMAIL] ${alert.name}`);
        break;
      default:
        console.log(`[UNKNOWN ACTION] ${action}`);
    }
  }

  /**
   * Record alert to history
   * @param {object} alert - Alert object to record
   */
  recordAlert(alert) {
    this.alertHistory.push({
      ...alert,
      recordedAt: Date.now(),
    });
  }

  /**
   * Get alert history
   * @param {object} filters - Filters (since, severity, name)
   * @returns {Array} Alert history
   */
  getAlertHistory(filters = {}) {
    let history = [...this.alertHistory];

    // Filter by time range
    if (filters.since) {
      history = history.filter(alert => alert.timestamp >= filters.since);
    }

    // Filter by severity
    if (filters.severity) {
      history = history.filter(alert => alert.severity === filters.severity);
    }

    // Filter by name
    if (filters.name) {
      history = history.filter(alert => alert.name === filters.name);
    }

    // Sort by most recent first
    history.sort((a, b) => b.timestamp - a.timestamp);

    return history;
  }

  /**
   * Get all alert definitions
   * @returns {Array} Alert definitions
   */
  getAlerts() {
    return this.alerts.map(alert => ({
      name: alert.name,
      threshold: alert.threshold,
      severity: alert.severity,
      metadata: alert.metadata,
    }));
  }

  /**
   * Get alert interpretation guide
   * @returns {object} Guide with remediation steps
   */
  getAlertInterpretationGuide() {
    return {
      high_error_rate: {
        description: 'Task failure rate exceeds threshold',
        severity: 'warning',
        threshold: '5%',
        remediation: [
          'Check recent error logs for patterns',
          'Verify task inputs and dependencies',
          'Check system resource availability',
          'Review recent code changes',
        ],
        runbook: 'https://docs.example.com/alerts/high-error-rate',
      },
      memory_pressure: {
        description: 'Memory usage exceeds safe threshold',
        severity: 'critical',
        threshold: '280MB',
        remediation: [
          'Identify memory-intensive operations',
          'Check for memory leaks',
          'Consider reducing concurrent task limit',
          'Review recent task workloads',
        ],
        runbook: 'https://docs.example.com/alerts/memory-pressure',
      },
      context_exhaustion: {
        description: 'Context window usage approaching limit',
        severity: 'warning',
        threshold: '90%',
        remediation: [
          'Invoke context-compressor skill',
          'Summarize completed work',
          'Archive completed tasks',
          'Consider breaking into subtasks',
        ],
        runbook: 'https://docs.example.com/alerts/context-exhaustion',
      },
      performance_degradation: {
        description: 'Task duration significantly higher than baseline',
        severity: 'warning',
        threshold: '2x baseline',
        remediation: [
          'Check system resource contention',
          'Review recent performance changes',
          'Identify slow operations via profiling',
          'Consider optimization opportunities',
        ],
        runbook: 'https://docs.example.com/alerts/performance-degradation',
      },
      long_task_hang: {
        description: 'Task running for over 1 hour without completion',
        severity: 'critical',
        threshold: '1 hour',
        remediation: [
          'Check task logs for progress indicators',
          'Verify task is not deadlocked',
          'Consider manual intervention',
          'Check for infinite loops or blocking operations',
        ],
        runbook: 'https://docs.example.com/alerts/long-task-hang',
      },
    };
  }

  /**
   * Clear all alerts (for testing)
   */
  reset() {
    this.alerts = [];
    this.alertHistory = [];
    this.lastTriggered.clear();
  }
}

module.exports = { AlertingSystem };
