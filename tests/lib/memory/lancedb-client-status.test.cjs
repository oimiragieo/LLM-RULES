'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEST_DB_PATH,
  setupTestDir,
  cleanupTestDir,
  getModule,
} = require('../../helpers/memory-lancedb-test-utils.cjs');

test('isMockMode returns true for test mode', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();
  assert.strictEqual(store.isMockMode(), true);
  await store.close();
});

test('getEmbeddingStatus returns ready status for test mode', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();
  const status = store.getEmbeddingStatus();
  assert.ok(status);
  assert.strictEqual(status.status, 'ready');
  assert.strictEqual(status.mode, 'test');
  await store.close();
});
