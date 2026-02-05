/**
 * LanceDB Client for Memory Vector Storage
 *
 * Replaces ChromaDB with an embedded, serverless vector database.
 * Part of Core Remediation Plan (P0 - Task #21).
 *
 * Features:
 * - In-process execution (no Docker/server required)
 * - Native Node.js bindings via @lancedb/lancedb
 * - Local embedding generation via @xenova/transformers
 */

const path = require('path');
const fs = require('fs');
const { createLogger } = require('../utils/logger.cjs');

const logger = createLogger('lancedb-client');

/**
 * @typedef {Object} EmbeddingStatus
 * @property {'unknown'|'ready'|'unavailable'|'disabled'} status
 * @property {string|null} mode
 * @property {string|null} reason
 */

/**
 * @typedef {Object} VectorStoreConfig
 * @property {string} [persistDirectory]
 * @property {string} [collectionName]
 * @property {string} [embeddingMode]
 * @property {string} [embeddingModel]
 */

// Lazy load transformers
let pipeline;
let lancedbModule;

async function getLanceDb() {
  if (!lancedbModule) {
    // @lancedb/lancedb may be ESM depending on version; use dynamic import for CJS compatibility.
    lancedbModule = await import('@lancedb/lancedb');
  }
  return lancedbModule;
}

