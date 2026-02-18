/**
 * Tests for project-root.cjs — regex gap fixes
 * Bug 2 regression: PATH_TRAVERSAL_PATTERNS regex /\.\./ is too broad,
 * blocking valid filenames like "some..thing" that contain ".." but are not
 * path traversal sequences.
 *
 * @see .claude/lib/utils/project-root.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Module under test
const { validatePathWithinProject, sanitizePath, PROJECT_ROOT } = require(
  path.join(process.cwd(), '.claude', 'lib', 'utils', 'project-root.cjs')
);

describe('project-root.cjs validatePathWithinProject()', () => {
  describe('traversal detection correctness', () => {
    it('blocks basic ../ traversal', () => {
      const result = validatePathWithinProject('../etc/passwd', PROJECT_ROOT);
      assert.strictEqual(result.safe, false, '../etc/passwd should be blocked');
    });

    it('blocks foo/../../etc traversal', () => {
      const result = validatePathWithinProject('foo/../../etc', PROJECT_ROOT);
      assert.strictEqual(result.safe, false, 'foo/../../etc should be blocked');
    });

    it('blocks trailing .. at end of path (foo/bar/..)', () => {
      const result = validatePathWithinProject('foo/bar/..', PROJECT_ROOT);
      assert.strictEqual(result.safe, false, 'foo/bar/.. should be blocked (trailing traversal)');
    });

    it('blocks standalone .. segment', () => {
      const result = validatePathWithinProject('..', PROJECT_ROOT);
      assert.strictEqual(result.safe, false, 'standalone .. should be blocked');
    });
  });

  describe('Bug 2 regression — overly broad regex false positives', () => {
    // The /\.\./ pattern in PATH_TRAVERSAL_PATTERNS matches any two consecutive dots
    // in a path string, which incorrectly blocks filenames like "some..thing".
    // Only segments that are exactly ".." should be traversal.
    it('allows filenames with dots-in-the-middle (not path traversal)', () => {
      const result = validatePathWithinProject('src/some..thing.js', PROJECT_ROOT);
      assert.strictEqual(
        result.safe,
        true,
        'src/some..thing.js should be allowed — ".." inside a filename is not path traversal'
      );
    });

    it('allows version strings with double-dot in filename (rare edge case)', () => {
      // e.g., dist/lodash..min.js — unusual but valid filename
      const result = validatePathWithinProject('dist/lodash..min.js', PROJECT_ROOT);
      assert.strictEqual(
        result.safe,
        true,
        'dist/lodash..min.js should be allowed — ".." inside a filename is not path traversal'
      );
    });

    it('allows paths where a directory name contains two dots (not a separator)', () => {
      // e.g., test/fixtures/v1..2/config.json
      const result = validatePathWithinProject('test/fixtures/v1..2/config.json', PROJECT_ROOT);
      assert.strictEqual(
        result.safe,
        true,
        'test/fixtures/v1..2/config.json should be allowed — ".." in dir name is not traversal'
      );
    });
  });

  describe('safe path allowances', () => {
    it('allows simple relative path', () => {
      const result = validatePathWithinProject('src/file.js', PROJECT_ROOT);
      assert.strictEqual(result.safe, true);
    });

    it('allows dotfile path', () => {
      const result = validatePathWithinProject('.claude/CLAUDE.md', PROJECT_ROOT);
      assert.strictEqual(result.safe, true);
    });

    it('allows path with version number (v1.2.3)', () => {
      const result = validatePathWithinProject('dist/v1.2.3/file.js', PROJECT_ROOT);
      assert.strictEqual(result.safe, true);
    });
  });

  describe('fail-closed for null/empty/invalid', () => {
    it('blocks null path', () => {
      const result = validatePathWithinProject(null, PROJECT_ROOT);
      assert.strictEqual(result.safe, false);
    });

    it('blocks undefined path', () => {
      const result = validatePathWithinProject(undefined, PROJECT_ROOT);
      assert.strictEqual(result.safe, false);
    });

    it('blocks empty string path', () => {
      const result = validatePathWithinProject('', PROJECT_ROOT);
      assert.strictEqual(result.safe, false);
    });

    it('blocks whitespace-only path', () => {
      const result = validatePathWithinProject('   ', PROJECT_ROOT);
      assert.strictEqual(result.safe, false);
    });
  });

  describe('sanitizePath()', () => {
    it('throws on traversal path', () => {
      assert.throws(() => sanitizePath('../etc/passwd', PROJECT_ROOT), /Path validation failed/);
    });

    it('returns resolved path for safe relative path', () => {
      const resolved = sanitizePath('src/file.js', PROJECT_ROOT);
      assert.strictEqual(resolved, path.resolve(PROJECT_ROOT, 'src/file.js'));
    });
  });
});
