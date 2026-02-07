'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_VALIDATOR_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'skill-definition.schema.json');

// =============================================================================
// skill-definition.schema.json validation tests
// =============================================================================

test('skill-definition schema can be compiled by createValidator', () => {
  const { createValidator } = require(SCHEMA_VALIDATOR_PATH);
  const validator = createValidator(SCHEMA_PATH);
  assert.ok(validator, 'Should compile skill-definition schema');
  assert.strictEqual(typeof validator, 'function');
});

test('valid skill frontmatter passes schema validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const validFrontmatter = {
    name: 'test-skill',
    description: 'A test skill used for validation testing purposes only',
    version: '1.0',
    model: 'sonnet',
    tools: ['Read', 'Write'],
  };

  const result = validateData(validFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'Valid frontmatter should pass');
});

test('missing required name field fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    // name missing
    description: 'A test skill used for validation testing purposes only',
    version: '1.0',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Missing name should fail');
});

test('invalid name pattern fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    name: 'InvalidCapitalizedName',
    description: 'A test skill used for validation testing purposes only',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Invalid name pattern should fail');
});

test('short description fails validation (minLength)', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    name: 'test-skill',
    description: 'Too short',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Short description should fail');
});

test('create.cjs _SCHEMA_PATH references existing schema file', () => {
  const fs = require('fs');
  assert.ok(fs.existsSync(SCHEMA_PATH),
    'skill-definition.schema.json should exist at expected path');
});
