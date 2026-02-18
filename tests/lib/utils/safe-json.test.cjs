/**
 * safe-json.cjs TDD Test Suite
 * RED-GREEN-REFACTOR cycles for safeParseJSON implementation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  safeParseJSON,
  stripDangerousKeys,
} = require('../../../.claude/lib/utils/safe-json.cjs');

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

// ========================================
// Bug 1 (HIGH): Object.assign defeats null-prototype protection
// RED: safeParseJSON with schema returns null-prototype result
// ========================================

test('BUG1: safeParseJSON schema-based result has null prototype (no Object.assign pollution)', () => {
  // With a known schema, the final return is Object.assign({}, validated)
  // which restores Object.prototype — this test must fail (RED) before fix.
  const json = '{"mode": "router"}';
  const result = safeParseJSON(json, 'router-state');

  assert.strictEqual(
    Object.getPrototypeOf(result),
    null,
    'Schema-based parse result should have null prototype to prevent prototype pollution'
  );
});

test('BUG1: Object.prototype not polluted after safeParseJSON with schema and __proto__ key', () => {
  // Even though schema strips unknown keys, the Object.assign re-attaches prototype.
  // After the call, Object.prototype.isAdmin must be undefined.
  const maliciousJson = '{"__proto__": {"isAdmin": true}, "mode": "router"}';

  // Clear any pollution before the test
  delete Object.prototype.isAdmin;

  safeParseJSON(maliciousJson, 'router-state');

  assert.strictEqual(
    Object.prototype.isAdmin,
    undefined,
    'Object.prototype.isAdmin must remain undefined after schema parse'
  );

  // cleanup
  delete Object.prototype.isAdmin;
});

// ========================================
// Bug 2 (MEDIUM): stripDangerousKeys mutates input in-place
// RED: original object must not be modified after stripDangerousKeys
// ========================================

test('BUG2: stripDangerousKeys does not mutate the original input object', () => {
  // Simulate what an attacker-controlled JSON.parse produces: an object with __proto__ key
  // We use Object.defineProperty to set __proto__ as an own property (as JSON.parse does internally)
  const input = JSON.parse('{"a": 1, "__proto__": {"x": 99}, "b": 2}');

  // Capture original own keys before stripping
  const keysBefore = Object.getOwnPropertyNames(input);

  stripDangerousKeys(input);

  // The original input's own properties should NOT have been deleted
  // (the function should work on a copy, not mutate the argument)
  const keysAfter = Object.getOwnPropertyNames(input);

  assert.deepStrictEqual(
    keysBefore.sort(),
    keysAfter.sort(),
    'stripDangerousKeys must not delete keys from the original input object'
  );
  // Specifically, __proto__ as an own property should still be present on input
  assert.ok(
    Object.prototype.hasOwnProperty.call(input, '__proto__') ||
      !keysBefore.includes('__proto__'),
    'If __proto__ was an own key before, it must still be an own key after (not mutated)'
  );
});

test('BUG2: stripDangerousKeys returns a clean copy without dangerous keys', () => {
  const input = JSON.parse('{"a": 1, "__proto__": {"x": 99}, "b": 2}');
  const result = stripDangerousKeys(input);

  // The returned object should NOT have __proto__ as an own property
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(result, '__proto__'),
    false,
    'Returned object should not have __proto__ as own property'
  );
  // But should have the safe keys
  assert.strictEqual(result.a, 1, 'Safe key a should be preserved');
  assert.strictEqual(result.b, 2, 'Safe key b should be preserved');
});

// ========================================
// Bug 3 (LOW): Nested objects retain Object.prototype in no-schema fallback
// RED: nested objects inside no-schema parse result must not have Object.prototype
// ========================================

test('BUG3: safeParseJSON no-schema fallback: nested objects have null prototype', () => {
  // No schema provided (schemaName = null) — uses the fallback path
  const json = '{"outer": {"inner": {"value": 42}}}';
  const result = safeParseJSON(json, null);

  assert.ok(result.outer, 'outer should exist');
  assert.strictEqual(
    Object.getPrototypeOf(result.outer),
    null,
    'Nested object "outer" should have null prototype in no-schema fallback'
  );
  assert.ok(result.outer.inner, 'inner should exist');
  assert.strictEqual(
    Object.getPrototypeOf(result.outer.inner),
    null,
    'Deeply nested object "inner" should have null prototype in no-schema fallback'
  );
});

test('BUG3: safeParseJSON no-schema fallback strips nested __proto__ completely', () => {
  // Verifies nested proto is stripped AND nested objects are safe
  const json = '{"a": {"__proto__": {"x": 1}}}';

  delete Object.prototype.x;
  const result = safeParseJSON(json, null);

  assert.strictEqual(
    Object.prototype.x,
    undefined,
    'Object.prototype.x must not be set after nested __proto__ in no-schema fallback'
  );
  delete Object.prototype.x;
  void result;
});
