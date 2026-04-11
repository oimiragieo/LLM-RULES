'use strict';
/**
 * Regression tests for H-05: yaml.load CORE_SCHEMA hardening (CWE-502)
 *
 * These tests assert that yaml.load() with { schema: yaml.CORE_SCHEMA }
 * rejects !!js/function and !!js/regexp tags (arbitrary code execution vectors)
 * while still parsing standard YAML 1.2 types correctly.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');

// ─── Hardened loader helper (mirrors pattern used in all 5 H-05 files) ───────

function safeLoad(str) {
  return yaml.load(str, { schema: yaml.CORE_SCHEMA });
}

// ─── Standard YAML types must still work ─────────────────────────────────────

test('CORE_SCHEMA: parses plain string', () => {
  const result = safeLoad('hello: world');
  assert.deepStrictEqual(result, { hello: 'world' });
});

test('CORE_SCHEMA: parses integer and float', () => {
  const result = safeLoad('count: 42\nprice: 3.14');
  assert.strictEqual(result.count, 42);
  assert.ok(Math.abs(result.price - 3.14) < 0.001);
});

test('CORE_SCHEMA: parses boolean', () => {
  const result = safeLoad('enabled: true');
  assert.strictEqual(result.enabled, true);
});

test('CORE_SCHEMA: parses null', () => {
  const result = safeLoad('value: null');
  assert.strictEqual(result.value, null);
});

test('CORE_SCHEMA: parses array', () => {
  const result = safeLoad('items:\n  - a\n  - b\n  - c');
  assert.deepStrictEqual(result.items, ['a', 'b', 'c']);
});

// ─── Dangerous YAML tags MUST be rejected ─────────────────────────────────────

test('CORE_SCHEMA: rejects !!js/function tag (CWE-502)', () => {
  const malicious = "exploit: !!js/function 'function(){return process.env}'";
  assert.throws(
    () => safeLoad(malicious),
    err => {
      // js-yaml throws YAMLException for unknown tags in CORE_SCHEMA
      assert.ok(err instanceof Error, 'Should throw an Error');
      return true;
    },
    'CORE_SCHEMA must reject !!js/function'
  );
});

test('CORE_SCHEMA: rejects !!js/regexp tag', () => {
  const malicious = "pattern: !!js/regexp '/foo/gi'";
  assert.throws(
    () => safeLoad(malicious),
    err => {
      assert.ok(err instanceof Error, 'Should throw an Error');
      return true;
    },
    'CORE_SCHEMA must reject !!js/regexp'
  );
});

test('CORE_SCHEMA: rejects !!js/undefined tag', () => {
  const malicious = 'value: !!js/undefined ~';
  assert.throws(
    () => safeLoad(malicious),
    err => {
      assert.ok(err instanceof Error, 'Should throw an Error');
      return true;
    },
    'CORE_SCHEMA must reject !!js/undefined'
  );
});

// ─── Regression guard: CORE_SCHEMA must not silently ignore bad tags ─────────

test('CORE_SCHEMA: nested object with dangerous-looking key names parses safely', () => {
  // Ensure CORE_SCHEMA still rejects embedded js/* tags even when nested
  const input = 'outer:\n  inner: !!js/function "function(){}"';
  assert.throws(
    () => safeLoad(input),
    err => {
      assert.ok(err instanceof Error, 'Should throw for nested !!js/function');
      return true;
    },
    'CORE_SCHEMA must reject nested !!js/function'
  );
});
