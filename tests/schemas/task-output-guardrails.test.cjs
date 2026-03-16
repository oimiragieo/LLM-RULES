'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'schemas',
  'task-output-guardrails.schema.json'
);

describe('task-output-guardrails schema', () => {
  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
  });

  test('schema should be valid JSON', () => {
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), 'Schema should be parseable JSON');
  });

  test('schema should have summary as the only required field', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(Array.isArray(schema.required), 'required should be an array');
    assert.ok(schema.required.includes('summary'), 'summary should be required');
    assert.strictEqual(schema.required.length, 1, 'only summary should be required');
  });

  test('schema should have all expected properties', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const expectedProps = [
      'summary',
      'filesModified',
      'testsRun',
      'lintClean',
      'success',
      'criteria_met',
      'criteria_failed',
    ];
    assert.ok(schema.properties, 'schema should have properties');
    for (const prop of expectedProps) {
      assert.ok(schema.properties[prop], `property "${prop}" should exist in schema`);
    }
  });

  test('summary should have minLength 10 and maxLength 500', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const summaryProp = schema.properties.summary;
    assert.strictEqual(summaryProp.type, 'string', 'summary should be type string');
    assert.strictEqual(summaryProp.minLength, 10, 'summary minLength should be 10');
    assert.strictEqual(summaryProp.maxLength, 500, 'summary maxLength should be 500');
  });

  test('filesModified should be array of strings', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const prop = schema.properties.filesModified;
    assert.strictEqual(prop.type, 'array', 'filesModified should be type array');
    assert.strictEqual(prop.items.type, 'string', 'filesModified items should be type string');
  });

  test('boolean fields should have type boolean', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    for (const field of ['testsRun', 'lintClean', 'success']) {
      assert.strictEqual(
        schema.properties[field].type,
        'boolean',
        `${field} should have type boolean`
      );
    }
  });

  test('criteria_met and criteria_failed should be arrays of strings', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    for (const field of ['criteria_met', 'criteria_failed']) {
      const prop = schema.properties[field];
      assert.strictEqual(prop.type, 'array', `${field} should be type array`);
      assert.strictEqual(prop.items.type, 'string', `${field} items should be type string`);
    }
  });

  test('valid minimal completion metadata passes structural validation', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const minimalValid = {
      summary: 'Added auth middleware with JWT validation',
    };
    // Only summary is required
    for (const field of schema.required) {
      assert.ok(minimalValid[field] !== undefined, `Required field "${field}" should be present`);
    }
    // summary length constraints
    assert.ok(
      minimalValid.summary.length >= schema.properties.summary.minLength,
      'summary should meet minLength'
    );
    assert.ok(
      minimalValid.summary.length <= schema.properties.summary.maxLength,
      'summary should meet maxLength'
    );
  });

  test('valid full completion metadata passes structural validation', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const fullValid = {
      summary: 'Implemented JWT authentication middleware with refresh token support',
      filesModified: ['src/middleware/auth.ts', 'src/routes/login.ts'],
      testsRun: true,
      lintClean: true,
      success: true,
      criteria_met: ['JWT validation works', 'Refresh tokens rotate'],
      criteria_failed: [],
    };
    // All required fields present
    for (const field of schema.required) {
      assert.ok(fullValid[field] !== undefined, `Required field "${field}" should be present`);
    }
    // Types match schema
    assert.ok(typeof fullValid.summary === 'string', 'summary should be string');
    assert.ok(Array.isArray(fullValid.filesModified), 'filesModified should be array');
    assert.ok(typeof fullValid.testsRun === 'boolean', 'testsRun should be boolean');
    assert.ok(typeof fullValid.lintClean === 'boolean', 'lintClean should be boolean');
    assert.ok(typeof fullValid.success === 'boolean', 'success should be boolean');
    assert.ok(Array.isArray(fullValid.criteria_met), 'criteria_met should be array');
    assert.ok(Array.isArray(fullValid.criteria_failed), 'criteria_failed should be array');
  });

  test('summary too short (less than 10 chars) violates minLength', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const shortSummary = 'Done';
    assert.ok(
      shortSummary.length < schema.properties.summary.minLength,
      'Short summary should be below minLength threshold'
    );
  });

  test('summary too long (over 500 chars) violates maxLength', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const longSummary = 'x'.repeat(501);
    assert.ok(
      longSummary.length > schema.properties.summary.maxLength,
      'Long summary should exceed maxLength threshold'
    );
  });
});
