'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// =============================================================================
// schema-validator.cjs Tests
// =============================================================================

test('schema-validator module loads', () => {
  const mod = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));
  assert.ok(mod, 'Module should load');
  assert.strictEqual(typeof mod.createValidator, 'function', 'Should export createValidator');
  assert.strictEqual(typeof mod.validateData, 'function', 'Should export validateData');
});

test('createValidator returns compiled validator for valid schema', () => {
  const { createValidator } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'evolution-state.schema.json');
  const validator = createValidator(schemaPath);

  assert.ok(validator, 'Should return a validator function');
  assert.strictEqual(typeof validator, 'function', 'Validator should be a function');
});

test('createValidator returns null for non-existent schema', () => {
  const { createValidator } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const validator = createValidator('/non/existent/path.schema.json');
  assert.strictEqual(validator, null, 'Should return null for missing schema');
});

test('validateData returns valid=true for conforming data', () => {
  const { validateData } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'evolution-state.schema.json');
  const validData = {
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
  };

  const result = validateData(validData, schemaPath);
  assert.strictEqual(result.valid, true, 'Should be valid');
  assert.strictEqual(result.errors, null, 'Should have no errors');
});

test('validateData returns valid=false for non-conforming data', () => {
  const { validateData } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'evolution-state.schema.json');
  const invalidData = {
    version: 123, // Should be string
    state: 'invalid-state', // Not in enum
  };

  const result = validateData(invalidData, schemaPath);
  assert.strictEqual(result.valid, false, 'Should be invalid');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.errors.length > 0, 'Should have at least one error');
});

test('validateData returns valid=true when schema path is missing (graceful degradation)', () => {
  const { validateData } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const result = validateData({ anything: true }, '/non/existent/schema.json');
  assert.strictEqual(result.valid, true, 'Should degrade gracefully to valid');
  assert.strictEqual(result.errors, null, 'Should have no errors');
  assert.strictEqual(result.skipped, true, 'Should indicate validation was skipped');
});

test('validateData returns valid=true when data is null (graceful degradation)', () => {
  const { validateData } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'evolution-state.schema.json');
  const result = validateData(null, schemaPath);
  assert.strictEqual(result.valid, true, 'Should degrade gracefully for null data');
  assert.strictEqual(result.skipped, true, 'Should indicate validation was skipped');
});

test('createValidator caches compiled validators', () => {
  const { createValidator } = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs'));

  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'evolution-state.schema.json');
  const v1 = createValidator(schemaPath);
  const v2 = createValidator(schemaPath);
  assert.strictEqual(v1, v2, 'Should return same cached validator instance');
});
