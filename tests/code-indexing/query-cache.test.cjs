'use strict';

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Save and restore env vars
let savedEnv;

describe('QueryCache', () => {
  let QueryCache;

  before(() => {
    savedEnv = { ...process.env };
    QueryCache = require('../../.claude/lib/code-indexing/query-cache.cjs').QueryCache;
  });

  after(() => {
    // Restore environment
    process.env = savedEnv;
  });

  beforeEach(() => {
    // Reset env vars that tests may modify
    delete process.env.SEARCH_CACHE_ENABLED;
    delete process.env.SEARCH_CACHE_TTL_MS;
    delete process.env.SEARCH_CACHE_SIMILARITY;
  });

  test('returns null on cache miss', () => {
    const cache = new QueryCache();
    const result = cache.get('nonexistent query');
    assert.equal(result, null);
  });

  test('stores and retrieves cached results by exact query text', () => {
    const cache = new QueryCache();
    const results = [{ file: 'foo.js', score: 0.9 }];

    cache.set('find auth middleware', results);
    const hit = cache.get('find auth middleware');

    assert.notEqual(hit, null);
    assert.deepStrictEqual(hit.results, results);
    assert.equal(hit.fromCache, true);
    assert.equal(hit.matchType, 'exact');
    assert.equal(typeof hit.age, 'number');
  });

  test('returns cached result when query is semantically similar', () => {
    const cache = new QueryCache({ similarityThreshold: 0.95 });

    // Use normalized embeddings where dot product = cosine similarity
    // Two vectors with cosine similarity > 0.95
    const embeddingA = [0.6, 0.8, 0.0]; // normalized: magnitude = 1.0
    const embeddingB = [0.61, 0.79, 0.02]; // very similar direction

    // Normalize embeddingB
    const magB = Math.sqrt(embeddingB.reduce((s, v) => s + v * v, 0));
    const normB = embeddingB.map(v => v / magB);

    // Verify similarity is > 0.95
    const dot = embeddingA.reduce((s, v, i) => s + v * normB[i], 0);
    assert.ok(dot > 0.95, `Expected similarity > 0.95, got ${dot}`);

    const results = [{ file: 'auth.js', score: 1.0 }];
    cache.set('authentication handler', results, embeddingA);
    const hit = cache.get('auth handler', normB);

    assert.notEqual(hit, null);
    assert.deepStrictEqual(hit.results, results);
    assert.equal(hit.fromCache, true);
    assert.equal(hit.matchType, 'semantic');
    assert.equal(typeof hit.similarity, 'number');
    assert.ok(hit.similarity >= 0.95);
  });

  test('returns null when similarity is below threshold', () => {
    const cache = new QueryCache({ similarityThreshold: 0.95 });

    // Two orthogonal vectors: cosine similarity = 0
    const embeddingA = [1, 0, 0];
    const embeddingB = [0, 1, 0];

    const results = [{ file: 'unrelated.js', score: 0.5 }];
    cache.set('database migration', results, embeddingA);
    const hit = cache.get('completely different query', embeddingB);

    assert.equal(hit, null);
  });

  test('expires entries after TTL', async () => {
    const cache = new QueryCache({ ttlMs: 50 }); // 50ms TTL
    const results = [{ file: 'temp.js' }];

    cache.set('expiring query', results);

    // Immediately should hit
    const hitBefore = cache.get('expiring query');
    assert.notEqual(hitBefore, null);

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 80));

    const hitAfter = cache.get('expiring query');
    assert.equal(hitAfter, null);
  });

  test('handles empty results gracefully', () => {
    const cache = new QueryCache();

    cache.set('no results query', []);
    const hit = cache.get('no results query');

    assert.notEqual(hit, null);
    assert.deepStrictEqual(hit.results, []);
    assert.equal(hit.fromCache, true);
  });

  test('cache stats reports hits, misses, and entry count', () => {
    const cache = new QueryCache();

    // Initial state
    let stats = cache.getStats();
    assert.equal(stats.entries, 0);
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 0);
    assert.equal(stats.enabled, true);

    // Add an entry and trigger a miss + a hit
    cache.set('test query', [{ file: 'a.js' }]);
    cache.get('missing query'); // miss
    cache.get('test query'); // hit

    stats = cache.getStats();
    assert.equal(stats.entries, 1);
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
  });

  test('clear() removes all entries', () => {
    const cache = new QueryCache();

    cache.set('query1', [{ file: 'a.js' }]);
    cache.set('query2', [{ file: 'b.js' }]);

    assert.equal(cache.getStats().entries, 2);

    cache.clear();

    // Stats should be reset immediately after clear
    assert.equal(cache.getStats().entries, 0);
    assert.equal(cache.getStats().hits, 0);
    assert.equal(cache.getStats().misses, 0);

    // Previously cached entries should no longer be retrievable
    assert.equal(cache.get('query1'), null);
    assert.equal(cache.get('query2'), null);
  });

  test('respects SEARCH_CACHE_ENABLED=off env var', () => {
    process.env.SEARCH_CACHE_ENABLED = 'off';
    const cache = new QueryCache();

    cache.set('disabled query', [{ file: 'x.js' }]);
    const hit = cache.get('disabled query');

    assert.equal(hit, null);
    assert.equal(cache.getStats().enabled, false);
    assert.equal(cache.getStats().entries, 0);
  });
});
