'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../../.claude/schemas/failure-taxonomy.schema.json');

describe('F1: 10-Category Failure Taxonomy Schema', () => {
  it('schema file should exist', () => {
    assert.ok(fs.existsSync(SCHEMA_PATH), 'failure-taxonomy.schema.json must exist');
  });

  it('schema should be valid JSON', () => {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    const schema = JSON.parse(raw);
    assert.ok(schema, 'Schema should parse as JSON');
  });

  it('schema should have required metadata fields', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(schema.$schema, 'Must have $schema field');
    assert.ok(schema.title, 'Must have title field');
    assert.ok(schema.description, 'Must have description field');
  });

  it('schema should define exactly 10 failure categories', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const categoryEnum =
      schema.properties?.category?.enum ||
      schema.$defs?.failureCategory?.enum ||
      schema.definitions?.failureCategory?.enum;
    assert.ok(categoryEnum, 'Schema must define a category enum');
    assert.equal(categoryEnum.length, 10, `Expected 10 categories, got ${categoryEnum.length}`);
  });

  it('schema should include all expected categories', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const categoryEnum =
      schema.properties?.category?.enum ||
      schema.$defs?.failureCategory?.enum ||
      schema.definitions?.failureCategory?.enum;

    const expected = [
      'tool-misuse',
      'scope-drift',
      'hallucination',
      'incomplete-output',
      'wrong-agent',
      'timeout',
      'context-overflow',
      'dependency-failure',
      'test-failure',
      'other',
    ];

    for (const cat of expected) {
      assert.ok(categoryEnum.includes(cat), `Missing category: ${cat}`);
    }
  });

  it('schema should define severity levels', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const severityEnum =
      schema.properties?.severity?.enum ||
      schema.$defs?.severity?.enum ||
      schema.definitions?.severity?.enum;
    assert.ok(severityEnum, 'Schema must define severity levels');
    assert.ok(severityEnum.length >= 3, 'Should have at least 3 severity levels');
  });

  it('schema should require category and description fields', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(schema.required, 'Schema must have required fields');
    assert.ok(schema.required.includes('category'), 'category must be required');
    assert.ok(schema.required.includes('severity'), 'severity must be required');
  });
});
