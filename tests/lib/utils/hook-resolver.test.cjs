'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveHookRequire } = require('../../../.claude/lib/utils/hook-resolver.cjs');

test('resolveHookRequire resolves ../ paths relative to .claude/lib/utils', () => {
  const mod = resolveHookRequire('../utils/safe-json.cjs');
  assert.equal(typeof mod.safeParseJSON, 'function');
});

test('resolveHookRequire resolves ../../lib/ shorthand as lib-relative', () => {
  const mod = resolveHookRequire('../../lib/utils/safe-json.cjs');
  assert.equal(typeof mod.safeParseJSON, 'function');
});
