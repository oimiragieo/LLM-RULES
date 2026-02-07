'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ASSEMBLER_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'spawn', 'prompt-assembler.cjs');
const SCHEMA_VALIDATOR_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'presets.schema.json');

// =============================================================================
// presets.schema.json wired into prompt-assembler.cjs
// =============================================================================

test('prompt-assembler.cjs exports validatePresets method', () => {
  delete require.cache[require.resolve(ASSEMBLER_PATH)];
  const assembler = require(ASSEMBLER_PATH);
  assert.strictEqual(typeof assembler.validatePresets, 'function',
    'Should expose validatePresets method');
});

test('validatePresets validates presets.json against schema', () => {
  delete require.cache[require.resolve(ASSEMBLER_PATH)];
  const assembler = require(ASSEMBLER_PATH);

  const result = assembler.validatePresets();
  // Result should have valid/errors/skipped fields
  assert.ok(result !== null && typeof result === 'object', 'Should return result object');
  assert.strictEqual(typeof result.valid, 'boolean', 'Should have valid boolean');
});

test('validatePresets validates conforming presets data', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const validPresets = {
    version: '1.0.0',
    presets: {
      'test-preset': {
        agentId: 'developer',
        enabledSkills: ['tdd', 'debugging'],
        ruleSnippetPath: null,
      },
    },
  };

  const result = validateData(validPresets, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'Valid presets should pass');
});

test('validatePresets detects missing required version field', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidPresets = {
    // Missing version (required)
    presets: {},
  };

  const result = validateData(invalidPresets, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Missing version should fail');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.errors.length > 0, 'Should have errors');
});

test('validatePresets degrades gracefully with null input', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const result = validateData(null, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'Should degrade gracefully for null');
  assert.strictEqual(result.skipped, true, 'Should indicate skipped');
});
