/**
 * Tests for safe-path module (Windows Path Traversal Hardening - CVE-2025-27210)
 *
 * @see .claude/lib/utils/safe-path.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Module under test
const {
  isWindowsReservedName,
  hasPathTraversal,
  isUNCPath,
  sanitizePath,
  validatePathSafe,
  validatePathSegments,
} = require(path.join(process.cwd(), '.claude', 'lib', 'utils', 'safe-path.cjs'));

describe('safe-path module', () => {
  describe('isWindowsReservedName()', () => {
    it('detects CON as reserved (case-insensitive)', () => {
      assert.strictEqual(isWindowsReservedName('CON'), true);
      assert.strictEqual(isWindowsReservedName('con'), true);
      assert.strictEqual(isWindowsReservedName('Con'), true);
    });

    it('detects NUL, PRN, AUX as reserved', () => {
      assert.strictEqual(isWindowsReservedName('NUL'), true);
      assert.strictEqual(isWindowsReservedName('PRN'), true);
      assert.strictEqual(isWindowsReservedName('AUX'), true);
    });

    it('detects COM1-COM9 as reserved', () => {
      assert.strictEqual(isWindowsReservedName('COM1'), true);
      assert.strictEqual(isWindowsReservedName('com9'), true);
      assert.strictEqual(isWindowsReservedName('COM3'), true);
    });

    it('detects LPT1-LPT9 as reserved', () => {
      assert.strictEqual(isWindowsReservedName('LPT1'), true);
      assert.strictEqual(isWindowsReservedName('lpt9'), true);
      assert.strictEqual(isWindowsReservedName('LPT3'), true);
    });

    it('detects reserved names with extensions (CON.txt, NUL.md)', () => {
      assert.strictEqual(isWindowsReservedName('CON.txt'), true);
      assert.strictEqual(isWindowsReservedName('NUL.md'), true);
      assert.strictEqual(isWindowsReservedName('AUX.log'), true);
    });

    it('allows valid filenames (CONTROL, NULIFY, CONTRACT)', () => {
      assert.strictEqual(isWindowsReservedName('CONTROL'), false);
      assert.strictEqual(isWindowsReservedName('NULIFY'), false);
      assert.strictEqual(isWindowsReservedName('CONTRACT'), false);
      assert.strictEqual(isWindowsReservedName('console.log'), false);
    });

    it('allows normal filenames', () => {
      assert.strictEqual(isWindowsReservedName('README.md'), false);
      assert.strictEqual(isWindowsReservedName('index.cjs'), false);
      assert.strictEqual(isWindowsReservedName('safe-path.cjs'), false);
    });
  });

  describe('hasPathTraversal()', () => {
    it('detects ../ traversal', () => {
      assert.strictEqual(hasPathTraversal('../etc/passwd'), true);
      assert.strictEqual(hasPathTraversal('foo/../../bar'), true);
    });

    it('detects backslash traversal', () => {
      assert.strictEqual(hasPathTraversal('..\\windows\\system32'), true);
    });

    it('allows relative paths without traversal', () => {
      assert.strictEqual(hasPathTraversal('foo/bar'), false);
      assert.strictEqual(hasPathTraversal('./foo'), false);
      assert.strictEqual(hasPathTraversal('a/b/c'), false);
    });
  });

  describe('isUNCPath()', () => {
    it('detects UNC paths (\\\\server\\share)', () => {
      assert.strictEqual(isUNCPath('\\\\server\\share'), true);
      assert.strictEqual(isUNCPath('\\\\?\\C:\\foo'), true);
    });

    it('allows normal paths with single backslash', () => {
      assert.strictEqual(isUNCPath('C:\\Users\\foo'), false);
      assert.strictEqual(isUNCPath('.claude\\lib'), false);
    });
  });

  describe('sanitizePath()', () => {
    it('normalizes backslashes to forward slashes', () => {
      assert.strictEqual(sanitizePath('foo\\bar\\baz'), 'foo/bar/baz');
    });

    it('removes null bytes', () => {
      assert.strictEqual(sanitizePath('foo\x00bar'), 'foobar');
    });

    it('trims leading/trailing whitespace', () => {
      assert.strictEqual(sanitizePath('  foo/bar  '), 'foo/bar');
    });
  });

  describe('validatePathSafe()', () => {
    it('returns { safe: true } for valid paths', () => {
      const result = validatePathSafe('.claude/lib/utils/safe-path.cjs');
      assert.strictEqual(result.safe, true);
    });

    it('returns { safe: false, reason } for reserved names', () => {
      const result = validatePathSafe('output/CON.txt');
      assert.strictEqual(result.safe, false);
      assert.ok(result.reason.toLowerCase().includes('reserved'));
    });

    it('returns { safe: false, reason } for path traversal', () => {
      const result = validatePathSafe('../../../etc/passwd');
      assert.strictEqual(result.safe, false);
      assert.ok(result.reason.toLowerCase().includes('traversal'));
    });

    it('returns { safe: false, reason } for UNC paths', () => {
      const result = validatePathSafe('\\\\server\\share\\file');
      assert.strictEqual(result.safe, false);
      assert.ok(result.reason.toLowerCase().includes('unc'));
    });

    it('returns { safe: false, reason } for null bytes', () => {
      const result = validatePathSafe('foo\x00bar');
      assert.strictEqual(result.safe, false);
      assert.ok(result.reason.toLowerCase().includes('null'));
    });
  });

  describe('validatePathSegments()', () => {
    it('checks each segment of a path for reserved names', () => {
      const result = validatePathSegments('output/CON/file.txt');
      assert.strictEqual(result.safe, false);
      assert.ok(result.reason.includes('CON'));
    });

    it('passes paths with no reserved segments', () => {
      const result = validatePathSegments('.claude/context/plans/my-plan.md');
      assert.strictEqual(result.safe, true);
    });
  });
});
