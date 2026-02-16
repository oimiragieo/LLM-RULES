'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');

test('loadMemoryForContextAsync resolves expected context shape', async () => {
  const result = await memoryManager.loadMemoryForContextAsync(process.cwd());
  assert.equal(typeof result, 'object');
  assert.ok(Array.isArray(result.gotchas));
  assert.ok(Array.isArray(result.patterns));
  assert.ok(Array.isArray(result.recent_sessions));
});
