/**
 * safe-json.cjs TDD Test Suite
 * RED-GREEN-REFACTOR cycles for safeParseJSON implementation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

// ========================================
// Cycle 1: Valid JSON handling
// ========================================

test('safeParseJSON: handles valid JSON with success', () => {
  const result = safeParseJSON('{"foo": "bar"}', null);

  assert.strictEqual(typeof result, 'object', 'Should return object');
  assert.strictEqual(result.foo, 'bar', 'Should parse JSON correctly');
});

test('safeParseJSON: handles valid nested JSON', () => {
  const input = '{"user": {"name": "Alice", "age": 30}}';
  const result = safeParseJSON(input, null);

  assert.strictEqual(result.user.name, 'Alice');
  assert.strictEqual(result.user.age, 30);
});

// ========================================
// Cycle 2: Malformed JSON fallback
// ========================================

test('safeParseJSON: returns fallback on malformed JSON', () => {
  const fallback = { default: 'value' };
  const result = safeParseJSON('{invalid json}', null, null, fallback);

  // Should return fallback on parse error
  assert.deepStrictEqual(result, fallback);
});

test('safeParseJSON: returns empty object on malformed JSON without fallback', () => {
  const result = safeParseJSON('{invalid json}', null);

  // Should return empty object when no fallback
  assert.strictEqual(typeof result, 'object');
  assert.strictEqual(Object.keys(result).length, 0);
});

// ========================================
// Cycle 3: Prototype pollution protection
// ========================================

test('safeParseJSON: blocks __proto__ injection', () => {
  const malicious = '{"__proto__": {"isAdmin": true}}';
  const result = safeParseJSON(malicious, null);

  // Should parse but strip dangerous keys
  assert.strictEqual(result.__proto__, undefined, '__proto__ should be stripped');
  assert.strictEqual(result.isAdmin, undefined, 'Polluted property should not exist');
});

test('safeParseJSON: blocks constructor injection', () => {
  const malicious = '{"constructor": {"prototype": {"isAdmin": true}}}';
  const result = safeParseJSON(malicious, null);

  assert.strictEqual(result.constructor, undefined, 'constructor should be stripped');
});

test('safeParseJSON: blocks prototype injection', () => {
  const malicious = '{"prototype": {"isAdmin": true}}';
  const result = safeParseJSON(malicious, null);

  assert.strictEqual(result.prototype, undefined, 'prototype should be stripped');
});

test('safeParseJSON: blocks nested __proto__ injection', () => {
  const malicious = '{"user": {"name": "Alice", "__proto__": {"isAdmin": true}}}';
  const result = safeParseJSON(malicious, null);

  assert.strictEqual(result.user.name, 'Alice', 'Valid data should remain');
  // Check that __proto__ is not an own property (it was stripped)
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(result.user, '__proto__'),
    false,
    'Nested __proto__ should be stripped'
  );
  // Verify pollution didn't happen
  assert.strictEqual(result.user.isAdmin, undefined, 'Polluted property should not exist');
});
