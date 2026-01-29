/**
 * Unit tests for semantic search API
 *
 * Tests the MemoryVectorStore.search() method with mocked ChromaDB responses.
 * This avoids requiring a running ChromaDB server for unit tests.
 *
 * Related: Task #23 (P1-1.3)
 * Spec: .claude/context/artifacts/specs/memory-system-enhancement-spec.md Section 6.1
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Dynamically import CommonJS module
const { MemoryVectorStore } = await import(
  `file:///${path.join(PROJECT_ROOT, '.claude/lib/memory/chromadb-client.cjs').replace(/\\/g, '/')}`
);

describe('Semantic Search API Unit Tests', () => {
  let vectorStore;
  let mockCollection;

  beforeEach(async () => {
    // Create vector store instance
    vectorStore = new MemoryVectorStore({
      persistDirectory: '.claude/data/chromadb-test',
      collectionName: 'test-semantic-search',
    });

    // Mock the client and collection
    vectorStore.client = {
      heartbeat: mock.fn(async () => true),
      getOrCreateCollection: mock.fn(async () => mockCollection),
    };

    vectorStore.isInitialized = true;

    // Create mock collection with query method
    mockCollection = {
      query: mock.fn(async params => {
        // Return mock results based on query
        if (params.queryTexts[0] === 'vector database') {
          return {
            ids: [['doc-1', 'doc-2']],
            documents: [['ChromaDB is a vector database', 'SQLite is a relational database']],
            metadatas: [
              [
                { type: 'learning', source: 'learnings.md', line: 10 },
                { type: 'decision', source: 'decisions.md', line: 25 },
              ],
            ],
            distances: [[0.1, 0.3]], // Lower distance = higher similarity
          };
        }

        // Default: empty results
        return {
          ids: [[]],
          documents: [[]],
          metadatas: [[]],
          distances: [[]],
        };
      }),
    };

    // Set collection directly (skip getOrCreateCollection for unit tests)
    vectorStore.collection = mockCollection;
  });

  describe('Basic Semantic Search', () => {
    it('should search for documents and return results', async () => {
      const results = await vectorStore.search('vector database');

      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.strictEqual(results.length, 2, 'Should return 2 results');
      assert.ok(mockCollection.query.mock.calls.length > 0, 'Should call collection.query()');
    });

    it('should return results with correct structure', async () => {
      const results = await vectorStore.search('vector database');

      const result = results[0];
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'id'), 'Result should have id');
      assert.ok(
        Object.prototype.hasOwnProperty.call(result, 'content'),
        'Result should have content'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(result, 'metadata'),
        'Result should have metadata'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(result, 'similarity'),
        'Result should have similarity score'
      );
    });

    it('should convert ChromaDB distance to similarity score', async () => {
      const results = await vectorStore.search('vector database');

      // First result has distance 0.1 → similarity 0.9
      assert.strictEqual(results[0].similarity, 0.9, 'Similarity should be 1 - distance');

      // Second result has distance 0.3 → similarity 0.7
      assert.strictEqual(results[1].similarity, 0.7, 'Similarity should be 1 - distance');
    });

    it('should include content from documents', async () => {
      const results = await vectorStore.search('vector database');

      assert.strictEqual(results[0].content, 'ChromaDB is a vector database');
      assert.strictEqual(results[1].content, 'SQLite is a relational database');
    });

    it('should include metadata from results', async () => {
      const results = await vectorStore.search('vector database');

      assert.deepStrictEqual(results[0].metadata, {
        type: 'learning',
        source: 'learnings.md',
        line: 10,
      });

      assert.deepStrictEqual(results[1].metadata, {
        type: 'decision',
        source: 'decisions.md',
        line: 25,
      });
    });
  });

  describe('Search Options', () => {
    it('should pass limit to ChromaDB query', async () => {
      await vectorStore.search('test', { limit: 5 });

      const call = mockCollection.query.mock.calls[0];
      assert.strictEqual(call.arguments[0].nResults, 5, 'Should pass limit as nResults');
    });

    it('should filter results by minScore threshold', async () => {
      // Mock results with varying similarity
      mockCollection.query = mock.fn(async () => ({
        ids: [['doc-1', 'doc-2', 'doc-3']],
        documents: [['Result 1', 'Result 2', 'Result 3']],
        metadatas: [[{}, {}, {}]],
        distances: [[0.1, 0.4, 0.7]], // Similarities: 0.9, 0.6, 0.3
      }));

      const results = await vectorStore.search('test', { minScore: 0.5 });

      // Should filter out doc-3 (similarity 0.3 < 0.5)
      assert.strictEqual(results.length, 2, 'Should filter out results below minScore');
      assert.ok(results[0].similarity >= 0.5, 'All results should have similarity >= minScore');
      assert.ok(results[1].similarity >= 0.5, 'All results should have similarity >= minScore');
    });

    it('should pass metadata filters to ChromaDB', async () => {
      await vectorStore.search('test', {
        filters: { type: 'learning' },
      });

      const call = mockCollection.query.mock.calls[0];
      assert.deepStrictEqual(
        call.arguments[0].where,
        { type: 'learning' },
        'Should pass filters as where clause'
      );
    });

    it('should handle no filters gracefully', async () => {
      await vectorStore.search('test');

      const call = mockCollection.query.mock.calls[0];
      assert.strictEqual(
        call.arguments[0].where,
        undefined,
        'Should not include where clause if no filters'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results', async () => {
      // Mock empty results
      mockCollection.query = mock.fn(async () => ({
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]],
      }));

      const results = await vectorStore.search('nonexistent query');

      assert.ok(Array.isArray(results), 'Should return array');
      assert.strictEqual(results.length, 0, 'Should return empty array for no results');
    });

    it('should throw error if not initialized', async () => {
      vectorStore.isInitialized = false;

      await assert.rejects(
        () => vectorStore.search('test'),
        /not initialized/,
        'Should throw error if not initialized'
      );
    });

    it('should throw error if collection query fails', async () => {
      mockCollection.query = mock.fn(async () => {
        throw new Error('Query failed');
      });

      await assert.rejects(
        () => vectorStore.search('test'),
        /Semantic search failed/,
        'Should throw error with descriptive message'
      );
    });

    it('should handle undefined distances gracefully', async () => {
      // Mock results with missing distances
      mockCollection.query = mock.fn(async () => ({
        ids: [['doc-1']],
        documents: [['Result']],
        metadatas: [[{}]],
        distances: [[undefined]],
      }));

      const results = await vectorStore.search('test');

      // Should handle undefined distance (similarity = NaN, which fails minScore check)
      assert.ok(Array.isArray(results), 'Should return array even with undefined distances');
    });
  });

  describe('Result Ranking', () => {
    it('should preserve ChromaDB result ordering (best first)', async () => {
      // ChromaDB returns results ordered by distance (best = lowest distance)
      mockCollection.query = mock.fn(async () => ({
        ids: [['doc-1', 'doc-2', 'doc-3']],
        documents: [['Best match', 'Good match', 'Weak match']],
        metadatas: [[{}, {}, {}]],
        distances: [[0.1, 0.3, 0.4]], // Already ordered: best → worst, all above default minScore (0.5)
      }));

      const results = await vectorStore.search('test', { minScore: 0 }); // Set minScore to 0 to get all results

      // Results should maintain order: best (0.9) → good (0.7) → weak (0.6)
      assert.strictEqual(results.length, 3, 'Should return all 3 results');
      assert.strictEqual(results[0].similarity, 0.9, 'First result should have highest similarity');
      assert.strictEqual(results[1].similarity, 0.7, 'Second result should have middle similarity');
      assert.strictEqual(results[2].similarity, 0.6, 'Third result should have lowest similarity');
    });
  });
});
