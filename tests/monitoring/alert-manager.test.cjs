#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AlertManager } = require('../../.claude/lib/monitoring/alert-manager.cjs');
const { ALERT_THRESHOLDS } = require('../../.claude/lib/monitoring/production-alerts.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock LogAggregator that returns a fixed event list.
 * @param {Array} events
 */
function createMockAggregator(events = []) {
  return {
    getRecentEvents(count) {
      if (!count || count <= 0) return [];
      return events.slice(-count);
    },
    query(_opts) {
      return events;
    },
  };
}

/** Build a normalized event matching the LogAggregator output shape. */
function makeEvent(type, component, data, timestamp) {
  return {
    timestamp: timestamp || '2026-01-01T00:00:00.000Z',
    type,
    component: component || 'test',
    data: data || {},
  };
}

// ---------------------------------------------------------------------------
// Test-specific thresholds: use a small heapLimit so tests stay predictable
// without depending on the runtime NODE_OPTIONS value.
// ---------------------------------------------------------------------------
const TEST_HEAP_LIMIT = 100 * 1024 * 1024; // 100 MB

const TEST_ALERT_CONFIG = {
  thresholds: {
    memory: {
      warning: 0.7,
      critical: 0.85,
      heapLimit: TEST_HEAP_LIMIT,
    },
    errors: {
      // Use higher spike threshold so spike logic does not interfere with
      // rate-based tests.
      warningRate: 0.01, // 1 %
      criticalRate: 0.1, // 10 %
      spikeThreshold: 10000,
    },
    concurrency: {
      warning: 150,
      critical: 200,
      max: 500,
    },
    ml: ALERT_THRESHOLDS.ml,
    latency: ALERT_THRESHOLDS.latency,
    throughput: ALERT_THRESHOLDS.throughput,
  },
};

// Heap values relative to TEST_HEAP_LIMIT
const HEAP_HEALTHY = Math.round(TEST_HEAP_LIMIT * 0.5); // 50 % — below warning
const HEAP_WARNING = Math.round(TEST_HEAP_LIMIT * 0.75); // 75 % — above warning, below critical
const HEAP_CRITICAL = Math.round(TEST_HEAP_LIMIT * 0.9); // 90 % — above critical

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlertManager', () => {
  // -------------------------------------------------------------------------
  // constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('creates an instance with logAggregator', () => {
      const agg = createMockAggregator();
      const am = new AlertManager({ logAggregator: agg });
      assert.ok(am instanceof AlertManager);
    });

    it('uses ALERT_THRESHOLDS from production-alerts.cjs by default', () => {
      const agg = createMockAggregator();
      const am = new AlertManager({ logAggregator: agg });
      // Default thresholds should equal the exported ALERT_THRESHOLDS
      assert.deepEqual(am._thresholds, ALERT_THRESHOLDS);
    });

    it('accepts custom alertConfig thresholds', () => {
      const agg = createMockAggregator();
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      assert.strictEqual(am._thresholds.memory.heapLimit, TEST_HEAP_LIMIT);
    });

    it('starts with empty active alerts', () => {
      const agg = createMockAggregator();
      const am = new AlertManager({ logAggregator: agg });
      assert.deepEqual(am.getActiveAlerts(), []);
    });

    it('starts with empty alert history', () => {
      const agg = createMockAggregator();
      const am = new AlertManager({ logAggregator: agg });
      assert.deepEqual(am.getAlertHistory(), []);
    });
  });

  // -------------------------------------------------------------------------
  // evaluate()
  // -------------------------------------------------------------------------
  describe('evaluate()', () => {
    it('returns {alerts, checkedAt} with no events in aggregator', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const result = am.evaluate();
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'alerts'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'checkedAt'));
      assert.ok(Array.isArray(result.alerts));
      assert.ok(typeof result.checkedAt === 'string');
    });

    it('checkedAt is a valid ISO timestamp', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { checkedAt } = am.evaluate();
      assert.ok(!isNaN(new Date(checkedAt).getTime()));
    });

    it('returns no alerts when metrics are healthy (VAL-OB-004)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_HEALTHY })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      assert.strictEqual(alerts.length, 0);
    });

    it('returns no alerts when there are no events', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      assert.strictEqual(alerts.length, 0);
    });

    it('triggers heap-usage-warning when heap % exceeds warning threshold (VAL-OB-004)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const heapWarning = alerts.find(a => a.name === 'heap-usage-warning');
      assert.ok(heapWarning, 'heap-usage-warning alert should be triggered');
      assert.strictEqual(heapWarning.severity, 'warning');
    });

    it('triggers heap-usage-critical when heap % exceeds critical threshold', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_CRITICAL })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const heapCritical = alerts.find(a => a.name === 'heap-usage-critical');
      assert.ok(heapCritical, 'heap-usage-critical alert should be triggered');
      assert.strictEqual(heapCritical.severity, 'critical');
    });

    it('does not trigger heap-usage-warning when value is in the critical range', () => {
      // At 90 % (critical), only critical should fire, not warning
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_CRITICAL })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const heapWarning = alerts.find(a => a.name === 'heap-usage-warning');
      assert.ok(!heapWarning, 'heap-usage-warning should NOT fire when in critical range');
    });

    it('triggers error-rate-warning when error rate exceeds warning threshold', () => {
      // 2 errors out of 100 events = 2 % > warningRate (1 %), < criticalRate (10 %)
      const events = [];
      for (let i = 0; i < 98; i++) events.push(makeEvent('info', 'app', {}));
      for (let i = 0; i < 2; i++) events.push(makeEvent('error', 'app', {}));
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const errWarn = alerts.find(a => a.name === 'error-rate-warning');
      assert.ok(errWarn, 'error-rate-warning should be triggered');
      assert.strictEqual(errWarn.severity, 'warning');
    });

    it('triggers error-rate-critical when error rate exceeds critical threshold', () => {
      // 15 errors out of 100 events = 15 % > criticalRate (10 %)
      const events = [];
      for (let i = 0; i < 85; i++) events.push(makeEvent('info', 'app', {}));
      for (let i = 0; i < 15; i++) events.push(makeEvent('error', 'app', {}));
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const errCrit = alerts.find(a => a.name === 'error-rate-critical');
      assert.ok(errCrit, 'error-rate-critical should be triggered');
      assert.strictEqual(errCrit.severity, 'critical');
    });

    it('triggers concurrent-workflows-warning when workflow count is in warning range', () => {
      // 175 workflows: >= 150 (warning) but < 200 (critical)
      const events = [makeEvent('workflow', 'orchestrator', { concurrentWorkflows: 175 })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const cwWarn = alerts.find(a => a.name === 'concurrent-workflows-warning');
      assert.ok(cwWarn, 'concurrent-workflows-warning should be triggered');
      assert.strictEqual(cwWarn.severity, 'warning');
    });

    it('triggers concurrent-workflows-critical when workflow count exceeds critical threshold', () => {
      const events = [makeEvent('workflow', 'orchestrator', { concurrentWorkflows: 250 })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      const cwCrit = alerts.find(a => a.name === 'concurrent-workflows-critical');
      assert.ok(cwCrit, 'concurrent-workflows-critical should be triggered');
      assert.strictEqual(cwCrit.severity, 'critical');
    });

    it('returns alerts with all required fields (VAL-OB-004)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({
        alertConfig: TEST_ALERT_CONFIG,
        logAggregator: agg,
      });
      const { alerts } = am.evaluate();
      assert.ok(alerts.length > 0, 'expected at least one alert');
      const alert = alerts[0];
      assert.ok(
        typeof alert.id === 'string' && alert.id.length > 0,
        'id must be a non-empty string'
      );
      assert.ok(typeof alert.severity === 'string', 'severity must be a string');
      assert.ok(
        typeof alert.name === 'string' && alert.name.length > 0,
        'name must be a non-empty string'
      );
      assert.ok(
        typeof alert.description === 'string' && alert.description.length > 0,
        'description must be a non-empty string'
      );
      assert.ok(typeof alert.triggeredAt === 'string', 'triggeredAt must be a string');
      assert.ok(typeof alert.value === 'number', 'value must be a number');
      assert.ok(typeof alert.threshold === 'number', 'threshold must be a number');
    });

    it('alert IDs are deterministic — same name+severity always produces the same ID', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];

      const agg1 = createMockAggregator(events);
      const am1 = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg1 });
      const r1 = am1.evaluate();

      const agg2 = createMockAggregator(events);
      const am2 = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg2 });
      const r2 = am2.evaluate();

      const id1 = r1.alerts.find(a => a.name === 'heap-usage-warning')?.id;
      const id2 = r2.alerts.find(a => a.name === 'heap-usage-warning')?.id;
      assert.ok(id1, 'heap-usage-warning id should exist in first result');
      assert.strictEqual(id1, id2, 'IDs from different instances must be identical');
    });

    it('alert ID differs for different name or severity', () => {
      const events = [
        makeEvent('memory', 'process', { heapUsed: HEAP_WARNING }),
        makeEvent('workflow', 'orchestrator', { concurrentWorkflows: 175 }),
      ];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      const { alerts } = am.evaluate();
      const ids = alerts.map(a => a.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'each alert should have a unique ID');
    });
  });

  // -------------------------------------------------------------------------
  // getActiveAlerts()
  // -------------------------------------------------------------------------
  describe('getActiveAlerts()', () => {
    it('returns empty array before any evaluate()', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({ logAggregator: agg });
      assert.deepEqual(am.getActiveAlerts(), []);
    });

    it('returns triggered alerts with status "active" after evaluate() (VAL-OB-005)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const active = am.getActiveAlerts();
      assert.ok(active.length > 0, 'should have active alerts');
      active.forEach(a => assert.strictEqual(a.status, 'active'));
    });

    it('does not include acknowledged alerts', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const alertId = am.getActiveAlerts()[0].id;
      am.acknowledge(alertId);
      const active = am.getActiveAlerts();
      assert.ok(
        !active.find(a => a.id === alertId),
        'acknowledged alert should not appear in getActiveAlerts()'
      );
    });
  });

  // -------------------------------------------------------------------------
  // acknowledge()
  // -------------------------------------------------------------------------
  describe('acknowledge()', () => {
    it('marks an alert as acknowledged (VAL-OB-005)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const alertId = am.getActiveAlerts()[0].id;
      const result = am.acknowledge(alertId);
      assert.strictEqual(result, true);
      const history = am.getAlertHistory();
      const alert = history.find(a => a.id === alertId);
      assert.ok(alert, 'alert should exist in history');
      assert.strictEqual(alert.status, 'acknowledged');
    });

    it('returns false for an unknown alertId', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({ logAggregator: agg });
      const result = am.acknowledge('nonexistent-id-xyz');
      assert.strictEqual(result, false);
    });

    it('acknowledged alert is removed from getActiveAlerts()', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const alertId = am.getActiveAlerts()[0].id;
      am.acknowledge(alertId);
      assert.ok(
        !am.getActiveAlerts().find(a => a.id === alertId),
        'should not be in active alerts after acknowledgment'
      );
    });
  });

  // -------------------------------------------------------------------------
  // getAlertHistory()
  // -------------------------------------------------------------------------
  describe('getAlertHistory()', () => {
    it('returns empty array when no alerts have been triggered (VAL-OB-005)', () => {
      const agg = createMockAggregator([]);
      const am = new AlertManager({ logAggregator: agg });
      assert.deepEqual(am.getAlertHistory(), []);
    });

    it('returns all triggered alerts with a status field', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const history = am.getAlertHistory();
      assert.ok(history.length > 0, 'history should have entries');
      history.forEach(a => {
        assert.ok(
          a.status === 'active' || a.status === 'acknowledged',
          `status should be active or acknowledged, got: ${a.status}`
        );
      });
    });

    it('shows acknowledged status for acknowledged alerts (VAL-OB-005)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const alertId = am.getActiveAlerts()[0].id;
      am.acknowledge(alertId);
      const history = am.getAlertHistory();
      const alert = history.find(a => a.id === alertId);
      assert.ok(alert, 'alert should be in history');
      assert.strictEqual(alert.status, 'acknowledged');
    });

    it('filters history by timeRange.start (excludes earlier alerts)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();

      // Set start to far future — should exclude all current alerts
      const futureStart = '2099-01-01T00:00:00.000Z';
      const filtered = am.getAlertHistory({ start: futureStart });
      assert.deepEqual(filtered, []);
    });

    it('filters history by timeRange.end (excludes later alerts)', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();

      // Set end to far past — should exclude all current alerts
      const pastEnd = '2000-01-01T00:00:00.000Z';
      const filtered = am.getAlertHistory({ end: pastEnd });
      assert.deepEqual(filtered, []);
    });

    it('returns all alerts when timeRange includes current time', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();

      const pastStart = '2020-01-01T00:00:00.000Z';
      const history = am.getAlertHistory({ start: pastStart });
      assert.ok(history.length > 0, 'should have history entries within a broad time range');
    });

    it('returns all history when called without timeRange argument', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      am.evaluate();
      const history = am.getAlertHistory();
      assert.ok(history.length > 0);
    });
  });

  // -------------------------------------------------------------------------
  // State management across multiple evaluate() calls
  // -------------------------------------------------------------------------
  describe('state management across multiple evaluate() calls', () => {
    it('re-triggers an acknowledged alert on the next evaluate() call', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });

      // First evaluation — alert fires
      am.evaluate();
      const alertId = am.getActiveAlerts()[0].id;

      // Acknowledge it
      am.acknowledge(alertId);
      assert.strictEqual(am.getActiveAlerts().length, 0);

      // Second evaluation — same conditions, alert should re-trigger
      am.evaluate();
      const reTriggered = am.getActiveAlerts().find(a => a.id === alertId);
      assert.ok(
        reTriggered,
        'Alert should be re-triggered after acknowledgment on next evaluate()'
      );
      assert.strictEqual(reTriggered.status, 'active');
    });

    it('evaluate() result alerts are a subset of getAlertHistory()', () => {
      const events = [makeEvent('memory', 'process', { heapUsed: HEAP_WARNING })];
      const agg = createMockAggregator(events);
      const am = new AlertManager({ alertConfig: TEST_ALERT_CONFIG, logAggregator: agg });
      const { alerts } = am.evaluate();
      const history = am.getAlertHistory();

      // Every alert from evaluate() should also appear in history
      for (const alert of alerts) {
        const inHistory = history.find(h => h.id === alert.id);
        assert.ok(inHistory, `Alert ${alert.id} should be in getAlertHistory()`);
      }
    });
  });
});
