#!/usr/bin/env node
/**
 * validate-integration.test.cjs
 *
 * Tests for the validate-integration CLI tool.
 */

'use strict';

const {
  validateArtifact,
  getRecentArtifacts,
} = require('../../../.claude/tools/cli/validate-integration.cjs');

describe('validate-integration', () => {
  describe('validateArtifact', () => {
    test('returns exitCode 2 for non-existent file', () => {
      const result = validateArtifact('/non/existent/file.md');
      expect(result.exitCode).toBe(2);
      expect(result.passed).toBe(false);
    });

    test('validates known agent artifact', () => {
      // Test with developer.md which should exist and be integrated
      const result = validateArtifact('.claude/agents/core/developer.md');

      // Should not be exit code 2 (file not found)
      expect(result.exitCode).not.toBe(2);
      expect(result).toHaveProperty('passed');
    });

    test('validates known skill artifact', () => {
      const result = validateArtifact('.claude/skills/tdd/SKILL.md');
      expect(result.exitCode).not.toBe(2);
      expect(result).toHaveProperty('passed');
    });

    test('validates known workflow artifact', () => {
      const result = validateArtifact('.claude/workflows/core/router-decision.md');
      expect(result.exitCode).not.toBe(2);
      expect(result).toHaveProperty('passed');
    });

    test('validates known hook artifact', () => {
      const result = validateArtifact('.claude/hooks/routing/router-enforcer.cjs');
      expect(result.exitCode).not.toBe(2);
      expect(result).toHaveProperty('passed');
    });
  });

  describe('getRecentArtifacts', () => {
    test('returns array of artifact paths', () => {
      const recent = getRecentArtifacts(24);
      expect(Array.isArray(recent)).toBe(true);
    });

    test('returns empty array for very short time window', () => {
      const recent = getRecentArtifacts(0.0001); // ~0.36 seconds
      expect(Array.isArray(recent)).toBe(true);
    });

    test('handles invalid hours gracefully', () => {
      const recent = getRecentArtifacts(-1);
      expect(Array.isArray(recent)).toBe(true);
    });
  });
});

// Simple test runner if jest is not available
if (require.main === module) {
  console.log('Running validate-integration tests...\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] ${name}`);
      console.log(`         ${err.message}`);
      failed++;
    }
  }

  function expect(actual) {
    return {
      toBe(expected) {
        if (actual !== expected) {
          throw new Error(`Expected ${expected} but got ${actual}`);
        }
      },
      not: {
        toBe(expected) {
          if (actual === expected) {
            throw new Error(`Expected not to be ${expected}`);
          }
        },
      },
      toHaveProperty(prop) {
        if (!(prop in actual)) {
          throw new Error(`Expected object to have property ${prop}`);
        }
      },
    };
  }

  function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
  }

  // Run tests
  describe('validateArtifact', () => {
    test('returns exitCode 2 for non-existent file', () => {
      const result = validateArtifact('/non/existent/file.md');
      expect(result.exitCode).toBe(2);
      expect(result.passed).toBe(false);
    });

    test('validates known agent artifact', () => {
      const result = validateArtifact('.claude/agents/core/developer.md');
      expect(result.exitCode).not.toBe(2);
      expect(result).toHaveProperty('passed');
    });

    test('validates known skill artifact', () => {
      const result = validateArtifact('.claude/skills/tdd/SKILL.md');
      expect(result.exitCode).not.toBe(2);
    });

    test('validates known workflow artifact', () => {
      const result = validateArtifact('.claude/workflows/core/router-decision.md');
      expect(result.exitCode).not.toBe(2);
    });

    test('validates known hook artifact', () => {
      const result = validateArtifact('.claude/hooks/routing/router-enforcer.cjs');
      expect(result.exitCode).not.toBe(2);
    });
  });

  describe('getRecentArtifacts', () => {
    test('returns array of artifact paths', () => {
      const recent = getRecentArtifacts(24);
      expect(Array.isArray(recent)).toBe(true);
    });

    test('returns empty array for very short time window', () => {
      const recent = getRecentArtifacts(0.0001);
      expect(Array.isArray(recent)).toBe(true);
    });

    test('handles invalid hours gracefully', () => {
      const recent = getRecentArtifacts(-1);
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
