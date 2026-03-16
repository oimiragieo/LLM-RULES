'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('workflow-snapshot schema', () => {
  const schemaPath = path.resolve(
    __dirname,
    '..',
    '..',
    '.claude',
    'schemas',
    'workflow-snapshot.schema.json'
  );

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath));
  });

  test('schema should have all expected properties', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties.workflow_id);
    assert.ok(schema.properties.current_step);
    assert.ok(schema.properties.total_steps);
    assert.ok(schema.properties.steps_completed);
    assert.ok(schema.properties.last_task_metadata);
    assert.ok(schema.properties.key_findings);
    assert.ok(schema.properties.timestamp);
    assert.ok(schema.properties.resumable);
  });

  test('required fields should be workflow_id, current_step, total_steps, steps_completed, timestamp', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const required = schema.required;
    assert.ok(required.includes('workflow_id'));
    assert.ok(required.includes('current_step'));
    assert.ok(required.includes('total_steps'));
    assert.ok(required.includes('steps_completed'));
    assert.ok(required.includes('timestamp'));
  });

  test('current_step should have minimum of 0', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.current_step.minimum, 0);
  });

  test('total_steps should have minimum of 1', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.total_steps.minimum, 1);
  });

  test('steps_completed should be an array type', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.properties.steps_completed.type, 'array');
  });

  test('last_task_metadata and key_findings should NOT be required', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(!schema.required.includes('last_task_metadata'));
    assert.ok(!schema.required.includes('key_findings'));
  });

  test('schema title should be Workflow Execution Snapshot', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schema.title, 'Workflow Execution Snapshot');
  });
});
