'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '..', '..', '.claude', 'schemas', 'verification-gap.schema.json');

describe('verification-gap schema', () => {
  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
  });

  test('schema should be valid JSON', () => {
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), 'Schema should be parseable JSON');
  });

  test('schema should have required properties: gap_id, category, description, severity', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(Array.isArray(schema.required), 'required should be an array');
    assert.ok(schema.required.includes('gap_id'), 'gap_id should be required');
    assert.ok(schema.required.includes('category'), 'category should be required');
    assert.ok(schema.required.includes('description'), 'description should be required');
    assert.ok(schema.required.includes('severity'), 'severity should be required');
  });

  test('suggested_fix should NOT be required', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(!schema.required.includes('suggested_fix'), 'suggested_fix should be optional');
  });

  test('schema should have properties for all defined fields', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties, 'schema should have properties');
    assert.ok(schema.properties.gap_id, 'gap_id property should exist');
    assert.ok(schema.properties.category, 'category property should exist');
    assert.ok(schema.properties.description, 'description property should exist');
    assert.ok(schema.properties.severity, 'severity property should exist');
    assert.ok(schema.properties.suggested_fix, 'suggested_fix property should exist');
  });

  test('gap_id should have pattern ^G[0-9]+$', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.gap_id.pattern, '^G[0-9]+$');
  });

  test('category should be enum with expected values', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const expectedCategories = [
      'missing_test',
      'missing_artifact',
      'broken_link',
      'lint_error',
      'truth_violation',
      'missing_doc',
    ];
    assert.ok(Array.isArray(schema.properties.category.enum), 'category should have enum');
    for (const cat of expectedCategories) {
      assert.ok(
        schema.properties.category.enum.includes(cat),
        `category enum should include "${cat}"`
      );
    }
  });

  test('severity should be enum with blocker, warning, info', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const expectedSeverities = ['blocker', 'warning', 'info'];
    assert.ok(Array.isArray(schema.properties.severity.enum), 'severity should have enum');
    for (const sev of expectedSeverities) {
      assert.ok(
        schema.properties.severity.enum.includes(sev),
        `severity enum should include "${sev}"`
      );
    }
  });

  test('valid gap object passes structural validation', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const validGap = {
      gap_id: 'G1',
      category: 'missing_test',
      description: 'No test for auth middleware',
      severity: 'blocker',
      suggested_fix: 'Create tests/auth/middleware.test.cjs',
    };
    // Check required fields exist
    for (const field of schema.required) {
      assert.ok(validGap[field] !== undefined, `Valid gap should have required field: ${field}`);
    }
    // Check gap_id matches pattern
    assert.ok(/^G[0-9]+$/.test(validGap.gap_id), 'gap_id should match pattern');
    // Check category is valid
    assert.ok(
      schema.properties.category.enum.includes(validGap.category),
      'category should be valid enum value'
    );
    // Check severity is valid
    assert.ok(
      schema.properties.severity.enum.includes(validGap.severity),
      'severity should be valid enum value'
    );
  });

  test('gap_id pattern rejects non-matching values', () => {
    const pattern = /^G[0-9]+$/;
    assert.ok(!pattern.test('G'), 'G alone should not match');
    assert.ok(!pattern.test('g1'), 'lowercase g should not match');
    assert.ok(!pattern.test('1'), 'number alone should not match');
    assert.ok(!pattern.test('GA'), 'G with letter should not match');
    assert.ok(pattern.test('G1'), 'G1 should match');
    assert.ok(pattern.test('G42'), 'G42 should match');
    assert.ok(pattern.test('G100'), 'G100 should match');
  });
});
