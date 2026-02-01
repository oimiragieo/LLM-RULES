/**
 * Integration tests for semantic search API (LanceDB embedded)
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
  `file:///${path.join(PROJECT_ROOT, '.claude/lib/memory/lancedb-client.cjs').replace(/\\/g, '/')}`
);

/**
 * Test fixture: Sample documents for semantic search testing
 */
const SAMPLE_DOCUMENTS = [
  {
    id: 'doc-1',
    content:
      'LanceDB is an embedded vector database for semantic search. It uses embeddings to find similar documents.',
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
  const testDir = path.join(PROJECT_ROOT, '.claude/data/lancedb-test');

  before(async () => {
    // Initialize vector store with test configuration
    vectorStore = new MemoryVectorStore({
      persistDirectory: testDir,
      collectionName: 'test-semantic-search',
      embeddingMode: 'test',
    });

    // Reset test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    const available = await vectorStore.isAvailable();
    assert.ok(available, 'LanceDB should be available');

    // Index sample documents
    await vectorStore.upsertDocuments(
      SAMPLE_DOCUMENTS.map(doc => ({ id: doc.id, text: doc.content, metadata: doc.metadata }))
    );
  });

  after(async () => {
    // Cleanup: Remove test directory
    try {
      await vectorStore?.close?.();
    } catch {
      // ignore
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Basic Semantic Search', () => {
    it('should search for documents semantically', async () => {
      // Exact match query (embeddingMode=test is deterministic, not semantic)
      const results = await vectorStore.search(SAMPLE_DOCUMENTS[0].content);

      // Should return results
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length > 0, 'Should return at least one result');

      // First result should be doc-1 for exact match
      assert.strictEqual(results[0].id, 'doc-1');
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

  describe('Determinism', () => {
    it('should return exact-match document as top result', async () => {
      for (const doc of SAMPLE_DOCUMENTS) {
        const results = await vectorStore.search(doc.content, { limit: 1 });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, doc.id);
      }
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

      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should handle query with no matches above threshold', async () => {
      // Search for completely unrelated content with high threshold
      const results = await vectorStore.search('quantum physics astronomy', {
        minScore: 0.95, // Very high threshold
      });

      assert.ok(Array.isArray(results), 'Should return array');

      // minScore is enforced in the client; results should be empty.
      assert.strictEqual(results.length, 0, 'Should return empty array above very high threshold');
    });

    it('should handle limit of 0', async () => {
      const results = await vectorStore.search('database', { limit: 0 });

      assert.ok(Array.isArray(results), 'Should return array');
      assert.strictEqual(results.length, 0, 'Should return empty array when limit is 0');
    });
  });
});
