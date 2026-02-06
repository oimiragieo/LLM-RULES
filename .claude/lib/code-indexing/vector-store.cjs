/**
 * Vector Store - Code index vector layer (LanceDB-backed)
 *
 * @module code-indexing/vector-store
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { MemoryVectorStore } = require('../memory/lancedb-client.cjs');

class VectorStore {
  constructor(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const persistDirectory =
      options.persistDirectory ||
      process.env.LANCEDB_URI ||
      path.join(projectRoot, '.claude', 'data', 'lancedb');
    const collectionName = options.collectionName || process.env.LANCEDB_TABLE_CODE || 'code_index';

    this.embeddingMode =
      options.embeddingMode ||
      process.env.LANCEDB_EMBEDDING_MODE_CODE ||
      process.env.LANCEDB_EMBEDDING_MODE ||
      'transformers';

    // Skip LanceDB initialization entirely when embeddings are off (BM25-only mode)
    if (this.embeddingMode !== 'off') {
      this.store = MemoryVectorStore.getSharedStore({
        persistDirectory,
        collectionName,
        embeddingMode: this.embeddingMode,
        embeddingModel:
          this.embeddingMode === 'fastembed'
            ? undefined
            : process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      });
    } else {
      this.store = null;
    }

    // BM25 hybrid search integration (Phase 2)
    this.bm25Index = null; // Lazy-loaded BM25 indexer
    this.bm25Config = options.bm25 || {};
    this.persistDirectory = persistDirectory;
  }

  /**
   * Convert code chunks to document shape for the store.
   * @private
   */
  _chunksToDocs(chunks) {
    return chunks.map(chunk => ({
      id: chunk.id,
      text: chunk.content,
      metadata: {
        filePath: chunk.filePath,
        language: chunk.language,
        type: chunk.type,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        name: chunk.name,
        signature: chunk.signature,
        tokenCount: chunk.tokenCount,
      },
    }));
  }

  /**
   * Add chunks to the vector store (upsert: delete by id then add).
   * Use for incremental updates where chunk ids may already exist.
   */
  async addChunks(chunks, options = {}) {
    if (!Array.isArray(chunks) || chunks.length === 0) return;
    if (!this.store) return; // BM25-only mode - no dense embeddings
    const docs = this._chunksToDocs(chunks);
    if (options.addOnly) {
      await this.store.addDocuments(docs, options.embedBatchSize, {
        onEmbedProgress: options.onEmbedProgress,
      });
    } else {
      await this.store.upsertDocuments(docs);
    }
  }

  /**
   * Add chunks without deleting existing ids (append-only). Use for full reindex after dropping the table.
   * Also builds BM25 sparse index alongside dense embeddings.
   * @param {Object} [options] - Optional { embedBatchSize, onEmbedProgress(batchDone, totalBatches) }.
   */
  async addChunksOnly(chunks, options = {}) {
    if (!Array.isArray(chunks) || chunks.length === 0) return;

    // Build BM25 index first (fast)
    await this.addChunksToBM25(chunks);

    // Skip dense embeddings when in BM25-only mode
    if (this.embeddingMode === 'off') return;

    // Then build dense embeddings (slow)
    return this.addChunks(chunks, { addOnly: true, ...options });
  }

  /**
   * Drop the code index table so a full reindex can use add-only writes (avoids per-chunk deletes).
   */
  async dropCodeTable() {
    if (!this.store) return; // BM25-only mode
    await this.store.initialize();
    return this.store.dropTable();
  }

  async search(query, options = {}) {
    if (!this.store) return []; // BM25-only mode - no dense search
    const limit = options.limit || options.topK || 10;
    const filters = options.filters || {};
    const minScore = typeof options.minScore === 'number' ? options.minScore : null;
    return await this.store.search(query, { limit, filters, minScore });
  }

  async deleteFile(filePath) {
    if (!this.store) return; // BM25-only mode
    return await this.store.deleteByMetadata('filePath', filePath);
  }

  async getStats() {
    if (!this.store) {
      return {
        collectionName: null,
        dbPath: this.persistDirectory,
        tables: [],
        mode: 'bm25-only',
        bm25Loaded: !!this.bm25Index,
      };
    }
    const tables = await this.store.listTables();
    return {
      collectionName: this.store.config?.collectionName,
      dbPath: this.store.config?.persistDirectory,
      tables,
    };
  }

  /**
   * Load BM25 index from disk (if exists)
   * @returns {Promise<void>}
   */
  async loadBM25Index() {
    const bm25Path = path.join(this.persistDirectory, 'bm25-index.json');
    if (fs.existsSync(bm25Path)) {
      const data = JSON.parse(fs.readFileSync(bm25Path, 'utf-8'));
      const { BM25Indexer } = require('./bm25-indexer.cjs');
      this.bm25Index = BM25Indexer.fromJSON(data);
    }
  }

  /**
   * Save BM25 index to disk
   * @returns {Promise<void>}
   */
  async saveBM25Index() {
    if (this.bm25Index) {
      const bm25Path = path.join(this.persistDirectory, 'bm25-index.json');
      fs.writeFileSync(bm25Path, JSON.stringify(this.bm25Index.toJSON()), 'utf-8');
    }
  }

  /**
   * Add chunks to BM25 sparse index
   * @param {Array<Object>} chunks - Code chunks to add
   * @returns {Promise<void>}
   */
  async addChunksToBM25(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return;

    // Lazy-initialize BM25 indexer
    if (!this.bm25Index) {
      const { BM25Indexer } = require('./bm25-indexer.cjs');
      this.bm25Index = new BM25Indexer(this.bm25Config);
    }

    // Convert chunks to BM25 document format
    const docs = chunks.map(chunk => ({
      id: chunk.id,
      text: chunk.content || chunk.text,
      filePath: chunk.filePath,
      startLine: chunk.lineStart || chunk.startLine,
      endLine: chunk.lineEnd || chunk.endLine,
    }));

    this.bm25Index.addDocuments(docs);
  }

  /**
   * Hybrid search combining BM25 (sparse) + dense embeddings with RRF fusion
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} [options.mode='hybrid'] - Search mode: 'hybrid', 'sparse', 'dense'
   * @param {number} [options.k_sparse=100] - Number of sparse results
   * @param {number} [options.k_dense=10] - Number of dense results
   * @param {number} [options.rrf_k=60] - RRF k constant
   * @param {number} [options.sparse_weight=0.4] - Sparse result weight
   * @param {number} [options.dense_weight=0.6] - Dense result weight
   * @returns {Promise<Array>} Hybrid search results
   */
  async hybridSearch(query, options = {}) {
    const opts = {
      k_sparse: options.k_sparse || this.bm25Config.k_sparse || 100,
      k_dense: options.k_dense || this.bm25Config.k_dense || 10,
      rrf_k: options.rrf_k || this.bm25Config.rrf_k || 60,
      sparse_weight: options.sparse_weight || this.bm25Config.weights?.sparse || 0.4,
      dense_weight: options.dense_weight || this.bm25Config.weights?.dense || 0.6,
      mode: options.mode || 'hybrid',
    };

    // Fallback to dense-only if BM25 not available
    if (!this.bm25Index) {
      return this.search(query, { limit: opts.k_dense });
    }

    // Sparse-only mode
    if (opts.mode === 'sparse') {
      return this.bm25Index.search(query, opts.k_sparse);
    }

    // Dense-only mode
    if (opts.mode === 'dense') {
      return this.search(query, { limit: opts.k_dense });
    }

    // Hybrid mode: RRF fusion
    const sparseResults = this.bm25Index.search(query, opts.k_sparse);
    const denseResults = await this.search(query, { limit: opts.k_dense });

    // Fuse results using Reciprocal Rank Fusion
    const fused = this._fuseResultsRRF(
      sparseResults,
      denseResults,
      opts.rrf_k,
      opts.sparse_weight,
      opts.dense_weight
    );

    return fused.slice(0, Math.max(opts.k_sparse, opts.k_dense));
  }

  /**
   * Reciprocal Rank Fusion (RRF) - Fuse sparse + dense results
   * @param {Array} sparseResults - BM25 results
   * @param {Array} denseResults - Dense embedding results
   * @param {number} k - RRF constant (default: 60)
   * @param {number} sparseWeight - Weight for sparse results (default: 0.4)
   * @param {number} denseWeight - Weight for dense results (default: 0.6)
   * @returns {Array} Fused results sorted by RRF score
   * @private
   */
  _fuseResultsRRF(sparseResults, denseResults, k = 60, sparseWeight = 0.4, denseWeight = 0.6) {
    const scoreMap = new Map();

    // Add sparse results with weighted RRF scores
    sparseResults.forEach((result, rank) => {
      const score = sparseWeight * (1 / (k + rank));
      if (!scoreMap.has(result.id)) {
        scoreMap.set(result.id, { ...result, rrf_score: 0 });
      }
      scoreMap.get(result.id).rrf_score += score;
    });

    // Add dense results with weighted RRF scores
    denseResults.forEach((result, rank) => {
      const id = result.id || result.metadata?.id;
      const score = denseWeight * (1 / (k + rank));
      if (!scoreMap.has(id)) {
        scoreMap.set(id, { ...result, id, rrf_score: 0 });
      }
      scoreMap.get(id).rrf_score += score;
    });

    // Sort by RRF score (descending)
    return Array.from(scoreMap.values()).sort((a, b) => b.rrf_score - a.rrf_score);
  }

  async close() {
    if (!this.store) return; // BM25-only mode
    return this.store.close();
  }
}

module.exports = {
  VectorStore,
};
