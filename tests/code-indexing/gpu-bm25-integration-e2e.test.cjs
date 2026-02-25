/**
 * End-to-End Integration Test: GPU + BM25 in Indexing Pipeline
 *
 * This test verifies that BOTH GPU detection AND BM25 indexing work
 * in the complete indexing pipeline (not just in isolation).
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');

const LANCEDB_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing', 'lancedb-e2e-test');
const TABLE_NAME = `code_index_e2e_test_${process.pid}`;
const TEST_PROJECT = path.join(__dirname, '../fixtures/sample-code-e2e');

describe('GPU + BM25 End-to-End Integration', () => {
  before(async () => {
    // Use test mode for speed but verify wiring
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = LANCEDB_DIR;
    process.env.LANCEDB_TABLE_CODE = TABLE_NAME;

    // Create test project
    await fs.mkdir(TEST_PROJECT, { recursive: true });
    await fs.writeFile(
      path.join(TEST_PROJECT, 'example.js'),
      `
/**
 * User authentication service
 */
class UserAuthService {
  constructor(database, tokenService) {
    this.db = database;
    this.tokens = tokenService;
  }

  /**
   * Authenticate user with username and password
   */
  async authenticate(username, password) {
    const user = await this.db.findUser(username);
    if (!user) throw new Error('User not found');

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error('Invalid password');

    return this.tokens.generate(user.id);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    const bcrypt = require('bcrypt');
    return bcrypt.compare(password, hash);
  }
}

/**
 * Token generation service
 */
function generateToken(userId) {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
      `
    );
  });

  after(async () => {
    await fs.rm(LANCEDB_DIR, { recursive: true, force: true }).catch(() => {});
    await fs.rm(TEST_PROJECT, { recursive: true, force: true }).catch(() => {});
  });

  test('E2E: Full indexing pipeline with GPU detection + BM25', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
      verbose: false,
    });

    // Index the project
    const result = await manager.indexDirectory(TEST_PROJECT);

    // Verify basic indexing worked
    assert.ok(result.filesIndexed >= 1, 'Should index at least 1 file');
    assert.ok(result.chunksCreated >= 2, 'Should create multiple chunks (classes, functions)');

    // Verify VectorStore was initialized
    assert.ok(manager.vectorStore, 'VectorStore should be initialized');
    assert.ok(manager.vectorStore.store, 'VectorStore.store should exist');

    // Verify GPU detection happened (even if no GPU present, it should have tried)
    const store = manager.vectorStore.store;
    assert.ok('device' in store, 'Store should have device property (cpu or gpu)');
    assert.ok('gpuDetected' in store, 'Store should have gpuDetected property');
    assert.ok(store.device === 'cpu' || store.device === 'gpu', 'Device should be cpu or gpu');

    console.log(`[E2E] Device detected: ${store.device}`);
    console.log(`[E2E] GPU detected: ${store.gpuDetected}`);
    if (store.gpuDetected) {
      console.log(`[E2E] GPU name: ${store.gpuName}`);
      console.log(`[E2E] GPU memory: ${store.gpuMemoryMB}MB`);
      console.log(`[E2E] Batch size: ${store.config.embedBatchSize || 'default'}`);
    }

    // Verify BM25 index was built
    const bm25Path = path.join(LANCEDB_DIR, 'bm25-index.json');
    const bm25Exists = await fs
      .access(bm25Path)
      .then(() => true)
      .catch(() => false);
    assert.ok(bm25Exists, 'BM25 index should be created during indexing');

    if (bm25Exists) {
      const bm25Data = JSON.parse(await fs.readFile(bm25Path, 'utf-8'));
      assert.ok(bm25Data.documents, 'BM25 index should have documents array');
      assert.ok(bm25Data.documents.length > 0, 'BM25 should have indexed documents');
      console.log(`[E2E] BM25 indexed ${bm25Data.documents.length} documents`);
    }

    // Verify BM25 is accessible from VectorStore
    assert.ok(manager.vectorStore.bm25Index, 'VectorStore should have BM25 index');

    // Verify hybrid search works (requires both dense embeddings and BM25)
    const hybridResults = await manager.vectorStore.hybridSearch('authentication logic', {
      mode: 'hybrid',
      k_sparse: 5,
      k_dense: 5,
    });

    assert.ok(Array.isArray(hybridResults), 'Hybrid search should return array');
    console.log(`[E2E] Hybrid search returned ${hybridResults.length} results`);

    // If results found, verify they have the hybrid scoring
    if (hybridResults.length > 0) {
      const firstResult = hybridResults[0];
      assert.ok(
        'rrf_score' in firstResult || 'score' in firstResult,
        'Results should have RRF scores from hybrid fusion'
      );
      console.log(`[E2E] Top result RRF score: ${firstResult.rrf_score || firstResult.score}`);
    }
    await manager.close();
  });

  test('E2E: Verify semantic search still works', async () => {
    const manager = new IndexManager({
      projectRoot: TEST_PROJECT,
    });

    // Don't re-index, use existing index
    const results = await manager.semanticSearch('user authentication');

    assert.ok(Array.isArray(results), 'Semantic search should return array');
    console.log(`[E2E] Semantic search found ${results.length} results`);

    if (results.length > 0) {
      const first = results[0];
      assert.ok(first.code || first.text, 'Results should have code');
      assert.ok(first.filePath, 'Results should have file path');
      assert.ok(typeof first.similarity === 'number', 'Results should have similarity score');
      console.log(`[E2E] Top result similarity: ${first.similarity.toFixed(3)}`);
    }
    await manager.close();
  });
});
