'use strict';

const { normalizePath, normalizeGlobPattern, escapePathForRegex } = require('../../../.claude/lib/utils/path-utils.cjs');
const assert = require('assert');
const test = require('node:test');

test('Path Utils (Cross-Platform)', async t => {
  await t.test('should normalize Windows backslashes to forward slashes', () => {
    assert.strictEqual(normalizePath('src\\utils\\helper.js'), 'src/utils/helper.js');
  });

  await t.test('should handle mixed slashes', () => {
    assert.strictEqual(normalizePath('src/utils\\helper.js'), 'src/utils/helper.js');
  });

  await t.test('should handle already normalized paths', () => {
    assert.strictEqual(normalizePath('src/utils/helper.js'), 'src/utils/helper.js');
  });

  await t.test('should return non-strings as is', () => {
    assert.strictEqual(normalizePath(null), null);
    assert.strictEqual(normalizePath(undefined), undefined);
  });

  await t.test('should normalize glob patterns', () => {
    assert.strictEqual(normalizeGlobPattern('**\\*.js'), '**/*.js');
  });

  await t.test('should escape paths for regex', () => {
    assert.strictEqual(escapePathForRegex('src/utils/helper.js'), 'src/utils/helper\\.js');
    assert.strictEqual(escapePathForRegex('C:\\dev\\project'), 'C:\\\\dev\\\\project');
  });
});
