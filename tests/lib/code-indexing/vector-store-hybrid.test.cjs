/**
 * Integration tests for VectorStore hybrid search (BM25 + dense embeddings)
 *
 * Tests Phase 2 integration: BM25 indexer integrated into VectorStore with RRF fusion
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { VectorStore } = require('../../../.claude/lib/code-indexing/vector-store.cjs');
const { BM25Indexer } = require('../../../.claude/lib/code-indexing/bm25-indexer.cjs');

describe('VectorStore Hybrid Search Integration', () => {
  let vectorStore;
  let testDir;

  before(async () => {
    // Create temp directory for test data
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vector-store-test-'));
  });

  after(async () => {
    // Cleanup
    if (vectorStore) {
      await vectorStore.close();
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Test 1: VectorStore Initialization with BM25', () => {
    it('should initialize with null BM25 index (lazy-loaded)', () => {
      vectorStore = new VectorStore({
        persistDirectory: testDir,
        collectionName: 'test_code_index',
        embeddingMode: 'transformers',
        projectRoot: process.cwd(),
        bm25: {
          k1: 1.5,
          b: 0.75,
          k_sparse: 100,
          k_dense: 10,
          rrf_k: 60,
          weights: { sparse: 0.4, dense: 0.6 },
        },
      });

      // BM25 should not be initialized until documents are added
      assert.strictEqual(vectorStore.bm25Index, null);
      assert.ok(vectorStore.bm25Config);
      assert.strictEqual(vectorStore.bm25Config.k1, 1.5);
    });
  });

  describe('Test 2: Adding Chunks to BM25', () => {
    it('should build BM25 index when chunks are added', async () => {
      const chunks = [
        {
          id: 'chunk1',
          content: 'function authenticate(user, password) { return true; }',
          filePath: 'src/auth.js',
          lineStart: 1,
          lineEnd: 3,
          language: 'javascript',
          type: 'function',
        },
        {
          id: 'chunk2',
          content: 'function login(username) { return authenticate(username, "pass"); }',
          filePath: 'src/login.js',
          lineStart: 5,
          lineEnd: 7,
          language: 'javascript',
          type: 'function',
        },
      ];

      await vectorStore.addChunksToBM25(chunks);

      // BM25 should now be initialized
      assert.ok(vectorStore.bm25Index instanceof BM25Indexer);
      assert.strictEqual(vectorStore.bm25Index.N, 2); // 2 documents
    });

    it('should persist BM25 index to JSON file', async () => {
      await vectorStore.saveBM25Index();

      const bm25Path = path.join(testDir, 'bm25-index.json');
      assert.ok(fs.existsSync(bm25Path));

      // Verify JSON structure
      const data = JSON.parse(fs.readFileSync(bm25Path, 'utf-8'));
      assert.ok(data.documents);
      assert.strictEqual(data.documents.length, 2);
      assert.ok(data.idf);
      assert.ok(data.avgDocLength);
    });

    it('should reload BM25 index from JSON file', async () => {
      // Create new VectorStore instance
      const vectorStore2 = new VectorStore({
        persistDirectory: testDir,
        collectionName: 'test_code_index',
        embeddingMode: 'transformers',
        projectRoot: process.cwd(),
      });

      await vectorStore2.loadBM25Index();

      // BM25 should be loaded from file
      assert.ok(vectorStore2.bm25Index instanceof BM25Indexer);
      assert.strictEqual(vectorStore2.bm25Index.N, 2);

      await vectorStore2.close();
    });
  });

  describe('Test 3: Hybrid Search - Exact Match Query', () => {
    it('should return BM25 results for exact keyword match', async () => {
      // Query for exact function name
      const results = await vectorStore.hybridSearch('authenticate', {
        mode: 'sparse',
        k_sparse: 10,
      });

      assert.ok(Array.isArray(results));
      assert.ok(results.length > 0);

      // First result should be chunk1 (contains "authenticate" function name)
      assert.strictEqual(results[0].id, 'chunk1');
      assert.ok(results[0].score > 0);
    });
  });

  describe('Test 4: RRF Fusion Correctness', () => {
    it('should correctly fuse sparse and dense results with RRF', () => {
      const sparseResults = [
        { id: 'doc1', score: 10.5 },
        { id: 'doc2', score: 8.3 },
        { id: 'doc3', score: 6.1 },
      ];

      const denseResults = [
        { id: 'doc2', score: 0.95 },
        { id: 'doc4', score: 0.88 },
        { id: 'doc1', score: 0.75 },
      ];

      const fused = vectorStore._fuseResultsRRF(
        sparseResults,
        denseResults,
        60,  // k
        0.4, // sparse weight
        0.6  // dense weight
      );

      // doc2 appears in both lists (rank 1 in sparse, rank 0 in dense)
      // Should have highest RRF score
      assert.ok(fused.length > 0);
      assert.strictEqual(fused[0].id, 'doc2');

      // doc1 appears in both (rank 0 in sparse, rank 2 in dense)
      // Should be second
      assert.strictEqual(fused[1].id, 'doc1');

      // Scores should be calculated correctly
      // doc2 RRF = 0.4 * (1/(60+1)) + 0.6 * (1/(60+0)) = 0.4/61 + 0.6/60
      const expectedDoc2Score = 0.4 * (1 / 61) + 0.6 * (1 / 60);
      assert.ok(Math.abs(fused[0].rrf_score - expectedDoc2Score) < 0.001);
    });

    it('should handle non-overlapping result sets', () => {
      const sparseResults = [{ id: 'doc1', score: 10 }];
      const denseResults = [{ id: 'doc2', score: 0.9 }];

      const fused = vectorStore._fuseResultsRRF(sparseResults, denseResults, 60, 0.4, 0.6);

      // Both documents should appear in results
      assert.strictEqual(fused.length, 2);

      // Ranking depends on weights and k value
      // doc2 has higher dense weight contribution
      assert.ok(fused.some(r => r.id === 'doc1'));
      assert.ok(fused.some(r => r.id === 'doc2'));
    });
  });

  describe('Test 5: Fallback to Dense-Only', () => {
    it('should fallback to dense search when BM25 not available', async () => {
      // Create new VectorStore without BM25
      const vectorStore3 = new VectorStore({
        persistDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'vector-store-fallback-')),
        collectionName: 'test_fallback',
        embeddingMode: 'transformers',
        projectRoot: process.cwd(),
      });

      // No BM25 index exists yet
      assert.strictEqual(vectorStore3.bm25Index, null);

      // hybridSearch should fallback to dense-only
      const results = await vectorStore3.hybridSearch('test query', {
        k_dense: 5,
      });

      // Should not throw error, should return dense results (may be empty)
      assert.ok(Array.isArray(results));

      await vectorStore3.close();
    });
  });

  describe('Test 6: Search Mode Options', () => {
    it('should support sparse-only mode', async () => {
      const results = await vectorStore.hybridSearch('authenticate', {
        mode: 'sparse',
        k_sparse: 10,
      });

      assert.ok(Array.isArray(results));
      // Should only return BM25 results
      if (results.length > 0) {
        assert.ok(results[0].score > 0); // BM25 score
      }
    });

    it('should support dense-only mode', async () => {
      const results = await vectorStore.hybridSearch('authentication logic', {
        mode: 'dense',
        k_dense: 5,
      });

      assert.ok(Array.isArray(results));
      // Dense results may be empty if no embeddings exist yet
    });

    it('should support hybrid mode (default)', async () => {
      const results = await vectorStore.hybridSearch('authenticate', {
        mode: 'hybrid',
        k_sparse: 100,
        k_dense: 10,
      });

      assert.ok(Array.isArray(results));
      // Hybrid mode should combine both
    });
  });

  describe('Test 7: Integration with addChunksOnly', () => {
    it('should build BM25 index during addChunksOnly', async () => {
      const vectorStore4 = new VectorStore({
        persistDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'vector-store-chunks-')),
        collectionName: 'test_chunks',
        embeddingMode: 'transformers',
        projectRoot: process.cwd(),
        bm25: { k1: 1.5, b: 0.75 },
      });

      const chunks = [
        {
          id: 'chunk_a',
          content: 'export function validateUser(email) { return email.includes("@"); }',
          filePath: 'src/validator.js',
          lineStart: 1,
          lineEnd: 3,
          language: 'javascript',
          type: 'function',
        },
      ];

      // addChunksOnly should build both dense + sparse (BM25)
      await vectorStore4.addChunksOnly(chunks);

      // BM25 should be built
      assert.ok(vectorStore4.bm25Index instanceof BM25Indexer);
      assert.strictEqual(vectorStore4.bm25Index.N, 1);

      await vectorStore4.close();
    });
  });

  describe('Test 8: Empty Result Handling', () => {
    it('should handle empty sparse results gracefully', () => {
      const sparseResults = [];
      const denseResults = [{ id: 'doc1', score: 0.9 }];

      const fused = vectorStore._fuseResultsRRF(sparseResults, denseResults, 60, 0.4, 0.6);

      assert.strictEqual(fused.length, 1);
      assert.strictEqual(fused[0].id, 'doc1');
    });

    it('should handle empty dense results gracefully', () => {
      const sparseResults = [{ id: 'doc1', score: 10 }];
      const denseResults = [];

      const fused = vectorStore._fuseResultsRRF(sparseResults, denseResults, 60, 0.4, 0.6);

      assert.strictEqual(fused.length, 1);
      assert.strictEqual(fused[0].id, 'doc1');
    });

    it('should handle both empty results', () => {
      const fused = vectorStore._fuseResultsRRF([], [], 60, 0.4, 0.6);

      assert.strictEqual(fused.length, 0);
    });
  });
});
