'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  canonicalizePathForPlatform,
} = require('../../../.claude/lib/utils/path-canonicalizer.cjs');

function normalizeForCompare(value) {
  return String(value).replace(/\\/g, '/').toLowerCase();
}

test('S0: canonicalizePathForPlatform normalizes equivalent absolute paths', () => {
  const forward = canonicalizePathForPlatform('C:/dev/projects/agent-studio/.claude/context/memory/patterns.json');
  const back = canonicalizePathForPlatform('C:\\dev\\projects\\agent-studio\\.claude\\context\\memory\\patterns.json');
  const mixed = canonicalizePathForPlatform('C:/dev\\projects/agent-studio\\.claude/context\\memory/patterns.json');

  assert.equal(normalizeForCompare(forward), normalizeForCompare(back));
  assert.equal(normalizeForCompare(forward), normalizeForCompare(mixed));
});

test('S0: canonicalizePathForPlatform resolves equivalent relative paths to same canonical form', () => {
  const projectRoot = path.resolve('C:/dev/projects/agent-studio');
  const forward = canonicalizePathForPlatform('.claude/context/memory/gotchas.json', projectRoot);
  const back = canonicalizePathForPlatform('.claude\\context\\memory\\gotchas.json', projectRoot);
  const mixed = canonicalizePathForPlatform('.claude/context\\memory/gotchas.json', projectRoot);

  assert.equal(normalizeForCompare(forward), normalizeForCompare(back));
  assert.equal(normalizeForCompare(forward), normalizeForCompare(mixed));
});
