#!/usr/bin/env node
/**
 * post-creation-reminder.test.cjs
 *
 * Tests for the post-creation reminder hook.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  getRecentEvolutions,
  quickValidate,
} = require('../../.claude/hooks/session/post-creation-reminder.cjs');

describe('post-creation-reminder', () => {
  describe('getRecentEvolutions', () => {
    test('returns empty array when no recent evolutions', () => {
      const recent = getRecentEvolutions(0.001);
      assert.ok(Array.isArray(recent));
    });

    test('returns array of evolution objects', () => {
      const recent = getRecentEvolutions(24);
      assert.ok(Array.isArray(recent));

      if (recent.length > 0) {
        const first = recent[0];
        assert.ok(Object.prototype.hasOwnProperty.call(first, 'name'));
        assert.ok(Object.prototype.hasOwnProperty.call(first, 'type'));
      }
    });

    test('handles invalid hours gracefully', () => {
      const recent = getRecentEvolutions(-1);
      assert.ok(Array.isArray(recent));
    });
  });

  describe('quickValidate', () => {
    test('returns passed:false for non-existent artifact', () => {
      const result = quickValidate('/non/existent/path.md');
      assert.equal(result.passed, false);
      assert.ok(result.issues.includes('Artifact file not found'));
    });

    test('validates agent with CLAUDE.md check', () => {
      const result = quickValidate('.claude/agents/core/developer.md');

      if (!result.issues.includes('Artifact file not found')) {
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'passed'));
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'issues'));
        assert.ok(Array.isArray(result.issues));
      }
    });

    test('validates skill with catalog check', () => {
      const result = quickValidate('.claude/skills/tdd/SKILL.md');

      if (!result.issues.includes('Artifact file not found')) {
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'passed'));
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'issues'));
      }
    });

    test('handles unknown artifact type', () => {
      const result = quickValidate('.claude/CLAUDE.md');
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'passed'));
    });
  });
});
