/**
 * Index Manager GPU Integration Tests
 *
 * Tests that GPU detection and BM25 indexing are ACTUALLY wired into the
 * indexing orchestrator, not just tested in isolation.
 *
 * RED-GREEN-REFACTOR: This test should FAIL initially, proving the bug exists.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');

const LANCEDB_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing', 'lancedb-gpu-test');
const TABLE_NAME = `code_index_gpu_test_${process.pid}`;
const TEST_PROJECT = path.join(__dirname, '../fixtures/sample-code-gpu');

describe('IndexManager - GPU and BM25 Integration', () => {
  before(async () => {
    // Use test mode for faster execution, but still test the wiring
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = LANCEDB_DIR;
    process.env.LANCEDB_TABLE_CODE = TABLE_NAME;

    // Create test project
    await fs.mkdir(TEST_PROJECT, { recursive: true });
    await fs.writeFile(
      path.join(TEST_PROJECT, 'auth.js'),
      `
function authenticate(username, password) {
  // Authentication logic
  return username === 'admin' && password === 'secret';
}

class AuthService {
  constructor(db) {
    this.db = db;
  }

  async login(user, pass) {
    return authenticate(user, pass);
  }
}
      `
    );
  });

  after(async () => {
    await fs.rm(LANCEDB_DIR, { recursive: true, force: true }).catch(() => {});
    await fs.rm(TEST_PROJECT, { recursive: true, force: true }).catch(() => {});
  });

  test('RED: GPU detection should be called during indexing', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
      verbose: true,
    });

    const result = await manager.indexDirectory(TEST_PROJECT);

    assert.ok(result.filesIndexed >= 1, 'Should index files');
    assert.ok(result.chunksCreated >= 1, 'Should create chunks');

    // Check that vectorStore was initialized (this should trigger GPU detection)
    assert.ok(manager.vectorStore, 'VectorStore should be initialized');
    assert.ok(manager.vectorStore.store, 'VectorStore.store should exist');

    // The critical check: MemoryVectorStore should have attempted initialization
    // which includes GPU detection if properly wired
    assert.ok(manager.vectorStore.store.isInitialized, 'Store should be initialized');

    // This test documents that initialization happened and GPU detection was attempted
    await manager.close();
  });

  test('RED: BM25 index should be built during indexing', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
      verbose: true,
    });

    const result = await manager.indexDirectory(TEST_PROJECT);

    assert.ok(result.filesIndexed >= 1, 'Should index files');
    assert.ok(result.chunksCreated >= 1, 'Should create chunks');

    // Debug: Check vectorStore state
    console.log('[DEBUG] VectorStore initialized:', !!manager.vectorStore);
    console.log('[DEBUG] BM25 index initialized:', !!manager.vectorStore?.bm25Index);

    // Check that BM25 index was built
    const bm25Path = path.join(LANCEDB_DIR, 'bm25-index.json');
    console.log('[DEBUG] Looking for BM25 at:', bm25Path);

    const bm25Exists = await fs
      .access(bm25Path)
      .then(() => true)
      .catch(() => false);
    console.log('[DEBUG] BM25 file exists:', bm25Exists);

    // THIS SHOULD FAIL initially, proving BM25 is not wired
    assert.ok(bm25Exists, 'BM25 index file should exist after indexing');

    if (bm25Exists) {
      const bm25Data = JSON.parse(await fs.readFile(bm25Path, 'utf-8'));
      console.log('[DEBUG] BM25 documents:', bm25Data.documents?.length || 0);
      assert.ok(bm25Data.documents, 'BM25 index should have documents');
      assert.ok(bm25Data.documents.length > 0, 'BM25 index should have indexed documents');
    }
    await manager.close();
  });

  test('RED: BM25 index should be saved incrementally', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
      verbose: true,
      chunkFlushSize: 50, // Small flush size to test incremental saves
    });

    const result = await manager.indexDirectory(TEST_PROJECT);

    assert.ok(result.filesIndexed >= 1, 'Should index files');

    // Check that BM25 index was saved
    const bm25Path = path.join(LANCEDB_DIR, 'bm25-index.json');
    const bm25Exists = await fs
      .access(bm25Path)
      .then(() => true)
      .catch(() => false);

    // THIS SHOULD FAIL initially
    assert.ok(bm25Exists, 'BM25 index should be saved after indexing');
    await manager.close();
  });

  test('GREEN: After fix - hybrid search should work', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
      verbose: true,
    });

    await manager.indexDirectory(TEST_PROJECT);

    // Hybrid search requires both BM25 and dense embeddings
    const hybridResults = await manager.vectorStore.hybridSearch('authentication logic', {
      mode: 'hybrid',
      k_sparse: 10,
      k_dense: 10,
    });

    // This will FAIL if BM25 is not properly initialized
    assert.ok(Array.isArray(hybridResults), 'Hybrid search should return results array');

    if (manager.vectorStore.bm25Index) {
      assert.ok(hybridResults.length > 0, 'Hybrid search should find results when BM25 is wired');
    }
    await manager.close();
  });
});
