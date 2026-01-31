const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

describe('VectorDatabase', () => {
  let VectorDatabase;
  let db;
  const TEST_DB_PATH = path.join(__dirname, '../../.claude/context/code-index/chroma-test');

  before(async () => {
    // Clean up test database before tests
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  after(async () => {
    // Clean up test database after tests
    if (db && typeof db.close === 'function') {
      await db.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  describe('40.1: Initialize ChromaDB', () => {
    it('should create VectorDatabase instance', async () => {
      VectorDatabase = require('../../.claude/lib/code-indexing/vector-db.cjs');
      db = new VectorDatabase({ path: TEST_DB_PATH });

      assert.ok(db, 'VectorDatabase instance should be created');
      assert.strictEqual(typeof db.addChunks, 'function', 'should have addChunks method');
      assert.strictEqual(typeof db.search, 'function', 'should have search method');
      assert.strictEqual(typeof db.deleteFile, 'function', 'should have deleteFile method');
      assert.strictEqual(typeof db.getStats, 'function', 'should have getStats method');
      assert.strictEqual(typeof db.clear, 'function', 'should have clear method');
    });

    it('should initialize ChromaDB connection', async () => {
      const collection = await db.getCollection();
      assert.ok(collection, 'should return collection');
      assert.strictEqual(collection.name, 'code-embeddings', 'collection should be named code-embeddings');
    });

    it('should create database directory', () => {
      assert.ok(fs.existsSync(TEST_DB_PATH), 'database directory should exist');
    });
  });

  describe('40.2: Implement addChunks()', () => {
    it('should add chunks with embeddings to database', async () => {
      const chunks = [
        { code: 'function hello() { return "world"; }', type: 'function' },
        { code: 'const PI = 3.14159;', type: 'constant' }
      ];

      const embeddings = [
        new Array(384).fill(0).map(() => Math.random()), // Random 384-dim embedding
        new Array(384).fill(0).map(() => Math.random())
      ];

      const metadata = [
        {
          id: 'file1.js:func:1',
          filePath: 'file1.js',
          lineStart: 1,
          lineEnd: 3,
          codeType: 'function',
          name: 'hello',
          language: 'javascript'
        },
        {
          id: 'file1.js:const:5',
          filePath: 'file1.js',
          lineStart: 5,
          lineEnd: 5,
          codeType: 'constant',
          name: 'PI',
          language: 'javascript'
        }
      ];

      await db.addChunks(chunks, embeddings, metadata);

      const stats = await db.getStats();
      assert.strictEqual(stats.count, 2, 'should have 2 chunks');
    });

    it('should upsert (update existing chunks)', async () => {
      // Add initial chunk
      const chunks1 = [{ code: 'function test() {}', type: 'function' }];
      const embeddings1 = [new Array(384).fill(0).map(() => 0.1)];
      const metadata1 = [{
        id: 'file2.js:func:1',
        filePath: 'file2.js',
        codeType: 'function',
        language: 'javascript'
      }];

      await db.addChunks(chunks1, embeddings1, metadata1);
      let stats = await db.getStats();
      const initialCount = stats.count;

      // Update same chunk (upsert)
      const chunks2 = [{ code: 'function test() { return 42; }', type: 'function' }];
      const embeddings2 = [new Array(384).fill(0).map(() => 0.2)];
      const metadata2 = [{
        id: 'file2.js:func:1', // Same ID
        filePath: 'file2.js',
        codeType: 'function',
        language: 'javascript',
        updated: true
      }];

      await db.addChunks(chunks2, embeddings2, metadata2);
      stats = await db.getStats();

      assert.strictEqual(stats.count, initialCount, 'count should not increase (upsert)');

      // Verify metadata was updated
      const meta = await db.getMetadata('file2.js:func:1');
      assert.strictEqual(meta.updated, true, 'metadata should be updated');
    });

    it('should store metadata alongside embeddings', async () => {
      const chunks = [{ code: 'class MyClass {}', type: 'class' }];
      const embeddings = [new Array(384).fill(0).map(() => 0.5)];
      const metadata = [{
        id: 'file3.js:class:1',
        filePath: 'file3.js',
        lineStart: 1,
        lineEnd: 10,
        codeType: 'class',
        name: 'MyClass',
        language: 'javascript',
        isExported: true,
        tags: ['ui', 'component']
      }];

      await db.addChunks(chunks, embeddings, metadata);

      const meta = await db.getMetadata('file3.js:class:1');
      assert.ok(meta, 'should retrieve metadata');
      assert.strictEqual(meta.name, 'MyClass', 'should have correct name');
      assert.strictEqual(meta.isExported, true, 'should have correct export status');
      assert.deepStrictEqual(meta.tags, ['ui', 'component'], 'should have correct tags');
    });
  });

  describe('40.3: Implement search()', () => {
    before(async () => {
      // Add test data for search
      await db.clear();

      const chunks = [
        { code: 'function login(user, pass) {}', type: 'function' },
        { code: 'function logout() {}', type: 'function' },
        { code: 'class UserService {}', type: 'class' },
        { code: 'const API_URL = "https://api.com";', type: 'constant' }
      ];

      // Create embeddings with known similarities
      // login and logout are similar (auth functions)
      // UserService is somewhat similar
      // API_URL is different
      const embeddings = [
        new Array(384).fill(0).map((_, i) => i < 100 ? 0.8 : 0.1), // login
        new Array(384).fill(0).map((_, i) => i < 100 ? 0.7 : 0.1), // logout (similar to login)
        new Array(384).fill(0).map((_, i) => i < 50 ? 0.6 : 0.1),  // UserService (moderately similar)
        new Array(384).fill(0).map((_, i) => i < 10 ? 0.9 : 0.05)  // API_URL (different)
      ];

      const metadata = [
        { id: 'auth.js:func:1', filePath: 'auth.js', codeType: 'function', name: 'login', language: 'javascript' },
        { id: 'auth.js:func:10', filePath: 'auth.js', codeType: 'function', name: 'logout', language: 'javascript' },
        { id: 'services.js:class:1', filePath: 'services.js', codeType: 'class', name: 'UserService', language: 'javascript' },
        { id: 'config.js:const:1', filePath: 'config.js', codeType: 'constant', name: 'API_URL', language: 'javascript' }
      ];

      await db.addChunks(chunks, embeddings, metadata);
    });

    it('should find semantically similar chunks', async () => {
      // Query similar to login function
      const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 100 ? 0.75 : 0.1);

      const results = await db.search(queryEmbedding, { topK: 10 });

      assert.ok(results.ids, 'should return ids');
      assert.ok(results.distances, 'should return distances');
      assert.ok(results.metadatas, 'should return metadatas');
      assert.strictEqual(results.ids[0].length, 4, 'should return all 4 chunks (topK=10)');

      // Results should be sorted by similarity (distance ascending)
      // Most similar should be login, then logout, then UserService, then API_URL
      assert.strictEqual(results.ids[0][0], 'auth.js:func:1', 'most similar should be login');
      assert.strictEqual(results.ids[0][1], 'auth.js:func:10', 'second most similar should be logout');
    });

    it('should return top K results', async () => {
      const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 100 ? 0.75 : 0.1);

      const results = await db.search(queryEmbedding, { topK: 2 });

      assert.strictEqual(results.ids[0].length, 2, 'should return only 2 results');
      assert.strictEqual(results.ids[0][0], 'auth.js:func:1', 'should return login');
      assert.strictEqual(results.ids[0][1], 'auth.js:func:10', 'should return logout');
    });

    it('should rank results by similarity', async () => {
      const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 100 ? 0.75 : 0.1);

      const results = await db.search(queryEmbedding, { topK: 10 });

      // Distances should be in ascending order (more similar = smaller distance)
      for (let i = 0; i < results.distances[0].length - 1; i++) {
        assert.ok(
          results.distances[0][i] <= results.distances[0][i + 1],
          `distances should be sorted: ${results.distances[0][i]} <= ${results.distances[0][i + 1]}`
        );
      }
    });
  });

  describe('40.4: Implement metadata filtering', () => {
    it('should filter by filePath', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => 0.5);

      const results = await db.search(queryEmbedding, {
        topK: 10,
        filters: { filePath: 'auth.js' }
      });

      assert.ok(results.ids[0].length > 0, 'should return results');

      // All results should be from auth.js
      for (const meta of results.metadatas[0]) {
        assert.strictEqual(meta.filePath, 'auth.js', 'all results should be from auth.js');
      }
    });

    it('should filter by codeType', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => 0.5);

      const results = await db.search(queryEmbedding, {
        topK: 10,
        filters: { codeType: 'function' }
      });

      assert.ok(results.ids[0].length > 0, 'should return results');

      // All results should be functions
      for (const meta of results.metadatas[0]) {
        assert.strictEqual(meta.codeType, 'function', 'all results should be functions');
      }
    });

    it('should combine multiple filters (AND logic)', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => 0.5);

      const results = await db.search(queryEmbedding, {
        topK: 10,
        filters: { filePath: 'auth.js', codeType: 'function' }
      });

      assert.ok(results.ids[0].length > 0, 'should return results');

      // All results should match both filters
      for (const meta of results.metadatas[0]) {
        assert.strictEqual(meta.filePath, 'auth.js', 'should match filePath');
        assert.strictEqual(meta.codeType, 'function', 'should match codeType');
      }
    });

    it('should return empty results if no matches', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => 0.5);

      const results = await db.search(queryEmbedding, {
        topK: 10,
        filters: { filePath: 'nonexistent.js' }
      });

      assert.strictEqual(results.ids[0].length, 0, 'should return empty results');
    });
  });

  describe('40.5: Implement deleteFile()', () => {
    before(async () => {
      // Add test data
      await db.clear();

      const chunks = [
        { code: 'function a() {}', type: 'function' },
        { code: 'function b() {}', type: 'function' },
        { code: 'function c() {}', type: 'function' },
        { code: 'function d() {}', type: 'function' },
        { code: 'function e() {}', type: 'function' }
      ];

      const embeddings = chunks.map(() => new Array(384).fill(0).map(() => Math.random()));

      const metadata = [
        { id: 'file1.js:1', filePath: 'file1.js', codeType: 'function', language: 'javascript' },
        { id: 'file1.js:2', filePath: 'file1.js', codeType: 'function', language: 'javascript' },
        { id: 'file1.js:3', filePath: 'file1.js', codeType: 'function', language: 'javascript' },
        { id: 'file2.js:1', filePath: 'file2.js', codeType: 'function', language: 'javascript' },
        { id: 'file3.js:1', filePath: 'file3.js', codeType: 'function', language: 'javascript' }
      ];

      await db.addChunks(chunks, embeddings, metadata);
    });

    it('should delete all chunks from a file', async () => {
      const statsBefore = await db.getStats();
      assert.strictEqual(statsBefore.count, 5, 'should have 5 chunks before delete');

      await db.deleteFile('file1.js');

      const statsAfter = await db.getStats();
      assert.strictEqual(statsAfter.count, 2, 'should have 2 chunks after deleting file1.js (had 3 chunks)');
    });

    it('should verify deletion', async () => {
      // Try to get metadata for deleted chunks
      const meta1 = await db.getMetadata('file1.js:1');
      const meta2 = await db.getMetadata('file1.js:2');
      const meta3 = await db.getMetadata('file1.js:3');

      assert.strictEqual(meta1, null, 'file1.js:1 should be deleted');
      assert.strictEqual(meta2, null, 'file1.js:2 should be deleted');
      assert.strictEqual(meta3, null, 'file1.js:3 should be deleted');

      // Verify other files still exist
      const meta4 = await db.getMetadata('file2.js:1');
      const meta5 = await db.getMetadata('file3.js:1');

      assert.ok(meta4, 'file2.js:1 should still exist');
      assert.ok(meta5, 'file3.js:1 should still exist');
    });

    it('should support incremental updates (delete then re-add)', async () => {
      // Delete file
      await db.deleteFile('file2.js');

      let stats = await db.getStats();
      assert.strictEqual(stats.count, 1, 'should have 1 chunk after deleting file2.js');

      // Re-add file with updated content
      const chunks = [
        { code: 'function newFunc() {}', type: 'function' }
      ];

      const embeddings = [new Array(384).fill(0).map(() => Math.random())];

      const metadata = [{
        id: 'file2.js:1',
        filePath: 'file2.js',
        codeType: 'function',
        language: 'javascript',
        updated: true
      }];

      await db.addChunks(chunks, embeddings, metadata);

      stats = await db.getStats();
      assert.strictEqual(stats.count, 2, 'should have 2 chunks after re-adding file2.js');

      const meta = await db.getMetadata('file2.js:1');
      assert.strictEqual(meta.updated, true, 'should have updated metadata');
    });
  });

  describe('40.6: Implement statistics/metadata', () => {
    before(async () => {
      // Add diverse test data
      await db.clear();

      const chunks = [
        { code: 'function jsFunc() {}', type: 'function' },
        { code: 'class JsClass {}', type: 'class' },
        { code: 'function tsFunc(): void {}', type: 'function' },
        { code: 'interface TsInterface {}', type: 'interface' }
      ];

      const embeddings = chunks.map(() => new Array(384).fill(0).map(() => Math.random()));

      const metadata = [
        { id: 'file1.js:1', filePath: 'file1.js', codeType: 'function', language: 'javascript' },
        { id: 'file1.js:2', filePath: 'file1.js', codeType: 'class', language: 'javascript' },
        { id: 'file2.ts:1', filePath: 'file2.ts', codeType: 'function', language: 'typescript' },
        { id: 'file3.ts:1', filePath: 'file3.ts', codeType: 'interface', language: 'typescript' }
      ];

      await db.addChunks(chunks, embeddings, metadata);
    });

    it('should return correct count', async () => {
      const stats = await db.getStats();

      assert.strictEqual(stats.count, 4, 'should have correct total count');
    });

    it('should return file count', async () => {
      const stats = await db.getStats();

      assert.strictEqual(stats.fileCount, 3, 'should have 3 unique files');
    });

    it('should return languages', async () => {
      const stats = await db.getStats();

      assert.ok(Array.isArray(stats.languages), 'languages should be an array');
      assert.ok(stats.languages.includes('javascript'), 'should include javascript');
      assert.ok(stats.languages.includes('typescript'), 'should include typescript');
      assert.strictEqual(stats.languages.length, 2, 'should have 2 languages');
    });

    it('should return collection name and path', async () => {
      const stats = await db.getStats();

      assert.strictEqual(stats.collectionName, 'code-embeddings', 'should have correct collection name');
      assert.ok(stats.dbPath, 'should have db path');
    });

    it('should clear entire index', async () => {
      const statsBefore = await db.getStats();
      assert.strictEqual(statsBefore.count, 4, 'should have 4 chunks before clear');

      await db.clear();

      const statsAfter = await db.getStats();
      assert.strictEqual(statsAfter.count, 0, 'should have 0 chunks after clear');
      assert.strictEqual(statsAfter.fileCount, 0, 'should have 0 files after clear');
      assert.strictEqual(statsAfter.languages.length, 0, 'should have 0 languages after clear');
    });
  });

  describe('40.7: Performance optimization', () => {
    it('should add 1000 chunks in <5s', async () => {
      await db.clear();

      // Generate 1000 chunks
      const chunks = Array.from({ length: 1000 }, (_, i) => ({
        code: `function func${i}() { return ${i}; }`,
        type: 'function'
      }));

      const embeddings = chunks.map(() => new Array(384).fill(0).map(() => Math.random()));

      const metadata = chunks.map((_, i) => ({
        id: `perf-test.js:${i}`,
        filePath: 'perf-test.js',
        lineStart: i * 3,
        lineEnd: i * 3 + 2,
        codeType: 'function',
        name: `func${i}`,
        language: 'javascript'
      }));

      const startTime = Date.now();
      await db.addChunks(chunks, embeddings, metadata);
      const duration = Date.now() - startTime;

      assert.ok(duration < 5000, `addChunks should complete in <5s (took ${duration}ms)`);

      const stats = await db.getStats();
      assert.strictEqual(stats.count, 1000, 'should have 1000 chunks');
    });

    it('should search top-10 in <500ms with 1000 chunks', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => Math.random());

      const startTime = Date.now();
      const results = await db.search(queryEmbedding, { topK: 10 });
      const duration = Date.now() - startTime;

      assert.ok(duration < 500, `search should complete in <500ms (took ${duration}ms)`);
      assert.strictEqual(results.ids[0].length, 10, 'should return 10 results');
    });

    it('should filter search in <500ms', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => Math.random());

      const startTime = Date.now();
      const results = await db.search(queryEmbedding, {
        topK: 10,
        filters: { filePath: 'perf-test.js', codeType: 'function' }
      });
      const duration = Date.now() - startTime;

      assert.ok(duration < 500, `filter search should complete in <500ms (took ${duration}ms)`);
      assert.ok(results.ids[0].length > 0, 'should return results');
    });

    it('should delete file in <100ms', async () => {
      const startTime = Date.now();
      await db.deleteFile('perf-test.js');
      const duration = Date.now() - startTime;

      assert.ok(duration < 100, `deleteFile should complete in <100ms (took ${duration}ms)`);

      const stats = await db.getStats();
      assert.strictEqual(stats.count, 0, 'all chunks should be deleted');
    });

    it('should get stats in <10ms', async () => {
      // Re-add some data
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        code: `function f${i}() {}`,
        type: 'function'
      }));
      const embeddings = chunks.map(() => new Array(384).fill(0).map(() => Math.random()));
      const metadata = chunks.map((_, i) => ({
        id: `test.js:${i}`,
        filePath: 'test.js',
        codeType: 'function',
        language: 'javascript'
      }));
      await db.addChunks(chunks, embeddings, metadata);

      const startTime = Date.now();
      const stats = await db.getStats();
      const duration = Date.now() - startTime;

      assert.ok(duration < 10, `getStats should complete in <10ms (took ${duration}ms)`);
      assert.strictEqual(stats.count, 100, 'should have correct count');
    });
  });

  describe('40.8: Unit tests + integration', () => {
    before(async () => {
      await db.clear();
    });

    it('should handle empty database gracefully', async () => {
      const queryEmbedding = new Array(384).fill(0).map(() => 0.5);

      const results = await db.search(queryEmbedding, { topK: 10 });

      assert.ok(results, 'should return results object');
      assert.strictEqual(results.ids[0].length, 0, 'should return empty results');

      const stats = await db.getStats();
      assert.strictEqual(stats.count, 0, 'count should be 0');
    });

    it('should handle invalid embedding dimensions', async () => {
      const chunks = [{ code: 'test', type: 'function' }];
      const embeddings = [new Array(384).fill(0)];
      const metadata = [{ id: 'test:1', filePath: 'test.js', language: 'javascript' }];

      await db.addChunks(chunks, embeddings, metadata);

      // Try to search with wrong dimension
      const wrongDimEmbedding = new Array(256).fill(0);

      await assert.rejects(
        async () => await db.search(wrongDimEmbedding),
        /Vectors must have same length/,
        'should throw error for mismatched dimensions'
      );
    });

    it('should handle edge cases (empty filters, null metadata)', async () => {
      await db.clear();

      const chunks = [{ code: 'test', type: 'function' }];
      const embeddings = [new Array(384).fill(0)];
      const metadata = [{ id: 'test:1', filePath: 'test.js' }];

      await db.addChunks(chunks, embeddings, metadata);

      // Search with empty filters
      const results1 = await db.search(new Array(384).fill(0), { filters: {} });
      assert.strictEqual(results1.ids[0].length, 1, 'should return results with empty filters');

      // Get metadata for non-existent ID
      const meta = await db.getMetadata('nonexistent');
      assert.strictEqual(meta, null, 'should return null for non-existent ID');
    });

    it('should support full CRUD workflow', async () => {
      await db.clear();

      // CREATE
      const chunks = [{ code: 'function test() {}', type: 'function' }];
      const embeddings = [new Array(384).fill(0).map(() => 0.5)];
      const metadata = [{ id: 'crud:1', filePath: 'crud.js', name: 'test', language: 'javascript' }];

      await db.addChunks(chunks, embeddings, metadata);

      // READ
      let stats = await db.getStats();
      assert.strictEqual(stats.count, 1, 'should have 1 chunk after create');

      const meta = await db.getMetadata('crud:1');
      assert.strictEqual(meta.name, 'test', 'should retrieve metadata');

      // UPDATE (via upsert)
      const updatedMetadata = [{ id: 'crud:1', filePath: 'crud.js', name: 'testUpdated', language: 'javascript' }];
      await db.addChunks(chunks, embeddings, updatedMetadata);

      stats = await db.getStats();
      assert.strictEqual(stats.count, 1, 'count should remain 1 after update');

      const updatedMeta = await db.getMetadata('crud:1');
      assert.strictEqual(updatedMeta.name, 'testUpdated', 'metadata should be updated');

      // DELETE
      await db.deleteFile('crud.js');

      stats = await db.getStats();
      assert.strictEqual(stats.count, 0, 'should have 0 chunks after delete');
    });

    it('should handle concurrent operations', async () => {
      await db.clear();

      // Simulate concurrent adds
      const promises = Array.from({ length: 10 }, (_, i) => {
        const chunks = [{ code: `function f${i}() {}`, type: 'function' }];
        const embeddings = [new Array(384).fill(0).map(() => Math.random())];
        const metadata = [{ id: `concurrent:${i}`, filePath: `file${i}.js`, language: 'javascript' }];

        return db.addChunks(chunks, embeddings, metadata);
      });

      await Promise.all(promises);

      const stats = await db.getStats();
      assert.strictEqual(stats.count, 10, 'should have 10 chunks after concurrent adds');
    });

    it('should calculate cosine similarity correctly', async () => {
      await db.clear();

      // Add two embeddings: identical and orthogonal
      const chunks = [
        { code: 'function a() {}', type: 'function' },
        { code: 'function b() {}', type: 'function' }
      ];

      const identicalEmbedding = new Array(384).fill(0).map((_, i) => i < 100 ? 1 : 0);
      const orthogonalEmbedding = new Array(384).fill(0).map((_, i) => i >= 100 && i < 200 ? 1 : 0);

      const embeddings = [identicalEmbedding, orthogonalEmbedding];

      const metadata = [
        { id: 'sim:1', filePath: 'sim.js', language: 'javascript' },
        { id: 'sim:2', filePath: 'sim.js', language: 'javascript' }
      ];

      await db.addChunks(chunks, embeddings, metadata);

      // Query with identical embedding (should match sim:1 perfectly)
      const results = await db.search(identicalEmbedding, { topK: 2 });

      // Most similar should be sim:1 (distance ~0)
      assert.strictEqual(results.ids[0][0], 'sim:1', 'most similar should be identical embedding');
      assert.ok(results.distances[0][0] < 0.01, `distance should be near 0 (got ${results.distances[0][0]})`);

      // Least similar should be sim:2 (distance ~1 for orthogonal vectors)
      assert.strictEqual(results.ids[0][1], 'sim:2', 'least similar should be orthogonal embedding');
      assert.ok(results.distances[0][1] > 0.99, `distance should be near 1 (got ${results.distances[0][1]})`);
    });
  });
});
