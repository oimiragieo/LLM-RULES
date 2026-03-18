'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { compactMessages } = require('../../.claude/lib/utils/incremental-compactor.cjs');

const makeMsg = (role, content) => ({ role, content });

describe('compactMessages', () => {
  it('returns messages unchanged when under threshold', () => {
    const messages = [makeMsg('user', 'Hello'), makeMsg('assistant', 'Hi')];
    const result = compactMessages({ messages, threshold: 80000, protectedCount: 2 });
    assert.equal(result.compacted.length, 2);
    assert.equal(result.removedCount, 0);
    assert.equal(result.savedTokens, 0);
  });

  it('removes oldest non-protected messages when over threshold', () => {
    // 20 messages of 400 chars each = 100 tokens each = 2000 tokens total
    // threshold = 500 tokens, protectedCount = 5
    // tail 5 = 500 tokens = at threshold, no removal needed... let's use 400 threshold
    const messages = Array.from(
      { length: 20 },
      () => makeMsg('user', 'x'.repeat(400)) // 100 tokens each
    );
    const result = compactMessages({ messages, threshold: 500, protectedCount: 5 });
    assert.ok(result.removedCount > 0);
    assert.ok(result.savedTokens > 0);
    // Protected tail must be intact
    assert.equal(result.compacted.length, messages.length - result.removedCount);
  });

  it('always keeps the last protectedCount messages', () => {
    const messages = Array.from(
      { length: 10 },
      () => makeMsg('user', 'x'.repeat(400)) // 100 tokens each = 1000 tokens total
    );
    const result = compactMessages({ messages, threshold: 100, protectedCount: 3 });
    // The last 3 messages must be in compacted
    assert.equal(result.compacted.length >= 3, true);
    const lastThree = messages.slice(-3);
    const lastThreeOfResult = result.compacted.slice(-3);
    for (let i = 0; i < 3; i++) {
      assert.equal(lastThreeOfResult[i].content, lastThree[i].content);
    }
  });

  it('savedTokens equals sum of removed message token costs', () => {
    // 10 messages of 400 chars = 100 tokens each = 1000 tokens total
    // threshold 200 tokens, protected 2 = protected 200 tokens
    // need to remove 8 messages to get under threshold
    const messages = Array.from({ length: 10 }, () => makeMsg('user', 'x'.repeat(400)));
    const result = compactMessages({ messages, threshold: 200, protectedCount: 2 });
    assert.equal(result.savedTokens, result.removedCount * 100);
  });

  it('handles empty messages array', () => {
    const result = compactMessages({ messages: [], threshold: 80000, protectedCount: 5 });
    assert.equal(result.compacted.length, 0);
    assert.equal(result.removedCount, 0);
    assert.equal(result.savedTokens, 0);
  });

  it('does not remove protected messages even when over threshold', () => {
    const messages = [
      makeMsg('user', 'x'.repeat(4000)), // 1000 tokens
      makeMsg('assistant', 'x'.repeat(4000)), // 1000 tokens
    ];
    // threshold = 100 tokens, but both messages are protected
    const result = compactMessages({ messages, threshold: 100, protectedCount: 2 });
    assert.equal(result.compacted.length, 2);
    assert.equal(result.removedCount, 0);
  });

  it('removes messages until under threshold', () => {
    // 5 messages of 100 tokens each = 500 tokens; threshold = 200; protected = 1 (100 tokens)
    // Need to remove enough to get to <= 200 tokens
    const messages = Array.from(
      { length: 5 },
      () => makeMsg('user', 'x'.repeat(400)) // 100 tokens
    );
    const result = compactMessages({ messages, threshold: 200, protectedCount: 1 });
    // total tokens of compacted should be <= 200
    const totalCompactedTokens = result.compacted.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    assert.ok(totalCompactedTokens <= 200);
  });

  it('uses default protectedCount of 5 when not specified', () => {
    const messages = Array.from({ length: 10 }, () => makeMsg('user', 'x'.repeat(400)));
    const result = compactMessages({ messages, threshold: 100 });
    // last 5 should be preserved
    assert.ok(result.compacted.length >= 5);
  });
});
