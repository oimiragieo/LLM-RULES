'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isCommandAllowed } = require('../../../.claude/lib/safety/command-allowlist.cjs');

test('does not treat harmless substrings as dangerous flags', () => {
  const verdict = isCommandAllowed('find . -name "firmware.txt"');
  assert.equal(verdict.allowed, true);
});

test('blocks dangerous token usage for find', () => {
  const verdict = isCommandAllowed('find . -name "*.tmp" -exec rm {} \\;');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /dangerous flag/i);
});

test('blocks dangerous token usage for git', () => {
  const verdict = isCommandAllowed('git reset --hard HEAD~1');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /(dangerous flag|does not match allowed patterns)/i);
});

test('blocks command substitution with $() even for allowlisted commands', () => {
  const verdict = isCommandAllowed('echo $(rm -rf /tmp/demo)');
  assert.equal(verdict.allowed, false);
});

test('blocks backtick command substitution even for allowlisted commands', () => {
  const verdict = isCommandAllowed('echo `whoami`');
  assert.equal(verdict.allowed, false);
});
