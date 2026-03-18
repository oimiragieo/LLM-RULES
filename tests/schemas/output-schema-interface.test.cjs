'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schemasDir = path.resolve(__dirname, '..', '..', '.claude', 'schemas');

function loadValidator(filename) {
  const ajv = new Ajv({ allErrors: true });
  const schema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, filename), 'utf8')
  );
  return ajv.compile(schema);
}

// --- task-output.schema.json ---

describe('task-output.schema.json', () => {
  const schemaFile = 'task-output.schema.json';
  const schemaPath = path.join(schemasDir, schemaFile);

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema not found at ${schemaPath}`);
  });

  test('schema should be valid JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true });
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(ajv.validateSchema(schema), 'Schema should be a valid JSON Schema');
  });

  test('validates a well-formed task output', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      summary: 'Implemented JWT auth middleware',
      status: 'success',
      filesModified: ['src/auth/jwt.ts', 'src/middleware/auth.ts'],
      keyDecisions: ['JWT over sessions'],
      completedAt: '2026-03-18T10:00:00Z',
    });
    assert.ok(valid, `Should validate: ${JSON.stringify(validate.errors)}`);
  });

  test('rejects output missing required summary', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({ status: 'success', filesModified: [] });
    assert.strictEqual(valid, false, 'Should reject missing summary');
  });

  test('rejects output missing required status', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({ summary: 'Did something', filesModified: [] });
    assert.strictEqual(valid, false, 'Should reject missing status');
  });

  test('rejects invalid status enum value', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      summary: 'Did something',
      status: 'unknown-status',
      filesModified: [],
    });
    assert.strictEqual(valid, false, 'Should reject invalid status');
  });

  test('accepts minimal output (required fields only)', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      summary: 'Quick fix',
      status: 'success',
      filesModified: [],
    });
    assert.ok(
      valid,
      `Minimal output should validate: ${JSON.stringify(validate.errors)}`
    );
  });

  test('accepts all optional fields', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      summary: 'Full output',
      status: 'partial',
      filesModified: ['a.js'],
      keyDecisions: ['chose X over Y'],
      discoveries: ['found legacy code'],
      deviations: [{ rule: 'DR-1', description: 'auto-fixed typo' }],
      tokensEstimated: 50000,
      completedAt: '2026-03-18T10:00:00Z',
    });
    assert.ok(
      valid,
      `Full output should validate: ${JSON.stringify(validate.errors)}`
    );
  });

  test('backward-compatible with current TaskUpdate metadata', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      summary: 'Existing format',
      status: 'success',
      filesModified: ['file.js'],
      completedAt: '2026-03-18T10:00:00Z',
    });
    assert.ok(valid, 'Should be backward-compatible with existing metadata');
  });
});

// --- guardrail-result.schema.json ---

describe('guardrail-result.schema.json', () => {
  const schemaFile = 'guardrail-result.schema.json';
  const schemaPath = path.join(schemasDir, schemaFile);

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema not found at ${schemaPath}`);
  });

  test('schema should be valid JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true });
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(ajv.validateSchema(schema), 'Schema should be a valid JSON Schema');
  });

  test('validates a passing guardrail result', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      passed: true,
      checks: [
        {
          name: 'schema-validation',
          passed: true,
          message: 'Output matches schema',
        },
        { name: 'completeness', passed: true, message: 'All fields present' },
      ],
    });
    assert.ok(
      valid,
      `Should validate passing result: ${JSON.stringify(validate.errors)}`
    );
  });

  test('validates a failing guardrail result with retry info', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      passed: false,
      checks: [
        {
          name: 'schema-validation',
          passed: false,
          message: 'Missing summary field',
        },
      ],
      retryCount: 2,
      circuitBreakerTripped: true,
      escalated: true,
    });
    assert.ok(
      valid,
      `Should validate failing result: ${JSON.stringify(validate.errors)}`
    );
  });

  test('rejects result missing passed field', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      checks: [{ name: 'test', passed: true, message: 'ok' }],
    });
    assert.strictEqual(valid, false, 'Should reject missing passed');
  });

  test('rejects result missing checks array', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({ passed: true });
    assert.strictEqual(valid, false, 'Should reject missing checks');
  });
});

// --- failure-taxonomy.schema.json ---

describe('failure-taxonomy.schema.json', () => {
  const schemaFile = 'failure-taxonomy.schema.json';
  const schemaPath = path.join(schemasDir, schemaFile);

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema not found at ${schemaPath}`);
  });

  test('schema should be valid JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true });
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(ajv.validateSchema(schema), 'Schema should be a valid JSON Schema');
  });

  test('validates all 10 failure categories', () => {
    const validate = loadValidator(schemaFile);
    const categories = [
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
    for (const category of categories) {
      const valid = validate({ category, severity: 'medium' });
      assert.ok(
        valid,
        `Category '${category}' should validate: ${JSON.stringify(validate.errors)}`
      );
    }
  });

  test('rejects unknown category', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      category: 'not-a-real-category',
      severity: 'low',
    });
    assert.strictEqual(valid, false, 'Should reject unknown category');
  });

  test('validates all severity levels', () => {
    const validate = loadValidator(schemaFile);
    for (const severity of ['low', 'medium', 'high', 'critical']) {
      const valid = validate({ category: 'timeout', severity });
      assert.ok(valid, `Severity '${severity}' should validate`);
    }
  });

  test('accepts optional description and metadata', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      category: 'scope-drift',
      severity: 'high',
      description: 'Agent started refactoring unrelated code',
      taskId: 'task-5',
      agentType: 'developer',
      timestamp: '2026-03-18T12:00:00Z',
    });
    assert.ok(
      valid,
      `Full failure entry should validate: ${JSON.stringify(validate.errors)}`
    );
  });

  test('other category accepts free text description', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({
      category: 'other',
      severity: 'low',
      description: 'Custom failure type not in standard categories',
    });
    assert.ok(valid, 'Other category with description should validate');
  });

  test('rejects missing required category', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({ severity: 'low' });
    assert.strictEqual(valid, false, 'Should reject missing category');
  });

  test('rejects missing required severity', () => {
    const validate = loadValidator(schemaFile);
    const valid = validate({ category: 'timeout' });
    assert.strictEqual(valid, false, 'Should reject missing severity');
  });
});
