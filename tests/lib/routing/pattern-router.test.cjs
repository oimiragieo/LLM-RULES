'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveByPattern } = require('../../../.claude/lib/routing/pattern-router.cjs');

test('resolveByPattern returns null for empty input', () => {
  assert.equal(resolveByPattern('', null), null);
  assert.equal(resolveByPattern('hello', null), null);
  assert.equal(resolveByPattern('hello', {}), null);
});

test('resolveByPattern picks highest priority match', () => {
  const patterns = {
    developer: [{ pattern: /fix\b/i, priority: 10 }],
    qa: [{ pattern: /fix\b/i, priority: 5 }],
  };
  const result = resolveByPattern('fix this bug', patterns);
  assert.deepEqual(result, { agent: 'developer', priority: 10 });
});

test('resolveByPattern returns single matching agent', () => {
  const patterns = {
    planner: [{ pattern: /plan/i, priority: 7 }],
  };
  const result = resolveByPattern('plan the work', patterns);
  assert.deepEqual(result, { agent: 'planner', priority: 7 });
});

test('resolveByPattern returns null when no pattern matches', () => {
  const patterns = {
    qa: [{ pattern: /test/i, priority: 10 }],
  };
  const result = resolveByPattern('write docs', patterns);
  assert.equal(result, null);
});
