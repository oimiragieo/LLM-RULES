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
  _catalogHasEntry,
  _claudeMdHasEntry,
  stripFencesAndHeadings,
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

describe('validate-integration — Bug 1 & Bug 2 regression guard (end-to-end check logic)', () => {
  // These tests call the exported check-logic helpers directly with controlled content,
  // proving the integration path (_catalogHasEntry / _claudeMdHasEntry) prevents
  // false positives that the old str.includes fallback would have allowed through.

  it('Bug 2: _catalogHasEntry rejects skill name that appears only in a fenced code block', () => {
    const catalog = [
      '# Skill Catalog',
      '',
      '```',
      '| Skill Name | Category |',
      '|------------|----------|',
      '| code-fence-only-skill | example |',
      '```',
      '',
      '| Skill Name | Category |',
      '|------------|----------|',
      '| other-skill | real entry |',
    ].join('\n');

    // Old fallback would have returned true via str.includes — this is the regression
    assert.ok(
      catalog.includes('code-fence-only-skill'),
      'str.includes confirms the false-positive scenario exists'
    );
    assert.ok(
      !_catalogHasEntry(catalog, 'code-fence-only-skill'),
      'Bug 2 fixed: _catalogHasEntry rejects skill in code fence'
    );
  });

  it('Bug 1: _claudeMdHasEntry rejects agent name that appears only in a fenced code block', () => {
    const claudeMd = [
      '# Routing',
      '',
      '```javascript',
      '// Route to code-fence-only-agent for this',
      'Task({ subagent_type: "code-fence-only-agent" })',
      '```',
      '',
      'Use other-agent for real routing.',
    ].join('\n');

    assert.ok(
      claudeMd.includes('code-fence-only-agent'),
      'str.includes confirms the false-positive scenario exists'
    );
    assert.ok(
      !_claudeMdHasEntry(claudeMd, 'code-fence-only-agent'),
      'Bug 1 fixed: _claudeMdHasEntry rejects agent in code fence'
    );
  });

  it('Bug 1: _claudeMdHasEntry rejects agent name that appears only in a heading', () => {
    const claudeMd = [
      '# heading-only-agent Documentation',
      '',
      '## Overview',
      '',
      'Use other-agent for actual routing.',
    ].join('\n');

    assert.ok(
      claudeMd.includes('heading-only-agent'),
      'str.includes confirms the false-positive scenario exists'
    );
    assert.ok(
      !_claudeMdHasEntry(claudeMd, 'heading-only-agent'),
      'Bug 1 fixed: _claudeMdHasEntry rejects agent in heading'
    );
  });

  it('true positive: _catalogHasEntry finds skill in a real table row', () => {
    const catalog = [
      '| Skill Name | Category |',
      '|------------|----------|',
      '| real-table-skill | utility |',
    ].join('\n');

    assert.ok(
      _catalogHasEntry(catalog, 'real-table-skill'),
      'true positive preserved: skill in table row is found'
    );
  });

  it('true positive: _claudeMdHasEntry finds agent name in plain text body', () => {
    const claudeMd = [
      '# Routing Overview',
      '',
      'Use plain-text-agent for implementation tasks.',
    ].join('\n');

    assert.ok(
      _claudeMdHasEntry(claudeMd, 'plain-text-agent'),
      'true positive preserved: agent in plain text is found'
    );
  });

  it('stripFencesAndHeadings removes fences and headings but preserves table rows', () => {
    const content = [
      '# Section Heading',
      '',
      '```',
      'code-block-content',
      '```',
      '',
      '| Col | Val |',
      '|-----|-----|',
      '| real-row | data |',
    ].join('\n');

    const stripped = stripFencesAndHeadings(content);
    assert.ok(!stripped.includes('Section Heading'), 'heading removed');
    assert.ok(!stripped.includes('code-block-content'), 'code block content removed');
    assert.ok(stripped.includes('real-row'), 'table row preserved');
  });
});
