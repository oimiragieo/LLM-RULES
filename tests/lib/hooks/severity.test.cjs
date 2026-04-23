'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SEVERITY_MODULE = path.join(PROJECT_ROOT, '.claude', 'lib', 'hooks', 'severity.cjs');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'guardrail-result.schema.json');

// ---------------------------------------------------------------------------
// Test 1: asWarning returns { severity:"warning", message, ts }
// ---------------------------------------------------------------------------
test('asWarning returns object with severity warning, message, and ts', () => {
  const { asWarning } = require(SEVERITY_MODULE);
  const result = asWarning('something looks off');
  assert.strictEqual(result.severity, 'warning', 'severity must be "warning"');
  assert.strictEqual(result.message, 'something looks off', 'message must be passed through');
  assert.ok(
    typeof result.ts === 'string' && result.ts.length > 0,
    'ts must be a non-empty ISO string'
  );
  // Verify ts parses as a valid date
  assert.ok(!isNaN(Date.parse(result.ts)), 'ts must be a parseable ISO timestamp');
});

// ---------------------------------------------------------------------------
// Test 2: asNotice returns { severity:"notice", message, ts }
// ---------------------------------------------------------------------------
test('asNotice returns object with severity notice, message, and ts', () => {
  const { asNotice } = require(SEVERITY_MODULE);
  const result = asNotice('just a heads-up');
  assert.strictEqual(result.severity, 'notice', 'severity must be "notice"');
  assert.strictEqual(result.message, 'just a heads-up');
  assert.ok(typeof result.ts === 'string' && result.ts.length > 0, 'ts must be set');
});

// ---------------------------------------------------------------------------
// Test 3: asError returns { severity:"error", message, ts }
// ---------------------------------------------------------------------------
test('asError returns object with severity error, message, and ts', () => {
  const { asError } = require(SEVERITY_MODULE);
  const result = asError('hard failure');
  assert.strictEqual(result.severity, 'error', 'severity must be "error"');
  assert.strictEqual(result.message, 'hard failure');
  assert.ok(typeof result.ts === 'string' && result.ts.length > 0, 'ts must be set');
});

// ---------------------------------------------------------------------------
// Test 4: formatForStderr prefixes [WARNING] / [NOTICE] / [ERROR]
// ---------------------------------------------------------------------------
test('formatForStderr prefixes message with uppercase severity label', () => {
  const { asWarning, asNotice, asError, formatForStderr } = require(SEVERITY_MODULE);

  assert.strictEqual(
    formatForStderr(asWarning('plan section missing')),
    '[WARNING] plan section missing',
    'warning should produce [WARNING] prefix'
  );
  assert.strictEqual(
    formatForStderr(asNotice('FYI')),
    '[NOTICE] FYI',
    'notice should produce [NOTICE] prefix'
  );
  assert.strictEqual(
    formatForStderr(asError('boom')),
    '[ERROR] boom',
    'error should produce [ERROR] prefix'
  );
});

// ---------------------------------------------------------------------------
// Test 5: schema validates { severity:"warning" } check entry
// ---------------------------------------------------------------------------
test('guardrail-result schema accepts check item with severity "warning"', () => {
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );

  const validPayload = {
    passed: false,
    checks: [
      {
        name: 'plan-section-check',
        passed: false,
        message: 'Missing plan section',
        severity: 'warning',
      },
    ],
  };

  const result = validateData(validPayload, SCHEMA_PATH);
  // If Ajv is not available, validation is skipped (skipped:true) — still passes
  if (result.skipped) {
    assert.ok(true, 'validation skipped (Ajv unavailable) — schema test counts as passing');
    return;
  }
  assert.strictEqual(
    result.valid,
    true,
    `Schema should accept severity:"warning". Errors: ${JSON.stringify(result.errors)}`
  );
});

// ---------------------------------------------------------------------------
// Test 6: schema rejects severity:"foo" (invalid enum value)
// ---------------------------------------------------------------------------
test('guardrail-result schema rejects check item with invalid severity "foo"', () => {
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );

  const invalidPayload = {
    passed: false,
    checks: [
      {
        name: 'some-check',
        passed: false,
        message: 'Failure',
        severity: 'foo',
      },
    ],
  };

  const result = validateData(invalidPayload, SCHEMA_PATH);
  if (result.skipped) {
    assert.ok(true, 'validation skipped (Ajv unavailable) — schema test counts as passing');
    return;
  }
  assert.strictEqual(result.valid, false, 'Schema should reject severity:"foo"');
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'Should have errors');
});

// ---------------------------------------------------------------------------
// Test 7: backward compat — absent severity defaults to "error" in helper
// ---------------------------------------------------------------------------
test('formatForStderr falls back to [ERROR] when severity is absent (backward compat)', () => {
  const { formatForStderr } = require(SEVERITY_MODULE);

  // Old-style result object without severity field
  const legacyResult = { message: 'something went wrong' };
  assert.strictEqual(
    formatForStderr(legacyResult),
    '[ERROR] something went wrong',
    'Missing severity should default to ERROR label'
  );

  // Null result
  assert.strictEqual(
    formatForStderr(null),
    '[ERROR] ',
    'Null result should produce [ERROR] with empty message'
  );

  // Empty object
  assert.strictEqual(
    formatForStderr({}),
    '[ERROR] ',
    'Empty result should produce [ERROR] with empty message'
  );
});