function stableTestEmbedding(text, dims = 384) {
  const vec = new Array(dims).fill(0);
  const str = String(text || '');
  for (let i = 0; i < str.length; i++) {
    vec[i % dims] += (str.charCodeAt(i) % 31) / 31;
  }
  // L2 normalize
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * MemoryVectorStore - LanceDB implementation
 */
class MemoryVectorStore {
  /**
   * Create a new MemoryVectorStore instance
   *
   * @param {Object} config - Configuration options
   * @param {string} [config.persistDirectory] - Directory for persistent storage
   * @param {string} [config.collectionName] - Name of the table (default: agent_memory)
   */
  constructor(config = {}) {
    this.config = {
      persistDirectory:
        config.persistDirectory || process.env.LANCEDB_URI || '.claude/data/lancedb',
      collectionName: config.collectionName || process.env.LANCEDB_TABLE || 'agent_memory',
      embeddingMode: config.embeddingMode || process.env.LANCEDB_EMBEDDING_MODE || 'transformers',
      embeddingModel:
        config.embeddingModel || process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      embedBatchSize: config.embedBatchSize,
      gpu: config.gpu !== undefined ? config.gpu : { enabled: true, autoTuneBatchSize: true },
    };

    this.db = null;
    this.table = null;
    this.embedder = null;
    this._fastembedModel = null;
    this.isInitialized = false;
    this._mockMode = false;
    this._tableVectorDim = null;
    this._shared = false;
    this._embeddingStatus = {
      status: 'unknown',
      mode: this.config.embeddingMode,
      reason: null,
    };
    // GPU detection state
    this.device = 'cpu'; // Default to CPU
    this.gpuDetected = false;
    this.gpuName = null;
    this.gpuMemoryMB = 0;
  }

  static _sharedStores = new Map();

  static _makeKey(config) {
    const persistDirectory =
      config.persistDirectory || process.env.LANCEDB_URI || '.claude/data/lancedb';
    const collectionName = config.collectionName || process.env.LANCEDB_TABLE || 'agent_memory';
    const embeddingMode =
      config.embeddingMode || process.env.LANCEDB_EMBEDDING_MODE || 'transformers';
    const embeddingModel =
      config.embeddingModel || process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    return [persistDirectory, collectionName, embeddingMode, embeddingModel].join('|');
  }

  static getSharedStore(config = {}) {
    const key = MemoryVectorStore._makeKey(config);
    if (MemoryVectorStore._sharedStores.has(key)) {
      return MemoryVectorStore._sharedStores.get(key);
    }
    const store = new MemoryVectorStore(config);
    store._shared = true;
    MemoryVectorStore._sharedStores.set(key, store);
    return store;
  }

  /**
   * Initialize GPU detection and configuration
   * @returns {Promise<void>}
   * @private
   */
  async _initializeGPU() {
    try {
      const { GPUDetector } = require('../code-indexing/gpu-detector.cjs');
      const detector = new GPUDetector();
      const gpuInfo = await detector.detectNVIDIA();

      if (gpuInfo.available) {
        this.device = 'gpu';
        this.gpuDetected = true;
        this.gpuName = gpuInfo.gpuName;
        this.gpuMemoryMB = gpuInfo.totalMemoryMB;

        // Auto-tune batch size based on GPU memory
        if (this.config.gpu.autoTuneBatchSize && !this.config.embedBatchSize) {
          this.config.embedBatchSize = detector.recommendBatchSize(this.gpuMemoryMB);
        }

        logger.info(`GPU detected: ${this.gpuName} (${this.gpuMemoryMB}MB)`, {
          batchSize: this.config.embedBatchSize,
        });
      } else {
        logger.info('No GPU detected, using CPU for embeddings');
        this.device = 'cpu';
      }
    } catch (error) {
      logger.warn(`GPU detection failed, falling back to CPU: ${error.message}`);
      this.device = 'cpu';
    }
  }

  /**
   * Initialize the LanceDB connection and embedding model
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 1. Initialize DB Connection
      const dbPath = path.resolve(this.config.persistDirectory);
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      const lancedb = await getLanceDb();
      this.db = await lancedb.connect(dbPath);

      // 2. GPU Detection (if enabled)
      if (this.config.gpu?.enabled && this.config.embeddingMode === 'transformers') {
        await this._initializeGPU();
      }

      // 3. Initialize Embedding Model (Local)
      if (this.config.embeddingMode === 'transformers') {
        if (!pipeline) {
          // @xenova/transformers is an ESM module in recent versions.
          // We use dynamic import and property access to get the pipeline function safely.
          try {
            // @xenova/transformers is an ESM module in recent versions.
            // We use dynamic import and property access to get the pipeline function safely.
            const transformerModule = await import('@xenova/transformers');
            pipeline = transformerModule.pipeline;

            // Use efficient MiniLM model (384 dimensions)
            // 'feature-extraction' allows raw vector output
            this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
            this._embeddingStatus = { status: 'ready', mode: 'transformers', reason: null };
            this._mockMode = false;
          } catch (e) {
            logger.warn(
              'Failed to load local embedding model (likely missing dependencies like "sharp"). Disabling semantic embeddings.',
              { error: e.message }
            );

            // Fail-closed: no mock embeddings
            this.embedder = null;
            this._mockMode = true;
            this._embeddingStatus = {
              status: 'unavailable',
              mode: 'transformers',
              reason: e.message,
            };
          }
        } else {
          // Already loaded pipeline, just ensure embedder is ready
          try {
            this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
            this._embeddingStatus = { status: 'ready', mode: 'transformers', reason: null };
            this._mockMode = false;
          } catch (e) {
            logger.warn(
              'Failed to initialize embedding model on reuse. Disabling semantic embeddings.',
              { error: e.message }
            );
            this.embedder = null;
            this._mockMode = true;
            this._embeddingStatus = {
              status: 'unavailable',
              mode: 'transformers',
              reason: e.message,
            };
          }
        }
      } else if (this.config.embeddingMode === 'test') {
        // Deterministic, fast embedding for tests (no network/model download)
        this.embedder = null;
        this._embeddingStatus = { status: 'ready', mode: 'test', reason: null };
        this._mockMode = false;
      } else if (this.config.embeddingMode === 'fastembed') {
        this.embedder = null;
        try {
          const fastembed = require('fastembed');
          this._fastembedModel = await fastembed.FlagEmbedding.init({
            model: fastembed.EmbeddingModel.BGESmallENV15,
          });
          this._embeddingStatus = { status: 'ready', mode: 'fastembed', reason: null };
          this._mockMode = false;
        } catch (e) {
          logger.warn('FastEmbed not available. Install optional dependency: pnpm add fastembed', {
            error: e.message,
          });
          this._fastembedModel = null;
          this._embeddingStatus = {
            status: 'unavailable',
            mode: 'fastembed',
            reason: e.message || 'Install optional dependency: pnpm add fastembed',
          };
        }
      } else if (this.config.embeddingMode === 'off') {
        this.embedder = null;
        this._embeddingStatus = {
          status: 'disabled',
          mode: 'off',
          reason: 'LANCEDB_EMBEDDING_MODE=off',
        };
        this._mockMode = false;
      } else {
        throw new Error(`Unknown embeddingMode: ${this.config.embeddingMode}`);
      }

      // 3. Open Table if exists
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.config.collectionName)) {
        this.table = await this.db.openTable(this.config.collectionName);
      }
      // If table doesn't exist, we wait for first add() to create it with schema inference

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize LanceDB: ${error.message}`);
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text
   * @returns {Promise<Array<number>>} Vector
   */
  async generateEmbedding(text) {
    if (this.config.embeddingMode === 'off') {
      throw new Error('Embeddings disabled (LANCEDB_EMBEDDING_MODE=off)');
    }

    if (this.config.embeddingMode === 'test') {
      return stableTestEmbedding(text, 384);
    }

    if (this._embeddingStatus?.status === 'unavailable') {
      throw new Error(
        `Embeddings unavailable${this._embeddingStatus.reason ? `: ${this._embeddingStatus.reason}` : ''}`
      );
    }

    if (this.config.embeddingMode === 'fastembed' && this._fastembedModel) {
      const gen = this._fastembedModel.embed([text], 1);
      for await (const batch of gen) {
        return Array.from(batch[0] || []);
      }
      return [];
    }

    if (!this.embedder) throw new Error('Embedder not initialized');

    // Real Transformers pipeline
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for multiple texts in batches.
   * Tries pipeline batch input (one forward pass per batch) when texts.length > 1;
   * falls back to parallel single-text calls if batch API is unsupported.
   * @param {string[]} texts
   * @param {number} [batchSize=32]
   * @returns {Promise<Array<number[]>>} Array of vectors in same order as texts
   */
  /**
   * @param {string[]} texts
   * @param {number} [batchSize=32]
   * @param {{ onBatchComplete?: (batchDone: number, totalBatches: number) => void }} [progressOptions]
   */
  async generateEmbeddingsBatch(texts, batchSize = 32, progressOptions) {
    if (!texts || texts.length === 0) return [];
    if (this.config.embeddingMode === 'test') {
      return texts.map(t => stableTestEmbedding(t, 384));
    }
    if (this.config.embeddingMode === 'off' || this._embeddingStatus?.status === 'unavailable') {
      throw new Error('Embedder not available for batch');
    }
    const totalBatches = Math.ceil(texts.length / batchSize) || 1;
    if (this.config.embeddingMode === 'fastembed' && this._fastembedModel) {
      return this._fastembedBatch(texts, batchSize, progressOptions, totalBatches);
    }
    if (!this.embedder) throw new Error('Embedder not initialized');
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
      const batchVectors = await this._embedBatch(batch);
      results.push(...batchVectors);
      if (progressOptions?.onBatchComplete) {
        const batchDone = Math.min(totalBatches, Math.floor((i + batch.length) / batchSize));
        progressOptions.onBatchComplete(batchDone, totalBatches);
      }
    }
    return results;
  }

  /**
   * FastEmbed batch: collect all batches from async generator.
   * @param {string[]} texts
   * @param {number} batchSize
   * @param {{ onBatchComplete?: (batchDone: number, totalBatches: number) => void }} [progressOptions]
   * @param {number} [totalBatches]
   * @returns {Promise<Array<number[]>>}
   * @private
   */
  async _fastembedBatch(texts, batchSize, progressOptions, totalBatches = 1) {
    const results = [];
    let batchDone = 0;
    const gen = this._fastembedModel.embed(texts, batchSize);
    for await (const batch of gen) {
      for (const row of batch) {
        results.push(Array.isArray(row) ? Array.from(row) : []);
      }
      batchDone += 1;
      if (progressOptions?.onBatchComplete)
        progressOptions.onBatchComplete(batchDone, totalBatches);
    }
    return results;
  }

  /**
   * One batch: try pipeline array input (single forward pass), else fall back to parallel single-text calls.
   * @param {string[]} batch - Non-empty array of texts
   * @returns {Promise<Array<number[]>>} Vectors in same order as batch
   * @private
   */
  async _embedBatch(batch) {
    if (batch.length === 1) {
      const vec = await this.generateEmbedding(batch[0]);
      return [vec];
    }
    try {
      const output = await this.embedder(batch, { pooling: 'mean', normalize: true });
      if (!output || typeof output.data === 'undefined')
        throw new Error('Unexpected pipeline output');
      const data = output.data;
      const dims = output.dims;
      if (!Array.isArray(dims) || dims.length < 2) throw new Error('Expected [batchSize, dim]');
      const [rows, dim] = dims;
      if (rows !== batch.length) throw new Error('Batch size mismatch');
      const vecSize = dim;
      const vectors = [];
      for (let r = 0; r < rows; r++) {
        const start = r * vecSize;
        vectors.push(Array.from(data.slice(start, start + vecSize)));
      }
      return vectors;
    } catch (err) {
      logger.debug(
        'Pipeline batch input failed, using parallel single-text fallback:',
        err?.message
      );
      return Promise.all(batch.map(t => this.generateEmbedding(t)));
    }
  }

  async getTableVectorDimension() {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return null;
    if (Number.isFinite(this._tableVectorDim)) {
      return this._tableVectorDim;
    }
    try {
      const schema = await this.table.schema();
      const field = schema?.fields?.find(f => f.name === 'vector');
      const listSize = field?.type?.listSize;
      if (Number.isFinite(listSize)) {
        this._tableVectorDim = listSize;
        return listSize;
      }
    } catch (_e) {
      // best-effort
    }
    return null;
  }

  async getEmbeddingDimension() {
    if (this.config.embeddingMode === 'off') return null;
    if (this.config.embeddingMode === 'test') return 384;
    if (this.config.embeddingMode === 'fastembed') return this._fastembedModel ? 384 : null;
    if (this._embeddingStatus?.status === 'unavailable') return null;
    if (!this.embedder) return null;
    const vec = await this.generateEmbedding('dimension_check');
    return Array.isArray(vec) ? vec.length : null;
  }

  async listTables() {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) return [];
    return await this.db.tableNames();
  }

  async dropTable() {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) return false;
    const tableNames = await this.db.tableNames();
    if (!tableNames.includes(this.config.collectionName)) return false;

    if (typeof this.db.dropTable === 'function') {
      await this.db.dropTable(this.config.collectionName);
      this.table = null;
      this._tableVectorDim = null;
      return true;
    }

    // FIXED (Issue #1 - CRITICAL): Remove destructive fs.rmSync that deletes entire directory
    // When this is the only table, just mark it as dropped without deleting the DB directory.
    // This allows multi-table usage and prevents catastrophic data loss.
    this.table = null;
    this._tableVectorDim = null;
    logger.info(`Table "${this.config.collectionName}" marked as dropped (metadata cleared)`);
    return true;
  }

  /**
   * Add documents to the store (batch embedding: one forward pass per batch when pipeline supports it).
   * @param {Array<{id: string, text: string, metadata: Object}>} documents
   * @param {number} [embedBatchSize] - Default from config or 64
   * @param {{ onEmbedProgress?: (batchDone: number, totalBatches: number) => void }} [options]
   */
  async addDocuments(documents, embedBatchSize, options) {
    const batchSize = Number.isFinite(embedBatchSize)
      ? embedBatchSize
      : this.config.embedBatchSize || 64;
    if (!documents || documents.length === 0) return;
    if (!this.isInitialized) await this.initialize();

    const toEmbed = documents.filter(d => (d.text || d.content || '').trim());
    if (toEmbed.length === 0) return;

    const texts = toEmbed.map(d => d.text || d.content || '');
    const progressOptions = options?.onEmbedProgress
      ? { onBatchComplete: options.onEmbedProgress }
      : undefined;
    const vectors = await this.generateEmbeddingsBatch(texts, batchSize, progressOptions);

    const tableDim = await this.getTableVectorDimension();
    const data = toEmbed.map((doc, i) => {
      const vector = vectors[i];
      if (Number.isFinite(tableDim) && vector.length !== tableDim) {
        const reason = `embedding dimension mismatch (table ${tableDim} vs vector ${vector.length}). Re-index or rebuild the LanceDB table (pnpm run memory:reindex).`;
        this._embeddingStatus = {
          status: 'unavailable',
          mode: this._embeddingStatus?.mode || this.config.embeddingMode,
          reason,
        };
        throw new Error(reason);
      }
      const text = doc.text || doc.content || '';
      const metadataObj = typeof doc.metadata === 'object' && doc.metadata ? doc.metadata : {};
      return {
        id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        vector,
        text,
        metadata: JSON.stringify(metadataObj),
        timestamp: Date.now(),
      };
    });

    if (!this.table) {
      this.table = await this.db.createTable(this.config.collectionName, data);
      const firstVector = data[0]?.vector;
      if (Array.isArray(firstVector)) {
        this._tableVectorDim = firstVector.length;
      }
    } else {
      await this.table.add(data);
    }
  }

  /**
   * Upsert documents by deleting matching ids then adding.
   *
   * @param {Array<{id: string, text: string, metadata: Object}>} documents
   */
  async upsertDocuments(documents) {
    if (!documents || documents.length === 0) return;
    if (!this.isInitialized) await this.initialize();

    if (this.table) {
      for (const doc of documents) {
        if (!doc?.id) continue;
        const escaped = String(doc.id).replace(/'/g, "''");
        try {
          await this.table.delete(`id = '${escaped}'`);
        } catch {
          // Ignore delete failures (e.g. table doesn't support delete yet)
        }
      }
    }

    await this.addDocuments(documents);
  }

  /**
   * Search for similar documents
   * @param {string} query
   * @param {Object} options
   * @returns {Promise<Array<{id: string, content: string, metadata: Object, similarity: number}>>}
   */
  async search(query, options = {}) {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return []; // No table = no results yet

    const limit = options.limit || 10;
    const minScore =
      typeof options.minScore === 'number'
        ? options.minScore
        : typeof options.threshold === 'number'
          ? options.threshold
          : null;
    const queryVector = await this.generateEmbedding(query);
    const tableDim = await this.getTableVectorDimension();
    if (Number.isFinite(tableDim) && queryVector.length !== tableDim) {
      const reason = `embedding dimension mismatch (table ${tableDim} vs query ${queryVector.length}). Re-index or rebuild the LanceDB table (pnpm run memory:reindex).`;
      this._embeddingStatus = {
        status: 'unavailable',
        mode: this._embeddingStatus?.mode || this.config.embeddingMode,
        reason,
      };
      throw new Error(reason);
    }

    let searchBuilder = this.table.vectorSearch(queryVector).limit(limit);

    // Apply filters if present.
    // LanceDB supports SQL filtering string in .where().
    if (options.filters) {
      if (typeof options.filters === 'string') {
        searchBuilder = searchBuilder.where(options.filters);
      } else if (typeof options.filters === 'object') {
        // Minimal adapter for common Chroma-style filters (metadata stored as JSON string).
        // Example: { type: 'learning' } -> metadata LIKE '%"type":"learning"%'
        const clauses = [];
        for (const [key, value] of Object.entries(options.filters)) {
          // metadata is stored as a JSON string; quote characters are safe inside a single-quoted SQL string.
          // Escape only the SQL string delimiter.
          const k = String(key).replace(/'/g, "''");
          const v = String(value).replace(/'/g, "''");
          clauses.push(`metadata LIKE '%"${k}":"${v}"%'`);
        }
        if (clauses.length > 0) {
          searchBuilder = searchBuilder.where(clauses.join(' AND '));
        }
      }
    }

    const results = await searchBuilder.toArray();

    // detailed results map matching standard MemoryVectorStore interface
    const mapped = results.map(r => {
      let metadata = {};
      try {
        metadata = JSON.parse(r.metadata);
      } catch (_e) {
        metadata = { raw: r.metadata };
      }

      return {
        id: r.id,
        content: r.text,
        metadata: metadata,
        similarity: 1 - (r._distance || 0), // Distance->similarity adapter
      };
    });

    if (minScore === null) return mapped;
    return mapped.filter(r => typeof r.similarity === 'number' && r.similarity >= minScore);
  }

  /**
   * Delete documents by metadata match.
   * Uses a LIKE filter on the JSON-encoded metadata column.
   *
   * @param {string} field
   * @param {string|number|boolean} value
   * @returns {Promise<boolean>}
   */
  async deleteByMetadata(field, value) {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return false;

    const k = String(field).replace(/'/g, "''");
    const v = String(value).replace(/'/g, "''");
    const clause = `metadata LIKE '%"${k}":"${v}"%'`;

    try {
      await this.table.delete(clause);
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check availability (always true if init logic passes)
   */
  async isAvailable() {
    try {
      if (!this.isInitialized) await this.initialize();
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check if running in mock mode
   */
  isMockMode() {
    return this._mockMode;
  }

  getEmbeddingStatus() {
    return { ...this._embeddingStatus };
  }

  async close() {
    if (this._shared) return;
    // Best-effort (LanceDB doesn't require explicit close in typical usage)
    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isInitialized = false;
  }

  isShared() {
    return this._shared;
  }
}

module.exports = { MemoryVectorStore };
