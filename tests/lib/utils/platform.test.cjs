#!/usr/bin/env node
/**
 * Tests for platform.cjs - Cross-platform path and shell handling utilities
 *
 * Run with: node --test .claude/lib/utils/platform.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const platform = require('../../../.claude/lib/utils/platform.cjs');

describe('platform.cjs', () => {
  describe('bashPath()', () => {
    it('should convert Windows backslashes to forward slashes', () => {
      const result = platform.bashPath('C:\\Users\\name\\project');
      assert.strictEqual(result, 'C:/Users/name/project');
    });

    it('should leave Unix paths unchanged', () => {
      const result = platform.bashPath('/home/user/project');
      assert.strictEqual(result, '/home/user/project');
    });

    it('should handle mixed separators', () => {
      const result = platform.bashPath('C:\\Users/name\\project/file.txt');
      assert.strictEqual(result, 'C:/Users/name/project/file.txt');
    });

    it('should handle empty string', () => {
      const result = platform.bashPath('');
      assert.strictEqual(result, '');
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(platform.bashPath(null), null);
      assert.strictEqual(platform.bashPath(undefined), undefined);
    });

    it('should handle path with spaces', () => {
      const result = platform.bashPath('C:\\Program Files\\My App\\file.txt');
      assert.strictEqual(result, 'C:/Program Files/My App/file.txt');
    });

    it('should handle deep nested paths', () => {
      const result = platform.bashPath('C:\\a\\b\\c\\d\\e\\f\\g.txt');
      assert.strictEqual(result, 'C:/a/b/c/d/e/f/g.txt');
    });

    // SEC-REMEDIATION-002: Null byte sanitization tests
    it('should remove null bytes from path (SEC-REMEDIATION-002)', () => {
      const result = platform.bashPath('C:\\Users\0\\evil.txt');
      assert.strictEqual(result, 'C:/Users/evil.txt');
      assert.ok(!result.includes('\0'), 'null byte should be removed');
    });

    it('should remove multiple null bytes', () => {
      const result = platform.bashPath('C:\\Users\0\0\\path\0\\file.txt');
      assert.strictEqual(result, 'C:/Users/path/file.txt');
    });

    it('should handle non-string input gracefully', () => {
      // Numbers should pass through unchanged
      assert.strictEqual(platform.bashPath(123), 123);
      // Objects should pass through unchanged
      const obj = { path: 'test' };
      assert.strictEqual(platform.bashPath(obj), obj);
    });
  });

  describe('shellQuote()', () => {
    it('should quote paths with spaces', () => {
      const result = platform.shellQuote('C:/Program Files/app');
      // Result should contain the path and be quoted
      assert.ok(result.includes('C:/Program Files/app'));
      assert.ok(result.startsWith('"') || result.startsWith("'"));
    });

    it('should convert backslashes first', () => {
      const result = platform.shellQuote('C:\\Program Files\\app');
      // Should not contain backslashes in the output
      assert.ok(!result.includes('\\'));
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(platform.shellQuote(null), null);
      assert.strictEqual(platform.shellQuote(undefined), undefined);
    });
  });

  describe('bashSafePath()', () => {
    it('should combine bashPath and shellQuote', () => {
      const result = platform.bashSafePath('C:\\Users\\test\\file.txt');
      // Should be quoted and have forward slashes
      assert.ok(!result.includes('\\'));
      assert.ok(result.includes('C:/Users/test/file.txt'));
    });
  });

  describe('isWindowsAbsolutePath()', () => {
    it('should detect Windows paths with backslash', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath('C:\\Users\\test'), true);
    });

    it('should detect Windows paths with forward slash', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath('C:/Users/test'), true);
    });

    it('should reject Unix paths', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath('/home/user'), false);
    });

    it('should reject relative paths', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath('relative/path'), false);
    });

    it('should handle lowercase drive letter', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath('c:\\Users\\test'), true);
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(platform.isWindowsAbsolutePath(null), false);
      assert.strictEqual(platform.isWindowsAbsolutePath(undefined), false);
    });
  });

  describe('isUnixAbsolutePath()', () => {
    it('should detect Unix absolute paths', () => {
      assert.strictEqual(platform.isUnixAbsolutePath('/home/user'), true);
    });

    it('should reject Windows paths', () => {
      assert.strictEqual(platform.isUnixAbsolutePath('C:\\Users\\test'), false);
    });

    it('should reject relative paths', () => {
      assert.strictEqual(platform.isUnixAbsolutePath('relative/path'), false);
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(platform.isUnixAbsolutePath(null), false);
      assert.strictEqual(platform.isUnixAbsolutePath(undefined), false);
    });
  });

  describe('isAbsolutePath()', () => {
    it('should detect Windows absolute paths', () => {
      assert.strictEqual(platform.isAbsolutePath('C:\\Users\\test'), true);
    });

    it('should detect Unix absolute paths', () => {
      assert.strictEqual(platform.isAbsolutePath('/home/user'), true);
    });

    it('should reject relative paths', () => {
      assert.strictEqual(platform.isAbsolutePath('relative/path'), false);
    });
  });

  describe('normalizeLineEndings()', () => {
    it('should convert CRLF to LF', () => {
      const result = platform.normalizeLineEndings('line1\r\nline2\r\nline3');
      assert.strictEqual(result, 'line1\nline2\nline3');
    });

    it('should convert CR to LF', () => {
      const result = platform.normalizeLineEndings('line1\rline2\rline3');
      assert.strictEqual(result, 'line1\nline2\nline3');
    });

    it('should leave LF unchanged', () => {
      const result = platform.normalizeLineEndings('line1\nline2\nline3');
      assert.strictEqual(result, 'line1\nline2\nline3');
    });

    it('should handle mixed line endings', () => {
      const result = platform.normalizeLineEndings('line1\r\nline2\nline3\rline4');
      assert.strictEqual(result, 'line1\nline2\nline3\nline4');
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(platform.normalizeLineEndings(null), null);
      assert.strictEqual(platform.normalizeLineEndings(undefined), undefined);
    });
  });

  describe('platform detection constants', () => {
    it('should export isWindows', () => {
      assert.strictEqual(typeof platform.isWindows, 'boolean');
    });

    it('should export isMac', () => {
      assert.strictEqual(typeof platform.isMac, 'boolean');
    });

    it('should export isLinux', () => {
      assert.strictEqual(typeof platform.isLinux, 'boolean');
    });
  });
});
