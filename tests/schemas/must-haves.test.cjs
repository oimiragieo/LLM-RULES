'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('must-haves schema', () => {
  const schemaPath = path.resolve(__dirname, '..', '..', '.claude', 'schemas', 'must-haves.schema.json');

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath));
  });

  test('schema should have truths, artifacts, key_links properties', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties.truths);
    assert.ok(schema.properties.artifacts);
    assert.ok(schema.properties.key_links);
  });

  test('truths and artifacts should be required', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.required.includes('truths'));
    assert.ok(schema.required.includes('artifacts'));
  });

  test('key_links should NOT be required', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(!schema.required.includes('key_links'));
  });

  test('truths and artifacts should be array types', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.truths.type, 'array');
    assert.strictEqual(schema.properties.artifacts.type, 'array');
  });

  test('schema title should be Must-Haves Verification Schema', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.title, 'Must-Haves Verification Schema');
  });
});
