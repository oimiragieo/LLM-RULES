'use strict';

/**
 * Tests for Report Formatter
 *
 * Covers validation contract assertions:
 * - VAL-RR-002: Multi-format report output
 *   - terminal: chalk-colored table with aligned columns
 *   - markdown: valid markdown table for CI comments
 *   - json: machine-parseable JSON
 *   - summary: one-line with overall score and level
 *
 * Also verifies:
 * - ReportFormatter class dispatches to correct formatter
 * - Unknown format throws descriptive error
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatTerminal,
  formatMarkdown,
  formatJson,
  formatSummary,
  ReportFormatter,
  SUPPORTED_FORMATS,
} = require('../../.claude/lib/readiness/report-formatter.cjs');

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A mock readiness report with 6/9 pillars passing */
const MOCK_REPORT = {
  repoPath: 'C:\\tmp\\test-project',
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'L3',
  overallScore: 72,
  pillars: {
    styleAndValidation: { score: 90, passed: true, weight: 1.0, command: '<mock>', exitCode: 0 },
    buildSystem: { score: 85, passed: true, weight: 1.0, command: '<mock>', exitCode: 0 },
    testing: { score: 40, passed: false, weight: 1.5, command: '<mock>', exitCode: 1 },
    documentation: { score: 50, passed: false, weight: 0.8, command: '<mock>', exitCode: 1 },
    developmentEnvironment: {
      score: 70,
      passed: false,
      weight: 0.8,
      command: '<mock>',
      exitCode: 1,
    },
    debuggingAndObservability: {
      score: 80,
      passed: true,
      weight: 1.0,
      command: '<mock>',
      exitCode: 0,
    },
    security: { score: 90, passed: true, weight: 1.2, command: '<mock>', exitCode: 0 },
    taskDiscovery: { score: 95, passed: true, weight: 0.7, command: '<mock>', exitCode: 0 },
    productAndExperimentation: {
      score: 85,
      passed: true,
      weight: 0.5,
      command: '<mock>',
      exitCode: 0,
    },
  },
  gateStatus: { passed: false, threshold: 80, details: 'Score 72 below threshold 80' },
  recommendations: ['Improve testing: Test framework and coverage. Current score: 40/100'],
};

/** A mock report with all 9 pillars passing */
const MOCK_ALL_PASSING_REPORT = {
  repoPath: 'C:\\tmp\\passing-project',
  timestamp: '2024-06-15T12:00:00.000Z',
  level: 'L5',
  overallScore: 98,
  pillars: Object.fromEntries(
    Object.entries(MOCK_REPORT.pillars).map(([k, v]) => [k, { ...v, passed: true, score: 98 }])
  ),
  gateStatus: { passed: true, threshold: 80, details: 'Score 98 meets threshold 80' },
  recommendations: [],
};

