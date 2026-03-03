'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_VALIDATOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'utils',
  'schema-validator.cjs'
);
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'skill-definition.schema.json');

// =============================================================================
// skill-definition.schema.json validation tests
// =============================================================================

test('skill-definition schema can be compiled by createValidator', () => {
  const { createValidator } = require(SCHEMA_VALIDATOR_PATH);
  const validator = createValidator(SCHEMA_PATH);
  assert.ok(validator, 'Should compile skill-definition schema');
  assert.strictEqual(typeof validator, 'function');
});

// ---------------------------------------------------------------------------
// Schema structure: required fields must be explicit at the top level
// ---------------------------------------------------------------------------

test('schema required array explicitly contains name and description', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.ok(Array.isArray(schema.required), 'schema.required should be an array');
  assert.ok(schema.required.includes('name'), 'schema.required should include "name"');
  assert.ok(
    schema.required.includes('description'),
    'schema.required should include "description"'
  );
});

// ---------------------------------------------------------------------------
// Direct top-level frontmatter format (what actual SKILL.md files use)
// ---------------------------------------------------------------------------

test('valid direct frontmatter with name and description passes', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const validFrontmatter = {
    name: 'test-skill',
    description: 'A test skill used for validation testing purposes only',
    model: 'sonnet',
    tools: ['Read', 'Write'],
  };

  const result = validateData(validFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'Direct frontmatter with name+description should pass');
});

test('real-world tdd skill frontmatter passes validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const tddFrontmatter = {
    name: 'tdd',
    description:
      'Canon TDD for humans and AI agents. Use for production code changes by writing tests first, proving RED, implementing minimal GREEN, and refactoring safely.',
    version: '1.2.0',
    model: 'sonnet',
    invoked_by: 'both',
    user_invocable: true,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    aliases: ['testing-expert'],
    best_practices: ['Keep a visible test scenario backlog and execute one scenario at a time'],
    error_handling: 'strict',
    streaming: 'supported',
    verified: true,
    lastVerifiedAt: '2026-02-18T21:55:39.677Z',
  };

  const result = validateData(tddFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'TDD skill frontmatter should pass');
});

test('real-world security-architect skill frontmatter passes validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const secFrontmatter = {
    name: 'security-architect',
    description:
      'Security architecture and threat modeling. OWASP Top 10 2025 analysis, OWASP Agentic AI Top 10 (ASI01-ASI10), AI/LLM security patterns, supply chain security, modern API authentication (OAuth 2.1, DPoP, Passkeys/WebAuthn), vulnerability assessment, and security review for code and infrastructure.',
    version: '1.1.0',
    model: 'sonnet',
    invoked_by: 'both',
    user_invocable: true,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    best_practices: ['Apply defense in depth', 'Follow principle of least privilege'],
    error_handling: 'graceful',
    streaming: 'supported',
    verified: true,
    lastVerifiedAt: '2026-02-22T00:00:00.000Z',
  };

  const result = validateData(secFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, true, 'Security-architect skill frontmatter should pass');
});

// ---------------------------------------------------------------------------
// Negative cases: missing or invalid required fields
// ---------------------------------------------------------------------------

test('empty object fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const result = validateData({}, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Empty object should fail');
});

test('missing name at top level fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    description: 'A test skill used for validation testing purposes only',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Missing top-level name should fail');
});

test('missing description at top level fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    name: 'test-skill',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Missing top-level description should fail');
});

test('invalid name pattern fails validation', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    name: 'InvalidCapitalizedName',
    description: 'A test skill used for validation testing purposes only',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Invalid name pattern should fail');
});

test('short description fails validation (minLength)', () => {
  const { validateData } = require(SCHEMA_VALIDATOR_PATH);

  const invalidFrontmatter = {
    name: 'test-skill',
    description: 'Too short',
  };

  const result = validateData(invalidFrontmatter, SCHEMA_PATH);
  assert.strictEqual(result.valid, false, 'Short description should fail');
});

test('create.cjs _SCHEMA_PATH references existing schema file', () => {
  assert.ok(
    fs.existsSync(SCHEMA_PATH),
    'skill-definition.schema.json should exist at expected path'
  );
});
