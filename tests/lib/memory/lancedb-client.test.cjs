#!/usr/bin/env node
/**
 * LanceDB Client Tests - Critical Memory Vector Storage
 * =====================================================
 *
 * Tests for:
 * 1. CRITICAL: dropTable method does NOT delete directory (FIX-MEMORY-CRITICAL-001)
 * 2. Table creation and initialization
 * 3. Error handling (DB connection failures, invalid paths)
 * 4. Concurrent table operations
 * 5. Embedding generation and vector operations
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

// Test directory setup
const TEST_DIR = path.join(__dirname, '.test-lancedb');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-lancedb');

/**
 * Setup test directory
 */
function setupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

/**
 * Cleanup test directory
 */
function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

/**
 * Get fresh module (clear require cache)
 */
function getModule() {
  const modulePath = require.resolve('../../../.claude/lib/memory/lancedb-client.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

// =============================================================================
// Test Suite 1: CRITICAL - dropTable does NOT delete directory
// =============================================================================

test('dropTable - CRITICAL: does NOT delete directory when dropping table', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  // Create store with test embedding mode (no network/model download)
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Add a document to create the table
  await store.addDocuments([
    { id: 'doc1', text: 'Test document for table creation', metadata: { type: 'test' } },
  ]);

  // Verify directory and table exist
  assert.ok(fs.existsSync(TEST_DB_PATH), 'DB directory should exist after initialization');
  const tablesBefore = await store.listTables();
  assert.ok(tablesBefore.includes('test_table'), 'Table should exist before drop');

  // Drop the table
  const dropResult = await store.dropTable();
  assert.strictEqual(dropResult, true, 'dropTable should return true');

  // CRITICAL CHECK: Directory should still exist (fix for Issue #1)
  assert.ok(
    fs.existsSync(TEST_DB_PATH),
    'CRITICAL: DB directory should still exist after dropTable (Issue #1 fix)'
  );

  // Table reference should be cleared
  assert.strictEqual(store.table, null, 'Table reference should be null after drop');

  await store.close();
});

test('dropTable - returns false when table does not exist', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'nonexistent_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Drop table that doesn't exist
  const dropResult = await store.dropTable();
  assert.strictEqual(dropResult, false, 'dropTable should return false for nonexistent table');

  await store.close();
});

test('dropTable - clears table vector dimension cache', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'dimension_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Add document to create table
  await store.addDocuments([
    { id: 'doc1', text: 'Dimension test document', metadata: {} },
  ]);

  // Get dimension (caches it)
  const dimBefore = await store.getTableVectorDimension();
  assert.strictEqual(dimBefore, 384, 'Dimension should be 384 (test mode)');

  // Drop table
  await store.dropTable();

  // Cached dimension should be cleared
  assert.strictEqual(store._tableVectorDim, null, 'Dimension cache should be cleared after drop');

  await store.close();
});

// =============================================================================
// Test Suite 2: Table creation and initialization
// =============================================================================

test('initialize - creates directory if not exists', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();
  const newDbPath = path.join(TEST_DIR, 'new-db-dir');

  assert.ok(!fs.existsSync(newDbPath), 'Directory should not exist before init');

  const store = new MemoryVectorStore({
    persistDirectory: newDbPath,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  assert.ok(fs.existsSync(newDbPath), 'Directory should be created after init');
  assert.strictEqual(store.isInitialized, true, 'Store should be initialized');

  await store.close();
});

test('initialize - idempotent (can be called multiple times)', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();
  assert.strictEqual(store.isInitialized, true);

  // Call initialize again - should not throw
  await store.initialize();
  assert.strictEqual(store.isInitialized, true);

  await store.close();
});

test('initialize - opens existing table if present', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  // First store creates table
  const store1 = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'existing_table',
    embeddingMode: 'test',
  });

  await store1.initialize();
  await store1.addDocuments([
    { id: 'doc1', text: 'Document for existing table test', metadata: {} },
  ]);
  await store1.close();

  // Second store opens existing table
  const store2 = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'existing_table',
    embeddingMode: 'test',
  });

  await store2.initialize();
  assert.ok(store2.table !== null, 'Table should be opened from existing data');

  await store2.close();
});

