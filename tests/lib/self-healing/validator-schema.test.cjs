'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const VALIDATOR_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'self-healing', 'validator.cjs');

// =============================================================================
// evolution-state.schema.json wired into validator.cjs
// =============================================================================

test('validator.cjs exports validateStateWithSchema function', () => {
  // Clear require cache to get fresh module
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const validator = require(VALIDATOR_PATH);
  assert.strictEqual(typeof validator.validateStateWithSchema, 'function',
    'Should export validateStateWithSchema');
});

test('validateStateWithSchema validates valid evolution state data', () => {
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const { validateStateWithSchema } = require(VALIDATOR_PATH);

  const validState = {
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
  };

  const result = validateStateWithSchema(validState);
  assert.strictEqual(result.valid, true, 'Valid state should pass schema validation');
  assert.strictEqual(result.errors, null, 'Should have no errors');
});

test('validateStateWithSchema detects invalid state enum value', () => {
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const { validateStateWithSchema } = require(VALIDATOR_PATH);

  const invalidState = {
    version: '1.0.0',
    state: 'bogus-state',
    evolutions: [],
    patterns: [],
    suggestions: [],
  };

  const result = validateStateWithSchema(invalidState);
  assert.strictEqual(result.valid, false, 'Invalid state enum should fail');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.errors.length > 0, 'Should have at least one error');
});

test('validateStateWithSchema detects missing required fields', () => {
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const { validateStateWithSchema } = require(VALIDATOR_PATH);

  const incompleteState = {
    version: '1.0.0',
    state: 'idle',
    // Missing: evolutions, patterns, suggestions
  };

  const result = validateStateWithSchema(incompleteState);
  assert.strictEqual(result.valid, false, 'Missing required fields should fail');
});

test('validateStateWithSchema degrades gracefully with null input', () => {
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const { validateStateWithSchema } = require(VALIDATOR_PATH);

  const result = validateStateWithSchema(null);
  assert.strictEqual(result.valid, true, 'Should degrade gracefully for null');
  assert.strictEqual(result.skipped, true, 'Should indicate skipped');
});

test('validateState still works as before (backward compat)', () => {
  delete require.cache[require.resolve(VALIDATOR_PATH)];
  const { validateState } = require(VALIDATOR_PATH);

  // Create a temp state file with valid data
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
  const stateFile = path.join(tmpDir, 'evolution-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
  }));

  const result = validateState(stateFile);
  assert.strictEqual(result.valid, true, 'Original validateState should still work');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
