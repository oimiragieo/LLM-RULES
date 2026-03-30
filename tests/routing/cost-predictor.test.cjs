#!/usr/bin/env node
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CostPredictor,
  DEFAULT_SESSION_BUDGET_USD,
} = require('../../.claude/lib/routing/cost-predictor.cjs');
const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ModelRegistry pointing at the real config */
function makeRegistry(configPath) {
  return new ModelRegistry(
    configPath || path.join(__dirname, '../../.claude/config/model-registry.json')
  );
}

/**
 * Build a stub TokenAccountant.
 * @param {object} opts
 * @param {number} [opts.costUSD=0]   - Total cost reported by getSessionTotal
 * @param {object} [opts.records={}]  - Raw records for toJSON() (taskId -> array)
 */
function makeStubAccountant({ costUSD = 0, records = {} } = {}) {
  return {
    getSessionTotal() {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUSD,
        taskCount: Object.keys(records).length,
      };
    },
    toJSON() {
      return {
        tasks: {},
        session: { costUSD, taskCount: Object.keys(records).length },
        records,
      };
    },
  };
}

/** Create a record at a given timestamp (ms since epoch) */
function makeRecord(timestampMs) {
  return {
    inputTokens: 1000,
    outputTokens: 200,
    model: 'sonnet',
    agentType: 'worker',
    timestamp: new Date(timestampMs).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CostPredictor', () => {
  let registry;
  before(() => {
    registry = makeRegistry();
  });

  // -------------------------------------------------------------------------
  // estimateCost
  // -------------------------------------------------------------------------
  describe('estimateCost', () => {
    it('returns an object with all required fields (VAL-MR-005)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.estimateCost('hello world', 'haiku');

      assert.ok(typeof result.estimatedTokens === 'number', 'estimatedTokens must be a number');
      assert.ok(typeof result.inputCostUSD === 'number', 'inputCostUSD must be a number');
      assert.ok(
        typeof result.estimatedOutputTokens === 'number',
        'estimatedOutputTokens must be a number'
      );
      assert.ok(typeof result.outputCostUSD === 'number', 'outputCostUSD must be a number');
      assert.ok(typeof result.totalCostUSD === 'number', 'totalCostUSD must be a number');
      assert.ok(typeof result.model === 'string', 'model must be a string');
    });

    it('returns accurate cost using CHAR_TO_TOKEN_RATIO and model pricing (VAL-MR-005)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const prompt = 'hello world'; // 11 chars → floor(11 * 0.75) = 8 tokens

      const haiku = registry.getModel('haiku');
      const result = predictor.estimateCost(prompt, 'haiku');

      assert.strictEqual(result.estimatedTokens, 8);
      const expectedInputCost = (8 / 1000) * haiku.costPer1KInput;
      assert.ok(
        Math.abs(result.inputCostUSD - expectedInputCost) < 1e-10,
        `inputCostUSD ${result.inputCostUSD} should equal ${expectedInputCost}`
      );
      assert.ok(result.totalCostUSD > 0, 'totalCostUSD should be positive');
    });

    it('uses model shorthand alias (VAL-MR-005)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const byShorthand = predictor.estimateCost('hello', 'sonnet');
      const byFullId = predictor.estimateCost('hello', 'claude-sonnet-4-6');
      assert.strictEqual(byShorthand.model, byFullId.model);
      assert.ok(Math.abs(byShorthand.totalCostUSD - byFullId.totalCostUSD) < 1e-12);
    });

    it('returns full model ID (not shorthand) in result', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.estimateCost('hello', 'opus');
      assert.strictEqual(result.model, 'claude-opus-4-6');
    });

    it('opus costs more than sonnet which costs more than haiku', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const prompt = 'The quick brown fox jumps over the lazy dog.';
      const haikuCost = predictor.estimateCost(prompt, 'haiku').totalCostUSD;
      const sonnetCost = predictor.estimateCost(prompt, 'sonnet').totalCostUSD;
      const opusCost = predictor.estimateCost(prompt, 'opus').totalCostUSD;

      assert.ok(
        haikuCost < sonnetCost,
        `haiku (${haikuCost}) should be cheaper than sonnet (${sonnetCost})`
      );
      assert.ok(
        sonnetCost < opusCost,
        `sonnet (${sonnetCost}) should be cheaper than opus (${opusCost})`
      );
    });

    it('empty prompt returns zero cost (VAL-MR-005)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.estimateCost('', 'haiku');

      assert.strictEqual(result.estimatedTokens, 0);
      assert.strictEqual(result.inputCostUSD, 0);
      assert.strictEqual(result.estimatedOutputTokens, 0);
      assert.strictEqual(result.outputCostUSD, 0);
      assert.strictEqual(result.totalCostUSD, 0);
    });

    it('unknown model throws descriptive error (VAL-MR-005)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      assert.throws(
        () => predictor.estimateCost('hello world', 'nonexistent-model'),
        err => {
          assert.ok(err instanceof Error, 'Should be an Error instance');
          assert.ok(
            err.message.includes('nonexistent-model'),
            `Error message should mention the unknown model name: "${err.message}"`
          );
          return true;
        }
      );
    });

    it('totalCostUSD equals inputCostUSD + outputCostUSD', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.estimateCost('test prompt for verification', 'sonnet');
      const expected = result.inputCostUSD + result.outputCostUSD;
      assert.ok(
        Math.abs(result.totalCostUSD - expected) < 1e-12,
        `totalCostUSD (${result.totalCostUSD}) should equal inputCostUSD + outputCostUSD (${expected})`
      );
    });
  });

  // -------------------------------------------------------------------------
  // suggestModel
  // -------------------------------------------------------------------------
  describe('suggestModel', () => {
    it('returns an object with model, estimatedCostUSD, and reason (VAL-MR-006)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.suggestModel('hello world', { maxCostUSD: 1 });
      assert.ok(result !== null, 'Should not be null for a generous budget');
      assert.ok(typeof result.model === 'string', 'model must be a string');
      assert.ok(typeof result.estimatedCostUSD === 'number', 'estimatedCostUSD must be a number');
      assert.ok(typeof result.reason === 'string', 'reason must be a string');
    });

    it('returns null when no model fits budget (VAL-MR-006)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      // Budget of $0 — no model should be free for a non-empty prompt
      const result = predictor.suggestModel('hello world', { maxCostUSD: 0 });
      assert.strictEqual(result, null);
    });

    it("qualityPreference='cost' picks cheapest model (VAL-MR-006)", () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.suggestModel('hello world', {
        maxCostUSD: 1,
        qualityPreference: 'cost',
      });
      assert.ok(result !== null, 'Should find a model');
      // haiku is cheapest
      assert.strictEqual(result.model, 'claude-haiku-4-5-20251001');
    });

    it("qualityPreference='quality' prefers opus (VAL-MR-006)", () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.suggestModel('hello world', {
        maxCostUSD: 1,
        qualityPreference: 'quality',
      });
      assert.ok(result !== null, 'Should find a model');
      // opus is the highest quality
      assert.strictEqual(result.model, 'claude-opus-4-6');
    });

    it("qualityPreference='quality' falls back to best available when opus exceeds budget", () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      // Build a long prompt so that opus costs > budget, but haiku/sonnet fit
      const longPrompt = 'x'.repeat(5000);
      const opusCost = predictor.estimateCost(longPrompt, 'opus').totalCostUSD;
      const sonnetCost = predictor.estimateCost(longPrompt, 'sonnet').totalCostUSD;
      const maxBudget = (opusCost + sonnetCost) / 2; // between sonnet and opus cost

      const result = predictor.suggestModel(longPrompt, {
        maxCostUSD: maxBudget,
        qualityPreference: 'quality',
      });
      assert.ok(result !== null, 'Should find a model within budget');
      // opus should be excluded (too expensive), sonnet should be picked as best quality
      assert.strictEqual(result.model, 'claude-sonnet-4-6');
    });

    it('estimatedCostUSD is within maxCostUSD', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const maxCostUSD = 0.01;
      const result = predictor.suggestModel('a short prompt', { maxCostUSD });
      if (result !== null) {
        assert.ok(
          result.estimatedCostUSD <= maxCostUSD,
          `estimatedCostUSD (${result.estimatedCostUSD}) should be <= maxCostUSD (${maxCostUSD})`
        );
      }
    });

    it('returns null for empty budget (maxCostUSD=0) with non-empty prompt', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      // Any non-trivially-long prompt will have a cost > 0
      const prompt = 'This is a prompt that should cost something.';
      const result = predictor.suggestModel(prompt, { maxCostUSD: 0 });
      assert.strictEqual(result, null);
    });

    it('works with empty prompt (zero cost fits any budget)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const result = predictor.suggestModel('', { maxCostUSD: 0, qualityPreference: 'cost' });
      // empty prompt has 0 cost so should fit even $0 budget
      assert.ok(result !== null, 'Empty prompt has zero cost and should fit any budget');
    });
  });

  // -------------------------------------------------------------------------
  // getBudgetStatus
  // -------------------------------------------------------------------------
  describe('getBudgetStatus', () => {
    it('returns an object with all required fields (VAL-MR-007)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant());
      const status = predictor.getBudgetStatus('session-1');

      assert.ok(typeof status.totalSpent === 'number', 'totalSpent must be a number');
      assert.ok(typeof status.remaining === 'number', 'remaining must be a number');
      assert.ok(typeof status.burnRatePerMinute === 'number', 'burnRatePerMinute must be a number');
      assert.ok(
        typeof status.estimatedMinutesLeft === 'number',
        'estimatedMinutesLeft must be a number'
      );
      assert.ok(typeof status.status === 'string', 'status must be a string');
    });

    it("returns status='ok' when budget is not significantly consumed (VAL-MR-007)", () => {
      // Spend 10% of budget — well below warning threshold
      const spentFraction = 0.1;
      const costUSD = DEFAULT_SESSION_BUDGET_USD * spentFraction;
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD }));
      const result = predictor.getBudgetStatus('session-ok');

      assert.strictEqual(result.status, 'ok');
      assert.ok(
        Math.abs(result.totalSpent - costUSD) < 1e-10,
        `totalSpent (${result.totalSpent}) should equal ${costUSD}`
      );
    });

    it("returns status='warning' when 80%+ of budget is consumed (VAL-MR-007)", () => {
      // Spend 85% of budget
      const costUSD = DEFAULT_SESSION_BUDGET_USD * 0.85;
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD }));
      const result = predictor.getBudgetStatus('session-warn');
      assert.strictEqual(result.status, 'warning');
    });

    it("returns status='critical' when 90%+ of budget is consumed (VAL-MR-007)", () => {
      // Spend 95% of budget
      const costUSD = DEFAULT_SESSION_BUDGET_USD * 0.95;
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD }));
      const result = predictor.getBudgetStatus('session-crit');
      assert.strictEqual(result.status, 'critical');
    });

    it('remaining = DEFAULT_SESSION_BUDGET_USD - totalSpent (VAL-MR-007)', () => {
      const costUSD = 2.5;
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD }));
      const result = predictor.getBudgetStatus('session-remaining');

      const expectedRemaining = DEFAULT_SESSION_BUDGET_USD - costUSD;
      assert.ok(
        Math.abs(result.remaining - expectedRemaining) < 1e-10,
        `remaining (${result.remaining}) should equal ${expectedRemaining}`
      );
    });

    it('calculates burn rate from TokenAccountant timestamps (VAL-MR-007)', () => {
      const now = Date.now();
      const twoMinutesAgo = now - 2 * 60 * 1000;
      const costUSD = 0.5;

      // One task with a record from 2 minutes ago
      const records = {
        'task-1': [makeRecord(twoMinutesAgo)],
      };
      const accountant = makeStubAccountant({ costUSD, records });
      const predictor = new CostPredictor(registry, accountant);
      const result = predictor.getBudgetStatus('session-burn');

      // burn rate should be approximately 0.5 / 2 = 0.25 $/min
      assert.ok(result.burnRatePerMinute > 0, 'burnRatePerMinute should be positive');
      // Allow ±10% tolerance for timing jitter
      const expectedBurnRate = costUSD / 2;
      assert.ok(
        Math.abs(result.burnRatePerMinute - expectedBurnRate) / expectedBurnRate < 0.1,
        `burnRatePerMinute (${result.burnRatePerMinute}) should be approximately ${expectedBurnRate}`
      );
    });

    it('burn rate is 0 when no records exist (VAL-MR-007)', () => {
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD: 0 }));
      const result = predictor.getBudgetStatus('session-empty');
      assert.strictEqual(result.burnRatePerMinute, 0);
    });

    it('estimatedMinutesLeft is derived from burn rate and remaining (VAL-MR-007)', () => {
      const now = Date.now();
      const twoMinutesAgo = now - 2 * 60 * 1000;
      const costUSD = 2.0; // 20% of $10 budget

      const records = {
        'task-1': [makeRecord(twoMinutesAgo)],
      };
      const accountant = makeStubAccountant({ costUSD, records });
      const predictor = new CostPredictor(registry, accountant);
      const result = predictor.getBudgetStatus('session-minutes');

      // remaining = $8, burn rate ~$1/min → ~8 minutes left
      assert.ok(
        result.estimatedMinutesLeft > 0,
        `estimatedMinutesLeft (${result.estimatedMinutesLeft}) should be positive`
      );
      assert.ok(
        Number.isFinite(result.estimatedMinutesLeft),
        'estimatedMinutesLeft should be finite when there is a burn rate'
      );
    });

    it('remaining is clamped to 0 when over budget', () => {
      // Spend more than the total budget
      const costUSD = DEFAULT_SESSION_BUDGET_USD * 1.5;
      const predictor = new CostPredictor(registry, makeStubAccountant({ costUSD }));
      const result = predictor.getBudgetStatus('session-over');
      assert.strictEqual(result.remaining, 0);
      assert.strictEqual(result.status, 'critical');
    });
  });
});
