#!/usr/bin/env node
'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { BudgetEnforcementService } = require('../../../.claude/lib/workers/budget-enforcement.cjs');

describe('BudgetEnforcementService', () => {
  /** @type {BudgetEnforcementService} */
  let budget;

  beforeEach(() => {
    budget = new BudgetEnforcementService({ maxTokensPerMinute: 10000, maxConcurrentWorkers: 2 });
  });

  describe('acquireWorkerSlot — allowed path', () => {
    it('returns allowed:true and a release function when under limits', () => {
      const slot = budget.acquireWorkerSlot(100);
      assert.equal(slot.allowed, true);
      assert.equal(typeof slot.release, 'function');
    });

    it('increments concurrentCount after acquire', () => {
      budget.acquireWorkerSlot(100);
      assert.equal(budget._concurrentCount, 1);
    });

    it('accumulates token usage', () => {
      budget.acquireWorkerSlot(500);
      budget.acquireWorkerSlot(300);
      assert.equal(budget.currentMinuteUsage, 800);
    });
  });

  describe('acquireWorkerSlot — release', () => {
    it('release() decrements concurrentCount', () => {
      const slot = budget.acquireWorkerSlot(100);
      assert.equal(budget._concurrentCount, 1);
      slot.release();
      assert.equal(budget._concurrentCount, 0);
    });

    it('release() never goes below zero', () => {
      const slot = budget.acquireWorkerSlot(100);
      slot.release();
      slot.release(); // extra release
      assert.equal(budget._concurrentCount, 0);
    });
  });

  describe('acquireWorkerSlot — MAX_CONCURRENT', () => {
    it('returns MAX_CONCURRENT when at the worker limit', () => {
      budget.acquireWorkerSlot(100);
      budget.acquireWorkerSlot(100);
      // _concurrentCount is now 2 = maxConcurrentWorkers

      const slot = budget.acquireWorkerSlot(100);
      assert.equal(slot.allowed, false);
      assert.equal(slot.reason, 'MAX_CONCURRENT');
      assert.equal(slot.retryAfterMs, 0);
    });

    it('allows acquire again after release frees a slot', () => {
      const slotA = budget.acquireWorkerSlot(100);
      budget.acquireWorkerSlot(100);

      let slot = budget.acquireWorkerSlot(100);
      assert.equal(slot.allowed, false);

      slotA.release();
      slot = budget.acquireWorkerSlot(100);
      assert.equal(slot.allowed, true);
    });
  });

  describe('acquireWorkerSlot — TPM_EXCEEDED', () => {
    it('returns TPM_EXCEEDED when token budget is exhausted', () => {
      // Directly set usage near the limit and ensure concurrent count is below max
      budget.currentMinuteUsage = 9900;
      budget._concurrentCount = 0;

      // 200 tokens would push usage to 10100, exceeding 10000 limit
      const blocked = budget.acquireWorkerSlot(200);
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.reason, 'TPM_EXCEEDED');
      assert.equal(typeof blocked.retryAfterMs, 'number');
      assert.ok(blocked.retryAfterMs >= 0);
    });

    it('allows acquire when tokens fit within remaining budget', () => {
      budget.currentMinuteUsage = 9000;
      budget._concurrentCount = 0;

      // 999 tokens fits within remaining 1000
      const slot = budget.acquireWorkerSlot(999);
      assert.equal(slot.allowed, true);
      slot.release();
    });
  });

  describe('getStats', () => {
    it('returns correct stats object shape', () => {
      const stats = budget.getStats();
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'currentMinuteUsage'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'maxTokensPerMinute'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'concurrentCount'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'maxConcurrentWorkers'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'msUntilReset'));
    });

    it('reflects current usage in stats', () => {
      budget.acquireWorkerSlot(1234);
      const stats = budget.getStats();
      assert.equal(stats.currentMinuteUsage, 1234);
      assert.equal(stats.concurrentCount, 1);
    });
  });

  describe('window reset', () => {
    it('resets currentMinuteUsage after 60s window expires', () => {
      budget.currentMinuteUsage = 9000;
      // Backdate the window start by 61 seconds
      budget.windowStart = Date.now() - 61000;

      const slot = budget.acquireWorkerSlot(100);
      assert.equal(slot.allowed, true);
      // After reset the usage should be just the new 100 tokens
      assert.equal(budget.currentMinuteUsage, 100);
    });

    it('msUntilReset returns 0 when window has already expired', () => {
      budget.windowStart = Date.now() - 61000;
      assert.equal(budget.msUntilReset(), 0);
    });

    it('msUntilReset returns positive value within window', () => {
      budget.windowStart = Date.now() - 10000;
      const remaining = budget.msUntilReset();
      assert.ok(remaining > 0 && remaining <= 60000);
    });
  });
});
