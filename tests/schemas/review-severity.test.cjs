'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../.claude/schemas/review-severity.schema.json'
);

describe('C4: Review Severity Schema', () => {
  it('schema file should exist', () => {
    assert.ok(fs.existsSync(SCHEMA_PATH), 'review-severity.schema.json must exist');
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

  it('schema type should be string', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.equal(schema.type, 'string', 'Schema type must be "string"');
  });

  it('schema should define exactly 4 severity levels', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(Array.isArray(schema.enum), 'Schema must have an enum array');
    assert.equal(schema.enum.length, 4, `Expected 4 severity levels, got ${schema.enum.length}`);
  });

  it('schema should include all four valid severity levels', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const expected = ['blocker', 'critical', 'suggestion', 'nit'];
    for (const level of expected) {
      assert.ok(schema.enum.includes(level), `Missing severity level: ${level}`);
    }
  });

  it('schema should reject invalid severity level "high"', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(!schema.enum.includes('high'), 'Invalid level "high" must not be in enum');
  });

  it('schema should reject invalid severity level "low"', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(!schema.enum.includes('low'), 'Invalid level "low" must not be in enum');
  });

  it('schema should reject invalid severity level "medium"', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(!schema.enum.includes('medium'), 'Invalid level "medium" must not be in enum');
  });

  it('schema should reject invalid severity level "invalid"', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.ok(!schema.enum.includes('invalid'), 'Invalid level "invalid" must not be in enum');
  });

  it('severity levels should be in expected order (blocker, critical, suggestion, nit)', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    assert.deepEqual(schema.enum, ['blocker', 'critical', 'suggestion', 'nit'],
      'Severity levels must be in canonical order');
  });
});
