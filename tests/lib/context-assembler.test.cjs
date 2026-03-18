'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assembleContext } = require('../../.claude/lib/utils/context-assembler.cjs');

const makeMsg = (role, content, timestamp) => ({ role, content, timestamp });

describe('assembleContext', () => {
  it('returns all messages as tail when total tokens are under budget', () => {
    const messages = [
      makeMsg('user', 'Hello', 1000),
      makeMsg('assistant', 'Hi there', 2000),
      makeMsg('user', 'How are you?', 3000),
    ];
    const result = assembleContext({ messages, budgetTokens: 80000, protectedTailCount: 5 });
    assert.equal(result.truncated, false);
    assert.equal(result.tail.length, 3);
    assert.equal(result.prefix.length, 0);
    assert.ok(result.totalTokens > 0);
  });

  it('protects the last N messages in tail', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i} ` + 'x'.repeat(100), i * 1000)
    );
    const result = assembleContext({ messages, budgetTokens: 80000, protectedTailCount: 3 });
    assert.equal(result.tail.length, 3);
    assert.equal(result.tail[0].content, messages[7].content);
    assert.equal(result.tail[1].content, messages[8].content);
    assert.equal(result.tail[2].content, messages[9].content);
  });

  it('truncates prefix messages when over budget', () => {
    // Each message is ~1000 chars = ~250 tokens; 20 messages = ~5000 tokens
    // Set budget low enough to force truncation of prefix
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMsg('user', 'x'.repeat(1000), i * 1000)
    );
    const result = assembleContext({ messages, budgetTokens: 2000, protectedTailCount: 5 });
    assert.equal(result.truncated, true);
    assert.equal(result.tail.length, 5);
    // prefix should have fewer than 15 messages (some were cut)
    assert.ok(result.prefix.length < 15);
  });

  it('estimates tokens as content length divided by 4', () => {
    const content = 'a'.repeat(400); // 400 chars = 100 tokens
    const messages = [makeMsg('user', content, 1000)];
    const result = assembleContext({ messages, budgetTokens: 80000, protectedTailCount: 1 });
    assert.equal(result.totalTokens, 100);
  });

  it('returns truncated=false when messages fit within budget', () => {
    const messages = [makeMsg('user', 'short', 1000)];
    const result = assembleContext({ messages, budgetTokens: 80000, protectedTailCount: 5 });
    assert.equal(result.truncated, false);
  });

  it('handles empty messages array', () => {
    const result = assembleContext({ messages: [], budgetTokens: 80000, protectedTailCount: 5 });
    assert.equal(result.truncated, false);
    assert.equal(result.tail.length, 0);
    assert.equal(result.prefix.length, 0);
    assert.equal(result.totalTokens, 0);
  });

  it('when messages fewer than protectedTailCount, all go into tail', () => {
    const messages = [makeMsg('user', 'hi', 1000), makeMsg('assistant', 'hello', 2000)];
    const result = assembleContext({ messages, budgetTokens: 80000, protectedTailCount: 10 });
    assert.equal(result.tail.length, 2);
    assert.equal(result.prefix.length, 0);
  });

  it('prefix messages have summarized flag set to true when truncation occurs', () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMsg('user', 'x'.repeat(1000), i * 1000)
    );
    const result = assembleContext({ messages, budgetTokens: 1500, protectedTailCount: 5 });
    assert.equal(result.truncated, true);
    // All prefix entries should have summarized: true
    for (const msg of result.prefix) {
      assert.equal(msg.summarized, true);
    }
  });
});
