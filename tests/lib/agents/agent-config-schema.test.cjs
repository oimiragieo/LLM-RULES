'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'agents', 'agent-config.cjs');

// =============================================================================
// agent-config.schema.json wired into agent-config.cjs
// =============================================================================

test('agent-config.cjs exports validateConfig method', () => {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const agentConfig = require(CONFIG_PATH);
  assert.strictEqual(
    typeof agentConfig.validateConfig,
    'function',
    'Should expose validateConfig method'
  );
});

test('validateConfig validates agent-config.json against schema', () => {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const agentConfig = require(CONFIG_PATH);

  const result = agentConfig.validateConfig();
  // Result should have valid/errors/skipped fields
  assert.ok(result !== null && typeof result === 'object', 'Should return result object');
  assert.strictEqual(typeof result.valid, 'boolean', 'Should have valid boolean');
});

test('validateConfig validates conforming data', () => {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-config.schema.json');

  const validConfig = {
    version: '1.0.0',
    agents: {
      developer: {
        tools: ['Read', 'Write'],
        thinkingDefault: 'medium',
        phase: 'implement',
      },
    },
  };

  const result = validateData(validConfig, schemaPath);
  assert.strictEqual(result.valid, true, 'Valid config should pass');
});

test('validateConfig detects missing required fields', () => {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-config.schema.json');

  const invalidConfig = {
    // Missing version and agents (both required)
  };

  const result = validateData(invalidConfig, schemaPath);
  assert.strictEqual(result.valid, false, 'Missing required fields should fail');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.errors.length > 0, 'Should have errors');
});

test('validateConfig degrades gracefully with null input', () => {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const { validateData } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'schema-validator.cjs')
  );
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-config.schema.json');

  const result = validateData(null, schemaPath);
  assert.strictEqual(result.valid, true, 'Should degrade gracefully for null');
  assert.strictEqual(result.skipped, true, 'Should indicate skipped');
});
