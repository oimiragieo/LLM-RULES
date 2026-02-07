/**
 * Security Tests for prompt-factory.cjs
 * Tests SEC-TMPL-004: Template Placeholder Injection
 *
 * This tests that we add sanitizeSubstitutionValue() function
 * and use it before .replace() calls in buildContextModePrompt().
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

// We'll export this function from prompt-factory for testing
let sanitizeSubstitutionValue;

test('SEC-TMPL-004: sanitizeSubstitutionValue function tests', async (t) => {
  await t.beforeEach(() => {
    // Try to import the function - it doesn't exist yet, so tests will fail
    try {
      const module = require('../../../.claude/lib/spawn/prompt-factory.cjs');
      sanitizeSubstitutionValue = module.sanitizeSubstitutionValue;
    } catch (_err) {
      sanitizeSubstitutionValue = null;
    }
  });

  await t.test('should export sanitizeSubstitutionValue function', () => {
    assert.ok(sanitizeSubstitutionValue,
      'sanitizeSubstitutionValue should be exported from prompt-factory.cjs');
    assert.strictEqual(typeof sanitizeSubstitutionValue, 'function',
      'sanitizeSubstitutionValue should be a function');
  });

  await t.test('should sanitize value containing {{available_tools}}', () => {
    if (!sanitizeSubstitutionValue) {
      assert.fail('sanitizeSubstitutionValue not exported - test cannot run');
    }

    const dangerousValue = '{{available_tools}}';
    const result = sanitizeSubstitutionValue(dangerousValue);

    // Should NOT contain {{ or }} (escaped)
    assert.ok(!result.includes('{{'),
      'Result should not contain {{');
    assert.ok(!result.includes('}}'),
      'Result should not contain }}');
  });

  await t.test('should sanitize nested {{nested{{deep}}}}', () => {
    if (!sanitizeSubstitutionValue) {
      assert.fail('sanitizeSubstitutionValue not exported');
    }

    const dangerousValue = '{{nested{{deep}}}}';
    const result = sanitizeSubstitutionValue(dangerousValue);

    // Should NOT contain {{ or }} (without spaces) - spaces prevent placeholder matching
    assert.ok(!result.includes('{{'),
      'Should remove all {{ (no spaces)');
    assert.ok(!result.includes('}}'),
      'Should remove all }} (no spaces)');

    // Should contain sanitized version: "{ {nested{ {deep} }} }"
    assert.ok(result.includes('{ {'),
      'Should contain sanitized { {');
    assert.ok(result.includes('} }'),
      'Should contain sanitized } }');
  });

  await t.test('should leave normal values unchanged', () => {
    if (!sanitizeSubstitutionValue) {
      assert.fail('sanitizeSubstitutionValue not exported');
    }

    const normalValue = 'This is a normal value';
    const result = sanitizeSubstitutionValue(normalValue);

    assert.strictEqual(result, normalValue,
      'Normal values should remain unchanged');
  });

  await t.test('should handle empty string', () => {
    if (!sanitizeSubstitutionValue) {
      assert.fail('sanitizeSubstitutionValue not exported');
    }

    const result = sanitizeSubstitutionValue('');
    assert.strictEqual(result, '', 'Empty string should remain empty');
  });

  await t.test('should preserve single braces', () => {
    if (!sanitizeSubstitutionValue) {
      assert.fail('sanitizeSubstitutionValue not exported');
    }

    const singleBraces = 'This has {single} braces';
    const result = sanitizeSubstitutionValue(singleBraces);

    assert.strictEqual(result, singleBraces,
      'Single braces should not be affected');
  });
});
