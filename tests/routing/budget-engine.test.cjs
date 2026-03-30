#!/usr/bin/env node
'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  BudgetEngine,
  BudgetExhaustedError,
} = require('../../.claude/lib/routing/budget-engine.cjs');
const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal stub TokenAccountant */
function makeStubAccountant({ costUSD = 0 } = {}) {
  return {
    getSessionTotal() {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD, taskCount: 0 };
    },
    toJSON() {
      return { tasks: {}, session: { costUSD }, records: {} };
    },
  };
}

/** Build a registry using the real config */
function makeRegistry() {
  return new ModelRegistry();
}

/** Create a BudgetEngine with sensible defaults */
function makeEngine(overrides = {}) {
  return new BudgetEngine({
    tokenAccountant: makeStubAccountant(),
    modelRegistry: makeRegistry(),
    config: overrides.config,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetEngine', () => {
  // -------------------------------------------------------------------------
  // BudgetExhaustedError
  // -------------------------------------------------------------------------
  describe('BudgetExhaustedError', () => {
    it('extends Error and carries sessionId/totalBudget/totalSpent', () => {
      const err = new BudgetExhaustedError('sess-1', 5.0, 5.5);
      assert.ok(err instanceof Error);
      assert.ok(err instanceof BudgetExhaustedError);
      assert.equal(err.sessionId, 'sess-1');
      assert.equal(err.totalBudget, 5.0);
      assert.equal(err.totalSpent, 5.5);
      assert.ok(err.message.includes('sess-1'));
    });
  });

  // -------------------------------------------------------------------------
  // constructor / config
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const engine = new BudgetEngine({
        tokenAccountant: makeStubAccountant(),
        modelRegistry: makeRegistry(),
      });
      // Verify defaults via checkBudget after allocateBudget
      engine.allocateBudget('s1', [{ phase: 'plan', fraction: 1.0 }]);
      const status = engine.checkBudget('s1');
      assert.equal(status.totalBudget, 5.0); // defaultSessionBudget
    });

    it('accepts custom config', () => {
      const engine = new BudgetEngine({
        tokenAccountant: makeStubAccountant(),
        modelRegistry: makeRegistry(),
        config: { defaultSessionBudget: 10.0 },
      });
      engine.allocateBudget('s1', [{ phase: 'plan', fraction: 1.0 }]);
      const status = engine.checkBudget('s1');
      assert.equal(status.totalBudget, 10.0);
    });
  });

  // -------------------------------------------------------------------------
  // allocateBudget (VAL-MR-012)
  // -------------------------------------------------------------------------
  describe('allocateBudget', () => {
    it('splits budget across phases by fraction (VAL-MR-012)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [
        { phase: 'planning', fraction: 0.3 },
        { phase: 'coding', fraction: 0.5 },
        { phase: 'review', fraction: 0.2 },
      ]);
      const planning = engine.getPhaseStatus('s1', 'planning');
      const coding = engine.getPhaseStatus('s1', 'coding');
      const review = engine.getPhaseStatus('s1', 'review');

      assert.ok(Math.abs(planning.allocatedBudget - 1.5) < 0.001); // 5.0 * 0.3
      assert.ok(Math.abs(coding.allocatedBudget - 2.5) < 0.001); // 5.0 * 0.5
      assert.ok(Math.abs(review.allocatedBudget - 1.0) < 0.001); // 5.0 * 0.2
    });

    it('fractions summing to exactly 1.0 do not throw (VAL-MR-012)', () => {
      const engine = makeEngine();
      assert.doesNotThrow(() => {
        engine.allocateBudget('s1', [
          { phase: 'a', fraction: 0.5 },
          { phase: 'b', fraction: 0.5 },
        ]);
      });
    });

    it('fractions summing to <1.0 do not throw (VAL-MR-012)', () => {
      const engine = makeEngine();
      assert.doesNotThrow(() => {
        engine.allocateBudget('s1', [{ phase: 'only', fraction: 0.6 }]);
      });
    });

    it('fractions summing to >1.0 throw RangeError (VAL-MR-012)', () => {
      const engine = makeEngine();
      assert.throws(
        () => {
          engine.allocateBudget('s1', [
            { phase: 'a', fraction: 0.7 },
            { phase: 'b', fraction: 0.5 },
          ]);
        },
        err => {
          assert.ok(err instanceof RangeError || err instanceof Error);
          return true;
        }
      );
    });

    it('empty phases array is accepted (no phases allocated)', () => {
      const engine = makeEngine();
      assert.doesNotThrow(() => {
        engine.allocateBudget('s1', []);
      });
      const status = engine.checkBudget('s1');
      assert.equal(Object.keys(status.phases).length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // checkBudget (VAL-MR-013)
  // -------------------------------------------------------------------------
  describe('checkBudget', () => {
    it('returns ok status when < 80% spent (VAL-MR-013)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 3.0); // 60% of 5.0
      const status = engine.checkBudget('s1');
      assert.equal(status.status, 'ok');
      assert.equal(status.totalBudget, 5.0);
      assert.ok(Math.abs(status.totalSpent - 3.0) < 0.001);
      assert.ok(Math.abs(status.remaining - 2.0) < 0.001);
    });

    it('returns warning at exactly 80% spent (VAL-MR-013)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // 80% of 5.0
      const status = engine.checkBudget('s1');
      assert.equal(status.status, 'warning');
    });

    it('returns critical at exactly 90% spent (VAL-MR-013)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.5); // 90% of 5.0
      const status = engine.checkBudget('s1');
      assert.equal(status.status, 'critical');
    });

    it('returns exhausted at 100% spent (VAL-MR-013)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 5.0); // 100% of 5.0
      const status = engine.checkBudget('s1');
      assert.equal(status.status, 'exhausted');
    });

    it('returns exhausted when over budget (VAL-MR-013)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 6.0); // 120% of 5.0
      const status = engine.checkBudget('s1');
      assert.equal(status.status, 'exhausted');
      assert.equal(status.remaining, 0);
    });

    it('returns all required BudgetStatus fields', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      const status = engine.checkBudget('s1');
      assert.ok(typeof status.totalBudget === 'number');
      assert.ok(typeof status.totalSpent === 'number');
      assert.ok(typeof status.remaining === 'number');
      assert.ok(typeof status.burnRate === 'number');
      assert.ok(typeof status.status === 'string');
      assert.ok(typeof status.autoDowngradeTriggered === 'boolean');
      assert.ok(typeof status.currentModel === 'string');
      assert.ok(typeof status.phases === 'object');
    });

    it('phases object in checkBudget reflects allocated phases', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [
        { phase: 'plan', fraction: 0.4 },
        { phase: 'code', fraction: 0.6 },
      ]);
      const status = engine.checkBudget('s1');
      assert.ok('plan' in status.phases);
      assert.ok('code' in status.phases);
    });
  });

  // -------------------------------------------------------------------------
  // recordSpend (VAL-MR-012, VAL-MR-013)
  // -------------------------------------------------------------------------
  describe('recordSpend', () => {
    it('updates session total spent', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 1.0);
      engine.recordSpend('s1', 0.5);
      const status = engine.checkBudget('s1');
      assert.ok(Math.abs(status.totalSpent - 1.5) < 0.001);
    });

    it('updates phase spent when phase provided', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [
        { phase: 'plan', fraction: 0.3 },
        { phase: 'code', fraction: 0.7 },
      ]);
      engine.recordSpend('s1', 0.5, 'plan');
      engine.recordSpend('s1', 1.0, 'code');

      const plan = engine.getPhaseStatus('s1', 'plan');
      const code = engine.getPhaseStatus('s1', 'code');
      assert.ok(Math.abs(plan.spent - 0.5) < 0.001);
      assert.ok(Math.abs(code.spent - 1.0) < 0.001);
    });

    it('still updates session total when unknown phase provided', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 1.0, 'nonexistent-phase');
      const status = engine.checkBudget('s1');
      assert.ok(Math.abs(status.totalSpent - 1.0) < 0.001);
    });

    it('does not throw for unknown session (graceful)', () => {
      const engine = makeEngine();
      assert.doesNotThrow(() => {
        engine.recordSpend('unknown-session', 1.0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // getPhaseStatus (VAL-MR-012)
  // -------------------------------------------------------------------------
  describe('getPhaseStatus', () => {
    it('returns accurate per-phase data (VAL-MR-012)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'analyze', fraction: 0.4 }]);
      engine.recordSpend('s1', 0.8, 'analyze');

      const ps = engine.getPhaseStatus('s1', 'analyze');
      assert.ok(Math.abs(ps.allocatedBudget - 2.0) < 0.001); // 5.0 * 0.4
      assert.ok(Math.abs(ps.spent - 0.8) < 0.001);
      assert.ok(Math.abs(ps.remaining - 1.2) < 0.001);
      assert.ok(typeof ps.fraction === 'number');
    });

    it('returns null for unallocated phase', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      const ps = engine.getPhaseStatus('s1', 'nonexistent');
      assert.equal(ps, null);
    });

    it('returns null for unknown session', () => {
      const engine = makeEngine();
      const ps = engine.getPhaseStatus('unknown-session', 'work');
      assert.equal(ps, null);
    });
  });

  // -------------------------------------------------------------------------
  // enforceLimit (VAL-MR-014)
  // -------------------------------------------------------------------------
  describe('enforceLimit', () => {
    it('returns {model, downgraded: false} when budget is ok (VAL-MR-014)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 1.0); // 20% - well within budget
      const result = engine.enforceLimit('s1');
      assert.equal(result.downgraded, false);
      assert.ok(typeof result.model === 'string');
    });

    it('downgrades opus->sonnet when at warning threshold (VAL-MR-014)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // 80% = warning
      const result = engine.enforceLimit('s1');
      assert.equal(result.downgraded, true);
      // After downgrade from opus, should be sonnet
      assert.ok(result.model.toLowerCase().includes('sonnet'));
    });

    it('downgrades through chain: opus->sonnet->haiku (VAL-MR-014)', () => {
      const engine = makeEngine();
      // First session at warning - should go from opus to sonnet
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // 80% = warning
      const result1 = engine.enforceLimit('s1');
      assert.equal(result1.downgraded, true);
      assert.ok(result1.model.toLowerCase().includes('sonnet'));

      // Now at critical with sonnet current - should downgrade to haiku
      engine.recordSpend('s1', 0.6); // now 4.6 = 92% = critical
      const result2 = engine.enforceLimit('s1');
      assert.equal(result2.downgraded, true);
      assert.ok(result2.model.toLowerCase().includes('haiku'));
    });

    it('throws BudgetExhaustedError when exhausted at minimum model (VAL-MR-014)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      // Force model to haiku
      engine.recordSpend('s1', 4.0); // warning => opus->sonnet
      engine.enforceLimit('s1');
      engine.recordSpend('s1', 0.6); // critical => sonnet->haiku
      engine.enforceLimit('s1');
      engine.recordSpend('s1', 0.4); // exhausted at haiku
      assert.throws(
        () => engine.enforceLimit('s1'),
        err => {
          assert.ok(err instanceof BudgetExhaustedError);
          assert.equal(err.sessionId, 's1');
          assert.ok(typeof err.totalBudget === 'number');
          assert.ok(typeof err.totalSpent === 'number');
          return true;
        }
      );
    });

    it('autoDowngradeTriggered is true after a downgrade', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // 80% = warning
      engine.enforceLimit('s1');
      const status = engine.checkBudget('s1');
      assert.equal(status.autoDowngradeTriggered, true);
    });

    it('does not downgrade when autoDowngrade is false', () => {
      const engine = new BudgetEngine({
        tokenAccountant: makeStubAccountant(),
        modelRegistry: makeRegistry(),
        config: { autoDowngrade: false },
      });
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // 80% = warning
      const result = engine.enforceLimit('s1');
      // With autoDowngrade=false, should NOT downgrade even at warning
      assert.equal(result.downgraded, false);
    });

    it('throws BudgetExhaustedError when exhausted and autoDowngrade is false', () => {
      const engine = new BudgetEngine({
        tokenAccountant: makeStubAccountant(),
        modelRegistry: makeRegistry(),
        config: { autoDowngrade: false },
      });
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 5.0); // 100% exhausted
      assert.throws(
        () => engine.enforceLimit('s1'),
        err => {
          assert.ok(err instanceof BudgetExhaustedError);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Multiple independent sessions (VAL-MR-015)
  // -------------------------------------------------------------------------
  describe('multiple sessions are independent (VAL-MR-015)', () => {
    it('sessions have separate budgets', () => {
      const engine = makeEngine();
      engine.allocateBudget('sessA', [{ phase: 'work', fraction: 1.0 }]);
      engine.allocateBudget('sessB', [{ phase: 'work', fraction: 1.0 }]);

      engine.recordSpend('sessA', 4.5); // critical in A
      engine.recordSpend('sessB', 1.0); // only 20% in B

      const statusA = engine.checkBudget('sessA');
      const statusB = engine.checkBudget('sessB');

      assert.equal(statusA.status, 'critical');
      assert.equal(statusB.status, 'ok');
    });

    it('spend in one session does not affect another (VAL-MR-015)', () => {
      const engine = makeEngine();
      engine.allocateBudget('sessA', [{ phase: 'work', fraction: 1.0 }]);
      engine.allocateBudget('sessB', [{ phase: 'work', fraction: 1.0 }]);

      engine.recordSpend('sessA', 2.0);
      engine.recordSpend('sessA', 1.5);

      const statusB = engine.checkBudget('sessB');
      assert.ok(Math.abs(statusB.totalSpent - 0) < 0.001);
    });

    it('downgrade in one session does not affect another (VAL-MR-015)', () => {
      const engine = makeEngine();
      engine.allocateBudget('sessA', [{ phase: 'work', fraction: 1.0 }]);
      engine.allocateBudget('sessB', [{ phase: 'work', fraction: 1.0 }]);

      // Force downgrade in A
      engine.recordSpend('sessA', 4.0); // warning => downgrade
      engine.enforceLimit('sessA');

      const statusA = engine.checkBudget('sessA');
      const statusB = engine.checkBudget('sessB');

      assert.equal(statusA.autoDowngradeTriggered, true);
      assert.equal(statusB.autoDowngradeTriggered, false);
    });

    it('enforceLimit exhaustion in one session does not affect another (VAL-MR-015)', () => {
      const engine = makeEngine();
      engine.allocateBudget('sessA', [{ phase: 'work', fraction: 1.0 }]);
      engine.allocateBudget('sessB', [{ phase: 'work', fraction: 1.0 }]);

      // Exhaust session A by downgrading through chain then spending
      engine.recordSpend('sessA', 4.0);
      engine.enforceLimit('sessA'); // opus -> sonnet
      engine.recordSpend('sessA', 0.6);
      engine.enforceLimit('sessA'); // sonnet -> haiku
      engine.recordSpend('sessA', 0.4); // exhaust

      // B should still be fine
      assert.throws(() => engine.enforceLimit('sessA'), BudgetExhaustedError);

      const statusB = engine.checkBudget('sessB');
      assert.equal(statusB.status, 'ok');
      assert.doesNotThrow(() => engine.enforceLimit('sessB'));
    });
  });

  // -------------------------------------------------------------------------
  // currentModel in checkBudget
  // -------------------------------------------------------------------------
  describe('currentModel tracking', () => {
    it('starts at first model in downgrade chain (opus)', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      const status = engine.checkBudget('s1');
      // currentModel should be opus (first in chain)
      assert.ok(status.currentModel.toLowerCase().includes('opus'));
    });

    it('updates currentModel after enforceLimit downgrade', () => {
      const engine = makeEngine();
      engine.allocateBudget('s1', [{ phase: 'work', fraction: 1.0 }]);
      engine.recordSpend('s1', 4.0); // warning
      engine.enforceLimit('s1');
      const status = engine.checkBudget('s1');
      assert.ok(status.currentModel.toLowerCase().includes('sonnet'));
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: session not initialized
  // -------------------------------------------------------------------------
  describe('uninitialized session handling', () => {
    it('checkBudget on uninitialized session uses default budget', () => {
      const engine = makeEngine();
      // Session never had allocateBudget called
      const status = engine.checkBudget('never-allocated');
      assert.equal(status.totalBudget, 5.0);
      assert.equal(status.totalSpent, 0);
      assert.equal(status.status, 'ok');
    });

    it('enforceLimit on uninitialized session returns default model', () => {
      const engine = makeEngine();
      const result = engine.enforceLimit('never-allocated');
      assert.equal(result.downgraded, false);
      assert.ok(typeof result.model === 'string');
    });
  });
});
