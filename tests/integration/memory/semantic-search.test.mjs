/**
 * Integration tests for semantic search API
 *
 * Tests the MemoryVectorStore.search() method for:
 * - Basic semantic search
 * - Options support (limit, minScore, filters)
 * - Result formatting (content, metadata, similarity)
 * - Search accuracy (>85% target)
 *
 * Related: Task #23 (P1-1.3)
 * Spec: .claude/context/artifacts/specs/memory-system-enhancement-spec.md Section 6.1
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Dynamically import CommonJS module
const { MemoryVectorStore } = await import(
  `file:///${path.join(PROJECT_ROOT, '.claude/lib/memory/chromadb-client.cjs').replace(/\\/g, '/')}`
);

/**
 * Test fixture: Sample documents for semantic search testing
 */
const SAMPLE_DOCUMENTS = [
  {
    id: 'doc-1',
    content:
      'ChromaDB is a vector database for semantic search. It uses embeddings to find similar documents.',
    metadata: { type: 'learning', source: 'learnings.md', line: 10 },
  },
  {
    id: 'doc-2',
    content:
      'SQLite is a relational database for structured data. It supports SQL queries and transactions.',
    metadata: { type: 'decision', source: 'decisions.md', line: 25 },
  },
  {
    id: 'doc-3',
    content:
      'Vector embeddings represent text as numerical arrays. Similar text has similar embeddings.',
    metadata: { type: 'learning', source: 'learnings.md', line: 45 },
  },
  {
    id: 'doc-4',
    content:
      'Semantic search uses embeddings to find relevant documents. It understands meaning, not just keywords.',
    metadata: { type: 'learning', source: 'learnings.md', line: 67 },
  },
  {
    id: 'doc-5',
    content:
      'The agent-studio framework uses a hybrid memory system. It combines files with vector and relational databases.',
    metadata: { type: 'decision', source: 'decisions.md', line: 102 },
  },
];

