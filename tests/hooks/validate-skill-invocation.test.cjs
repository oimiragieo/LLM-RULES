#!/usr/bin/env node
/**
 * Tests for validate-skill-invocation.cjs
 *
 * Tests the skill invocation validator hook which ensures agents properly
 * use Skill() tool to invoke skills, rather than just Read()ing SKILL.md files.
 *
 * Test Categories:
 * 1. Module exports
 * 2. isSkillFile pattern matching
 * 3. extractSkillName from file paths
 * 4. validate function behavior
 * 5. Main execution with hook input
 * 6. Edge cases and error handling
 */

'use strict';

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
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertIncludes(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected string to include "${substring}", got "${str}"`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message || 'Assertion failed'}: expected truthy value, got ${value}`);
  }
}

function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message || 'Assertion failed'}: expected falsy value, got ${value}`);
  }
}

console.log('\n=== validate-skill-invocation.cjs tests ===\n');

// Import the module under test
const {
  validate,
  isSkillFile,
  extractSkillName,
  SKILL_PATH_PATTERN,
} = require('../../.claude/hooks/safety/validate-skill-invocation.cjs');

// ============================================================
// Module Exports Tests
// ============================================================

console.log('--- Module Exports ---');

test('exports validate function', () => {
  assertEqual(typeof validate, 'function', 'Should export validate function');
});

test('exports isSkillFile function', () => {
  assertEqual(typeof isSkillFile, 'function', 'Should export isSkillFile function');
});

test('exports extractSkillName function', () => {
  assertEqual(typeof extractSkillName, 'function', 'Should export extractSkillName function');
});

test('exports SKILL_PATH_PATTERN', () => {
  assertTrue(SKILL_PATH_PATTERN instanceof RegExp, 'Should export SKILL_PATH_PATTERN as RegExp');
});

// ============================================================
// isSkillFile Tests - Pattern Matching
// ============================================================

console.log('\n--- isSkillFile Pattern Matching ---');

test('isSkillFile returns true for valid skill file path (forward slashes)', () => {
  const filePath = '.claude/skills/tdd/SKILL.md';
  assertTrue(isSkillFile(filePath), 'Should recognize skill file with forward slashes');
});

test('isSkillFile returns true for valid skill file path (backslashes)', () => {
  const filePath = '.claude\\skills\\tdd\\SKILL.md';
  assertTrue(isSkillFile(filePath), 'Should recognize skill file with backslashes');
});

test('isSkillFile returns true for absolute path', () => {
  const filePath = '/home/user/.claude/skills/debugging/SKILL.md';
  assertTrue(isSkillFile(filePath), 'Should recognize absolute skill path');
});

test('isSkillFile returns true for Windows absolute path', () => {
  const filePath = 'C:\\.claude\\skills\\test-generator\\SKILL.md';
  assertTrue(isSkillFile(filePath), 'Should recognize Windows absolute path');
});

test('isSkillFile returns true for case-insensitive SKILL.md', () => {
  const filePath = '.claude/skills/tdd/skill.md';
  assertTrue(isSkillFile(filePath), 'Should be case-insensitive for SKILL.md');
});

test('isSkillFile returns false for non-skill file in skills directory', () => {
  const filePath = '.claude/skills/tdd/README.md';
  assertFalse(isSkillFile(filePath), 'Should not match README.md');
});

test('isSkillFile returns false for SKILL.md outside skills directory', () => {
  const filePath = '.claude/agents/core/SKILL.md';
  assertFalse(isSkillFile(filePath), 'Should not match SKILL.md outside skills/');
});

test('isSkillFile returns false for empty string', () => {
  assertFalse(isSkillFile(''), 'Should return false for empty string');
});

test('isSkillFile returns false for null', () => {
  assertFalse(isSkillFile(null), 'Should return false for null');
});

test('isSkillFile returns false for undefined', () => {
  assertFalse(isSkillFile(undefined), 'Should return false for undefined');
});

test('isSkillFile returns false for partial path match', () => {
  const filePath = 'skills/tdd/SKILL.md'; // missing .claude prefix
  assertFalse(isSkillFile(filePath), 'Should require .claude prefix');
});

test('isSkillFile returns false for similar but wrong path', () => {
  const filePath = '.claude/skills/SKILL.md'; // missing skill name folder
  assertFalse(isSkillFile(filePath), 'Should require skill-name folder');
});

test('isSkillFile returns false for deeply nested SKILL.md', () => {
  const filePath = '.claude/skills/test-generator/examples/SKILL.md';
  assertFalse(isSkillFile(filePath), 'Should not match SKILL.md in subdirectories');
});

test('isSkillFile returns false for SKILL.txt', () => {
  const filePath = '.claude/skills/tdd/SKILL.txt';
  assertFalse(isSkillFile(filePath), 'Should require .md extension');
});

// ============================================================
// extractSkillName Tests
// ============================================================

console.log('\n--- extractSkillName Tests ---');

test('extractSkillName extracts skill name from forward slash path', () => {
  const filePath = '.claude/skills/tdd/SKILL.md';
  assertEqual(extractSkillName(filePath), 'tdd', 'Should extract "tdd"');
});

test('extractSkillName extracts skill name from backslash path', () => {
  const filePath = '.claude\\skills\\debugging\\SKILL.md';
  assertEqual(extractSkillName(filePath), 'debugging', 'Should extract "debugging"');
});

test('extractSkillName extracts from absolute path', () => {
  const filePath = '/home/user/.claude/skills/test-generator/SKILL.md';
  assertEqual(extractSkillName(filePath), 'test-generator', 'Should extract "test-generator"');
});

test('extractSkillName handles hyphenated skill names', () => {
  const filePath = '.claude/skills/rule-auditor/SKILL.md';
  assertEqual(extractSkillName(filePath), 'rule-auditor', 'Should extract hyphenated name');
});

test('extractSkillName handles underscored skill names', () => {
  const filePath = '.claude/skills/code_analyzer/SKILL.md';
  assertEqual(extractSkillName(filePath), 'code_analyzer', 'Should extract underscored name');
});

test('extractSkillName returns null for invalid path', () => {
  const filePath = '.claude/agents/core/developer.md';
  assertEqual(extractSkillName(filePath), null, 'Should return null for non-skill path');
});

test('extractSkillName returns null for empty string', () => {
  assertEqual(extractSkillName(''), null, 'Should return null for empty string');
});

test('extractSkillName throws for null (edge case)', () => {
  // Current implementation doesn't guard against null - this is expected behavior
  try {
    extractSkillName(null);
    throw new Error('Should have thrown');
  } catch (err) {
    assertIncludes(err.message, 'match', 'Should throw when calling match on null');
  }
});

test('extractSkillName throws for undefined (edge case)', () => {
  // Current implementation doesn't guard against undefined - this is expected behavior
  try {
    extractSkillName(undefined);
    throw new Error('Should have thrown');
  } catch (err) {
    assertIncludes(err.message, 'match', 'Should throw when calling match on undefined');
  }
});

test('extractSkillName handles Windows paths with drive letter', () => {
  const filePath = 'C:\\Users\\dev\\.claude\\skills\\tdd\\SKILL.md';
  assertEqual(extractSkillName(filePath), 'tdd', 'Should extract from Windows path');
});

test('extractSkillName extracts first occurrence in nested paths', () => {
  const filePath = '.claude/skills/test-generator/examples/skills/another/SKILL.md';
  assertEqual(
    extractSkillName(filePath),
    'test-generator',
    'Should extract first skill name after skills/'
  );
});

// ============================================================
// validate Function Tests
// ============================================================

console.log('\n--- validate Function Behavior ---');

test('validate allows non-Read tools', () => {
  const context = {
    tool: 'Write',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow non-Read tools');
  assertEqual(result.error, '', 'Should have empty error');
});

test('validate allows Skill tool', () => {
  const context = {
    tool: 'Skill',
    parameters: { skill: 'tdd' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow Skill tool');
  assertEqual(result.error, '', 'Should have empty error');
});

test('validate allows Read of non-skill files', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/agents/core/developer.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow Read of non-skill files');
  assertEqual(result.error, '', 'Should have empty error');
  assertFalse(result.warning, 'Should not have warning for non-skill files');
});

test('validate returns warning for Read of skill file', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should still be valid (not blocking)');
  assertEqual(result.error, '', 'Should have empty error');
  assertTrue(result.warning, 'Should have warning');
  assertIncludes(result.warning, 'tdd', 'Warning should include skill name');
  assertIncludes(result.warning, 'Skill({ skill: "tdd" })', 'Warning should show correct syntax');
});

test('validate warning mentions Skill() tool', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/debugging/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning.toLowerCase(), 'skill()', 'Warning should mention Skill() tool');
});

test('validate handles missing file_path parameter', () => {
  const context = {
    tool: 'Read',
    parameters: {},
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow Read with missing file_path');
  assertFalse(result.warning, 'Should not have warning');
});

test('validate handles null parameters', () => {
  const context = {
    tool: 'Read',
    parameters: null,
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle null parameters gracefully');
});

test('validate handles undefined parameters', () => {
  const context = {
    tool: 'Read',
    parameters: undefined,
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle undefined parameters gracefully');
});

test('validate extracts skill name correctly in warning', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/test-generator/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning, 'test-generator', 'Should extract hyphenated skill name');
});

test('validate handles unknown skill name gracefully', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/SKILL.md' }, // Invalid path
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should still be valid');
  // Should handle extraction failure gracefully
});

test('validate warning includes workflow application note', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning.toLowerCase(), 'workflow', 'Should mention workflow application');
});

// ============================================================
// Edge Cases and Integration
// ============================================================

console.log('\n--- Edge Cases ---');

test('validate handles empty file path', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle empty file path');
  assertFalse(result.warning, 'Should not warn for empty path');
});

test('validate handles whitespace-only file path', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '   ' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle whitespace path');
  assertFalse(result.warning, 'Should not warn for whitespace path');
});

test('validate handles very long file path', () => {
  const longPath = '.claude/skills/' + 'a'.repeat(500) + '/SKILL.md';
  const context = {
    tool: 'Read',
    parameters: { file_path: longPath },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle long file paths');
});

test('validate handles special characters in skill name', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/test-@#$-generator/SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle special characters');
});

test('validate handles relative path with ../', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '../.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle relative paths');
});

test('validate handles mixed slashes in path', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude\\skills/tdd\\SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle mixed slashes');
  if (result.warning) {
    assertIncludes(result.warning, 'tdd', 'Should still extract skill name');
  }
});

test('validate handles case variations in SKILL.md', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/Skill.MD' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle case variations');
  assertTrue(result.warning, 'Should still warn for case variations');
});

test('validate with multiple slashes in skill path', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/nested/sub/folder/SKILL.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should handle nested paths');
});

test('validate does not warn for README in skills directory', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/README.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow README.md');
  assertFalse(result.warning, 'Should not warn for README.md');
});

test('validate does not warn for examples in skills directory', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/examples/example.md' },
  };
  const result = validate(context);
  assertTrue(result.valid, 'Should allow example files');
  assertFalse(result.warning, 'Should not warn for example files');
});

// ============================================================
// Pattern Validation
// ============================================================

console.log('\n--- SKILL_PATH_PATTERN Validation ---');

test('SKILL_PATH_PATTERN matches valid skill path', () => {
  assertTrue(SKILL_PATH_PATTERN.test('.claude/skills/tdd/SKILL.md'), 'Should match valid path');
});

test('SKILL_PATH_PATTERN is case-insensitive', () => {
  assertTrue(SKILL_PATH_PATTERN.test('.claude/skills/tdd/skill.md'), 'Should be case-insensitive');
  assertTrue(
    SKILL_PATH_PATTERN.test('.claude/SKILLS/tdd/SKILL.MD'),
    'Should be case-insensitive for entire pattern'
  );
});

test('SKILL_PATH_PATTERN handles both slash types', () => {
  assertTrue(SKILL_PATH_PATTERN.test('.claude\\skills\\tdd\\SKILL.md'), 'Should match backslashes');
});

test('SKILL_PATH_PATTERN does not match non-SKILL.md files', () => {
  assertFalse(
    SKILL_PATH_PATTERN.test('.claude/skills/tdd/README.md'),
    'Should not match README.md'
  );
  assertFalse(
    SKILL_PATH_PATTERN.test('.claude/skills/tdd/SKILL.txt'),
    'Should not match .txt extension'
  );
});

// ============================================================
// Warning Message Format
// ============================================================

console.log('\n--- Warning Message Format ---');

test('warning message includes REMINDER prefix', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning.toUpperCase(), 'REMINDER', 'Should include REMINDER prefix');
});

test('warning message includes proper Skill() syntax', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/code-analyzer/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning, 'Skill({', 'Should show proper Skill() syntax');
  assertIncludes(result.warning, 'skill:', 'Should show skill parameter');
});

test('warning message mentions reading is allowed', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(
    result.warning.toLowerCase(),
    'reading is allowed',
    'Should clarify reading is allowed'
  );
});

test('warning message mentions workflow application', () => {
  const context = {
    tool: 'Read',
    parameters: { file_path: '.claude/skills/tdd/SKILL.md' },
  };
  const result = validate(context);
  assertIncludes(result.warning.toLowerCase(), 'workflow', 'Should mention workflow');
});

// ============================================================
// Print Test Summary
// ============================================================

console.log('\n========================================');
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
