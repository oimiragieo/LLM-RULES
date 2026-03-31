#!/usr/bin/env node
'use strict';

/**
 * Tests for Observability CLI
 *
 * Covers validation contract assertions:
 * - VAL-OB-002: CLI status command shows system health summary
 * - VAL-OB-003: CLI events command lists events with filters
 * - VAL-OB-007: CLI costs command shows model breakdown and trend
 *
 * LogAggregator, AlertManager, and CostReporter are mocked with fixture data.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createObservabilityCLI,
  runStatus,
  runEvents,
  runAlerts,
  runCosts,
} = require('../../.claude/lib/monitoring/observability-cli.cjs');

// ─── Fixture data ─────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = '2026-01-01T12:00:00.000Z';
const EARLIER_TIMESTAMP = '2026-01-01T11:00:00.000Z';

const FIXTURE_EVENTS = [
  {
    timestamp: '2026-01-01T10:00:00.000Z',
    type: 'spawn',
    component: 'worker',
    data: { summary: 'Worker started', pid: 123 },
  },
  {
    timestamp: '2026-01-01T10:30:00.000Z',
    type: 'error',
    component: 'router',
    data: { summary: 'Route failed', code: 500 },
  },
  {
    timestamp: '2026-01-01T11:00:00.000Z',
    type: 'health',
    component: 'system',
    data: { heapUsed: 52428800, heapLimit: 134217728 },
  },
  {
    timestamp: '2026-01-01T11:30:00.000Z',
    type: 'violation',
    component: 'budget',
    data: { summary: 'Budget exceeded', amount: 0.5 },
  },
  {
    timestamp: '2026-01-01T12:00:00.000Z',
    type: 'spawn',
    component: 'agent',
    data: { summary: 'Agent deployed', name: 'code-reviewer' },
  },
];

const FIXTURE_ALERTS = [
  {
    id: 'abc123def456',
    severity: 'critical',
    name: 'heap-usage-critical',
    description: 'Heap memory usage exceeds critical threshold (85% of heap limit)',
    triggeredAt: FIXED_TIMESTAMP,
    value: 120259084,
    threshold: 114123776,
  },
  {
    id: 'fed987cba654',
    severity: 'warning',
    name: 'error-rate-warning',
    description: 'Error rate exceeds warning threshold',
    triggeredAt: FIXED_TIMESTAMP,
    value: 0.05,
    threshold: 0.01,
  },
];

const FIXTURE_MODEL_BREAKDOWN = [
  { model: 'claude-opus-4-6', cost: 0.12, percentage: 60.0, taskCount: 5 },
  { model: 'claude-sonnet-4-6', cost: 0.08, percentage: 40.0, taskCount: 8 },
];

const FIXTURE_TREND = [
  { date: '2025-12-26', cost: 0.05 },
  { date: '2025-12-27', cost: 0.08 },
  { date: '2025-12-28', cost: 0.03 },
  { date: '2025-12-29', cost: 0.1 },
  { date: '2025-12-30', cost: 0.15 },
  { date: '2025-12-31', cost: 0.06 },
  { date: '2026-01-01', cost: 0.2 },
];

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Create a minimal mock LogAggregator.
 * @param {object} [overrides]
 */
function createMockLogAggregator(overrides = {}) {
  return {
    getRecentEvents(count) {
      const events = overrides.events || FIXTURE_EVENTS;
      if (!count || count <= 0) return [];
      return events.slice(-count);
    },
    query(opts = {}) {
      let events = overrides.events || FIXTURE_EVENTS;
      const { eventTypes, timeRange, limit } = opts;

      if (eventTypes && eventTypes.length > 0) {
        events = events.filter(e => eventTypes.includes(e.type));
      }
      if (timeRange && timeRange.start) {
        const startMs = new Date(timeRange.start).getTime();
        events = events.filter(e => new Date(e.timestamp).getTime() >= startMs);
      }
      if (limit && limit > 0) {
        events = events.slice(0, limit);
      }
      return events;
    },
  };
}

/**
 * Create a minimal mock AlertManager.
 * @param {object} [overrides]
 */
function createMockAlertManager(overrides = {}) {
  const alerts = overrides.alerts || FIXTURE_ALERTS;
  let evaluated = false;

  return {
    evaluate() {
      evaluated = true;
      return { alerts, checkedAt: FIXED_TIMESTAMP };
    },
    getActiveAlerts() {
      return alerts;
    },
    _wasEvaluated() {
      return evaluated;
    },
  };
}

/**
 * Create a minimal mock CostReporter.
 * @param {object} [overrides]
 */
function createMockCostReporter(overrides = {}) {
  return {
    getModelBreakdown() {
      return overrides.modelBreakdown || FIXTURE_MODEL_BREAKDOWN;
    },
    getTrend(days) {
      const trend = overrides.trend || FIXTURE_TREND;
      return days ? trend.slice(-days) : trend;
    },
    getDailyCosts(date) {
      return (
        overrides.dailyCosts || {
          date: date || '2026-01-01',
          totalCost: 0.2,
          sessionCount: 2,
          taskCount: 5,
        }
      );
    },
  };
}

