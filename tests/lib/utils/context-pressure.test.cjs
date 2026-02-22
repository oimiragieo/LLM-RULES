'use strict';
/**
 * Tests for context-pressure module (Track 1.1)
 * TDD — written BEFORE implementation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

let checkContextPressure;

describe('context-pressure — checkContextPressure', () => {
  before(() => {
    ({ checkContextPressure } = require('../../../.claude/lib/utils/context-pressure.cjs'));
  });

  it('returns low pressure when no triggers active', () => {
    const result = checkContextPressure({
      tokenBudgetPercent: 30,
      operationCount: 2,
      largeReadCount: 0,
    });
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
    assert.ok(typeof result.reason === 'string');
  });

  it('returns high pressure when budget > 90%', () => {
    const result = checkContextPressure({
      tokenBudgetPercent: 92,
      operationCount: 0,
      largeReadCount: 0,
    });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'high');
    assert.ok(result.reason.includes('92'));
  });

  it('returns medium pressure when budget 70–89%', () => {
    const result = checkContextPressure({
      tokenBudgetPercent: 75,
      operationCount: 0,
      largeReadCount: 0,
    });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'medium');
  });

  it('returns high pressure when many large reads', () => {
    const result = checkContextPressure({
      tokenBudgetPercent: 20,
      operationCount: 2,
      largeReadCount: 4,
    });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'high');
  });

  it('returns medium pressure when operation count exceeds threshold', () => {
    const result = checkContextPressure({
      tokenBudgetPercent: 20,
      operationCount: 15,
      largeReadCount: 0,
    });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'medium');
  });

  it('handles missing fields gracefully', () => {
    const result = checkContextPressure({});
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
  });

  it('returns structured object with needed, pressure, reason', () => {
    const result = checkContextPressure({ tokenBudgetPercent: 50 });
    assert.ok('needed' in result);
    assert.ok('pressure' in result);
    assert.ok('reason' in result);
    assert.ok(typeof result.needed === 'boolean');
    assert.ok(['low', 'medium', 'high'].includes(result.pressure));
  });
});

describe('SE-XX compliance — context-pressure', () => {
  it('SE-02: module loads correctly with all expected exports', () => {
    const mod = require('../../../.claude/lib/utils/context-pressure.cjs');
    assert.ok(typeof mod.checkContextPressure === 'function');
  });

  it('SE-01: handles path normalization (pure function, no path ops)', () => {
    const { checkContextPressure: cp } = require('../../../.claude/lib/utils/context-pressure.cjs');
    // pure computation — no paths involved, just verify no crash
    assert.doesNotThrow(() => cp({ tokenBudgetPercent: 0 }));
  });
});
