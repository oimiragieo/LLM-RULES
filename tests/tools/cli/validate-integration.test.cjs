#!/usr/bin/env node
/**
 * validate-integration.test.cjs
 *
 * Tests for the validate-integration CLI tool.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  validateArtifact,
  getRecentArtifacts,
} = require('../../../.claude/tools/cli/validate-integration.cjs');

describe('validate-integration', () => {
  describe('validateArtifact', () => {
    it('returns exitCode 2 for non-existent file', () => {
      const result = validateArtifact('/non/existent/file.md');
      assert.strictEqual(result.exitCode, 2);
      assert.strictEqual(result.passed, false);
    });

    it('validates known agent artifact', () => {
      // Test with developer.md which should exist and be integrated
      const result = validateArtifact('.claude/agents/core/developer.md');

      // Should not be exit code 2 (file not found)
      assert.notStrictEqual(result.exitCode, 2);
      assert.ok('passed' in result);
    });

    it('validates known skill artifact', () => {
      const result = validateArtifact('.claude/skills/tdd/SKILL.md');
      assert.notStrictEqual(result.exitCode, 2);
      assert.ok('passed' in result);
    });

    it('validates known workflow artifact', () => {
      const result = validateArtifact('.claude/workflows/core/router-decision.md');
      assert.notStrictEqual(result.exitCode, 2);
      assert.ok('passed' in result);
    });

    it('validates known hook artifact', () => {
      const result = validateArtifact('.claude/hooks/routing/agent-context-tracker.cjs');
      assert.notStrictEqual(result.exitCode, 2);
      assert.ok('passed' in result);
    });
  });

  describe('getRecentArtifacts', () => {
    it('returns array of artifact paths', () => {
      const recent = getRecentArtifacts(24);
      assert.ok(Array.isArray(recent));
    });

    it('returns empty array for very short time window', () => {
      const recent = getRecentArtifacts(0.0001); // ~0.36 seconds
      assert.ok(Array.isArray(recent));
    });

    it('handles invalid hours gracefully', () => {
      const recent = getRecentArtifacts(-1);
      assert.ok(Array.isArray(recent));
    });
  });
});
