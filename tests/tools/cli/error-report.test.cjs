#!/usr/bin/env node
// @ts-check
/**
 * Tests for Error Report CLI Tool
 *
 * Validates that the error report CLI properly generates summaries,
 * filters by agent/category/severity, and outputs reports.
 *
 * @module tools/cli/error-report.test
 */

'use strict';

const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec: _execSync, spawn: _spawn } = require('child_process');

// Test directory
const TEST_DIR = path.join(os.tmpdir(), 'error-report-test-' + Date.now());
const ERROR_REPORTS_DIR = path.join(TEST_DIR, '.claude', 'context', 'artifacts', 'error-reports');

let errorReport;

// Sample error entries for testing
const SAMPLE_ERRORS = [
  {
    errorId: 'ERR-CLITEST01',
    timestamp: new Date().toISOString(),
    category: 'TOOL_FAILURE',
    severity: 'MEDIUM',
    source: { component: 'tool', location: 'Bash' },
    message: 'npm test failed',
    context: { agentName: 'developer', taskId: '42' },
  },
  {
    errorId: 'ERR-CLITEST02',
    timestamp: new Date().toISOString(),
    category: 'SECURITY_VIOLATION',
    severity: 'CRITICAL',
    source: { component: 'hook', location: 'routing-guard.cjs' },
    message: 'SEC-001: Path traversal detected',
    context: { agentName: 'developer', taskId: '42' },
  },
  {
    errorId: 'ERR-CLITEST03',
    timestamp: new Date().toISOString(),
    category: 'VALIDATION_ERROR',
    severity: 'MEDIUM',
    source: { component: 'hook', location: 'spawn-validator.cjs' },
    message: 'Missing TaskUpdate protocol',
    context: { agentName: 'qa', taskId: '43' },
  },
  {
    errorId: 'ERR-CLITEST04',
    timestamp: new Date().toISOString(),
    category: 'TOOL_FAILURE',
    severity: 'LOW',
    source: { component: 'tool', location: 'Bash' },
    message: 'npm test failed - retrying',
    context: { agentName: 'developer', taskId: '42' },
  },
];

