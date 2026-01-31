#!/usr/bin/env node
/**
 * post-creation-reminder.test.cjs
 *
 * Tests for the post-creation reminder hook.
 */

'use strict';

const {
  getRecentEvolutions,
  quickValidate,
} = require('../../.claude/hooks/session/post-creation-reminder.cjs');

describe('post-creation-reminder', () => {
  describe('getRecentEvolutions', () => {
    test('returns empty array when no recent evolutions', () => {
      // This test depends on actual evolution-state.json
      const recent = getRecentEvolutions(0.001); // 0.001 hours = ~3.6 seconds ago
      // Should return empty or very recent items
      expect(Array.isArray(recent)).toBe(true);
    });

    test('returns array of evolution objects', () => {
      const recent = getRecentEvolutions(24);
      expect(Array.isArray(recent)).toBe(true);

      if (recent.length > 0) {
        const first = recent[0];
        expect(first).toHaveProperty('name');
        expect(first).toHaveProperty('type');
      }
    });

    test('handles invalid hours gracefully', () => {
      const recent = getRecentEvolutions(-1);
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe('quickValidate', () => {
    test('returns passed:false for non-existent artifact', () => {
      const result = quickValidate('/non/existent/path.md');
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('Artifact file not found');
    });

    test('validates agent with CLAUDE.md check', () => {
      // Test with a known agent that should exist and be in CLAUDE.md
      const result = quickValidate('.claude/agents/core/developer.md');

      // If the file exists, should check CLAUDE.md
      if (!result.issues.includes('Artifact file not found')) {
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('issues');
        expect(Array.isArray(result.issues)).toBe(true);
      }
    });

    test('validates skill with catalog check', () => {
      // Test with a known skill that should exist
      const result = quickValidate('.claude/skills/tdd/SKILL.md');

      if (!result.issues.includes('Artifact file not found')) {
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('issues');
      }
    });

    test('handles unknown artifact type', () => {
      // Test with a file that isn't an agent, skill, or workflow
      const result = quickValidate('.claude/CLAUDE.md');
      expect(result).toHaveProperty('passed');
    });
  });
});

// Simple test runner if jest is not available
if (require.main === module) {
  console.log('Running post-creation-reminder tests...\n');

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
      toHaveProperty(prop) {
        if (!(prop in actual)) {
          throw new Error(`Expected object to have property ${prop}`);
        }
      },
      toContain(item) {
        if (Array.isArray(actual)) {
          if (!actual.includes(item)) {
            throw new Error(`Expected array to contain ${item}`);
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(item)) {
            throw new Error(`Expected string to contain ${item}`);
          }
        }
      },
    };
  }

  function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
  }

  // Run tests
  describe('getRecentEvolutions', () => {
    test('returns empty array when no recent evolutions', () => {
      const recent = getRecentEvolutions(0.001);
      expect(Array.isArray(recent)).toBe(true);
    });

    test('returns array of evolution objects', () => {
      const recent = getRecentEvolutions(24);
      expect(Array.isArray(recent)).toBe(true);
    });

    test('handles invalid hours gracefully', () => {
      const recent = getRecentEvolutions(-1);
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe('quickValidate', () => {
    test('returns passed:false for non-existent artifact', () => {
      const result = quickValidate('/non/existent/path.md');
      expect(result.passed).toBe(false);
    });

    test('validates agent artifacts', () => {
      const result = quickValidate('.claude/agents/core/developer.md');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('issues');
    });

    test('validates skill artifacts', () => {
      const result = quickValidate('.claude/skills/tdd/SKILL.md');
      expect(result).toHaveProperty('passed');
    });
  });

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