/** A minimal report with no recommendations */
const MOCK_MINIMAL_REPORT = {
  repoPath: 'C:\\tmp\\minimal-project',
  timestamp: '2024-03-10T08:00:00.000Z',
  level: 'L2',
  overallScore: 45,
  pillars: {
    styleAndValidation: { score: 60, passed: false, weight: 1.0, command: '<mock>', exitCode: 1 },
    buildSystem: { score: 55, passed: false, weight: 1.0, command: '<mock>', exitCode: 1 },
    testing: { score: 40, passed: false, weight: 1.5, command: '<mock>', exitCode: 1 },
    documentation: { score: 50, passed: false, weight: 0.8, command: '<mock>', exitCode: 1 },
    developmentEnvironment: {
      score: 30,
      passed: false,
      weight: 0.8,
      command: '<mock>',
      exitCode: 1,
    },
    debuggingAndObservability: {
      score: 40,
      passed: false,
      weight: 1.0,
      command: '<mock>',
      exitCode: 1,
    },
    security: { score: 50, passed: false, weight: 1.2, command: '<mock>', exitCode: 1 },
    taskDiscovery: { score: 45, passed: false, weight: 0.7, command: '<mock>', exitCode: 1 },
    productAndExperimentation: {
      score: 35,
      passed: false,
      weight: 0.5,
      command: '<mock>',
      exitCode: 1,
    },
  },
  gateStatus: { passed: false, threshold: 80, details: 'Score 45 below threshold 80' },
  recommendations: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('report-formatter', () => {
  // ── SUPPORTED_FORMATS constant ─────────────────────────────────────────────
  describe('SUPPORTED_FORMATS', () => {
    it('exports all 4 supported format names', () => {
      assert.ok(Array.isArray(SUPPORTED_FORMATS), 'SUPPORTED_FORMATS should be an array');
      assert.strictEqual(SUPPORTED_FORMATS.length, 4, 'Should have exactly 4 supported formats');
      assert.ok(SUPPORTED_FORMATS.includes('terminal'), 'Should include terminal');
      assert.ok(SUPPORTED_FORMATS.includes('markdown'), 'Should include markdown');
      assert.ok(SUPPORTED_FORMATS.includes('json'), 'Should include json');
      assert.ok(SUPPORTED_FORMATS.includes('summary'), 'Should include summary');
    });
  });

  // ── formatTerminal ─────────────────────────────────────────────────────────
  describe('formatTerminal', () => {
    it('returns a string', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string');
    });

    it('contains level and score information', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.ok(result.includes('L3'), 'Should include level L3');
      assert.ok(result.includes('72'), 'Should include score 72');
    });

    it('contains all pillar names', () => {
      const result = formatTerminal(MOCK_REPORT);
      const pillarNames = Object.keys(MOCK_REPORT.pillars);
      for (const name of pillarNames) {
        assert.ok(result.includes(name), `Should contain pillar name: ${name}`);
      }
    });

    it('contains PASS and FAIL indicators', () => {
      const result = formatTerminal(MOCK_REPORT);
      // PASS and FAIL should appear for passing/failing pillars
      assert.ok(result.includes('PASS'), 'Should include PASS indicator');
      assert.ok(result.includes('FAIL'), 'Should include FAIL indicator');
    });

    it('contains ANSI color escape codes (colored output)', () => {
      const result = formatTerminal(MOCK_REPORT);
      // Check for ANSI escape codes indicating colored output
      assert.ok(result.includes('\x1b['), 'Should include ANSI escape codes for color');
    });

    it('contains a bar graph (block characters)', () => {
      const result = formatTerminal(MOCK_REPORT);
      // Progress bar uses Unicode block characters
      assert.ok(
        result.includes('\u2588') || result.includes('\u2591'),
        'Should include progress bar block characters'
      );
    });

    it('contains repoPath in output', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.ok(result.includes(MOCK_REPORT.repoPath), 'Should include repo path');
    });

    it('contains gate status with threshold', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.ok(result.includes('80'), 'Should include gate threshold value');
    });

    it('shows recommendations when present', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.ok(
        result.includes('Recommendations') || result.includes('recommendation'),
        'Should include recommendations section'
      );
      assert.ok(
        result.includes(MOCK_REPORT.recommendations[0]),
        'Should include recommendation text'
      );
    });

    it('handles report with no recommendations gracefully', () => {
      const result = formatTerminal(MOCK_ALL_PASSING_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string even with no recs');
      assert.ok(result.includes('L5'), 'Should include level L5');
    });

    it('handles all-passing report correctly', () => {
      const result = formatTerminal(MOCK_ALL_PASSING_REPORT);
      assert.ok(result.includes('98'), 'Should include score 98');
    });
  });

  // ── formatMarkdown ─────────────────────────────────────────────────────────
  describe('formatMarkdown', () => {
    it('returns a string', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string');
    });

    it('contains a markdown table header row', () => {
      const result = formatMarkdown(MOCK_REPORT);
      // Markdown table has | Pillar | Score | Status |
      assert.ok(result.includes('| Pillar'), 'Should include table header with Pillar column');
      assert.ok(result.includes('Score'), 'Should include Score column');
      assert.ok(result.includes('Status'), 'Should include Status column');
    });

    it('contains markdown table separator row', () => {
      const result = formatMarkdown(MOCK_REPORT);
      // Table separator row starts with |---
      assert.ok(result.includes('|---'), 'Should include markdown table separator row');
    });

    it('contains all pillar names as table rows', () => {
      const result = formatMarkdown(MOCK_REPORT);
      const pillarNames = Object.keys(MOCK_REPORT.pillars);
      for (const name of pillarNames) {
        assert.ok(result.includes(name), `Should contain pillar name: ${name}`);
      }
    });

    it('contains PASS and FAIL indicators in table rows', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.ok(result.includes('PASS'), 'Should include PASS indicator');
      assert.ok(result.includes('FAIL'), 'Should include FAIL indicator');
    });

    it('contains level and score in the header section', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.ok(result.includes('L3'), 'Should include level L3');
      assert.ok(result.includes('72'), 'Should include score 72');
    });

    it('contains a heading (# or ##)', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.ok(result.includes('#'), 'Should include a markdown heading');
    });

    it('does not contain ANSI color codes', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.ok(!result.includes('\x1b['), 'Should NOT include ANSI escape codes');
    });

    it('produces parseable table rows for each pillar', () => {
      const result = formatMarkdown(MOCK_REPORT);
      const lines = result.split('\n');
      const tableDataRows = lines.filter(
        l => l.startsWith('|') && !l.includes('---') && !l.includes('Pillar')
      );
      // Should have one row per pillar
      assert.strictEqual(
        tableDataRows.length,
        Object.keys(MOCK_REPORT.pillars).length,
        'Should have one table row per pillar'
      );
    });

    it('includes recommendations when present', () => {
      const result = formatMarkdown(MOCK_REPORT);
      assert.ok(
        result.includes(MOCK_REPORT.recommendations[0]),
        'Should include recommendation text'
      );
    });

    it('handles report with no recommendations gracefully', () => {
      const result = formatMarkdown(MOCK_ALL_PASSING_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string even with no recs');
    });
  });

  // ── formatJson ─────────────────────────────────────────────────────────────
  describe('formatJson', () => {
    it('returns a string', () => {
      const result = formatJson(MOCK_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string');
    });

    it('returns parseable JSON', () => {
      const result = formatJson(MOCK_REPORT);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result);
      }, 'Should produce valid parseable JSON');
      assert.ok(parsed, 'Parsed result should be truthy');
    });

    it('preserves all top-level report fields', () => {
      const result = formatJson(MOCK_REPORT);
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.level, MOCK_REPORT.level, 'Should preserve level');
      assert.strictEqual(parsed.overallScore, MOCK_REPORT.overallScore, 'Should preserve score');
      assert.strictEqual(parsed.repoPath, MOCK_REPORT.repoPath, 'Should preserve repoPath');
    });

    it('preserves all pillar entries', () => {
      const result = formatJson(MOCK_REPORT);
      const parsed = JSON.parse(result);
      const pillarNames = Object.keys(MOCK_REPORT.pillars);
      for (const name of pillarNames) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(parsed.pillars, name),
          `Should include pillar: ${name}`
        );
      }
    });

    it('uses indented formatting (not compact)', () => {
      const result = formatJson(MOCK_REPORT);
      // Indented JSON has newlines and spaces
      assert.ok(result.includes('\n'), 'Should have newlines (indented, not compact)');
      assert.ok(result.includes('  '), 'Should have spaces (indented formatting)');
    });

    it('preserves gateStatus', () => {
      const result = formatJson(MOCK_REPORT);
      const parsed = JSON.parse(result);
      assert.strictEqual(
        parsed.gateStatus.passed,
        MOCK_REPORT.gateStatus.passed,
        'Should preserve gateStatus.passed'
      );
      assert.strictEqual(
        parsed.gateStatus.threshold,
        MOCK_REPORT.gateStatus.threshold,
        'Should preserve gateStatus.threshold'
      );
    });

    it('does not contain ANSI color codes', () => {
      const result = formatJson(MOCK_REPORT);
      assert.ok(!result.includes('\x1b['), 'Should NOT include ANSI escape codes');
    });
  });

  // ── formatSummary ──────────────────────────────────────────────────────────
  describe('formatSummary', () => {
    it('returns a string', () => {
      const result = formatSummary(MOCK_REPORT);
      assert.strictEqual(typeof result, 'string', 'Should return a string');
    });

    it('produces a single-line string (no newlines)', () => {
      const result = formatSummary(MOCK_REPORT);
      assert.ok(!result.includes('\n'), 'Should be a single line (no newlines)');
    });

    it('matches the expected summary pattern: Readiness: L3 (72/100) — X/9 pillars passing', () => {
      const result = formatSummary(MOCK_REPORT);
      // Pattern: Readiness: L3 (72/100) — 6/9 pillars passing
      assert.ok(result.startsWith('Readiness:'), 'Should start with "Readiness:"');
      assert.ok(result.includes('L3'), 'Should include level L3');
      assert.ok(result.includes('72/100'), 'Should include score 72/100');
      assert.ok(result.includes('pillars passing'), 'Should include "pillars passing"');
    });

    it('reports correct passing pillar count (6/9)', () => {
      const result = formatSummary(MOCK_REPORT);
      // 6 out of 9 pillars pass in MOCK_REPORT
      const passingCount = Object.values(MOCK_REPORT.pillars).filter(p => p.passed).length;
      const totalCount = Object.keys(MOCK_REPORT.pillars).length;
      assert.ok(
        result.includes(`${passingCount}/${totalCount}`),
        `Should include "${passingCount}/${totalCount}" passing count`
      );
    });

    it('reports 9/9 when all pillars pass', () => {
      const result = formatSummary(MOCK_ALL_PASSING_REPORT);
      assert.ok(result.includes('9/9'), 'Should include "9/9" when all pillars pass');
      assert.ok(result.includes('L5'), 'Should include level L5');
      assert.ok(result.includes('98/100'), 'Should include score 98/100');
    });

    it('reports 0/9 when no pillars pass', () => {
      const result = formatSummary(MOCK_MINIMAL_REPORT);
      assert.ok(result.includes('0/9'), 'Should include "0/9" when no pillars pass');
      assert.ok(result.includes('L2'), 'Should include level L2');
      assert.ok(result.includes('45/100'), 'Should include score 45/100');
    });

    it('contains em dash separator', () => {
      const result = formatSummary(MOCK_REPORT);
      // em dash (\u2014) or at least a dash separator
      assert.ok(
        result.includes('\u2014') || result.includes('—'),
        'Should include em dash separator'
      );
    });

    it('does not contain ANSI color codes', () => {
      const result = formatSummary(MOCK_REPORT);
      assert.ok(!result.includes('\x1b['), 'Should NOT include ANSI escape codes');
    });
  });

  // ── ReportFormatter class ──────────────────────────────────────────────────
  describe('ReportFormatter', () => {
    it('can be instantiated with a valid format', () => {
      for (const fmt of SUPPORTED_FORMATS) {
        assert.doesNotThrow(() => new ReportFormatter(fmt), `Should not throw for format: ${fmt}`);
      }
    });

    it('throws descriptive error for unknown format', () => {
      assert.throws(
        () => new ReportFormatter('xml'),
        err => {
          assert.ok(err instanceof Error, 'Should throw an Error');
          assert.ok(err.message.includes('xml'), 'Error message should mention the bad format');
          assert.ok(
            err.message.toLowerCase().includes('format') ||
              err.message.toLowerCase().includes('unknown') ||
              err.message.toLowerCase().includes('support'),
            'Error message should be descriptive'
          );
          return true;
        }
      );
    });

    it('throws for empty string format', () => {
      assert.throws(
        () => new ReportFormatter(''),
        err => {
          assert.ok(err instanceof Error, 'Should throw an Error for empty format');
          return true;
        }
      );
    });

    it('throws for null format', () => {
      assert.throws(
        () => new ReportFormatter(null),
        err => {
          assert.ok(err instanceof Error, 'Should throw an Error for null format');
          return true;
        }
      );
    });

    it('dispatches to formatTerminal when format is "terminal"', () => {
      const formatter = new ReportFormatter('terminal');
      const result = formatter.format(MOCK_REPORT);
      const direct = formatTerminal(MOCK_REPORT);
      assert.strictEqual(result, direct, 'Should produce identical output to formatTerminal()');
    });

    it('dispatches to formatMarkdown when format is "markdown"', () => {
      const formatter = new ReportFormatter('markdown');
      const result = formatter.format(MOCK_REPORT);
      const direct = formatMarkdown(MOCK_REPORT);
      assert.strictEqual(result, direct, 'Should produce identical output to formatMarkdown()');
    });

    it('dispatches to formatJson when format is "json"', () => {
      const formatter = new ReportFormatter('json');
      const result = formatter.format(MOCK_REPORT);
      const direct = formatJson(MOCK_REPORT);
      assert.strictEqual(result, direct, 'Should produce identical output to formatJson()');
    });

    it('dispatches to formatSummary when format is "summary"', () => {
      const formatter = new ReportFormatter('summary');
      const result = formatter.format(MOCK_REPORT);
      const direct = formatSummary(MOCK_REPORT);
      assert.strictEqual(result, direct, 'Should produce identical output to formatSummary()');
    });

    it('format() returns a string for all supported formats', () => {
      for (const fmt of SUPPORTED_FORMATS) {
        const formatter = new ReportFormatter(fmt);
        const result = formatter.format(MOCK_REPORT);
        assert.strictEqual(typeof result, 'string', `format("${fmt}") should return a string`);
      }
    });

    it('format method returns non-empty string for all formats', () => {
      for (const fmt of SUPPORTED_FORMATS) {
        const formatter = new ReportFormatter(fmt);
        const result = formatter.format(MOCK_REPORT);
        assert.ok(result.length > 0, `format("${fmt}") should return non-empty string`);
      }
    });
  });

  // ── VAL-RR-002: Multi-format report output ─────────────────────────────────
  describe('VAL-RR-002: Multi-format report output', () => {
    it('terminal format produces colored output (ANSI codes present)', () => {
      const result = formatTerminal(MOCK_REPORT);
      assert.ok(result.includes('\x1b['), 'Terminal output should contain ANSI color codes');
    });

    it('markdown format produces a valid table (pipe-delimited rows)', () => {
      const result = formatMarkdown(MOCK_REPORT);
      const lines = result.split('\n').filter(l => l.trim().startsWith('|'));
      // At minimum header row, separator, and one data row
      assert.ok(lines.length >= 3, 'Should have at least header, separator, and data rows');
    });

    it('json format output is machine-parseable JSON', () => {
      const result = formatJson(MOCK_REPORT);
      assert.doesNotThrow(() => JSON.parse(result), 'JSON format must be parseable');
    });

    it('summary format is one line with score and level', () => {
      const result = formatSummary(MOCK_REPORT);
      assert.ok(!result.includes('\n'), 'Summary should be a single line');
      assert.ok(result.includes(MOCK_REPORT.level), 'Summary should include level');
      assert.ok(String(MOCK_REPORT.overallScore), 'Summary should include score');
    });

    it('all 4 formats produce distinct output', () => {
      const terminal = formatTerminal(MOCK_REPORT);
      const markdown = formatMarkdown(MOCK_REPORT);
      const json = formatJson(MOCK_REPORT);
      const summary = formatSummary(MOCK_REPORT);

      // Each format should produce distinct output
      const outputs = [terminal, markdown, json, summary];
      const uniqueOutputs = new Set(outputs);
      assert.strictEqual(uniqueOutputs.size, 4, 'All 4 formats should produce distinct output');
    });
  });
});
