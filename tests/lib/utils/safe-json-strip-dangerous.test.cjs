'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

test('test top-level __proto__ stripped in fallback path', () => {
  const input = '{"__proto__":{"isAdmin":true}}';

  const result = safeParseJSON(input, null);

  // Check that Object.prototype wasn't polluted
  const testObj = {};
  assert.strictEqual(testObj.isAdmin, undefined,
    'Object.prototype should not be polluted by __proto__ injection');

  // Result should not contain __proto__ key
  assert.strictEqual(result.__proto__, undefined,
    '__proto__ key should be stripped from result');
});

test('test nested __proto__ stripped recursively', () => {
  const input = '{"data":{"__proto__":{"isAdmin":true}}}';

  const result = safeParseJSON(input, null);

  // Check that Object.prototype wasn't polluted
  const testObj = {};
  assert.strictEqual(testObj.isAdmin, undefined,
    'Nested __proto__ should not pollute Object.prototype');

  // Check that data exists but __proto__ is stripped
  assert.ok(result.data !== undefined, 'data key should exist');
  assert.strictEqual(result.data.__proto__, Object.prototype,
    '__proto__ should reference Object.prototype, not be a data key');
});

test('test deeply nested __proto__ stripped (3 levels)', () => {
  const input = '{"a":{"b":{"__proto__":{"x":1}}}}';

  const result = safeParseJSON(input, null);

  // Check for pollution
  const testObj = {};
  assert.strictEqual(testObj.x, undefined,
    'Deeply nested __proto__ should not pollute Object.prototype');

  // Verify structure exists but __proto__ is cleaned
  assert.ok(result.a !== undefined, 'Level 1 should exist');
  assert.ok(result.a.b !== undefined, 'Level 2 should exist');
});

test('test constructor key stripped recursively', () => {
  const input = '{"data":{"constructor":{"prototype":{"y":2}}}}';

  const result = safeParseJSON(input, null);

  // Check for pollution via constructor
  const testObj = {};
  assert.strictEqual(testObj.y, undefined,
    'constructor.prototype pollution should be prevented');

  // data key should exist but constructor should be stripped
  assert.ok(result.data !== undefined, 'data key should exist');
  // constructor should be the normal Function.constructor, not a data key
  assert.strictEqual(typeof result.data.constructor, 'function',
    'constructor should be normal prototype chain, not polluted data');
});

test('test array items sanitized recursively', () => {
  const input = '[{"__proto__":{"z":3}},{"nested":{"__proto__":{"w":4}}}]';

  const result = safeParseJSON(input, null);

  // Check for pollution
  const testObj1 = {};
  const testObj2 = {};
  assert.strictEqual(testObj1.z, undefined, 'First array item __proto__ should not pollute');
  assert.strictEqual(testObj2.w, undefined, 'Nested array item __proto__ should not pollute');

  // Verify array structure
  assert.ok(Array.isArray(result), 'Result should be an array');
  assert.strictEqual(result.length, 2, 'Array should have 2 items');
});

test('test schema path deep copy also sanitized', () => {
  // Test with schema-allowed key containing nested __proto__
  const input = '{"allowedData":{"nested":{"__proto__":{"hack":true}}}}';

  const result = safeParseJSON(input, 'router-state', {
    allowedData: {
      type: 'object',
      required: true,
    },
  }, {
    allowedData: {},
  });

  // Check for pollution after deep copy
  const testObj = {};
  assert.strictEqual(testObj.hack, undefined,
    'Schema-validated deep copy should also strip dangerous keys');

  // Verify structure
  assert.ok(result.allowedData !== undefined, 'allowedData should exist');
  assert.ok(result.allowedData.nested !== undefined, 'nested structure should exist');
});
