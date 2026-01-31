#!/usr/bin/env node
/**
 * Tests for error-summary-extractor.cjs
 * Phase 4.1 of error logging integration
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('error-summary-extractor', () => {
  let extractor;
  let testDir;
  let errorReportsDir;
  let errorSummariesDir;

  beforeEach(() => {
    // Create temp directories
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-summary-test-'));
    errorReportsDir = path.join(testDir, 'error-reports');
    errorSummariesDir = path.join(testDir, 'error-summaries');
    fs.mkdirSync(errorReportsDir, { recursive: true });
    fs.mkdirSync(errorSummariesDir, { recursive: true });

    // Clear module cache
    delete require.cache[require.resolve('../../.claude/hooks/reflection/error-summary-extractor.cjs')];
    extractor = require('../../.claude/hooks/reflection/error-summary-extractor.cjs');

    // Set test directories
    extractor.setErrorReportsDir(errorReportsDir);
    extractor.setErrorSummariesDir(errorSummariesDir);
  });

  afterEach(() => {
    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  describe('readErrorLogs', () => {
    it('should read errors from JSONL file', () => {
      const errors = [
        { errorId: 'ERR-001', timestamp: new Date().toISOString(), message: 'Test error 1' },
        { errorId: 'ERR-002', timestamp: new Date().toISOString(), message: 'Test error 2' },
      ];

      const errorsFile = path.join(errorReportsDir, 'errors.jsonl');
      fs.writeFileSync(errorsFile, errors.map(e => JSON.stringify(e)).join('\n') + '\n');

      const result = extractor.readErrorLogs(errorReportsDir);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].errorId, 'ERR-001');
      assert.strictEqual(result[1].errorId, 'ERR-002');
    });

    it('should return empty array if no error logs exist', () => {
      const result = extractor.readErrorLogs(errorReportsDir);
      assert.strictEqual(result.length, 0);
    });

    it('should skip malformed JSON lines', () => {
      const errorsFile = path.join(errorReportsDir, 'errors.jsonl');
      fs.writeFileSync(
        errorsFile,
        '{"errorId":"ERR-001","message":"good"}\n' +
          'not valid json\n' +
          '{"errorId":"ERR-002","message":"also good"}\n'
      );

      const result = extractor.readErrorLogs(errorReportsDir);

      assert.strictEqual(result.length, 2);
    });
  });

  describe('filterErrorsByTimeRange', () => {
    it('should filter errors within last 24 hours', () => {
      const now = new Date();
      const errors = [
        { errorId: 'ERR-001', timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString() }, // 12 hours ago
        { errorId: 'ERR-002', timestamp: new Date(now - 48 * 60 * 60 * 1000).toISOString() }, // 48 hours ago
        { errorId: 'ERR-003', timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString() }, // 1 hour ago
      ];

      const filtered = extractor.filterErrorsByTimeRange(errors, 24 * 60 * 60 * 1000);

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.some(e => e.errorId === 'ERR-001'));
      assert.ok(filtered.some(e => e.errorId === 'ERR-003'));
    });
  });

  describe('aggregateByAgent', () => {
    it('should group errors by agent name', () => {
      const errors = [
        { errorId: 'ERR-001', context: { agentName: 'developer' } },
        { errorId: 'ERR-002', context: { agentName: 'developer' } },
        { errorId: 'ERR-003', context: { agentName: 'qa' } },
        { errorId: 'ERR-004' }, // No agent
      ];

      const aggregated = extractor.aggregateByAgent(errors);

      assert.strictEqual(aggregated.developer, 2);
      assert.strictEqual(aggregated.qa, 1);
      assert.strictEqual(aggregated.unknown, 1);
    });
  });

  describe('aggregateByCategory', () => {
    it('should group errors by category', () => {
      const errors = [
        { errorId: 'ERR-001', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-002', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-003', category: 'HOOK_FAILURE' },
        { errorId: 'ERR-004', category: 'EXECUTION_ERROR' },
      ];

      const aggregated = extractor.aggregateByCategory(errors);

      assert.strictEqual(aggregated.TOOL_FAILURE, 2);
      assert.strictEqual(aggregated.HOOK_FAILURE, 1);
      assert.strictEqual(aggregated.EXECUTION_ERROR, 1);
    });
  });

  describe('aggregateBySeverity', () => {
    it('should group errors by severity', () => {
      const errors = [
        { errorId: 'ERR-001', severity: 'CRITICAL' },
        { errorId: 'ERR-002', severity: 'HIGH' },
        { errorId: 'ERR-003', severity: 'HIGH' },
        { errorId: 'ERR-004', severity: 'MEDIUM' },
      ];

      const aggregated = extractor.aggregateBySeverity(errors);

      assert.strictEqual(aggregated.CRITICAL, 1);
      assert.strictEqual(aggregated.HIGH, 2);
      assert.strictEqual(aggregated.MEDIUM, 1);
    });
  });

  describe('generateSummary', () => {
    it('should generate comprehensive summary', () => {
      const now = new Date();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now - 1000).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'HIGH',
          message: 'npm test failed',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-002',
          timestamp: new Date(now - 2000).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'HIGH',
          message: 'npm test failed',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-003',
          timestamp: new Date(now - 3000).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'HIGH',
          message: 'npm test failed',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-004',
          timestamp: new Date(now - 4000).toISOString(),
          category: 'HOOK_FAILURE',
          severity: 'MEDIUM',
          message: 'Validation failed',
          context: { agentName: 'qa' },
        },
      ];

      const summary = extractor.generateSummary(errors);

      assert.strictEqual(summary.totalErrors, 4);
      assert.strictEqual(summary.bySeverity.HIGH, 3);
      assert.strictEqual(summary.byCategory.TOOL_FAILURE, 3);
      assert.strictEqual(summary.byAgent.developer, 3);
      assert.ok(summary.patterns);
      assert.ok(summary.recommendations);
    });
  });

  describe('generateSummaryMarkdown', () => {
    it('should generate markdown summary', () => {
      const summary = {
        date: '2026-01-29',
        totalErrors: 4,
        bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 1 },
        byCategory: { TOOL_FAILURE: 2, HOOK_FAILURE: 2 },
        byAgent: { developer: 3, qa: 1 },
        criticalErrors: [{ errorId: 'ERR-001', message: 'Critical error' }],
        patterns: {
          repeatedErrors: [{ message: 'npm test failed', count: 3 }],
          cascades: [],
        },
        recommendations: [{ priority: 'HIGH', issue: 'Test issue', suggestion: 'Fix it' }],
      };

      const markdown = extractor.generateSummaryMarkdown(summary);

      assert.ok(markdown.includes('# Error Summary - 2026-01-29'));
      assert.ok(markdown.includes('## Critical Issues'));
      assert.ok(markdown.includes('## By Agent'));
      assert.ok(markdown.includes('## Pattern Detected'));
      assert.ok(markdown.includes('## Recommendations'));
    });
  });

  describe('saveSummary', () => {
    it('should save summary to file', () => {
      const summary = {
        date: '2026-01-29',
        totalErrors: 1,
        bySeverity: {},
        byCategory: {},
        byAgent: {},
        patterns: { repeatedErrors: [], cascades: [] },
        recommendations: [],
      };

      const filePath = extractor.saveSummary(summary, errorSummariesDir);

      assert.ok(fs.existsSync(filePath));
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(content.includes('# Error Summary - 2026-01-29'));
    });
  });

  describe('calculateReflectionWeight', () => {
    it('should return high weight for many errors', () => {
      const summary = {
        totalErrors: 20,
        bySeverity: { CRITICAL: 2, HIGH: 5, MEDIUM: 10, LOW: 3 },
      };

      const weight = extractor.calculateReflectionWeight(summary);

      assert.ok(weight >= 0.7);
    });

    it('should return low weight for few errors', () => {
      const summary = {
        totalErrors: 2,
        bySeverity: { LOW: 2 },
      };

      const weight = extractor.calculateReflectionWeight(summary);

      assert.ok(weight <= 0.3);
    });
  });

  describe('extractSummaryForReflection', () => {
    it('should produce complete reflection context', () => {
      const now = new Date();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now - 1000).toISOString(),
          category: 'CRITICAL_ERROR',
          severity: 'CRITICAL',
          message: 'Critical failure',
          context: { agentName: 'developer' },
        },
      ];

      const errorsFile = path.join(errorReportsDir, 'errors.jsonl');
      fs.writeFileSync(errorsFile, errors.map(e => JSON.stringify(e)).join('\n') + '\n');

      const result = extractor.extractSummaryForReflection({
        errorReportsDir,
        errorSummariesDir,
        hours: 24,
      });

      assert.ok(result.summary);
      assert.ok(result.summaryPath);
      assert.ok(result.reflectionWeight > 0);
      assert.ok(result.actionItems);
    });
  });
});
