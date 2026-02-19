'use strict';

class QueryCache {
  constructor(options = {}) {
    this.enabled = (process.env.SEARCH_CACHE_ENABLED || 'on') !== 'off';
    this.ttlMs = Number(process.env.SEARCH_CACHE_TTL_MS) || options.ttlMs || 300000;
    this.similarityThreshold =
      Number(process.env.SEARCH_CACHE_SIMILARITY) || options.similarityThreshold || 0.95;
    this.maxEntries = options.maxEntries || 100;
    this._cache = new Map(); // key: queryText -> { results, embedding, createdAt }
    this._hits = 0;
    this._misses = 0;
  }

  get(query, queryEmbedding = null) {
    if (!this.enabled) return null;

    // 1. Exact match (fastest)
    const exact = this._cache.get(query);
    if (exact && !this._isExpired(exact)) {
      this._hits++;
      return {
        results: exact.results,
        fromCache: true,
        matchType: 'exact',
        age: Date.now() - exact.createdAt,
      };
    }
    if (exact) {
      this._cache.delete(query); // expired
    }

    // 2. Semantic match (if embedding provided)
    if (queryEmbedding) {
      for (const [key, entry] of this._cache) {
        if (this._isExpired(entry)) {
          this._cache.delete(key);
          continue;
        }
        if (!entry.embedding) continue;
        const sim = this._cosineSimilarity(queryEmbedding, entry.embedding);
        if (sim >= this.similarityThreshold) {
          this._hits++;
          return {
            results: entry.results,
            fromCache: true,
            matchType: 'semantic',
            similarity: sim,
            age: Date.now() - entry.createdAt,
          };
        }
      }
    }

    this._misses++;
    return null;
  }

  set(query, results, embedding = null) {
    if (!this.enabled) return;
    // LRU eviction
    if (this._cache.size >= this.maxEntries) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(query, { results, embedding, createdAt: Date.now() });
  }

  clear() {
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

  getStats() {
    return {
      entries: this._cache.size,
      hits: this._hits,
      misses: this._misses,
      enabled: this.enabled,
    };
  }

  _isExpired(entry) {
    return Date.now() - entry.createdAt > this.ttlMs;
  }

  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // embeddings are normalized, so dot product = cosine
  }
}

module.exports = { QueryCache };
