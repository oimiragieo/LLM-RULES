'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const { EmbeddingGenerator, DEFAULT_OPTIONS } = require('../../.claude/lib/code-indexing/embedding-generator.cjs');

describe('Embedding Generator Tests', () => {
  let generator;
  const cacheDir = path.join(__dirname, '../../.claude/data/code-index');
  const cachePath = path.join(cacheDir, 'test-embedding-cache.json');

  before(async () => {
    // Clean cache before tests
    try {
      await fs.unlink(cachePath);
    } catch (_e) {
      // Ignore if doesn't exist
    }
  });

  after(async () => {
    // Clean up after tests
    try {
      await fs.unlink(cachePath);
    } catch (_e) {
      // Ignore if doesn't exist
    }
  });

  describe('39.1: Class Skeleton', () => {
    test('EmbeddingGenerator class instantiates with default options', () => {
      generator = new EmbeddingGenerator();
      assert.ok(generator, 'Generator should instantiate');
      assert.equal(generator.options.model, DEFAULT_OPTIONS.model);
      assert.equal(generator.options.dimensions, DEFAULT_OPTIONS.dimensions);
      assert.equal(generator.initialized, false);
    });

    test('EmbeddingGenerator accepts custom options', () => {
      const customGen = new EmbeddingGenerator({
        batchSize: 50,
        cacheEnabled: false
      });
      assert.equal(customGen.options.batchSize, 50);
      assert.equal(customGen.options.cacheEnabled, false);
      // Should still have default model
      assert.equal(customGen.options.model, DEFAULT_OPTIONS.model);
    });

    test('DEFAULT_OPTIONS exported correctly', () => {
      assert.ok(DEFAULT_OPTIONS);
      assert.equal(DEFAULT_OPTIONS.model, 'Xenova/all-MiniLM-L6-v2');
      assert.equal(DEFAULT_OPTIONS.dimensions, 384);
      assert.equal(DEFAULT_OPTIONS.batchSize, 100);
    });
  });

  describe('39.2: Initialization', () => {
    test('initialize loads model (slow first time)', { timeout: 60000 }, async () => {
      generator = new EmbeddingGenerator({
        cacheEnabled: false
      });

      assert.equal(generator.isInitialized(), false);

      await generator.initialize();

      assert.equal(generator.isInitialized(), true);
      assert.ok(generator.pipeline, 'Pipeline should be loaded');
    });

    test('getDimensions returns correct value', () => {
      const gen = new EmbeddingGenerator({ dimensions: 384 });
      assert.equal(gen.getDimensions(), 384);
    });

    test('initialize is idempotent (does not reload)', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });
      await gen.initialize();

      const pipeline1 = gen.pipeline;
      await gen.initialize(); // Call again
      const pipeline2 = gen.pipeline;

      assert.equal(pipeline1, pipeline2, 'Should reuse same pipeline');
    });
  });

  describe('39.3: Single Embedding', () => {
    test('embed generates 384-dimensional vector', { timeout: 60000 }, async () => {
      generator = new EmbeddingGenerator({ cacheEnabled: false });

      const text = 'function hello() { return 42; }';
      const embedding = await generator.embed(text);

      assert.ok(Array.isArray(embedding), 'Should return array');
      assert.equal(embedding.length, 384, 'Should be 384 dimensions');
      assert.ok(embedding.every(v => typeof v === 'number'), 'All values should be numbers');
    });

    test('embed handles empty string', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });
      const embedding = await gen.embed('');

      assert.ok(Array.isArray(embedding));
      assert.equal(embedding.length, 384);
    });

    test('embed handles very long text', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });
      const longText = 'x'.repeat(10000);
      const embedding = await gen.embed(longText);

      assert.ok(Array.isArray(embedding));
      assert.equal(embedding.length, 384);
    });

    test('embeddings are normalized (L2 norm ≈ 1)', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });
      const embedding = await gen.embed('test');

      // Calculate L2 norm
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      assert.ok(Math.abs(norm - 1.0) < 0.01, `L2 norm should be ≈1, got ${norm}`);
    });
  });

  describe('39.4: Batch Embedding', () => {
    test('batchEmbed processes multiple texts', { timeout: 60000 }, async () => {
      generator = new EmbeddingGenerator({
        batchSize: 2,
        cacheEnabled: false
      });

      const texts = [
        'function foo() {}',
        'function bar() {}',
        'class MyClass {}'
      ];

      const embeddings = await generator.batchEmbed(texts);

      assert.equal(embeddings.length, 3);
      assert.ok(embeddings.every(e => e.length === 384));
    });

    test('batchEmbed calls progress callback', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ batchSize: 1, cacheEnabled: false });
      const texts = ['a', 'b', 'c'];

      const progressCalls = [];
      await gen.batchEmbed(texts, (current, total) => {
        progressCalls.push({ current, total });
      });

      assert.ok(progressCalls.length > 0, 'Progress callback should be called');
      const lastCall = progressCalls[progressCalls.length - 1];
      assert.equal(lastCall.current, 3);
      assert.equal(lastCall.total, 3);
    });

    test('embedChunks adds embeddings to chunks', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });

      const chunks = [
        {
          id: 'test:func:1',
          type: 'function',
          language: 'javascript',
          name: 'hello',
          content: 'function hello() { return 42; }',
          signature: 'hello()'
        },
        {
          id: 'test:class:1',
          type: 'class',
          language: 'javascript',
          name: 'MyClass',
          content: 'class MyClass {}',
          signature: 'class MyClass'
        }
      ];

      const result = await gen.embedChunks(chunks);

      assert.equal(result.length, 2);
      assert.ok(result[0].chunk);
      assert.ok(result[0].embedding);
      assert.equal(result[0].chunk.id, 'test:func:1');
      assert.equal(result[0].embedding.length, 384);
    });

    test('prepareForEmbedding adds context prefix', () => {
      const gen = new EmbeddingGenerator();

      const chunk = {
        type: 'function',
        language: 'javascript',
        name: 'hello',
        signature: 'hello()',
        content: 'function hello() { return 42; }'
      };

      const prepared = gen.prepareForEmbedding(chunk);

      assert.ok(prepared.includes('[javascript]'));
      assert.ok(prepared.includes('[function]'));
      assert.ok(prepared.includes('Name: hello'));
      assert.ok(prepared.includes('Signature: hello()'));
      assert.ok(prepared.includes('Code:'));
    });
  });

  describe('39.5: Caching', () => {
    test('getCacheKey generates MD5 hash', () => {
      const gen = new EmbeddingGenerator();
      const key1 = gen.getCacheKey('test');
      const key2 = gen.getCacheKey('test');
      const key3 = gen.getCacheKey('different');

      assert.equal(key1, key2, 'Same text should produce same key');
      assert.notEqual(key1, key3, 'Different text should produce different key');
      assert.equal(key1.length, 32, 'MD5 hash should be 32 characters');
    });

    test('cache stores and retrieves embeddings', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });

      const text = 'function test() {}';

      // First call - generate embedding
      const embedding1 = await gen.embed(text, true);

      // Second call - should use cache
      const embedding2 = await gen.embed(text, true);

      assert.deepEqual(embedding1, embedding2);
      assert.equal(gen.cache.size, 1);
    });

    test('useCache=false bypasses cache', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: true, cachePath: cachePath });

      const text = 'test';
      await gen.embed(text, true); // Cache it

      const initialSize = gen.cache.size;
      await gen.embed(text, false); // Don't use cache

      // Cache size should not increase
      assert.equal(gen.cache.size, initialSize);
    });

    test('saveCache persists to disk', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });

      await gen.embed('test1');
      await gen.embed('test2');

      await gen.saveCache();

      // Check file exists
      const stats = await fs.stat(cachePath);
      assert.ok(stats.isFile());
    });

    test('loadCache restores from disk', { timeout: 60000 }, async () => {
      // First generator saves cache
      const gen1 = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });
      await gen1.embed('cached_text');
      await gen1.saveCache();

      // Second generator loads cache
      const gen2 = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });
      await gen2.loadCache();

      assert.ok(gen2.cache.size > 0, 'Should have loaded cached embeddings');
    });

    test('clearCache empties cache', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: true, cachePath: cachePath });
      await gen.embed('test');

      assert.ok(gen.cache.size > 0);

      gen.clearCache();

      assert.equal(gen.cache.size, 0);
    });

    test('getCacheStats returns stats', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });
      await gen.embed('test');

      const stats = gen.getCacheStats();

      assert.ok(stats.size >= 1);
      assert.equal(stats.enabled, true);
      assert.ok(stats.path.includes('test-embedding-cache.json'));
    });
  });

  describe('39.6: Error Handling', () => {
    test('embed auto-initializes if not initialized', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({ cacheEnabled: false });

      // Don't call initialize() manually
      assert.equal(gen.isInitialized(), false);

      const embedding = await gen.embed('test');

      assert.equal(gen.isInitialized(), true);
      assert.ok(embedding);
    });

    test('handles invalid cache file gracefully', { timeout: 60000 }, async () => {
      // Write invalid JSON
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, 'invalid json{{{', 'utf-8');

      const gen = new EmbeddingGenerator({
        cacheEnabled: true,
        cachePath: cachePath
      });

      // Should not throw
      await gen.loadCache();

      assert.equal(gen.cache.size, 0, 'Should start with empty cache');
    });
  });

  describe('39.7: Performance', () => {
    test('processes 100 chunks in <30 seconds', { timeout: 60000 }, async () => {
      const gen = new EmbeddingGenerator({
        batchSize: 100,
        cacheEnabled: false
      });

      // Generate 100 simple chunks
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        id: `test:${i}`,
        type: 'function',
        language: 'javascript',
        name: `func${i}`,
        content: `function func${i}() { return ${i}; }`
      }));

      const start = Date.now();
      const result = await gen.embedChunks(chunks);
      const elapsed = Date.now() - start;

      assert.equal(result.length, 100);
      assert.ok(elapsed < 30000, `Should complete in <30s, took ${elapsed}ms`);

      console.log(`      [PERF] 100 chunks in ${elapsed}ms (${(elapsed / 100).toFixed(1)}ms/chunk)`);
    });
  });
});
