'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  TEST_DB_PATH,
  setupTestDir,
  cleanupTestDir,
  getModule,
} = require('../../helpers/memory-lancedb-test-utils.cjs');

test('dimension mismatch returns reindex_required status via validateDimensions', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'resilience_dim_check',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.addDocuments([{ id: 'd1', text: 'hello world', metadata: { kind: 'seed' } }]);

  const mismatched = new Array(512).fill(0.5);
  const status = await store.validateDimensions(mismatched, 'vector');

  assert.equal(status.status, 'reindex_required');
  assert.equal(status.expectedDimension, 384);
  assert.equal(status.actualDimension, 512);
  assert.match(status.reason, /Re-indexing Required/i);
});

test('searchResilient catches mismatch and returns reindex_required', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'resilience_search',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.addDocuments([{ id: 'd1', text: 'resilience entry', metadata: { type: 'seed' } }]);

  // Simulate schema drift by forcing cached table dimension.
  store._tableVectorDim = 512;

  const result = await store.searchResilient('resilience query', { limit: 5 });
  assert.equal(result.status, 'reindex_required');
  assert.deepEqual(result.results, []);
  assert.match(String(result.reason || ''), /Re-indexing Required/i);
});

test('safeRebuild archives old table metadata and allows fresh writes', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'resilience_rebuild',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.addDocuments([
    { id: 'd1', text: 'old model text', metadata: { version: 1 } },
    { id: 'd2', text: 'old model text 2', metadata: { version: 1 } },
  ]);

  const rebuild = await store.safeRebuild();
  assert.equal(rebuild.status, 'rebuilt');
  assert.equal(rebuild.tableExisted, true);
  assert.equal(fs.existsSync(rebuild.archivePath), true);
  assert.equal(path.extname(rebuild.archivePath), '.json');

  await store.addDocuments([{ id: 'd3', text: 'new model text', metadata: { version: 2 } }]);
  const rows = await store.search('new model text', { limit: 5 });
  assert.ok(Array.isArray(rows));
});
