#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const skillMain = require('../../.claude/skills/code-semantic-search/scripts/main.cjs');

test('code-semantic-search delegates query mode to hybrid-search', () => {
  const result = skillMain.main({ query: 'auth middleware pattern' });
  assert.equal(result.ok, true);
  assert.equal(result.delegated, 'hybrid-search');
  assert.deepEqual(result.args, ['auth middleware pattern']);
});

test('code-semantic-search supports structure mode', () => {
  const result = skillMain.main({ mode: 'structure' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.args, ['--structure']);
});

test('code-semantic-search validates file mode requirements', () => {
  const result = skillMain.main({ mode: 'file' });
  assert.equal(result.ok, false);
  assert.match(result.error, /filePath is required/i);
});
