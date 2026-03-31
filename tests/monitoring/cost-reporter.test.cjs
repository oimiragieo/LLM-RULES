#!/usr/bin/env node
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { CostReporter } = require('../../.claude/lib/monitoring/cost-reporter.cjs');

// ---------------------------------------------------------------------------
// Pricing constants (mirrors token-accountant.cjs MODEL_PRICING)
// ---------------------------------------------------------------------------
const MODEL_PRICING = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

function calcCost(inputTokens, outputTokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

// ---------------------------------------------------------------------------
// Fixed test dates
// ---------------------------------------------------------------------------
const DATE_TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const DATE_YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const DATE_PAST = '2026-01-10';

// ---------------------------------------------------------------------------
// Mock TokenAccountant factory
// Creates a minimal mock with a toJSON() that returns known records.
//
// records shape: { taskId: [{inputTokens, outputTokens, model, agentType, timestamp}] }
// ---------------------------------------------------------------------------
function createMockAccountant(records) {
  return {
    toJSON() {
      const tasks = {};
      for (const [taskId, taskRecords] of Object.entries(records)) {
        let inputTokens = 0;
        let outputTokens = 0;
        let costUSD = 0;
        for (const r of taskRecords) {
          inputTokens += r.inputTokens;
          outputTokens += r.outputTokens;
          const pricing = MODEL_PRICING[r.model] || MODEL_PRICING.sonnet;
          costUSD +=
            (r.inputTokens / 1000) * pricing.input + (r.outputTokens / 1000) * pricing.output;
        }
        tasks[taskId] = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUSD: Math.round(costUSD * 1000000) / 1000000,
        };
      }
      return { tasks, records, session: {} };
    },
  };
}

// ---------------------------------------------------------------------------
// Standard test dataset
//
//  session1:task1  100 input / 10 output  sonnet  DATE_TODAY
//  session1:task2  200 input / 20 output  sonnet  DATE_TODAY
//  session2:task1   50 input /  5 output  haiku   DATE_YESTERDAY
//  standalone      400 input / 40 output  opus    DATE_PAST
// ---------------------------------------------------------------------------
const STANDARD_RECORDS = {
  'session1:task1': [
    {
      inputTokens: 100,
      outputTokens: 10,
      model: 'sonnet',
      agentType: 'worker',
      timestamp: `${DATE_TODAY}T10:00:00.000Z`,
    },
  ],
  'session1:task2': [
    {
      inputTokens: 200,
      outputTokens: 20,
      model: 'sonnet',
      agentType: 'worker',
      timestamp: `${DATE_TODAY}T11:00:00.000Z`,
    },
  ],
  'session2:task1': [
    {
      inputTokens: 50,
      outputTokens: 5,
      model: 'haiku',
      agentType: 'reviewer',
      timestamp: `${DATE_YESTERDAY}T09:00:00.000Z`,
    },
  ],
  standalone: [
    {
      inputTokens: 400,
      outputTokens: 40,
      model: 'opus',
      agentType: 'orchestrator',
      timestamp: `${DATE_PAST}T12:00:00.000Z`,
    },
  ],
};

// Pre-computed expected costs for STANDARD_RECORDS
const COST_S1_TASK1 = calcCost(100, 10, 'sonnet'); // $0.3 + $0.15 = $0.45
const COST_S1_TASK2 = calcCost(200, 20, 'sonnet'); // $0.6 + $0.3  = $0.9
const COST_S2_TASK1 = calcCost(50, 5, 'haiku'); //   $0.0125 + $0.00625 = ~$0.01875
const COST_STANDALONE = calcCost(400, 40, 'opus'); // $6 + $3 = $9

