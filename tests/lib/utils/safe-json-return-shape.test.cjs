// Agent: code-simplifier | Task: #23 | Session: 2026-04-11
'use strict';

/**
 * Regression test for audit C-01:
 * safeParseJSON returns the parsed object directly — NOT a { success, data, error } wrapper.
 * Any caller using `.data` on the return value will always get `undefined`.
 */

const test = require('node:test');
const assert = require('node:assert');
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

test('safeParseJSON: returns parsed object directly (not wrapped in {data})', () => {
  const result = safeParseJSON('{"a":1}', {});
  // Result may be null-prototype object; check the value directly
  assert.strictEqual(result.a, 1, 'Should return parsed object with correct field value');
  assert.strictEqual(typeof result, 'object', 'Should return an object directly');
});

test('safeParseJSON: .data on return is undefined — regression guard for C-01', () => {
  const result = safeParseJSON('{"a":1}', {});
  assert.strictEqual(
    result.data,
    undefined,
    '.data must be undefined — do not use safeParseJSON(...).data'
  );
});

test('safeParseJSON: returns defaults on parse failure', () => {
  const result = safeParseJSON('not json', null, null, { x: 1 });
  assert.strictEqual(result.x, 1, 'Should return inlineDefaults value when JSON is invalid');
  assert.strictEqual(typeof result, 'object', 'Should return an object (defaults) on failure');
});
