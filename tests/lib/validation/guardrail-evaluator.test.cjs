'use strict';

/**
 * Tests for guardrail-evaluator.cjs
 * TDD RED phase: all tests written before implementation
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  parseGuardrails,
  evaluateGuardrail,
  evaluateAll,
} = require(path.join(
  __dirname,
  '../../../.claude/lib/validation/guardrail-evaluator.cjs'
));

// ---------------------------------------------------------------------------
// parseGuardrails
// ---------------------------------------------------------------------------

test('parseGuardrails extracts guardrails section from plan markdown', () => {
  const planContent = `# My Plan

## Tasks
- [ ] Task 1

## Guardrails
- type: required_files
  paths:
    - src/index.cjs
- type: required_fields
  fields:
    - summary

## Notes
Some notes here.
`;
  const result = parseGuardrails(planContent);
  assert.ok(Array.isArray(result), 'should return array');
  assert.equal(result.length, 2, 'should extract 2 guardrails');
  assert.equal(result[0].type, 'required_files');
  assert.deepEqual(result[0].paths, ['src/index.cjs']);
  assert.equal(result[1].type, 'required_fields');
  assert.deepEqual(result[1].fields, ['summary']);
});

test('parseGuardrails with no guardrails section returns empty array', () => {
  const result = parseGuardrails('');
  assert.ok(Array.isArray(result), 'should return array');
  assert.equal(result.length, 0, 'should return empty array for empty input');
});

test('parseGuardrails with plan that has no Guardrails heading returns empty array', () => {
  const planContent = `# My Plan\n\n## Tasks\n- [ ] Task 1\n`;
  const result = parseGuardrails(planContent);
  assert.ok(Array.isArray(result), 'should return array');
  assert.equal(result.length, 0, 'should return empty for no guardrails section');
});

// ---------------------------------------------------------------------------
// evaluateGuardrail — required_files
// ---------------------------------------------------------------------------

test('evaluateGuardrail required_files with missing file returns fail', () => {
  const guardrail = {
    type: 'required_files',
    paths: ['this-file-definitely-does-not-exist-12345.cjs'],
  };
  const result = evaluateGuardrail(guardrail, {});
  assert.equal(result.passed, false, 'should fail when file missing');
  assert.ok(result.reason, 'should have a reason');
});

test('evaluateGuardrail required_files with existing file returns pass', () => {
  // Use this test file itself as a known-existing file
  const guardrail = {
    type: 'required_files',
    paths: [__filename.replace(/\\/g, '/')],
  };
  const result = evaluateGuardrail(guardrail, {});
  assert.equal(result.passed, true, 'should pass when file exists');
});

// ---------------------------------------------------------------------------
// evaluateGuardrail — required_fields
// ---------------------------------------------------------------------------

test('evaluateGuardrail required_fields with field present returns pass', () => {
  const guardrail = { type: 'required_fields', fields: ['summary'] };
  const metadata = { summary: 'done' };
  const result = evaluateGuardrail(guardrail, metadata);
  assert.equal(result.passed, true, 'should pass when required field is present');
});

test('evaluateGuardrail required_fields with missing field returns fail', () => {
  const guardrail = { type: 'required_fields', fields: ['summary'] };
  const result = evaluateGuardrail(guardrail, {});
  assert.equal(result.passed, false, 'should fail when required field is missing');
  assert.ok(result.reason, 'should have a reason');
});

// ---------------------------------------------------------------------------
// evaluateGuardrail — no_stubs
// ---------------------------------------------------------------------------

test('evaluateGuardrail no_stubs uses stub-patterns to check file content', () => {
  // Passes a non-existent path — evaluator should handle gracefully (treated as pass or skip)
  const guardrail = {
    type: 'no_stubs',
    paths: ['this-path-does-not-exist-abc.cjs'],
  };
  const result = evaluateGuardrail(guardrail, {});
  // Non-existent file: either pass (nothing to check) or fail with a reason
  assert.ok(typeof result.passed === 'boolean', 'passed must be a boolean');
});

// ---------------------------------------------------------------------------
// evaluateAll
// ---------------------------------------------------------------------------

test('evaluateAll with mode:warn returns warnings not blocks', () => {
  const guardrails = [
    {
      type: 'required_files',
      paths: ['this-file-definitely-does-not-exist-xyz.cjs'],
      mode: 'warn',
    },
  ];
  const { passed, warnings, blocks } = evaluateAll(guardrails, {}, { mode: 'warn' });
  assert.equal(typeof passed, 'boolean', 'passed must be boolean');
  assert.ok(Array.isArray(warnings), 'warnings must be array');
  assert.ok(Array.isArray(blocks), 'blocks must be array');
  assert.ok(warnings.length > 0, 'should have at least one warning');
  assert.equal(blocks.length, 0, 'should have no blocks in warn mode');
});

test('evaluateAll with mode:block returns blocks', () => {
  const guardrails = [
    {
      type: 'required_files',
      paths: ['this-file-definitely-does-not-exist-xyz.cjs'],
      mode: 'block',
    },
  ];
  const { passed, warnings, blocks } = evaluateAll(guardrails, {}, { mode: 'block' });
  assert.equal(typeof passed, 'boolean', 'passed must be boolean');
  assert.ok(Array.isArray(warnings), 'warnings must be array');
  assert.ok(Array.isArray(blocks), 'blocks must be array');
  assert.ok(blocks.length > 0, 'should have at least one block');
});

test('evaluateAll with empty guardrails returns pass-through', () => {
  const { passed, warnings, blocks } = evaluateAll([], {});
  assert.equal(passed, true, 'should pass with no guardrails');
  assert.equal(warnings.length, 0, 'should have no warnings');
  assert.equal(blocks.length, 0, 'should have no blocks');
});