const COST_SESSION1_TOTAL = COST_S1_TASK1 + COST_S1_TASK2; // $1.35
const COST_TODAY_TOTAL = COST_S1_TASK1 + COST_S1_TASK2; // only session1 tasks are today

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CostReporter', () => {
  // -------------------------------------------------------------------------
  // constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('creates an instance with a tokenAccountant', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      assert.ok(reporter instanceof CostReporter);
    });

    it('stores tokenAccountant reference', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      assert.strictEqual(reporter._accountant, mock);
    });
  });

  // -------------------------------------------------------------------------
  // getSessionCosts(sessionId)
  // -------------------------------------------------------------------------
  describe('getSessionCosts(sessionId)', () => {
    it('returns correct totalCost for a session with multiple tasks (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      assert.ok(typeof result.totalCost === 'number');
      assert.ok(
        Math.abs(result.totalCost - COST_SESSION1_TOTAL) < 0.000001,
        `Expected ~${COST_SESSION1_TOTAL}, got ${result.totalCost}`
      );
    });

    it('returns correct inputCost breakdown (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      const expectedInputCost = calcCost(100, 0, 'sonnet') + calcCost(200, 0, 'sonnet');
      assert.ok(
        Math.abs(result.inputCost - expectedInputCost) < 0.000001,
        `inputCost: expected ~${expectedInputCost}, got ${result.inputCost}`
      );
    });

    it('returns correct outputCost breakdown (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      const expectedOutputCost = calcCost(0, 10, 'sonnet') + calcCost(0, 20, 'sonnet');
      assert.ok(
        Math.abs(result.outputCost - expectedOutputCost) < 0.000001,
        `outputCost: expected ~${expectedOutputCost}, got ${result.outputCost}`
      );
    });

    it('returns correct taskCount for session', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      assert.strictEqual(result.taskCount, 2);
    });

    it('returns sessionId in result', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      assert.strictEqual(result.sessionId, 'session1');
    });

    it('returns dominant model in result', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      assert.strictEqual(result.model, 'sonnet');
    });

    it('returns correct costs for single-task session', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session2');
      assert.ok(
        Math.abs(result.totalCost - COST_S2_TASK1) < 0.000001,
        `Expected ~${COST_S2_TASK1}, got ${result.totalCost}`
      );
      assert.strictEqual(result.taskCount, 1);
      assert.strictEqual(result.model, 'haiku');
    });

    it('returns zero-value object for unknown sessionId (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('nonexistent-session');
      assert.strictEqual(result.sessionId, 'nonexistent-session');
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.inputCost, 0);
      assert.strictEqual(result.outputCost, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('returns zero-value object when accountant has no records (VAL-OB-006)', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('any-session');
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('handles standalone taskId matching exact sessionId', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      // 'standalone' task has no ':' separator — exact match works
      const result = reporter.getSessionCosts('standalone');
      assert.ok(
        Math.abs(result.totalCost - COST_STANDALONE) < 0.000001,
        `Expected ~${COST_STANDALONE}, got ${result.totalCost}`
      );
      assert.strictEqual(result.taskCount, 1);
      assert.strictEqual(result.model, 'opus');
    });

    it('result has all required fields', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getSessionCosts('session1');
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'sessionId'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'totalCost'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'inputCost'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'outputCost'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'taskCount'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'model'));
    });
  });

  // -------------------------------------------------------------------------
  // getDailyCosts(date?)
  // -------------------------------------------------------------------------
  describe('getDailyCosts(date?)', () => {
    it('defaults to today when no date is provided', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts();
      assert.strictEqual(result.date, DATE_TODAY);
    });

    it('aggregates totalCost for a given date (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.ok(
        Math.abs(result.totalCost - COST_TODAY_TOTAL) < 0.000001,
        `Expected ~${COST_TODAY_TOTAL}, got ${result.totalCost}`
      );
    });

    it('returns correct taskCount for a date', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.strictEqual(result.taskCount, 2); // session1:task1, session1:task2
    });

    it('returns correct sessionCount for a date', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.strictEqual(result.sessionCount, 1); // only session1 has tasks today
    });

    it('aggregates yesterday costs correctly', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_YESTERDAY);
      assert.ok(
        Math.abs(result.totalCost - COST_S2_TASK1) < 0.000001,
        `Expected ~${COST_S2_TASK1}, got ${result.totalCost}`
      );
      assert.strictEqual(result.taskCount, 1);
      assert.strictEqual(result.sessionCount, 1);
    });

    it('returns date in result', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.strictEqual(result.date, DATE_TODAY);
    });

    it('returns zero-value object for date with no activity (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts('2000-01-01');
      assert.strictEqual(result.date, '2000-01-01');
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.sessionCount, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('returns zero-value object when accountant has no records (VAL-OB-006)', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.sessionCount, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('result has all required fields', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getDailyCosts(DATE_TODAY);
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'date'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'totalCost'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'sessionCount'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'taskCount'));
    });
  });

  // -------------------------------------------------------------------------
  // getModelBreakdown(timeRange?)
  // -------------------------------------------------------------------------
  describe('getModelBreakdown(timeRange?)', () => {
    it('returns array of model breakdown objects (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0);
    });

    it('each entry has model, cost, percentage, taskCount fields', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      for (const entry of result) {
        assert.ok(typeof entry.model === 'string', 'model must be a string');
        assert.ok(typeof entry.cost === 'number', 'cost must be a number');
        assert.ok(typeof entry.percentage === 'number', 'percentage must be a number');
        assert.ok(typeof entry.taskCount === 'number', 'taskCount must be a number');
      }
    });

    it('is sorted by cost descending (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      for (let i = 1; i < result.length; i++) {
        assert.ok(
          result[i - 1].cost >= result[i].cost,
          `Expected sorted desc: ${result[i - 1].cost} >= ${result[i].cost}`
        );
      }
    });

    it('includes all models used in records', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      const models = result.map(r => r.model);
      assert.ok(models.includes('sonnet'));
      assert.ok(models.includes('haiku'));
      assert.ok(models.includes('opus'));
    });

    it('percentages sum to approximately 100 (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      const total = result.reduce((sum, r) => sum + r.percentage, 0);
      // Allow small floating point error
      assert.ok(Math.abs(total - 100) < 1, `Percentages should sum to ~100, got ${total}`);
    });

    it('opus has highest cost in standard dataset', () => {
      // COST_STANDALONE (opus) = $9, COST_SESSION1_TOTAL (sonnet) = $1.35, COST_S2_TASK1 (haiku) ~$0.019
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      assert.strictEqual(result[0].model, 'opus');
    });

    it('filters by timeRange when provided', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      // Only include DATE_PAST records (standalone opus task)
      const result = reporter.getModelBreakdown({
        start: `${DATE_PAST}T00:00:00.000Z`,
        end: `${DATE_PAST}T23:59:59.999Z`,
      });
      // Only opus task falls in this range
      assert.ok(result.length >= 1);
      assert.strictEqual(result[0].model, 'opus');
    });

    it('timeRange excludes all records returns empty array', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown({
        start: '2000-01-01T00:00:00.000Z',
        end: '2000-01-02T00:00:00.000Z',
      });
      assert.deepEqual(result, []);
    });

    it('returns empty array when accountant has no records (VAL-OB-006)', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getModelBreakdown();
      assert.deepEqual(result, []);
    });
  });

  // -------------------------------------------------------------------------
  // getTrend(days?)
  // -------------------------------------------------------------------------
  describe('getTrend(days?)', () => {
    it('returns array of {date, cost} objects (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      assert.ok(Array.isArray(result));
      for (const entry of result) {
        assert.ok(typeof entry.date === 'string', 'date must be a string');
        assert.ok(typeof entry.cost === 'number', 'cost must be a number');
      }
    });

    it('returns exactly 7 entries by default (VAL-OB-006)', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend();
      assert.strictEqual(result.length, 7);
    });

    it('returns exactly N entries when N is specified', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      assert.strictEqual(reporter.getTrend(3).length, 3);
      assert.strictEqual(reporter.getTrend(14).length, 14);
      assert.strictEqual(reporter.getTrend(1).length, 1);
    });

    it('dates are in ascending order', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      for (let i = 1; i < result.length; i++) {
        assert.ok(
          result[i].date >= result[i - 1].date,
          `Dates should be ascending: ${result[i - 1].date} <= ${result[i].date}`
        );
      }
    });

    it('last entry date is today', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      assert.strictEqual(result[result.length - 1].date, DATE_TODAY);
    });

    it('includes today cost when records exist for today', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      const todayEntry = result.find(r => r.date === DATE_TODAY);
      assert.ok(todayEntry, 'Should have an entry for today');
      assert.ok(
        Math.abs(todayEntry.cost - COST_TODAY_TOTAL) < 0.000001,
        `Today cost expected ~${COST_TODAY_TOTAL}, got ${todayEntry.cost}`
      );
    });

    it('days with no data have cost 0', () => {
      const mock = createMockAccountant(STANDARD_RECORDS);
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      // All entries must have non-negative costs
      for (const entry of result) {
        assert.ok(entry.cost >= 0, `cost should be >= 0, got ${entry.cost}`);
      }
    });

    it('returns all-zero costs when accountant has no records (VAL-OB-006)', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      assert.strictEqual(result.length, 7);
      for (const entry of result) {
        assert.strictEqual(entry.cost, 0);
      }
    });

    it('each entry date is a valid YYYY-MM-DD string', () => {
      const mock = createMockAccountant({});
      const reporter = new CostReporter(mock);
      const result = reporter.getTrend(7);
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      for (const entry of result) {
        assert.ok(datePattern.test(entry.date), `Invalid date format: ${entry.date}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Grace handling — empty / broken tokenAccountant
  // -------------------------------------------------------------------------
  describe('graceful degradation with empty TokenAccountant', () => {
    let reporter;

    before(() => {
      reporter = new CostReporter(createMockAccountant({}));
    });

    it('getSessionCosts returns zero-value object', () => {
      const result = reporter.getSessionCosts('any');
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.inputCost, 0);
      assert.strictEqual(result.outputCost, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('getDailyCosts returns zero-value object', () => {
      const result = reporter.getDailyCosts();
      assert.strictEqual(result.totalCost, 0);
      assert.strictEqual(result.sessionCount, 0);
      assert.strictEqual(result.taskCount, 0);
    });

    it('getModelBreakdown returns empty array', () => {
      assert.deepEqual(reporter.getModelBreakdown(), []);
    });

    it('getTrend returns array of zeros', () => {
      const result = reporter.getTrend(7);
      assert.strictEqual(result.length, 7);
      assert.ok(result.every(e => e.cost === 0));
    });
  });

  // -------------------------------------------------------------------------
  // Graceful handling when toJSON() returns unexpected structure
  // -------------------------------------------------------------------------
  describe('graceful degradation with broken tokenAccountant', () => {
    it('handles toJSON() returning null gracefully', () => {
      const broken = { toJSON: () => null };
      const reporter = new CostReporter(broken);
      assert.doesNotThrow(() => reporter.getSessionCosts('x'));
      assert.doesNotThrow(() => reporter.getDailyCosts());
      assert.doesNotThrow(() => reporter.getModelBreakdown());
      assert.doesNotThrow(() => reporter.getTrend(3));
    });

    it('handles toJSON() throwing gracefully', () => {
      const broken = {
        toJSON() {
          throw new Error('Accountant failure');
        },
      };
      const reporter = new CostReporter(broken);
      assert.doesNotThrow(() => reporter.getSessionCosts('x'));
      assert.doesNotThrow(() => reporter.getDailyCosts());
      assert.doesNotThrow(() => reporter.getModelBreakdown());
      assert.doesNotThrow(() => reporter.getTrend(3));
    });
  });
});
