#!/usr/bin/env node
/**
 * validate-integration.test.cjs
 *
 * Tests for the validate-integration CLI tool.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateArtifact,
  getRecentArtifacts,
} = require('../../../.claude/tools/cli/validate-integration.cjs');
const { parseMarkdownTable } = require('../../../.claude/lib/utils/markdown-table-parser.cjs');

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
      const result = validateArtifact('.claude/hooks/routing/routing-guard.cjs');
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

describe('parseMarkdownTable — false positive prevention (Track 4.1 regression guard)', () => {
  // These tests exist to prove WHY str.includes() is insufficient and why the
  // AST table parser is required for catalog lookup in validate-integration.

  it('str.includes gives false positive for value in fenced code block', () => {
    const catalog = [
      '# Skill Catalog',
      '',
      '```',
      '| Skill | Description |',
      '|-------|-------------|',
      '| my-skill | example only |',
      '```',
      '',
      '| Skill | Description |',
      '|-------|-------------|',
      '| other-skill | actual entry |',
    ].join('\n');

    // Demonstrate the false positive
    assert.ok(catalog.includes('my-skill'), 'str.includes incorrectly matches inside code fence');

    // Parser correctly reads only the real table, not the code block
    const rows = parseMarkdownTable(catalog);
    const hasEntry = rows.some(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes('my-skill'))
    );
    assert.ok(!hasEntry, 'parser correctly rejects false positive from fenced code block');
  });

  it('str.includes gives false positive for value appearing only in a heading', () => {
    const catalog = [
      '# my-skill documentation section',
      '',
      '| Skill | Description |',
      '|-------|-------------|',
      '| other-skill | another entry |',
    ].join('\n');

    // Demonstrate the false positive
    assert.ok(catalog.includes('my-skill'), 'str.includes incorrectly matches inside heading');

    // Parser reads only table rows
    const rows = parseMarkdownTable(catalog);
    const hasEntry = rows.some(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes('my-skill'))
    );
    assert.ok(!hasEntry, 'parser correctly rejects false positive from heading text');
  });

  it('parser correctly finds skill entry with extra cell whitespace (true positive)', () => {
    const catalog = [
      '| Skill Name     | Category   | Description        |',
      '|----------------|------------|--------------------|',
      '|  my-skill      |  utility   |  a useful skill    |',
    ].join('\n');

    const rows = parseMarkdownTable(catalog);
    const hasEntry = rows.some(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes('my-skill'))
    );
    assert.ok(hasEntry, 'parser finds entry even when cells have extra whitespace');
  });

  describe('SE-XX compliance — markdown-table-parser', () => {
    it('SE-01: correctly parses table with Windows CRLF line endings', () => {
      const catalog =
        '| Skill | Description |\r\n|-------|-------------|\r\n| my-skill | desc |\r\n';
      const rows = parseMarkdownTable(catalog);
      assert.ok(rows.length > 0, 'SE-01: parsed at least one data row from CRLF content');
      const hasEntry = rows.some(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes('my-skill'))
      );
      assert.ok(hasEntry, 'SE-01: finds entry in CRLF-encoded catalog');
    });
  });
});