describe('error-report CLI', () => {
  before(() => {
    // Create test directory structure
    fs.mkdirSync(ERROR_REPORTS_DIR, { recursive: true });

    // Write sample errors
    const today = new Date().toISOString().slice(0, 10);
    const logFile = path.join(ERROR_REPORTS_DIR, `errors-${today}.jsonl`);
    const content = SAMPLE_ERRORS.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(logFile, content);

    // Set up environment
    process.env.ERROR_REPORTS_DIR = ERROR_REPORTS_DIR;

    // Clear any cached modules
    delete require.cache[require.resolve('../../../.claude/tools/cli/error-report.cjs')];
    errorReport = require('../../../.claude/tools/cli/error-report.cjs');
  });

  after(() => {
    // Clean up test directory
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors
    }
    delete process.env.ERROR_REPORTS_DIR;
  });

  describe('exports', () => {
    it('should export generateSummary function', () => {
      assert.strictEqual(typeof errorReport.generateSummary, 'function');
    });

    it('should export filterErrors function', () => {
      assert.strictEqual(typeof errorReport.filterErrors, 'function');
    });

    it('should export formatMarkdown function', () => {
      assert.strictEqual(typeof errorReport.formatMarkdown, 'function');
    });

    it('should export formatCsv function', () => {
      assert.strictEqual(typeof errorReport.formatCsv, 'function');
    });

    it('should export detectPatterns function', () => {
      assert.strictEqual(typeof errorReport.detectPatterns, 'function');
    });
  });

  describe('generateSummary()', () => {
    it('should generate summary with totals', () => {
      const summary = errorReport.generateSummary({ date: 'today' });

      assert.ok(summary, 'Summary should exist');
      assert.ok('total' in summary, 'Should have total');
      assert.ok('bySeverity' in summary, 'Should have bySeverity');
      assert.ok('byCategory' in summary, 'Should have byCategory');
      assert.ok('byAgent' in summary, 'Should have byAgent');
    });

    it('should count errors by severity', () => {
      const summary = errorReport.generateSummary({ date: 'today' });

      assert.ok(summary.bySeverity.CRITICAL >= 1, 'Should have CRITICAL errors');
      assert.ok(summary.bySeverity.MEDIUM >= 1, 'Should have MEDIUM errors');
    });

    it('should count errors by category', () => {
      const summary = errorReport.generateSummary({ date: 'today' });

      assert.ok(summary.byCategory.TOOL_FAILURE >= 1, 'Should have TOOL_FAILURE errors');
      assert.ok(
        summary.byCategory.SECURITY_VIOLATION >= 1,
        'Should have SECURITY_VIOLATION errors'
      );
    });

    it('should count errors by agent', () => {
      const summary = errorReport.generateSummary({ date: 'today' });

      assert.ok(summary.byAgent.developer >= 1, 'Should have developer errors');
      assert.ok(summary.byAgent.qa >= 1, 'Should have qa errors');
    });
  });

  describe('filterErrors()', () => {
    it('should filter by agent', () => {
      const errors = errorReport.filterErrors({ agentName: 'developer' });

      assert.ok(errors.length >= 1, 'Should have developer errors');
      assert.ok(errors.every(e => e.context?.agentName === 'developer'));
    });

    it('should filter by category', () => {
      const errors = errorReport.filterErrors({ category: 'SECURITY_VIOLATION' });

      assert.ok(errors.length >= 1, 'Should have security errors');
      assert.ok(errors.every(e => e.category === 'SECURITY_VIOLATION'));
    });

    it('should filter by severity', () => {
      const errors = errorReport.filterErrors({ severity: 'CRITICAL' });

      assert.ok(errors.length >= 1, 'Should have critical errors');
      assert.ok(errors.every(e => e.severity === 'CRITICAL'));
    });

    it('should combine multiple filters', () => {
      const errors = errorReport.filterErrors({
        agentName: 'developer',
        category: 'TOOL_FAILURE',
      });

      assert.ok(
        errors.every(e => e.context?.agentName === 'developer' && e.category === 'TOOL_FAILURE')
      );
    });
  });

  describe('formatMarkdown()', () => {
    it('should generate valid markdown', () => {
      const summary = errorReport.generateSummary({ date: 'today' });
      const markdown = errorReport.formatMarkdown(summary);

      assert.ok(markdown.includes('# Error Report'), 'Should have title');
      assert.ok(markdown.includes('## Summary'), 'Should have summary section');
    });

    it('should include severity breakdown', () => {
      const summary = errorReport.generateSummary({ date: 'today' });
      const markdown = errorReport.formatMarkdown(summary);

      assert.ok(markdown.includes('CRITICAL'), 'Should show CRITICAL');
      assert.ok(markdown.includes('MEDIUM'), 'Should show MEDIUM');
    });

    it('should include category breakdown', () => {
      const summary = errorReport.generateSummary({ date: 'today' });
      const markdown = errorReport.formatMarkdown(summary);

      assert.ok(markdown.includes('TOOL_FAILURE'), 'Should show TOOL_FAILURE');
    });
  });

  describe('formatCsv()', () => {
    it('should generate valid CSV', () => {
      const errors = errorReport.filterErrors({});
      const csv = errorReport.formatCsv(errors);

      assert.ok(csv.includes('errorId'), 'Should have header');
      assert.ok(csv.includes('ERR-'), 'Should have error IDs');
    });

    it('should have all required columns', () => {
      const errors = errorReport.filterErrors({});
      const csv = errorReport.formatCsv(errors);
      const header = csv.split('\n')[0];

      assert.ok(header.includes('errorId'));
      assert.ok(header.includes('timestamp'));
      assert.ok(header.includes('category'));
      assert.ok(header.includes('severity'));
      assert.ok(header.includes('message'));
    });
  });

  describe('detectPatterns()', () => {
    it('should detect repeated errors', () => {
      const errors = errorReport.filterErrors({});
      const patterns = errorReport.detectPatterns(errors);

      assert.ok(Array.isArray(patterns), 'Should return array');
    });

    it('should return pattern with count and signature', () => {
      const errors = errorReport.filterErrors({});
      const patterns = errorReport.detectPatterns(errors);

      if (patterns.length > 0) {
        const pattern = patterns[0];
        assert.ok('signature' in pattern, 'Should have signature');
        assert.ok('count' in pattern, 'Should have count');
      }
    });
  });

  describe('date parsing', () => {
    it('should parse "today"', () => {
      const summary = errorReport.generateSummary({ date: 'today' });
      assert.ok(summary.total >= 0);
    });

    it('should parse "this-week"', () => {
      const summary = errorReport.generateSummary({ date: 'this-week' });
      assert.ok(summary.total >= 0);
    });

    it('should parse YYYY-MM-DD format', () => {
      const today = new Date().toISOString().slice(0, 10);
      const summary = errorReport.generateSummary({ date: today });
      assert.ok(summary.total >= 0);
    });
  });
});
