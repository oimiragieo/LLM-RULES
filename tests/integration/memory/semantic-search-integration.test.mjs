/**
 * Integration Tests for Semantic Search with ChromaDB
 *
 * Tests MemoryVectorStore.search() with actual ChromaDB server running.
 * Validates similarity scoring, filtering, accuracy, and error handling.
 *
 * Prerequisites: ChromaDB server running on localhost:8000
 * Start server: docker run -p 8000:8000 chromadb/chroma
 *
 * Related: Task #27 (P1-1.4)
 * Spec: .claude/context/artifacts/specs/memory-system-enhancement-spec.md Section 6.1
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// Dynamically import MemoryVectorStore
const chromaClientPath = path.join(PROJECT_ROOT, '.claude/lib/memory/chromadb-client.cjs');
const { MemoryVectorStore } = require(chromaClientPath);

describe('Semantic Search Integration Tests', () => {
  let vectorStore;
  let collection;
  const TEST_COLLECTION = 'test-semantic-search-integration';

  before(async () => {
    // Initialize vector store with test collection
    vectorStore = new MemoryVectorStore({
      persistDirectory: 'tests/data/chromadb-integration',
      collectionName: TEST_COLLECTION,
      host: 'http://localhost:8000',
    });

    try {
      await vectorStore.initialize();
      collection = await vectorStore.getCollection();
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to connect')) {
        console.error(
          '\n⚠️  ChromaDB server not running. Start with: docker run -p 8000:8000 chromadb/chroma\n'
        );
        throw new Error('ChromaDB server unavailable. Skipping integration tests.');
      }
      throw error;
    }
  });

  after(async () => {
    // Cleanup: Delete test collection
    if (vectorStore && vectorStore.client && collection) {
      try {
        await vectorStore.client.deleteCollection({ name: TEST_COLLECTION });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(async () => {
    // Clear collection before each test
    if (collection) {
      try {
        await vectorStore.client.deleteCollection({ name: TEST_COLLECTION });
        collection = await vectorStore.client.getOrCreateCollection({
          name: TEST_COLLECTION,
        });
        vectorStore.collection = collection;
      } catch (error) {
        console.warn('Warning: Could not clear collection:', error.message);
      }
    }
  });

  describe('Search with ChromaDB server running', () => {
    it('should connect to ChromaDB server and perform basic search', async () => {
      // Seed collection with documents
      await collection.add({
        ids: ['doc-1', 'doc-2', 'doc-3'],
        documents: [
          'ChromaDB is a vector database for AI applications',
          'SQLite is a relational database for structured data',
          'PostgreSQL is an advanced relational database',
        ],
        metadatas: [
          { type: 'learning', source: 'learnings.md', line: 10 },
          { type: 'learning', source: 'learnings.md', line: 20 },
          { type: 'decision', source: 'decisions.md', line: 30 },
        ],
      });

      // Search for vector database
      const results = await vectorStore.search('vector database for AI', {
        limit: 5,
        minScore: 0.5,
      });

      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length > 0, 'Should return at least one result');
      assert.ok(results[0].content.includes('ChromaDB'), 'Best match should mention ChromaDB');
      assert.ok(results[0].similarity > 0.5, 'Best match should have high similarity');
    });

    it('should return results with correct structure', async () => {
      // Seed documents
      await collection.add({
        ids: ['test-1'],
        documents: ['Test document for structure validation'],
        metadatas: [{ type: 'learning', tag: 'test' }],
      });

      const results = await vectorStore.search('test document', { limit: 1 });

      assert.ok(results.length > 0, 'Should return results');
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

      assert.strictEqual(typeof result.id, 'string', 'ID should be string');
      assert.strictEqual(typeof result.content, 'string', 'Content should be string');
      assert.strictEqual(typeof result.metadata, 'object', 'Metadata should be object');
      assert.strictEqual(typeof result.similarity, 'number', 'Similarity should be number');
    });
  });

  describe('Similarity scoring (relevant vs irrelevant)', () => {
    beforeEach(async () => {
      // Seed with relevant and irrelevant documents
      await collection.add({
        ids: ['rel-1', 'rel-2', 'irrel-1', 'irrel-2'],
        documents: [
          'ChromaDB vector database provides semantic search capabilities for AI',
          'Semantic search uses embeddings to find similar documents by meaning',
          'The weather forecast predicts rain tomorrow afternoon',
          'Cooking pasta requires boiling water and salt',
        ],
        metadatas: [
          { type: 'learning', relevance: 'high' },
          { type: 'learning', relevance: 'high' },
          { type: 'learning', relevance: 'low' },
          { type: 'learning', relevance: 'low' },
        ],
      });
    });

    it('should rank relevant documents higher than irrelevant ones', async () => {
      const results = await vectorStore.search('vector database semantic search', {
        limit: 10,
        minScore: 0.0, // Get all results for comparison
      });

      assert.ok(results.length >= 4, 'Should return all documents');

      // Top 2 results should be relevant (rel-1 or rel-2)
      const top2Ids = results.slice(0, 2).map(r => r.id);
      assert.ok(
        top2Ids.includes('rel-1') || top2Ids.includes('rel-2'),
        'Top 2 should include relevant documents'
      );

      // Relevant docs should have higher similarity than irrelevant
      const relevant = results.filter(r => r.id.startsWith('rel-'));
      const irrelevant = results.filter(r => r.id.startsWith('irrel-'));

      if (relevant.length > 0 && irrelevant.length > 0) {
        const avgRelevantScore =
          relevant.reduce((sum, r) => sum + r.similarity, 0) / relevant.length;
        const avgIrrelevantScore =
          irrelevant.reduce((sum, r) => sum + r.similarity, 0) / irrelevant.length;

        assert.ok(
          avgRelevantScore > avgIrrelevantScore,
          `Relevant docs (${avgRelevantScore.toFixed(2)}) should score higher than irrelevant (${avgIrrelevantScore.toFixed(2)})`
        );
      }
    });

    it('should filter out low-similarity results with minScore', async () => {
      const results = await vectorStore.search('vector database', {
        limit: 10,
        minScore: 0.6, // Higher threshold
      });

      // All results should meet minScore
      results.forEach(result => {
        assert.ok(
          result.similarity >= 0.6,
          `Result "${result.content.substring(0, 50)}..." has similarity ${result.similarity.toFixed(2)}, expected >= 0.6`
        );
      });

      // Should exclude irrelevant documents
      const irrelevantIds = results.filter(r => r.id.startsWith('irrel-'));
      assert.ok(
        irrelevantIds.length === 0 || irrelevantIds[0].similarity >= 0.6,
        'Irrelevant documents should be filtered out or have high similarity'
      );
    });
  });

  describe('Filters (limit, minScore, metadata)', () => {
    beforeEach(async () => {
      // Seed with categorized documents
      await collection.add({
        ids: ['learn-1', 'learn-2', 'decide-1', 'decide-2', 'issue-1'],
        documents: [
          'Pattern: Hybrid memory combines SQLite and ChromaDB',
          'Pattern: Write-Ahead Log ensures reliable sync',
          'Decision: Use ChromaDB for semantic search',
          'Decision: Use SQLite for structured entity storage',
          'Issue: ChromaDB connection timeout on slow networks',
        ],
        metadatas: [
          { type: 'learning', category: 'pattern' },
          { type: 'learning', category: 'pattern' },
          { type: 'decision', category: 'architecture' },
          { type: 'decision', category: 'architecture' },
          { type: 'issue', category: 'infrastructure' },
        ],
      });
    });

    it('should respect limit parameter', async () => {
      const results = await vectorStore.search('memory database', {
        limit: 2,
        minScore: 0.0,
      });

      assert.ok(results.length <= 2, `Should return at most 2 results, got ${results.length}`);
    });

    it('should filter by metadata type=learning', async () => {
      const results = await vectorStore.search('database', {
        limit: 10,
        minScore: 0.0,
        filters: { type: 'learning' },
      });

      assert.ok(results.length > 0, 'Should return learning results');
      results.forEach(result => {
        assert.strictEqual(
          result.metadata.type,
          'learning',
          'All results should have type=learning'
        );
      });
    });

    it('should filter by metadata type=decision', async () => {
      const results = await vectorStore.search('database', {
        limit: 10,
        minScore: 0.0,
        filters: { type: 'decision' },
      });

      assert.ok(results.length > 0, 'Should return decision results');
      results.forEach(result => {
        assert.strictEqual(
          result.metadata.type,
          'decision',
          'All results should have type=decision'
        );
      });
    });

    it('should combine limit and filters', async () => {
      const results = await vectorStore.search('database', {
        limit: 1,
        minScore: 0.0,
        filters: { type: 'learning' },
      });

      assert.ok(results.length <= 1, 'Should respect limit with filters');
      if (results.length > 0) {
        assert.strictEqual(results[0].metadata.type, 'learning', 'Result should match filter');
      }
    });

    it('should combine minScore and filters', async () => {
      const results = await vectorStore.search('ChromaDB memory', {
        limit: 10,
        minScore: 0.5,
        filters: { type: 'learning' },
      });

      results.forEach(result => {
        assert.ok(result.similarity >= 0.5, 'Should meet minScore threshold');
        assert.strictEqual(result.metadata.type, 'learning', 'Should match metadata filter');
      });
    });
  });

  describe('Accuracy validation (>85% target)', () => {
    beforeEach(async () => {
      // Seed with agent-studio domain documents
      await collection.add({
        ids: ['acc-1', 'acc-2', 'acc-3', 'acc-4', 'acc-5'],
        documents: [
          'The developer agent writes code following TDD principles with red-green-refactor cycle',
          'The QA agent generates test cases and validates code quality using checklist-generator skill',
          'The planner agent breaks down features into Epic→Story→Task hierarchy for execution',
          'The architect agent designs system architecture using C4 model and ADRs',
          'The technical-writer agent creates documentation from code comments and specifications',
        ],
        metadatas: [
          { agent: 'developer', skill: 'tdd' },
          { agent: 'qa', skill: 'checklist-generator' },
          { agent: 'planner', skill: 'task-breakdown' },
          { agent: 'architect', skill: 'c4-context' },
          { agent: 'technical-writer', skill: 'documentation' },
        ],
      });
    });

    it('should accurately retrieve agent information by role', async () => {
      const testCases = [
        {
          query: 'who writes tests and validates quality',
          expectedAgent: 'qa',
          minSimilarity: 0.5,
        },
        {
          query: 'who designs system architecture',
          expectedAgent: 'architect',
          minSimilarity: 0.5,
        },
        { query: 'who writes code using TDD', expectedAgent: 'developer', minSimilarity: 0.5 },
        {
          query: 'who creates documentation',
          expectedAgent: 'technical-writer',
          minSimilarity: 0.5,
        },
        { query: 'who breaks down tasks', expectedAgent: 'planner', minSimilarity: 0.5 },
      ];

      let correctMatches = 0;
      const results = [];

      for (const testCase of testCases) {
        const searchResults = await vectorStore.search(testCase.query, { limit: 1, minScore: 0.0 });

        if (searchResults.length > 0) {
          const topResult = searchResults[0];
          const isCorrect =
            topResult.metadata.agent === testCase.expectedAgent &&
            topResult.similarity >= testCase.minSimilarity;

          if (isCorrect) {
            correctMatches++;
          }

          results.push({
            query: testCase.query,
            expected: testCase.expectedAgent,
            actual: topResult.metadata.agent,
            similarity: topResult.similarity.toFixed(2),
            correct: isCorrect,
          });
        } else {
          results.push({
            query: testCase.query,
            expected: testCase.expectedAgent,
            actual: 'NO_RESULTS',
            similarity: 0,
            correct: false,
          });
        }
      }

      const accuracy = (correctMatches / testCases.length) * 100;

      console.log('\n=== Accuracy Test Results ===');
      results.forEach(r => {
        console.log(
          `${r.correct ? '✓' : '✗'} "${r.query}" → ${r.actual} (${r.similarity}) [expected: ${r.expected}]`
        );
      });
      console.log(`\nAccuracy: ${correctMatches}/${testCases.length} (${accuracy.toFixed(1)}%)\n`);

      assert.ok(accuracy >= 85, `Accuracy ${accuracy.toFixed(1)}% should be >= 85% target`);
    });

    it('should retrieve relevant skills by description', async () => {
      const skillQueries = [
        { query: 'test-driven development practice', expectedSkill: 'tdd' },
        { query: 'quality validation checklist', expectedSkill: 'checklist-generator' },
        { query: 'system context diagrams', expectedSkill: 'c4-context' },
      ];

      let correctMatches = 0;

      for (const test of skillQueries) {
        const results = await vectorStore.search(test.query, { limit: 1 });

        if (results.length > 0 && results[0].metadata.skill === test.expectedSkill) {
          correctMatches++;
        }
      }

      const accuracy = (correctMatches / skillQueries.length) * 100;

      assert.ok(
        accuracy >= 85,
        `Skill retrieval accuracy ${accuracy.toFixed(1)}% should be >= 85%`
      );
    });
  });

  describe('Error handling (server unavailable)', () => {
    it('should throw descriptive error when server is unavailable', async () => {
      // Create vector store pointing to invalid server
      const invalidStore = new MemoryVectorStore({
        persistDirectory: 'tests/data/chromadb-invalid',
        collectionName: 'test-invalid',
        host: 'http://localhost:9999', // Invalid port
      });

      await assert.rejects(
        async () => {
          await invalidStore.initialize();
          await invalidStore.getCollection();
          await invalidStore.search('test query');
        },
        error => {
          return (
            error.message.includes('Failed to initialize') ||
            error.message.includes('Failed to get or create collection') ||
            error.message.includes('Semantic search failed') ||
            error.message.includes('ECONNREFUSED')
          );
        },
        'Should throw error when ChromaDB server is unavailable'
      );
    });

    it('should detect server availability with isAvailable()', async () => {
      // Check valid server
      const available = await vectorStore.isAvailable();
      assert.strictEqual(available, true, 'Should detect server is available');

      // Check invalid server
      const invalidStore = new MemoryVectorStore({
        host: 'http://localhost:9999',
      });

      await invalidStore.initialize().catch(() => {}); // Ignore initialization errors

      const unavailable = await invalidStore.isAvailable();
      assert.strictEqual(unavailable, false, 'Should detect server is unavailable');
    });

    it('should throw error when searching without initialization', async () => {
      const uninitializedStore = new MemoryVectorStore({
        collectionName: 'test-uninitialized',
      });

      await assert.rejects(
        () => uninitializedStore.search('test'),
        /not initialized/,
        'Should throw error when searching without initialization'
      );
    });
  });
});