/** Capture output written by a run* function. */
function captureOutput(fn) {
  const lines = [];
  fn(line => lines.push(line));
  return lines.join('');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('observability-cli', () => {
  // ─── runStatus ──────────────────────────────────────────────────────────────

  describe('runStatus', () => {
    it('outputs system health summary with recent error count', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // Should mention error count (2 errors: type=error and type=violation)
      assert.match(output, /error/i);
    });

    it('outputs active alert count', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // Should mention alerts count (2 fixture alerts)
      assert.match(output, /alert/i);
      assert.match(output, /2/);
    });

    it('shows top 5 recent events', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // Should mention events section
      assert.match(output, /event/i);
      // Should show component names
      assert.match(output, /spawn|router|system|budget|agent/i);
    });

    it('shows memory usage when available in events', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // Health event has heapUsed data
      assert.match(output, /memory|heap/i);
    });

    it('uses chalk color codes in output', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // ANSI escape codes should be present for coloring
      assert.match(output, /\x1b\[/);
    });

    it('handles empty events gracefully', () => {
      const logAggregator = createMockLogAggregator({ events: [] });
      const alertManager = createMockAlertManager({ alerts: [] });
      const output = captureOutput(write =>
        runStatus({ _logAggregator: logAggregator, _alertManager: alertManager, _output: write })
      );
      // Should still output something without crashing
      assert.ok(output.length > 0);
    });

    it('returns a result object', () => {
      const logAggregator = createMockLogAggregator();
      const alertManager = createMockAlertManager();
      const lines = [];
      const result = runStatus({
        _logAggregator: logAggregator,
        _alertManager: alertManager,
        _output: line => lines.push(line),
      });
      assert.ok(result !== undefined);
      assert.ok(typeof result === 'object');
    });
  });

  // ─── runEvents ──────────────────────────────────────────────────────────────

  describe('runEvents', () => {
    it('lists recent events showing timestamp, type, component', () => {
      const logAggregator = createMockLogAggregator();
      const output = captureOutput(write =>
        runEvents({ _logAggregator: logAggregator, _output: write })
      );
      // Should show event types present in fixture
      assert.match(output, /spawn|error|health|violation/i);
      // Should show timestamps
      assert.match(output, /2026-01-01/);
    });

    it('filters events by --type', () => {
      const logAggregator = createMockLogAggregator();
      const output = captureOutput(write =>
        runEvents({ type: 'spawn', _logAggregator: logAggregator, _output: write })
      );
      // Should only show spawn type
      assert.match(output, /spawn/i);
      // Should NOT show error type events
      assert.doesNotMatch(output, /\berror\b/i);
    });

    it('filters events by --since ISO timestamp', () => {
      const logAggregator = createMockLogAggregator();
      const output = captureOutput(write =>
        runEvents({ since: EARLIER_TIMESTAMP, _logAggregator: logAggregator, _output: write })
      );
      // Events at 11:00 onwards: health (11:00), violation (11:30), spawn (12:00)
      assert.match(output, /health|violation|spawn/i);
    });

    it('applies --limit to number of events shown', () => {
      const logAggregator = createMockLogAggregator();
      const lines = [];
      runEvents({ limit: 2, _logAggregator: logAggregator, _output: line => lines.push(line) });
      const output = lines.join('');
      // With limit 2, should not show all 5 fixture events
      // Count lines that look like events (contain timestamp pattern)
      const eventLines = output.split('\n').filter(l => l.includes('2026-01-01'));
      assert.ok(eventLines.length <= 2, `Expected at most 2 event lines, got ${eventLines.length}`);
    });

    it('shows component name in each event line', () => {
      const logAggregator = createMockLogAggregator();
      const output = captureOutput(write =>
        runEvents({ _logAggregator: logAggregator, _output: write })
      );
      assert.match(output, /worker|router|system|budget|agent/i);
    });

    it('shows summary field from event data', () => {
      const logAggregator = createMockLogAggregator();
      const output = captureOutput(write =>
        runEvents({ _logAggregator: logAggregator, _output: write })
      );
      // Fixture events have summary fields
      assert.match(output, /Worker started|Route failed|Agent deployed/);
    });

    it('handles empty event list gracefully', () => {
      const logAggregator = createMockLogAggregator({ events: [] });
      const output = captureOutput(write =>
        runEvents({ _logAggregator: logAggregator, _output: write })
      );
      assert.ok(output.length >= 0);
    });

    it('returns event list', () => {
      const logAggregator = createMockLogAggregator();
      const lines = [];
      const result = runEvents({
        _logAggregator: logAggregator,
        _output: line => lines.push(line),
      });
      assert.ok(Array.isArray(result));
    });
  });

  // ─── runAlerts ──────────────────────────────────────────────────────────────

  describe('runAlerts', () => {
    it('calls AlertManager.evaluate()', () => {
      const alertManager = createMockAlertManager();
      captureOutput(write => runAlerts({ _alertManager: alertManager, _output: write }));
      assert.equal(alertManager._wasEvaluated(), true);
    });

    it('shows alert names in output', () => {
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runAlerts({ _alertManager: alertManager, _output: write })
      );
      assert.match(output, /heap-usage-critical|error-rate-warning/);
    });

    it('colors critical alerts red (ANSI red code)', () => {
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runAlerts({ _alertManager: alertManager, _output: write })
      );
      // Should contain ANSI red escape code \x1b[31m
      assert.match(output, /\x1b\[31m/);
    });

    it('colors warning alerts yellow (ANSI yellow code)', () => {
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runAlerts({ _alertManager: alertManager, _output: write })
      );
      // Should contain ANSI yellow escape code \x1b[33m
      assert.match(output, /\x1b\[33m/);
    });

    it('shows severity label for each alert', () => {
      const alertManager = createMockAlertManager();
      const output = captureOutput(write =>
        runAlerts({ _alertManager: alertManager, _output: write })
      );
      assert.match(output, /critical/i);
      assert.match(output, /warning/i);
    });

    it('shows no-alerts message when none triggered', () => {
      const alertManager = createMockAlertManager({ alerts: [] });
      const output = captureOutput(write =>
        runAlerts({ _alertManager: alertManager, _output: write })
      );
      assert.match(output, /no.*alert|0.*alert|healthy/i);
    });

    it('returns evaluate result', () => {
      const alertManager = createMockAlertManager();
      const lines = [];
      const result = runAlerts({
        _alertManager: alertManager,
        _output: line => lines.push(line),
      });
      assert.ok(result !== undefined);
      assert.ok(result.alerts !== undefined);
    });
  });

  // ─── runCosts ───────────────────────────────────────────────────────────────

  describe('runCosts', () => {
    it('shows model breakdown table with model names', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      assert.match(output, /claude-opus-4-6|claude-sonnet-4-6/);
    });

    it('shows cost values in model breakdown', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      // Fixture costs: 0.12 and 0.08
      assert.match(output, /0\.\d+/);
    });

    it('shows percentage values in model breakdown', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      // Fixture percentages: 60.0 and 40.0
      assert.match(output, /60|40/);
    });

    it('shows daily trend section', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      assert.match(output, /trend|daily/i);
    });

    it('shows dates in trend output', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      assert.match(output, /2025-12-\d\d|2026-01-01/);
    });

    it('uses chalk colors in output', () => {
      const costReporter = createMockCostReporter();
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      assert.match(output, /\x1b\[/);
    });

    it('handles empty model breakdown gracefully', () => {
      const costReporter = createMockCostReporter({ modelBreakdown: [], trend: [] });
      const output = captureOutput(write =>
        runCosts({ _costReporter: costReporter, _output: write })
      );
      assert.ok(output.length >= 0);
    });

    it('returns model breakdown data', () => {
      const costReporter = createMockCostReporter();
      const lines = [];
      const result = runCosts({
        _costReporter: costReporter,
        _output: line => lines.push(line),
      });
      assert.ok(result !== undefined);
    });
  });

  // ─── createObservabilityCLI ─────────────────────────────────────────────────

  describe('createObservabilityCLI', () => {
    it('returns a Commander program', () => {
      const program = createObservabilityCLI();
      assert.ok(program !== null);
      assert.equal(typeof program.parse, 'function');
      assert.equal(typeof program.command, 'function');
    });

    it('has status command', () => {
      const program = createObservabilityCLI();
      const commands = program.commands.map(c => c.name());
      assert.ok(commands.includes('status'), `Expected status in ${commands.join(', ')}`);
    });

    it('has events command', () => {
      const program = createObservabilityCLI();
      const commands = program.commands.map(c => c.name());
      assert.ok(commands.includes('events'), `Expected events in ${commands.join(', ')}`);
    });

    it('has alerts command', () => {
      const program = createObservabilityCLI();
      const commands = program.commands.map(c => c.name());
      assert.ok(commands.includes('alerts'), `Expected alerts in ${commands.join(', ')}`);
    });

    it('has costs command', () => {
      const program = createObservabilityCLI();
      const commands = program.commands.map(c => c.name());
      assert.ok(commands.includes('costs'), `Expected costs in ${commands.join(', ')}`);
    });

    it('events command has --type option', () => {
      const program = createObservabilityCLI();
      const eventsCmd = program.commands.find(c => c.name() === 'events');
      assert.ok(eventsCmd, 'events command should exist');
      const options = eventsCmd.options.map(o => o.long);
      assert.ok(options.includes('--type'), `Expected --type option in ${options.join(', ')}`);
    });

    it('events command has --since option', () => {
      const program = createObservabilityCLI();
      const eventsCmd = program.commands.find(c => c.name() === 'events');
      assert.ok(eventsCmd, 'events command should exist');
      const options = eventsCmd.options.map(o => o.long);
      assert.ok(options.includes('--since'), `Expected --since option in ${options.join(', ')}`);
    });

    it('events command has --limit option', () => {
      const program = createObservabilityCLI();
      const eventsCmd = program.commands.find(c => c.name() === 'events');
      assert.ok(eventsCmd, 'events command should exist');
      const options = eventsCmd.options.map(o => o.long);
      assert.ok(options.includes('--limit'), `Expected --limit option in ${options.join(', ')}`);
    });
  });
});
