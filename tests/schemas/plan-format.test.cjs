'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('plan-format schema', () => {
  const schemaPath = path.resolve(
    __dirname,
    '..',
    '..',
    '.claude',
    'schemas',
    'plan-format.schema.json'
  );

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema not found at ${schemaPath}`);
  });

  test('schema should be valid JSON with $schema and title', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.$schema, 'schema must have $schema field');
    assert.ok(schema.title, 'schema must have title field');
    assert.strictEqual(schema.type, 'object');
  });

  test('schema should have top-level plan properties', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties.title, 'schema must have title property');
    assert.ok(schema.properties.phases, 'schema must have phases property');
  });

  test('phases should be an array', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.phases.type, 'array');
  });

  test('phase items should have tasks array', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    assert.ok(phaseItems, 'phases must have items definition');
    assert.ok(phaseItems.properties.tasks, 'phase items must have tasks');
    assert.strictEqual(phaseItems.properties.tasks.type, 'array');
  });

  test('task items should have required id and description', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    assert.ok(taskItems, 'tasks must have items definition');
    assert.ok(taskItems.properties.id, 'task must have id property');
    assert.ok(taskItems.properties.description, 'task must have description property');
    assert.ok(Array.isArray(taskItems.required), 'task must have required array');
    assert.ok(taskItems.required.includes('id'), 'task id must be required');
    assert.ok(taskItems.required.includes('description'), 'task description must be required');
  });

  test('task items should have optional verify field', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    assert.ok(taskItems.properties.verify, 'task must have verify property');
    assert.strictEqual(taskItems.properties.verify.type, 'string', 'verify must be a string');
    // verify should NOT be in required
    assert.ok(
      !taskItems.required.includes('verify'),
      'verify must be optional (not in required array)'
    );
  });

  test('task items should have optional done field', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    assert.ok(taskItems.properties.done, 'task must have done property');
    assert.strictEqual(taskItems.properties.done.type, 'string', 'done must be a string');
    // done should NOT be in required
    assert.ok(
      !taskItems.required.includes('done'),
      'done must be optional (not in required array)'
    );
  });

  test('task items should have optional files field as array', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    assert.ok(taskItems.properties.files, 'task must have files property');
    assert.strictEqual(taskItems.properties.files.type, 'array', 'files must be an array');
    assert.ok(taskItems.properties.files.items, 'files must have items definition');
    assert.strictEqual(
      taskItems.properties.files.items.type,
      'string',
      'files items must be strings'
    );
    // files should NOT be in required
    assert.ok(
      !taskItems.required.includes('files'),
      'files must be optional (not in required array)'
    );
  });

  test('task items should have optional command and rollback fields', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    assert.ok(taskItems.properties.command, 'task must have command property');
    assert.ok(taskItems.properties.rollback, 'task must have rollback property');
    assert.ok(!taskItems.required.includes('command'), 'command must be optional');
    assert.ok(!taskItems.required.includes('rollback'), 'rollback must be optional');
  });

  test('plan title should be required', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(Array.isArray(schema.required), 'plan must have required array');
    assert.ok(schema.required.includes('title'), 'plan title must be required');
  });

  test('schema should support backward-compatible plans without verify/done/files', () => {
    // This test validates that the schema allows tasks without the new fields
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const phaseItems = schema.properties.phases.items;
    const taskItems = phaseItems.properties.tasks.items;
    // A task with only id and description should be valid (new fields optional)
    const minimalTask = { id: '1.1', description: 'Some task' };
    // Verify none of the new fields appear in required
    const newFields = ['verify', 'done', 'files'];
    for (const field of newFields) {
      assert.ok(
        !taskItems.required.includes(field),
        `${field} must not be required for backward compatibility`
      );
    }
    // If schema has additionalProperties check, minimal task won't fail
    // Just verify properties exist as optional
    for (const field of newFields) {
      assert.ok(taskItems.properties[field], `${field} must be defined as a property`);
    }
    // Suppress unused variable lint
    void minimalTask;
  });

  test('schema title should be Plan Format', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.title, 'Plan Format');
  });
});
