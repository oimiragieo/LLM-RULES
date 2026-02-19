/**
 * Hybrid Lazy Indexer - ripgrep + Embeddings
 *
 * Combines fast text search (ripgrep/BM25) with semantic embeddings
 * for the best of both worlds.
 *
 * Architecture:
 * - ripgrep: Instant text search, structure analysis
 * - Embeddings: Semantic similarity (optional, background)
 * - Hybrid scoring: Reciprocal Rank Fusion (RRF)
 */

'use strict';

const path = require('path');
const { AstGrepSearch } = require('./ast-grep-wrapper.cjs');
const { QueryCache } = require('./query-cache.cjs');

class HybridLazyIndexer {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.cacheDir = path.join(this.projectRoot, '.claude', 'context', 'code-index');
    this.lanceDbPath = path.join(this.projectRoot, '.claude', 'context', 'data', 'lancedb');

    // Configuration
    this.config = {
      // ripgrep settings
      maxRipgrepResults: options.maxRipgrepResults || 100,
      ripgrepTimeoutMs: options.ripgrepTimeoutMs || 5000,
      maxRipgrepMatchesPerFile: options.maxRipgrepMatchesPerFile || 3,
      maxRipgrepCacheEntries: options.maxRipgrepCacheEntries || 256,

      // Embedding settings
      embeddingEnabled: options.embeddingEnabled !== false,
      embedBatchSize: options.embedBatchSize || 32,
      maxConcurrentEmbeds: options.maxConcurrentEmbeds || 4,
      semanticCacheExpiryMs: options.semanticCacheExpiryMs || 30000,
      maxSemanticCacheEntries: options.maxSemanticCacheEntries || 128,
      maxEmbeddingCacheEntries: options.maxEmbeddingCacheEntries || 128,

      // Hybrid scoring
      rrfK: options.rrfK || 60,
      textWeight: options.textWeight || 0.4,
      semanticWeight: options.semanticWeight || 0.6,

      // Lazy loading
      cacheExpiryMs: options.cacheExpiryMs || 30000, // 30s
      debug: options.debug === true || process.env.HYBRID_SEARCH_DEBUG === 'true',

      // Optional ast-grep refinement for structural queries
      astGrepRefinementEnabled:
        options.astGrepRefinementEnabled !== false &&
        process.env.HYBRID_AST_GREP_REFINEMENT !== 'off',
      astGrepTimeoutMs: options.astGrepTimeoutMs || 1200,
      astGrepMaxCandidateFiles: options.astGrepMaxCandidateFiles || 40,
      astGrepScoreBoost: options.astGrepScoreBoost || 0.35,
    };

    // In-memory caches
    this.ripgrepCache = new Map();
    this.structureCache = null;
    this.structureCacheTime = 0;
    this.semanticCache = new Map();
    this.embeddingCache = new Map();

    // Background embedding queue
    this.embedQueue = [];
    this.isEmbedding = false;

    // Initialization state
    this.lanceDBInitialized = false;

    // ripgrep path cache (resolved once)
    this._rgPathPromise = null;
    this._rgPath = options.rgPath || null;

    this._astGrep = new AstGrepSearch({
      projectRoot: this.projectRoot,
      timeout: this.config.astGrepTimeoutMs,
      binPath: options.astGrepBinPath || process.env.AST_GREP_BIN || 'ast-grep',
    });
    this._astGrepAvailable = null;
    this._astGrepCheckPromise = null;
    this._astGrepBinCandidates = this.getAstGrepBinCandidates(
      options.astGrepBinPath || process.env.AST_GREP_BIN
    );

    // Semantic query cache
    this.queryCache = new QueryCache({
      ttlMs: options.queryCacheTtlMs,
      similarityThreshold: options.queryCacheSimilarityThreshold,
      maxEntries: options.queryCacheMaxEntries,
    });
  }
}

const { HybridLazyIndexerMethodsA } = require('./hybrid-lazy-indexer-methods-a.cjs');
const { HybridLazyIndexerMethodsB } = require('./hybrid-lazy-indexer-methods-b.cjs');
const { HybridLazyIndexerMethodsC } = require('./hybrid-lazy-indexer-methods-c.cjs');

function applyPrototypeMethods(sourceClass) {
  const descriptors = Object.getOwnPropertyDescriptors(sourceClass.prototype);
  delete descriptors.constructor;
  Object.defineProperties(HybridLazyIndexer.prototype, descriptors);
}

applyPrototypeMethods(HybridLazyIndexerMethodsA);
applyPrototypeMethods(HybridLazyIndexerMethodsB);
applyPrototypeMethods(HybridLazyIndexerMethodsC);

module.exports = { HybridLazyIndexer };
