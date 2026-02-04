'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fuzzyMatchIntent,
  fuzzyMatchIntentAlternatives,
  jaccardSimilarity,
  tokenize,
} = require('../../../.claude/lib/routing/fuzzy-intent-matcher.cjs');

test('tokenize splits words', () => {
  assert.deepEqual(tokenize('Fix-bug NOW!'), ['fix', 'bug', 'now']);
});

test('jaccardSimilarity basic behavior', () => {
  const score = jaccardSimilarity(['fix', 'bug'], ['fix', 'bug']);
  assert.equal(score, 1);
  const zero = jaccardSimilarity(['a'], ['b']);
  assert.equal(zero, 0);
});

test('fuzzyMatchIntent returns null for short prompt', () => {
  const result = fuzzyMatchIntent('a', { developer: ['fix bug'] });
  assert.equal(result, null);
});

test('fuzzyMatchIntent returns match above threshold', () => {
  const result = fuzzyMatchIntent('fix the bug', { developer: ['fix bug'] }, { threshold: 0.4 });
  assert.ok(result);
  assert.equal(result.intent, 'developer');
});

test('fuzzyMatchIntent returns null below threshold', () => {
  const result = fuzzyMatchIntent('unrelated text', { developer: ['fix bug'] }, { threshold: 0.8 });
  assert.equal(result, null);
});

test('fuzzyMatchIntent picks best intent', () => {
  const result = fuzzyMatchIntent(
    'review the code',
    {
      developer: ['implement code'],
      'code-reviewer': ['code review', 'review code'],
    },
    { threshold: 0.4 }
  );
  assert.ok(result);
  assert.equal(result.intent, 'code-reviewer');
});

test('fuzzyMatchIntent returns valid result when maxCandidates is 0', () => {
  const result = fuzzyMatchIntent(
    'fix the bug',
    { developer: ['fix bug'] },
    {
      threshold: 0.4,
      maxCandidates: 0,
    }
  );
  assert.ok(result);
  assert.equal(result.intent, 'developer');
  assert.equal(typeof result.confidence, 'number');
  assert.equal(result.method, 'fuzzy');
});

test('fuzzyMatchIntentAlternatives returns ranked list', () => {
  const result = fuzzyMatchIntentAlternatives(
    'review the code',
    {
      developer: ['implement code'],
      'code-reviewer': ['code review', 'review code'],
      qa: ['run tests'],
    },
    { threshold: 0.2, maxCandidates: 2 }
  );
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.equal(result[0].intent, 'code-reviewer');
  assert.equal(result[0].method, 'fuzzy');
});
