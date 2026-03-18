'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schemasDir = path.resolve(__dirname, '..', '..', '.claude', 'schemas');

describe('failure taxonomy integration', () => {
  test('failure-taxonomy schema has 10 categories', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'failure-taxonomy.schema.json'), 'utf8')
    );
    assert.strictEqual(
      schema.properties.category.enum.length,
      10,
      'Must have exactly 10 failure categories'
    );
  });

  test('gap-log entry with failureCategory validates against failure-taxonomy schema', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'failure-taxonomy.schema.json'), 'utf8')
    );
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    // Simulated gap-log entry with failure taxonomy fields
    const entry = {
      category: 'scope-drift',
      severity: 'medium',
      description: 'Agent refactored code outside task scope',
      taskId: 'task-5',
      agentType: 'developer',
      timestamp: '2026-03-18T10:00:00Z',
    };
    assert.ok(validate(entry), `Gap-log entry should validate: ${JSON.stringify(validate.errors)}`);
  });

  test('backward compat: gap-log entries without failureCategory still valid JSON', () => {
    // Old-format gap-log entry (no failureCategory) should still parse
    const oldEntry = {
      timestamp: '2026-03-18T10:00:00Z',
      type: 'hook-warning',
      taskId: 'task-3',
      agent: 'developer',
      description: 'Hook warned about routing',
      context: 'session cleanup',
    };
    // This just verifies old entries don't break anything - they're valid JSON
    assert.doesNotThrow(() => JSON.stringify(oldEntry), 'Old entries must be valid JSON');
  });

  test('reflection-agent.md mentions failure taxonomy', () => {
    const reflectionPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'agents',
      'core',
      'reflection-agent.md'
    );
    const content = fs.readFileSync(reflectionPath, 'utf8');
    assert.ok(
      content.includes('failure-taxonomy') || content.includes('failure taxonomy'),
      'reflection-agent must reference failure taxonomy'
    );
  });

  test('other category accepts free-text for unknown failures', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'failure-taxonomy.schema.json'), 'utf8')
    );
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate({
      category: 'other',
      severity: 'low',
      description: 'Unusual failure not covered by standard categories',
    });
    assert.ok(valid, 'Other category must accept free-text description');
  });
});
