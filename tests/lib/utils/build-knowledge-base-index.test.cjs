'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const builder = require(
  path.resolve(__dirname, '../../../.claude/lib/utils/build-knowledge-base-index.cjs')
);

test('escapeCSV prefixes dangerous values before applying CSV quoting', () => {
  assert.equal(builder.escapeCSV('- item, with comma'), '"\'- item, with comma"');
});

test('escapeCSV prefixes formula values that start with CR or LF', () => {
  assert.equal(builder.escapeCSV('\n=1+1').startsWith("'"), true);
  assert.equal(builder.escapeCSV('\r@cmd').startsWith("'"), true);
});

test('escapeCSV keeps generated index rows single-line', () => {
  assert.equal(builder.escapeCSV('first\nsecond, third'), '"first second, third"');
});