describe('Semantic Search API Integration Tests', () => {
  let vectorStore;
  let collection;

  before(async () => {
    // Initialize vector store with test configuration
    vectorStore = new MemoryVectorStore({
      persistDirectory: path.join(PROJECT_ROOT, '.claude/data/chromadb-test'),
      collectionName: 'test-semantic-search',
    });

    await vectorStore.initialize();
    collection = await vectorStore.getCollection();

    // Index sample documents
    const ids = SAMPLE_DOCUMENTS.map(doc => doc.id);
    const documents = SAMPLE_DOCUMENTS.map(doc => doc.content);
    const metadatas = SAMPLE_DOCUMENTS.map(doc => doc.metadata);

    await collection.add({ ids, documents, metadatas });
  });

  after(async () => {
    // Cleanup: Remove test collection and directory
    if (collection) {
      try {
        await vectorStore.client.deleteCollection({ name: 'test-semantic-search' });
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }

    // Remove test directory
    const testDir = path.join(PROJECT_ROOT, '.claude/data/chromadb-test');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Basic Semantic Search', () => {
    it('should search for documents semantically', async () => {
      // Query for vector database concepts
      const results = await vectorStore.search('vector database semantic search');

      // Should return results
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length > 0, 'Should return at least one result');

      // First result should be most relevant (doc-1 or doc-4)
      const firstResult = results[0];
      assert.ok(
        ['doc-1', 'doc-4'].includes(firstResult.id),
        'First result should be about vector database or semantic search'
      );
    });

    it('should return results with correct structure', async () => {
      const results = await vectorStore.search('embeddings');

      // Check result structure
      assert.ok(results.length > 0, 'Should return results');

      const result = results[0];
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

      // Check types
      assert.strictEqual(typeof result.content, 'string', 'Content should be string');
      assert.strictEqual(typeof result.metadata, 'object', 'Metadata should be object');
      assert.strictEqual(typeof result.similarity, 'number', 'Similarity should be number');

      // Similarity should be between 0 and 1
      assert.ok(
        result.similarity >= 0 && result.similarity <= 1,
        'Similarity should be between 0 and 1'
      );
    });
  });

  describe('Search Options', () => {
    it('should respect limit option', async () => {
      const results = await vectorStore.search('database', { limit: 2 });

      assert.ok(results.length <= 2, 'Should return at most 2 results');
    });

    it('should respect minScore threshold', async () => {
      // High threshold should filter out low-similarity results
      const results = await vectorStore.search('agent orchestration', { minScore: 0.8 });

      // All results should have similarity >= 0.8
      for (const result of results) {
        assert.ok(
          result.similarity >= 0.8,
          `Result similarity ${result.similarity} should be >= 0.8`
        );
      }
    });

    it('should filter by metadata', async () => {
      // Filter for only 'learning' type documents
      const results = await vectorStore.search('database', {
        limit: 10,
        filters: { type: 'learning' },
      });

      // All results should have type 'learning'
      for (const result of results) {
        assert.strictEqual(result.metadata.type, 'learning', 'Result should have type learning');
      }
    });

    it('should combine limit, minScore, and filters', async () => {
      const results = await vectorStore.search('vector', {
        limit: 2,
        minScore: 0.5,
        filters: { type: 'learning' },
      });

      // Check all constraints
      assert.ok(results.length <= 2, 'Should respect limit');

      for (const result of results) {
        assert.ok(result.similarity >= 0.5, 'Should respect minScore');
        assert.strictEqual(result.metadata.type, 'learning', 'Should respect filters');
      }
    });
  });

  describe('Search Accuracy', () => {
    /**
     * Ground truth test cases: Query → Expected relevant document IDs
     *
     * Accuracy = (relevant results returned) / (total relevant results)
     * Target: >85% accuracy
     */
    const GROUND_TRUTH_QUERIES = [
      {
        query: 'vector database semantic search',
        relevant: ['doc-1', 'doc-4'], // ChromaDB and semantic search
        description: 'Vector database concepts',
      },
      {
        query: 'embeddings numerical representation',
        relevant: ['doc-3', 'doc-4'], // Embeddings
        description: 'Embedding concepts',
      },
      {
        query: 'relational database SQL',
        relevant: ['doc-2'], // SQLite
        description: 'Relational database concepts',
      },
      {
        query: 'hybrid memory system',
        relevant: ['doc-5'], // Hybrid memory
        description: 'Hybrid architecture',
      },
      {
        query: 'semantic understanding meaning',
        relevant: ['doc-4'], // Semantic search understands meaning
        description: 'Semantic understanding',
      },
    ];

    it('should achieve >85% retrieval accuracy', async () => {
      let totalRelevant = 0;
      let totalCorrect = 0;

      for (const testCase of GROUND_TRUTH_QUERIES) {
        const { query, relevant } = testCase;

        // Search with moderate threshold (not too strict)
        const results = await vectorStore.search(query, {
          limit: 3, // Get top 3 results
          minScore: 0.3, // Low threshold to allow recall measurement
        });

        const retrievedIds = results.map(r => r.id);

        // Calculate metrics for this query
        const correctlyRetrieved = retrievedIds.filter(id => relevant.includes(id));

        totalRelevant += relevant.length;
        totalCorrect += correctlyRetrieved.length;
      }

      // Calculate overall accuracy
      // Accuracy = correct / total relevant (measures recall)
      const accuracy = totalCorrect / totalRelevant;

      // Log for debugging
      console.log(`  Semantic Search Accuracy: ${(accuracy * 100).toFixed(1)}%`);
      console.log(`  Correct: ${totalCorrect} / Relevant: ${totalRelevant}`);

      // Validate >85% accuracy
      assert.ok(accuracy > 0.85, `Accuracy ${(accuracy * 100).toFixed(1)}% should be >85%`);
    });

    it('should rank results by relevance', async () => {
      const results = await vectorStore.search('vector embeddings', { limit: 5 });

      // Results should be sorted by similarity (descending)
      for (let i = 0; i < results.length - 1; i++) {
        assert.ok(
          results[i].similarity >= results[i + 1].similarity,
          `Result ${i} (${results[i].similarity}) should have >= similarity than result ${i + 1} (${results[i + 1].similarity})`
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query gracefully', async () => {
      const results = await vectorStore.search('', { limit: 5 });

      // Should return some results (ChromaDB handles empty queries)
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should handle query with no matches above threshold', async () => {
      // Search for completely unrelated content with high threshold
      const results = await vectorStore.search('quantum physics astronomy', {
        minScore: 0.95, // Very high threshold
      });

      // Should return empty array or low-similarity results
      assert.ok(Array.isArray(results), 'Should return array');

      // If any results, all should be below threshold or empty
      if (results.length > 0) {
        // ChromaDB might still return results, but with low similarity
        assert.ok(results[0].similarity < 0.95, 'Results should have similarity < 0.95');
      }
    });

    it('should handle limit of 0', async () => {
      const results = await vectorStore.search('database', { limit: 0 });

      assert.ok(Array.isArray(results), 'Should return array');
      assert.strictEqual(results.length, 0, 'Should return empty array when limit is 0');
    });
  });
});
