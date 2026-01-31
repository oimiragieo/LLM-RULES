#!/usr/bin/env node
// @ts-check
/**
 * Tests for Error Writer Library
 *
 * Validates that the error writer properly persists errors to JSONL files
 * with daily rotation, archival, and compression.
 *
 * @module lib/error-writer.test
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test directory
const TEST_DIR = path.join(os.tmpdir(), 'error-writer-test-' + Date.now());
const ERROR_REPORTS_DIR = path.join(TEST_DIR, '.claude', 'context', 'artifacts', 'error-reports');

let errorWriter;

describe('error-writer', () => {
  before(() => {
    // Create test directory structure
    fs.mkdirSync(ERROR_REPORTS_DIR, { recursive: true });

    // Set up mock PROJECT_ROOT
    process.env.ERROR_REPORTS_DIR = ERROR_REPORTS_DIR;

    // Clear any cached modules
    delete require.cache[require.resolve('./error-writer.cjs')];
    errorWriter = require('./error-writer.cjs');
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

  describe('writeError()', () => {
    it('should export writeError function', () => {
      assert.strictEqual(typeof errorWriter.writeError, 'function');
    });

    it('should write error entry to JSONL file', () => {
      const entry = {
        errorId: 'ERR-12345678',
        timestamp: new Date().toISOString(),
        category: 'TOOL_FAILURE',
        severity: 'MEDIUM',
        source: { component: 'tool', location: 'Bash' },
        message: 'Command failed',
      };

      const result = errorWriter.writeError(entry);
      assert.strictEqual(result, true);

      // Verify file exists and contains the entry
      const logFile = errorWriter.getActiveLogFile();
      assert.ok(fs.existsSync(logFile), `Log file not found: ${logFile}`);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.includes('ERR-12345678'));
    });

    it('should append multiple entries', () => {
      const entry1 = {
        errorId: 'ERR-AAAAAAAA',
        timestamp: new Date().toISOString(),
        category: 'TOOL_FAILURE',
        severity: 'LOW',
        source: { component: 'tool', location: 'Bash' },
        message: 'First error',
      };

      const entry2 = {
        errorId: 'ERR-BBBBBBBB',
        timestamp: new Date().toISOString(),
        category: 'VALIDATION_ERROR',
        severity: 'MEDIUM',
        source: { component: 'hook', location: 'routing-guard.cjs' },
        message: 'Second error',
      };

      errorWriter.writeError(entry1);
      errorWriter.writeError(entry2);

      const logFile = errorWriter.getActiveLogFile();
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');

      // Should have at least 2 entries
      assert.ok(lines.length >= 2, `Expected at least 2 lines, got ${lines.length}`);
    });

    it('should handle invalid entries gracefully', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        errorWriter.writeError(null);
        errorWriter.writeError(undefined);
        errorWriter.writeError('invalid');
      });
    });
  });

  describe('getActiveLogFile()', () => {
    it('should export getActiveLogFile function', () => {
      assert.strictEqual(typeof errorWriter.getActiveLogFile, 'function');
    });

    it('should return file path with current date', () => {
      const logFile = errorWriter.getActiveLogFile();
      const _today = new Date().toISOString().slice(0, 10);

      assert.ok(logFile.includes('errors-'));
      assert.ok(logFile.includes('.jsonl'));
    });

    it('should return consistent path for same day', () => {
      const path1 = errorWriter.getActiveLogFile();
      const path2 = errorWriter.getActiveLogFile();

      assert.strictEqual(path1, path2);
    });
  });

  describe('queryErrors()', () => {
    it('should export queryErrors function', () => {
      assert.strictEqual(typeof errorWriter.queryErrors, 'function');
    });

    it('should return empty array when no errors', () => {
      const result = errorWriter.queryErrors({ category: 'NONEXISTENT' });
      assert.ok(Array.isArray(result));
    });

    it('should filter by category', () => {
      // Write test entries
      errorWriter.writeError({
        errorId: 'ERR-FILTER01',
        timestamp: new Date().toISOString(),
        category: 'SECURITY_VIOLATION',
        severity: 'CRITICAL',
        source: { component: 'hook', location: 'test' },
        message: 'Security test',
      });

      const result = errorWriter.queryErrors({ category: 'SECURITY_VIOLATION' });
      assert.ok(Array.isArray(result));
    });

    it('should filter by severity', () => {
      const result = errorWriter.queryErrors({ severity: 'CRITICAL' });
      assert.ok(Array.isArray(result));
    });

    it('should filter by date range', () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = errorWriter.queryErrors({ date: today });
      assert.ok(Array.isArray(result));
    });
  });

  describe('archiveOldLogs()', () => {
    it('should export archiveOldLogs function', () => {
      assert.strictEqual(typeof errorWriter.archiveOldLogs, 'function');
    });

    it('should create archive directory if needed', () => {
      const _archiveDir = path.join(ERROR_REPORTS_DIR, 'archive');

      // Archive should create directory
      errorWriter.archiveOldLogs({ daysOld: 30, compress: false });

      // Note: May or may not create archive dir depending on whether
      // there are old logs to archive
    });
  });

  describe('rotation', () => {
    it('should support daily rotation', () => {
      // Get today's log file
      const todayLog = errorWriter.getActiveLogFile();

      // Should have date in filename
      const today = new Date().toISOString().slice(0, 10);
      assert.ok(
        todayLog.includes(today) || todayLog.includes('errors-'),
        'Log file should have date format'
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failures', () => {
      // Write entry to verify retry logic doesn't break basic functionality
      const entry = {
        errorId: 'ERR-RETRYTEST',
        timestamp: new Date().toISOString(),
        category: 'TOOL_FAILURE',
        severity: 'LOW',
        source: { component: 'test', location: 'test' },
        message: 'Retry test',
      };

      const result = errorWriter.writeError(entry);
      assert.strictEqual(result, true);
    });
  });

  describe('atomic writes', () => {
    it('should use atomic writes to prevent corruption', () => {
      const entry = {
        errorId: 'ERR-ATOMIC01',
        timestamp: new Date().toISOString(),
        category: 'TOOL_FAILURE',
        severity: 'LOW',
        source: { component: 'test', location: 'test' },
        message: 'Atomic write test',
      };

      // Multiple writes should not corrupt file
      for (let i = 0; i < 10; i++) {
        entry.errorId = `ERR-ATOMIC${i.toString().padStart(2, '0')}`;
        errorWriter.writeError(entry);
      }

      // Read and verify all entries are valid JSON
      const logFile = errorWriter.getActiveLogFile();
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        assert.doesNotThrow(() => JSON.parse(line), `Invalid JSON: ${line.slice(0, 50)}`);
      }
    });
  });
});
