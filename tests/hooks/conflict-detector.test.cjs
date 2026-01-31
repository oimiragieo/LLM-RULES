#!/usr/bin/env node
/**
 * Tests for conflict-detector.cjs
 *
 * Tests the conflict detector hook which prevents naming conflicts
 * when creating new artifact files (agents, skills, workflows).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('\n=== conflict-detector.cjs tests ===\n');

// Import the module under test
const {
  getEnforcementMode,
  extractArtifactName,
  isValidArtifactName,
  checkNameConflict,
  ARTIFACT_CATEGORIES,
  NAME_PATTERN,
} = require('../../.claude/hooks/evolution/conflict-detector.cjs');

// Test: Module exports exist
test('exports getEnforcementMode function', () => {
  assertEqual(typeof getEnforcementMode, 'function', 'Should export function');
});

test('exports extractArtifactName function', () => {
  assertEqual(typeof extractArtifactName, 'function', 'Should export function');
});

test('exports isValidArtifactName function', () => {
  assertEqual(typeof isValidArtifactName, 'function', 'Should export function');
});

test('exports checkNameConflict function', () => {
  assertEqual(typeof checkNameConflict, 'function', 'Should export function');
});

test('exports ARTIFACT_CATEGORIES constant', () => {
  assertEqual(Array.isArray(ARTIFACT_CATEGORIES), true, 'Should export array');
  assertEqual(ARTIFACT_CATEGORIES.includes('agents'), true, 'Should include agents');
  assertEqual(ARTIFACT_CATEGORIES.includes('skills'), true, 'Should include skills');
  assertEqual(ARTIFACT_CATEGORIES.includes('workflows'), true, 'Should include workflows');
});

test('exports NAME_PATTERN constant', () => {
  assertEqual(NAME_PATTERN instanceof RegExp, true, 'Should export RegExp');
});

// Test: getEnforcementMode
test('getEnforcementMode returns block by default', () => {
  const originalEnv = process.env.CONFLICT_DETECTOR;
  delete process.env.CONFLICT_DETECTOR;
  assertEqual(getEnforcementMode(), 'block', 'Default should be block');
  process.env.CONFLICT_DETECTOR = originalEnv;
});

test('getEnforcementMode respects CONFLICT_DETECTOR env var', () => {
  const originalEnv = process.env.CONFLICT_DETECTOR;
  process.env.CONFLICT_DETECTOR = 'warn';
  assertEqual(getEnforcementMode(), 'warn', 'Should be warn');
  process.env.CONFLICT_DETECTOR = 'off';
  assertEqual(getEnforcementMode(), 'off', 'Should be off');
  process.env.CONFLICT_DETECTOR = originalEnv;
});

test('getEnforcementMode defaults to block for invalid values', () => {
  const originalEnv = process.env.CONFLICT_DETECTOR;
  process.env.CONFLICT_DETECTOR = 'invalid';
  assertEqual(getEnforcementMode(), 'block', 'Should default to block');
  process.env.CONFLICT_DETECTOR = originalEnv;
});

// Test: extractArtifactName
test('extractArtifactName extracts agent name from path', () => {
  assertEqual(
    extractArtifactName('.claude/agents/core/new-agent.md'),
    'new-agent',
    'Should extract agent name'
  );
  assertEqual(
    extractArtifactName('.claude/agents/domain/python-pro.md'),
    'python-pro',
    'Should extract domain agent name'
  );
});

test('extractArtifactName extracts skill name from path', () => {
  assertEqual(
    extractArtifactName('.claude/skills/new-skill/SKILL.md'),
    'new-skill',
    'Should extract skill name'
  );
  assertEqual(
    extractArtifactName('.claude/skills/tdd/SKILL.md'),
    'tdd',
    'Should extract tdd skill name'
  );
});

test('extractArtifactName extracts workflow name from path', () => {
  assertEqual(
    extractArtifactName('.claude/workflows/core/new-workflow.md'),
    'new-workflow',
    'Should extract workflow name'
  );
});

test('extractArtifactName returns null for non-artifact paths', () => {
  assertEqual(extractArtifactName('.claude/settings.json'), null, 'Should return null');
  assertEqual(extractArtifactName('src/index.ts'), null, 'Should return null');
});

test('extractArtifactName handles null/undefined', () => {
  assertEqual(extractArtifactName(null), null, 'Should return null');
  assertEqual(extractArtifactName(undefined), null, 'Should return null');
  assertEqual(extractArtifactName(''), null, 'Should return null');
});

// Test: isValidArtifactName
test('isValidArtifactName accepts valid kebab-case names', () => {
  assertEqual(isValidArtifactName('tdd'), true, 'Should accept short name');
  assertEqual(isValidArtifactName('python-pro'), true, 'Should accept kebab-case');
  assertEqual(isValidArtifactName('mobile-ux-reviewer'), true, 'Should accept multi-part');
  assertEqual(isValidArtifactName('c4-context'), true, 'Should accept with number');
});

test('isValidArtifactName rejects invalid names', () => {
  assertEqual(isValidArtifactName('Python-Pro'), false, 'Should reject uppercase');
  assertEqual(isValidArtifactName('PythonPro'), false, 'Should reject PascalCase');
  assertEqual(isValidArtifactName('python_pro'), false, 'Should reject snake_case');
  assertEqual(isValidArtifactName('python pro'), false, 'Should reject spaces');
  assertEqual(isValidArtifactName('123-agent'), false, 'Should reject starting with number');
  assertEqual(isValidArtifactName('-invalid'), false, 'Should reject starting with dash');
});

test('isValidArtifactName handles null/undefined', () => {
  assertEqual(isValidArtifactName(null), false, 'Should reject null');
  assertEqual(isValidArtifactName(undefined), false, 'Should reject undefined');
  assertEqual(isValidArtifactName(''), false, 'Should reject empty string');
});

// Test: checkNameConflict
test('checkNameConflict returns conflict for existing agent', () => {
  // Test against known existing agent 'developer'
  const result = checkNameConflict('developer', 'agents');
  assertEqual(result.hasConflict, true, 'Should detect conflict');
  assertEqual(result.category, 'agents', 'Should report category');
});

test('checkNameConflict returns conflict for existing skill', () => {
  // Test against known existing skill 'tdd'
  const result = checkNameConflict('tdd', 'skills');
  assertEqual(result.hasConflict, true, 'Should detect conflict');
  assertEqual(result.category, 'skills', 'Should report category');
});

test('checkNameConflict returns no conflict for unique name', () => {
  // Test with unique name
  const result = checkNameConflict('unique-name-12345', 'agents');
  assertEqual(result.hasConflict, false, 'Should not detect conflict');
});

test('checkNameConflict handles null/undefined', () => {
  const result1 = checkNameConflict(null, 'agents');
  assertEqual(result1.hasConflict, false, 'Should not conflict for null');

  const result2 = checkNameConflict('test', null);
  assertEqual(result2.hasConflict, false, 'Should not conflict for null category');
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
