'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  estimateTokens,
  getContextPressure,
} = require('../../../.claude/lib/utils/context-token-estimator.cjs');

test('estimateTokens returns non-negative integer', () => {
  assert.strictEqual(estimateTokens(null), 0);
  assert.strictEqual(estimateTokens('abcd'), 1);
  assert.strictEqual(estimateTokens('abcdefgh'), 2);
  assert.strictEqual(estimateTokens(''), 0);
});

test('getContextPressure returns ratio in [0,1]', () => {
  const ratio = getContextPressure({
    systemPrompt: 'a'.repeat(2000), // 500 tokens
    history: 'b'.repeat(2000), // 500 tokens
    incomingTaskPrompt: 'c'.repeat(4000), // 1000 tokens
    contextWindow: 4000,
  });

  assert.strictEqual(ratio, 0.5); // 2000 tokens / 4000 window = 0.5
});

test('getContextPressure respects over-threshold 0.85', () => {
  const ratio = getContextPressure({
    systemPrompt: 'a'.repeat(1700 * 4), // 1700 tokens
    contextWindow: 2000,
  });

  assert.strictEqual(ratio, 0.85);
});

test('getContextPressure threshold boundary', () => {
  const ratio79 = getContextPressure({
    systemPrompt: 'a'.repeat(79 * 4),
    contextWindow: 100,
  });

  const ratio81 = getContextPressure({
    systemPrompt: 'a'.repeat(81 * 4),
    contextWindow: 100,
  });

  assert.ok(ratio79 < 0.8);
  assert.ok(ratio81 > 0.8);
});
