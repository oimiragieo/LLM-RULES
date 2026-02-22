'use strict';
/**
 * Tests for context-pressure module (Track 1.1)
 * TDD — written BEFORE implementation.
 */

const { describe, it, before } = require('node:test');
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

describe('context-pressure — text-based interface (Track 1.1 API scope)', () => {
  // checkContextPressure({ text }) estimates tokens as Math.ceil(text.length / 4)
  // and computes tokenBudgetPercent = (estimatedTokens / 200_000) * 100

  it('text producing > 90% budget → high pressure', () => {
    // 200_000 * 90% * 4 chars/token = 720_000 chars needed for 90%
    // Use 190_000 tokens worth → 760_000 chars (> 90%)
    const text = 'x'.repeat(760_000);
    const result = checkContextPressure({ text });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'high');
  });

  it('text producing 70–89% budget → medium pressure', () => {
    // 75% of 200_000 = 150_000 tokens → 600_000 chars
    const text = 'x'.repeat(600_000);
    const result = checkContextPressure({ text });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'medium');
  });

  it('short text → low pressure', () => {
    const result = checkContextPressure({ text: 'Hello world' });
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
  });

  it('empty text → low pressure', () => {
    const result = checkContextPressure({ text: '' });
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
  });

  it('text at exact 90% threshold boundary → high', () => {
    // Exactly 90% budget: 180_000 tokens → 720_000 chars
    const text = 'x'.repeat(720_000);
    const result = checkContextPressure({ text });
    assert.ok(result.needed);
    assert.equal(result.pressure, 'high');
  });

  it('tokenBudgetPercent is estimated from text.length / 4 / CONTEXT_WINDOW', () => {
    // 80_000 chars → 20_000 tokens → 10% → low
    const result = checkContextPressure({ text: 'a'.repeat(80_000) });
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
  });

  it('text param coexists with explicit tokenBudgetPercent (text takes precedence)', () => {
    // Short text but high tokenBudgetPercent passed explicitly
    // text estimator wins → low
    const result = checkContextPressure({ text: 'hello', tokenBudgetPercent: 95 });
    assert.ok(!result.needed);
    assert.equal(result.pressure, 'low');
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
