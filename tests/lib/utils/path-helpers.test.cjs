#!/usr/bin/env node
/**
 * Tests for path-helpers.cjs (SEC-ICE-001)
 *
 * Tests path normalization, artifact name validation, and path containment
 * validation to prevent path traversal attacks.
 */

'use strict';

const path = require('path');

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    failCount++;
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

// =============================================================================
// Test Suite
// =============================================================================

async function runTests() {
  console.log('Path Helpers Tests (SEC-ICE-001)');
  console.log('=================================');

  // Load module
  const pathHelpers = require('../../../.claude/lib/utils/path-helpers.cjs');

  await describe('normalizePath', async () => {
    await test('should convert backslashes to forward slashes', () => {
      const result = pathHelpers.normalizePath('C:\\Users\\test\\file.txt');
      assertEqual(result, 'C:/Users/test/file.txt', 'should have forward slashes');
    });

    await test('should handle paths with only forward slashes', () => {
      const result = pathHelpers.normalizePath('/usr/local/bin');
      assertEqual(result, '/usr/local/bin', 'should remain unchanged');
    });

    await test('should handle empty string', () => {
      const result = pathHelpers.normalizePath('');
      assertEqual(result, '', 'should return empty string');
    });

    await test('should handle null input', () => {
      const result = pathHelpers.normalizePath(null);
      assertEqual(result, '', 'should return empty string for null');
    });
  });

  await describe('extractArtifactName', async () => {
    await test('should extract name from regular file', () => {
      const result = pathHelpers.extractArtifactName('.claude/agents/core/developer.md');
      assertEqual(result, 'developer', 'should extract developer');
    });

    await test('should use parent dir name for SKILL.md files', () => {
      const result = pathHelpers.extractArtifactName('.claude/skills/tdd/SKILL.md');
      assertEqual(result, 'tdd', 'should extract tdd');
    });

    await test('should remove .schema suffix', () => {
      const result = pathHelpers.extractArtifactName('.claude/schemas/agent.schema.json');
      assertEqual(result, 'agent', 'should extract agent');
    });

    await test('should handle empty string', () => {
      const result = pathHelpers.extractArtifactName('');
      assertEqual(result, '', 'should return empty string');
    });
  });

  await describe('getParentDirName', async () => {
    await test('should extract parent directory name', () => {
      const result = pathHelpers.getParentDirName('.claude/skills/tdd/SKILL.md');
      assertEqual(result, 'tdd', 'should extract tdd');
    });

    await test('should return lowercase', () => {
      const result = pathHelpers.getParentDirName('.claude/skills/TDD/SKILL.md');
      assertEqual(result, 'tdd', 'should be lowercase');
    });

    await test('should handle empty string', () => {
      const result = pathHelpers.getParentDirName('');
      assertEqual(result, '', 'should return empty string');
    });
  });

  await describe('isValidArtifactName (SEC-ICE-001)', async () => {
    await test('should accept valid lowercase name with hyphens', () => {
      const result = pathHelpers.isValidArtifactName('agent-creator');
      assertEqual(result, true, 'should accept agent-creator');
    });

    await test('should accept single lowercase letter', () => {
      const result = pathHelpers.isValidArtifactName('a');
      assertEqual(result, true, 'should accept single letter');
    });

    await test('should accept name with numbers', () => {
      const result = pathHelpers.isValidArtifactName('skill-123-abc');
      assertEqual(result, true, 'should accept skill-123-abc');
    });

    await test('should reject path traversal with ../', () => {
      const result = pathHelpers.isValidArtifactName('../hack');
      assertEqual(result, false, 'should reject ../hack');
    });

    await test('should reject absolute paths', () => {
      const result = pathHelpers.isValidArtifactName('/etc/passwd');
      assertEqual(result, false, 'should reject /etc/passwd');
    });

    await test('should reject paths with dots', () => {
      const result = pathHelpers.isValidArtifactName('agent.md');
      assertEqual(result, false, 'should reject agent.md');
    });

    await test('should reject uppercase letters', () => {
      const result = pathHelpers.isValidArtifactName('Agent-Creator');
      assertEqual(result, false, 'should reject Agent-Creator');
    });

    await test('should reject names with spaces', () => {
      const result = pathHelpers.isValidArtifactName('agent creator');
      assertEqual(result, false, 'should reject names with spaces');
    });

    await test('should reject empty string', () => {
      const result = pathHelpers.isValidArtifactName('');
      assertEqual(result, false, 'should reject empty string');
    });

    await test('should reject null', () => {
      const result = pathHelpers.isValidArtifactName(null);
      assertEqual(result, false, 'should reject null');
    });

    await test('should reject names starting with hyphen', () => {
      const result = pathHelpers.isValidArtifactName('-agent');
      assertEqual(result, false, 'should reject -agent');
    });

    await test('should reject names ending with hyphen', () => {
      const result = pathHelpers.isValidArtifactName('agent-');
      assertEqual(result, false, 'should reject agent-');
    });
  });

  await describe('isPathWithinProject (SEC-ICE-001)', async () => {
    const projectRoot = process.platform === 'win32' ? 'C:/project' : '/home/user/project';

    await test('should accept path within project', () => {
      const testPath = path.join(projectRoot, '.claude', 'skills', 'tdd');
      const result = pathHelpers.isPathWithinProject(testPath, projectRoot);
      assertEqual(result, true, 'should accept path within project');
    });

    await test('should accept project root itself', () => {
      const result = pathHelpers.isPathWithinProject(projectRoot, projectRoot);
      assertEqual(result, true, 'should accept project root');
    });

    await test('should reject path outside project', () => {
      const testPath = process.platform === 'win32' ? 'C:/other/path' : '/home/user/other/path';
      const result = pathHelpers.isPathWithinProject(testPath, projectRoot);
      assertEqual(result, false, 'should reject path outside project');
    });

    await test('should reject path traversal attempt', () => {
      const testPath = path.join(projectRoot, '..', '..', 'etc', 'passwd');
      const result = pathHelpers.isPathWithinProject(testPath, projectRoot);
      assertEqual(result, false, 'should reject path traversal');
    });

    await test('should handle empty string', () => {
      const result = pathHelpers.isPathWithinProject('', projectRoot);
      assertEqual(result, false, 'should reject empty string');
    });

    await test('should handle null', () => {
      const result = pathHelpers.isPathWithinProject(null, projectRoot);
      assertEqual(result, false, 'should reject null');
    });
  });

  await describe('interpolateArtifactName (SEC-ICE-001)', async () => {
    await test('should interpolate valid artifact name', () => {
      const result = pathHelpers.interpolateArtifactName('.claude/skills/{name}/SKILL.md', 'tdd');
      assertEqual(result, '.claude/skills/tdd/SKILL.md', 'should interpolate tdd');
    });

    await test('should block interpolation of invalid name', () => {
      const result = pathHelpers.interpolateArtifactName(
        '.claude/skills/{name}/SKILL.md',
        '../hack'
      );
      assertEqual(result, null, 'should return null for invalid name');
    });

    await test('should handle multiple placeholders', () => {
      const result = pathHelpers.interpolateArtifactName('.claude/{name}/test-{name}.md', 'agent');
      assertEqual(result, '.claude/agent/test-agent.md', 'should interpolate both');
    });

    await test('should handle empty template', () => {
      const result = pathHelpers.interpolateArtifactName('', 'tdd');
      assertEqual(result, null, 'should return null for empty template');
    });

    await test('should handle null template', () => {
      const result = pathHelpers.interpolateArtifactName(null, 'tdd');
      assertEqual(result, null, 'should return null for null template');
    });
  });

  // Summary
  console.log('\n=================================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
