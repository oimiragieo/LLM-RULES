/**
 * Windows Path Normalization Tests
 *
 * Verifies that path.relative() output is normalized to forward slashes
 * across all modules that return paths to agents.
 *
 * Bug fixes validated:
 * - M-11: ast-grep-wrapper.cjs returns backslash paths to glob include
 * - M-12: standard-tools.cjs returns backslash paths in success messages
 * - M-13: skill-tool.cjs returns backslash filePath in skill objects
 *
 * Test execution: node --test tests/lib/windows-path-normalization.test.cjs
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Windows path normalization', () => {
  describe('ast-grep-wrapper.cjs: glob include paths use forward slashes', () => {
    test('path.relative output is normalized with .replace(/\\\\/g, "/")', () => {
      const src = fs.readFileSync(
        path.join(PROJECT_ROOT, '.claude/lib/code-indexing/ast-grep-wrapper.cjs'),
        'utf8'
      );
      // The include array construction should normalize paths
      assert.ok(
        src.includes("replace(/\\\\/g, '/')") || src.includes('replace(/\\\\/g, "/")'),
        'ast-grep-wrapper.cjs must normalize backslashes in glob include paths'
      );
    });
  });

  describe('standard-tools.cjs: success messages use forward slashes', () => {
    test('Write success message normalizes paths', () => {
      const src = fs.readFileSync(
        path.join(PROJECT_ROOT, '.claude/lib/tools/standard-tools.cjs'),
        'utf8'
      );
      // Count occurrences of path normalization in success messages
      const normalizations = (src.match(/path\.relative\([^)]+\)\.replace\(/g) || []).length;
      assert.ok(
        normalizations >= 3,
        `Expected at least 3 path normalizations in standard-tools.cjs, found ${normalizations}`
      );
    });
  });

  describe('skill-tool.cjs: filePath in skill objects uses forward slashes', () => {
    test('filePath assignment normalizes backslashes', () => {
      const src = fs.readFileSync(
        path.join(PROJECT_ROOT, '.claude/lib/tools/skill-tool.cjs'),
        'utf8'
      );
      // Both filePath assignments (success and error paths) should normalize
      const filePathLines = src.split('\n').filter(
        line => line.includes('filePath:') && line.includes('path.relative')
      );
      for (const line of filePathLines) {
        assert.ok(
          line.includes('replace'),
          `filePath assignment should normalize backslashes: ${line.trim()}`
        );
      }
      assert.ok(
        filePathLines.length >= 2,
        `Expected at least 2 filePath normalizations, found ${filePathLines.length}`
      );
    });
  });
});
