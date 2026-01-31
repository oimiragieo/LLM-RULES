'use strict';

/**
 * Tests for hook-creator SKILL.md v2.1.0 updates
 *
 * TDD: RED -> GREEN -> REFACTOR
 * These tests verify that the required updates are present in the skill file.
 */

const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, 'SKILL.md');

// Test framework
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toContain(substring) {
      if (!actual.includes(substring)) {
        throw new Error(`Expected content to contain "${substring.substring(0, 50)}..."`);
      }
    },
    toMatch(regex) {
      if (!regex.test(actual)) {
        throw new Error(`Expected content to match ${regex}`);
      }
    },
  };
}

console.log('\n=== hook-creator SKILL.md v2.1.0 Tests ===\n');

// Read skill file
let skillContent;
try {
  skillContent = fs.readFileSync(SKILL_PATH, 'utf8');
} catch (_error) {
  console.error('FATAL: Cannot read SKILL.md file');
  process.exit(1);
}

console.log('1. Version Update Tests:');

test('should have version 2.1.0 in frontmatter', () => {
  expect(skillContent).toMatch(/version:\s*2\.1\.0/);
});

console.log('\n2. Reference Hook Section Tests:');

test('should have Reference Hook section', () => {
  expect(skillContent).toContain('### Reference Hook');
});

test('should reference router-enforcer.cjs as canonical', () => {
  expect(skillContent).toContain('router-enforcer.cjs');
  expect(skillContent).toContain('canonical reference');
});

test('should have checklist items for CommonJS exports', () => {
  expect(skillContent).toContain('CommonJS exports');
  expect(skillContent).toContain('module.exports');
});

test('should have checklist item for comprehensive test file', () => {
  expect(skillContent).toContain('test file');
  expect(skillContent).toContain('.test.cjs');
});

test('should have checklist item for error handling', () => {
  expect(skillContent).toContain('error handling');
});

test('should have checklist item for response format', () => {
  expect(skillContent).toContain('response format');
});

console.log('\n3. System Impact Analysis Strengthening Tests:');

test('should mark System Impact Analysis as MANDATORY', () => {
  expect(skillContent).toMatch(/System Impact Analysis.*\(MANDATORY\)/i);
});

test('should have BLOCKING label for settings registration', () => {
  expect(skillContent).toContain('Settings Registration (BLOCKING)');
});

test('should have BLOCKING label for test coverage', () => {
  expect(skillContent).toContain('Test Coverage (BLOCKING)');
});

test('should require minimum 10 test cases', () => {
  expect(skillContent).toContain('minimum 10 test cases');
});

test('should have grep verification command', () => {
  expect(skillContent).toContain('grep');
  expect(skillContent).toContain('settings.json');
});

test('should have test run command example', () => {
  expect(skillContent).toContain('node .claude/hooks/');
  expect(skillContent).toContain('.test.cjs');
});

test('should have BLOCKING warning at end', () => {
  expect(skillContent).toContain(
    '**BLOCKING**: If ANY item above is missing, hook creation is INCOMPLETE.'
  );
});

console.log('\n4. Integration Tests:');

test('should have proper markdown structure', () => {
  // Check for main sections
  expect(skillContent).toContain('# Hook Creator Skill');
  expect(skillContent).toContain('## Overview');
  expect(skillContent).toContain('## Hook Types');
  expect(skillContent).toContain('## Workflow Steps');
  expect(skillContent).toContain('## Iron Laws');
});

test('should preserve existing Iron Laws', () => {
  expect(skillContent).toContain('NO HOOK WITHOUT validate() EXPORT');
  expect(skillContent).toContain('NO HOOK WITHOUT main() FOR CLI');
  expect(skillContent).toContain('NO HOOK WITHOUT GRACEFUL DEGRADATION');
});

test('should preserve Memory Protocol section', () => {
  expect(skillContent).toContain('## Memory Protocol (MANDATORY)');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\nSome tests failed. Run update to fix.');
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
