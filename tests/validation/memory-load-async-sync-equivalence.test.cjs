#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const memoryManager = require('../../.claude/lib/memory/memory-manager.cjs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => JSON.stringify(item)).sort();
  }
  return value;
}

test('loadMemoryForContextAsync matches sync load contract for same project root', async () => {
  const syncResult = memoryManager.loadMemoryForContext(PROJECT_ROOT);
  const asyncResult = await memoryManager.loadMemoryForContextAsync(PROJECT_ROOT);

  const expectedKeys = [
    'decisions',
    'discoveries',
    'gotchas',
    'legacy_summary',
    'patterns',
    'recent_sessions',
  ];

  assert.deepEqual(Object.keys(syncResult).sort(), expectedKeys);
  assert.deepEqual(Object.keys(asyncResult).sort(), expectedKeys);

  for (const key of expectedKeys) {
    assert.deepEqual(
      normalizeValue(asyncResult[key]),
      normalizeValue(syncResult[key]),
      `Mismatch for key ${key}`
    );
  }
});