// =============================================================================
// Test Suite 3: Error handling
// =============================================================================

test('initialize - handles invalid embedding mode', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'invalid_mode',
  });

  await assert.rejects(
    store.initialize(),
    /Unknown embeddingMode/,
    'Should throw for invalid embedding mode'
  );
});

test('generateEmbedding - throws when embeddings disabled', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'off',
  });

  await store.initialize();

  await assert.rejects(
    store.generateEmbedding('test text'),
    /Embeddings disabled/,
    'Should throw when embeddings are disabled'
  );

  await store.close();
});

test('search - returns empty array when table does not exist', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'empty_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  const results = await store.search('test query');
  assert.deepStrictEqual(results, [], 'Should return empty array for nonexistent table');

  await store.close();
});

test('addDocuments - skips empty documents array', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Should not throw for empty array
  await store.addDocuments([]);
  await store.addDocuments(null);
  await store.addDocuments(undefined);

  // Table should still be null (not created)
  assert.strictEqual(store.table, null, 'Table should not be created for empty documents');

  await store.close();
});

test('addDocuments - skips documents without text', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Documents without text should be skipped
  await store.addDocuments([
    { id: 'no-text', metadata: { type: 'empty' } },
    { id: 'has-text', text: 'Valid document', metadata: {} },
  ]);

  const results = await store.search('Valid document');
  assert.strictEqual(results.length, 1, 'Only document with text should be added');

  await store.close();
});

// =============================================================================
// Test Suite 4: Concurrent operations
// =============================================================================

test('concurrent addDocuments - handles parallel inserts', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'concurrent_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Add initial document to create table
  await store.addDocuments([
    { id: 'init', text: 'Initial document', metadata: {} },
  ]);

  // Parallel inserts
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      store.addDocuments([
        { id: `doc-${i}`, text: `Concurrent document ${i}`, metadata: { index: i } },
      ])
    );
  }

  // Should all complete without error
  await Promise.all(promises);

  // Verify all documents exist
  const results = await store.search('Concurrent document', { limit: 10 });
  assert.ok(results.length >= 5, 'All concurrent documents should be added');

  await store.close();
});

test('shared store - returns same instance for same config', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const config = {
    persistDirectory: TEST_DB_PATH,
    collectionName: 'shared_table',
    embeddingMode: 'test',
  };

  const store1 = MemoryVectorStore.getSharedStore(config);
  const store2 = MemoryVectorStore.getSharedStore(config);

  assert.strictEqual(store1, store2, 'Should return same instance for same config');
  assert.strictEqual(store1.isShared(), true, 'Shared store should report isShared=true');
});

test('shared store - different instances for different configs', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store1 = MemoryVectorStore.getSharedStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'table_a',
    embeddingMode: 'test',
  });

  const store2 = MemoryVectorStore.getSharedStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'table_b',
    embeddingMode: 'test',
  });

  assert.notStrictEqual(store1, store2, 'Should return different instances for different configs');
});

// =============================================================================
// Test Suite 5: Embedding and vector operations
// =============================================================================

test('generateEmbedding - test mode produces stable embeddings', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  const embedding1 = await store.generateEmbedding('test text');
  const embedding2 = await store.generateEmbedding('test text');

  assert.strictEqual(embedding1.length, 384, 'Test embedding should be 384 dimensions');
  assert.deepStrictEqual(embedding1, embedding2, 'Same text should produce same embedding');

  await store.close();
});

test('getEmbeddingDimension - returns correct dimension for test mode', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  const dim = await store.getEmbeddingDimension();
  assert.strictEqual(dim, 384, 'Test mode should report 384 dimensions');

  await store.close();
});

test('getEmbeddingDimension - returns null when embeddings off', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'off',
  });

  await store.initialize();

  const dim = await store.getEmbeddingDimension();
  assert.strictEqual(dim, null, 'Should return null when embeddings are off');

  await store.close();
});

// =============================================================================
// Test Suite 6: Search operations
// =============================================================================

