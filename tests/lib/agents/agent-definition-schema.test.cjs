'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PARSER_PATH = path.join(PROJECT_ROOT, '.claude', 'lib', 'agents', 'agent-parser.cjs');

// =============================================================================
// agent-definition.schema.json wired into agent-parser.cjs
// =============================================================================

test('AgentParser exports validateDefinition method', () => {
  delete require.cache[require.resolve(PARSER_PATH)];
  const { AgentParser } = require(PARSER_PATH);
  const parser = new AgentParser();
  assert.strictEqual(
    typeof parser.validateDefinition,
    'function',
    'Should expose validateDefinition method'
  );
});

test('validateDefinition validates conforming agent definition', () => {
  delete require.cache[require.resolve(PARSER_PATH)];
  const { AgentParser } = require(PARSER_PATH);
  const parser = new AgentParser();

  const validDef = {
    frontmatter: {
      name: 'test-agent',
      description: 'A test agent used for validating schema integration works correctly',
      tools: ['Read', 'Write'],
      model: 'sonnet',
    },
    content: 'x'.repeat(101), // minLength: 100
  };

  const result = parser.validateDefinition(validDef);
  assert.strictEqual(result.valid, true, 'Valid definition should pass');
});

test('validateDefinition detects missing required fields', () => {
  delete require.cache[require.resolve(PARSER_PATH)];
  const { AgentParser } = require(PARSER_PATH);
  const parser = new AgentParser();

  const invalidDef = {
    frontmatter: {
      // Missing name and description (both required)
    },
    content: 'x'.repeat(101),
  };

  const result = parser.validateDefinition(invalidDef);
  assert.strictEqual(result.valid, false, 'Missing required fields should fail');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.errors.length > 0, 'Should have errors');
});

test('validateDefinition detects invalid name pattern', () => {
  delete require.cache[require.resolve(PARSER_PATH)];
  const { AgentParser } = require(PARSER_PATH);
  const parser = new AgentParser();

  const invalidDef = {
    frontmatter: {
      name: 'Invalid_Name_With_Caps',
      description: 'A test agent used for validating schema integration works correctly',
    },
    content: 'x'.repeat(101),
  };

  const result = parser.validateDefinition(invalidDef);
  assert.strictEqual(result.valid, false, 'Invalid name pattern should fail');
});

test('validateDefinition degrades gracefully with null input', () => {
  delete require.cache[require.resolve(PARSER_PATH)];
  const { AgentParser } = require(PARSER_PATH);
  const parser = new AgentParser();

  const result = parser.validateDefinition(null);
  assert.strictEqual(result.valid, true, 'Should degrade gracefully for null');
  assert.strictEqual(result.skipped, true, 'Should indicate skipped');
});
