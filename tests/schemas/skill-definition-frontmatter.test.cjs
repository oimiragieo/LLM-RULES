'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('skill-definition schema — frontmatter block (v3.1.0 dual-layer pattern)', () => {
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );
  const schemaPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'schemas',
    'skill-definition.schema.json'
  );

  // Test 1: skill WITHOUT frontmatter block — validates (backward compat)
  test('skill without frontmatter block passes validation (backward compat)', () => {
    const skill = {
      name: 'my-skill',
      description: 'A skill that does something useful when invoked by agents.',
    };
    const result = validateData(skill, schemaPath);
    assert.strictEqual(result.valid, true, 'Skill without frontmatter must still validate');
    assert.strictEqual(result.errors, null, 'Should have no errors');
  });

  // Test 2: skill WITH valid frontmatter — validates
  test('skill with valid frontmatter block passes validation', () => {
    const skill = {
      name: 'my-skill',
      description: 'A skill that does something useful when invoked by agents.',
      frontmatter: {
        triggers: ['when user asks about X', 'on pattern Y'],
        output_schema_ref: 'schemas/my-skill-output.schema.json',
        token_budget: 5000,
        requires_skills: ['ripgrep', 'code-semantic-search'],
      },
    };
    const result = validateData(skill, schemaPath);
    assert.strictEqual(result.valid, true, 'Skill with valid frontmatter must validate');
    assert.strictEqual(result.errors, null, 'Should have no errors');
  });

  // Test 3: frontmatter with invalid `triggers` (non-string items) — fails
  test('frontmatter with non-string triggers items fails validation', () => {
    const skill = {
      name: 'my-skill',
      description: 'A skill that does something useful when invoked by agents.',
      frontmatter: {
        triggers: [123, true], // items must be strings
      },
    };
    const result = validateData(skill, schemaPath);
    assert.strictEqual(
      result.valid,
      false,
      'Non-string trigger items must fail validation'
    );
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
    assert.ok(result.errors.length > 0, 'Should have at least one error');
  });

  // Test 4: frontmatter with `token_budget: 500` (below min 1000) — fails
  test('frontmatter with token_budget below minimum 1000 fails validation', () => {
    const skill = {
      name: 'my-skill',
      description: 'A skill that does something useful when invoked by agents.',
      frontmatter: {
        token_budget: 500, // minimum is 1000
      },
    };
    const result = validateData(skill, schemaPath);
    assert.strictEqual(
      result.valid,
      false,
      'token_budget below 1000 must fail validation'
    );
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
    assert.ok(result.errors.length > 0, 'Should have at least one error');
  });

  // Test 5: frontmatter with unknown property — fails (additionalProperties: false)
  test('frontmatter with unknown property fails validation (additionalProperties: false)', () => {
    const skill = {
      name: 'my-skill',
      description: 'A skill that does something useful when invoked by agents.',
      frontmatter: {
        triggers: ['on pattern X'],
        unknown_field: 'this should not be allowed',
      },
    };
    const result = validateData(skill, schemaPath);
    assert.strictEqual(
      result.valid,
      false,
      'Unknown frontmatter property must fail validation'
    );
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
    assert.ok(result.errors.length > 0, 'Should have at least one error');
  });
});