test('search - filters by similarity threshold', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'search_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  await store.addDocuments([
    { id: 'doc1', text: 'apple banana cherry', metadata: {} },
    { id: 'doc2', text: 'dog elephant fox', metadata: {} },
  ]);

  const results = await store.search('apple banana', { limit: 10, minScore: 0.9 });

  // Results above threshold should be returned
  for (const r of results) {
    assert.ok(r.similarity >= 0.9, `Result should have similarity >= 0.9, got ${r.similarity}`);
  }

  await store.close();
});

test('search - applies limit correctly', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'limit_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Add many documents
  const docs = [];
  for (let i = 0; i < 20; i++) {
    docs.push({ id: `doc-${i}`, text: `Document number ${i} with content`, metadata: {} });
  }
  await store.addDocuments(docs);

  const results = await store.search('Document number', { limit: 5 });
  assert.strictEqual(results.length, 5, 'Should return exactly 5 results');

  await store.close();
});

// =============================================================================
// Test Suite 7: Upsert and delete operations
// =============================================================================

test('upsertDocuments - updates existing document', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'upsert_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Add initial document
  await store.addDocuments([
    { id: 'upsert-doc', text: 'Original content', metadata: { version: 1 } },
  ]);

  // Upsert with new content
  await store.upsertDocuments([
    { id: 'upsert-doc', text: 'Updated content', metadata: { version: 2 } },
  ]);

  const results = await store.search('Updated content', { limit: 10 });
  assert.ok(results.length >= 1, 'Should find updated document');

  await store.close();
});

test('deleteByMetadata - removes documents matching filter', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'delete_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  await store.addDocuments([
    { id: 'keep', text: 'Keep this document', metadata: { type: 'keep' } },
    { id: 'delete', text: 'Delete this document', metadata: { type: 'delete' } },
  ]);

  const deleted = await store.deleteByMetadata('type', 'delete');
  assert.strictEqual(deleted, true, 'deleteByMetadata should return true');

  await store.close();
});

test('deleteByMetadata - returns false when table does not exist', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'empty_delete_test',
    embeddingMode: 'test',
  });

  await store.initialize();

  const deleted = await store.deleteByMetadata('type', 'nonexistent');
  assert.strictEqual(deleted, false, 'deleteByMetadata should return false for no table');

  await store.close();
});

// =============================================================================
// Test Suite 8: Status and utility methods
// =============================================================================

test('isAvailable - returns true after successful init', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  const available = await store.isAvailable();
  assert.strictEqual(available, true, 'Store should be available');

  await store.close();
});

test('isMockMode - returns false for test mode', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_table',
    embeddingMode: 'test',
  });

  await store.initialize();

  assert.strictEqual(store.isMockMode(), false, 'Test mode should not be mock mode');

  await store.close();
});

test('getEmbeddingStatus - returns status object', async (t) => {
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
  assert.ok(status, 'Should return status object');
  assert.strictEqual(status.status, 'ready', 'Status should be ready for test mode');
  assert.strictEqual(status.mode, 'test', 'Mode should be test');

  await store.close();
});

test('listTables - returns array of table names', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'list_test',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.addDocuments([
    { id: 'doc1', text: 'Test document', metadata: {} },
  ]);

  const tables = await store.listTables();
  assert.ok(Array.isArray(tables), 'Should return array');
  assert.ok(tables.includes('list_test'), 'Should include created table');

  await store.close();
});

test('close - clears internal state', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'close_test',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.close();

  assert.strictEqual(store.db, null, 'db should be null after close');
  assert.strictEqual(store.table, null, 'table should be null after close');
  assert.strictEqual(store.isInitialized, false, 'isInitialized should be false after close');
});

test('close - no-op for shared stores', async (t) => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = getModule();

  const store = MemoryVectorStore.getSharedStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'shared_close_test',
    embeddingMode: 'test',
  });

  await store.initialize();
  await store.close();

  // Shared store should not be cleared
  assert.ok(store.db !== null || store.isInitialized, 'Shared store should not be fully cleared');
});
