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
    };

    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isInitialized = false;
    this._mockMode = false;
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

      // 2. Initialize Embedding Model (Local)
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
          } catch (e) {
            console.warn(
              '[LanceDB] Failed to load local embedding model (likely missing dependencies like "sharp"). switching to MOCK mode.'
            );
            console.warn(`[LanceDB] Error details: ${e.message}`);

            // Fallback to Mock Embedder
            this.embedder = this._createMockEmbedder();
            this._mockMode = true;
          }
        } else {
          // Already loaded pipeline, just ensure embedder is ready
          this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
        }
      } else if (this.config.embeddingMode === 'test') {
        // Deterministic, fast embedding for tests (no network/model download)
        this.embedder = null;
      } else if (this.config.embeddingMode === 'off') {
        this.embedder = null;
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
   * Create a mock embedder function that returns random vectors
   * Used when local transformers cannot be loaded
   */
  _createMockEmbedder() {
    return async _text => {
      // Return a mock tensor-like object or just handled in generateEmbedding
      // We'll return a function similar to the pipeline output
      return {
        data: Array.from({ length: 384 }, () => Math.random()), // 384-dim random vector
      };
    };
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

    if (!this.embedder) throw new Error('Embedder not initialized');

    // Check if it's our mock
    if (
      this.embedder.name === '_createMockEmbedder' ||
      (typeof this.embedder === 'function' && this.embedder.toString().includes('Math.random()'))
    ) {
      const output = await this.embedder(text);
      return output.data;
    }

    // Real Transformers pipeline
    // Xenova/transformers returns a Tensor.
    // We need pooling='mean', normalize=true
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });

    // Output is a Tensor, .data is Float32Array
    return Array.from(output.data);
  }

  /**
   * Add documents to the store
   * @param {Array<{id: string, text: string, metadata: Object}>} documents
   */
  async addDocuments(documents) {
    if (!documents || documents.length === 0) return;
    if (!this.isInitialized) await this.initialize();

    const data = [];
    for (const doc of documents) {
      // Text is required for embedding
      const text = doc.text || doc.content || '';
      if (!text) continue;

      const vector = await this.generateEmbedding(text);

      const metadataObj = typeof doc.metadata === 'object' && doc.metadata ? doc.metadata : {};

      data.push({
        id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        vector: vector,
        text: text,
        // LanceDB prefers flat schema or JSON strings for loose metadata
        metadata: JSON.stringify(metadataObj),
        timestamp: Date.now(),
      });
    }

    if (data.length === 0) return;

    if (!this.table) {
      // Create table on first insert.
      // LanceDB infers schema from the first batch of data.
      this.table = await this.db.createTable(this.config.collectionName, data);
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

  async close() {
    // Best-effort (LanceDB doesn't require explicit close in typical usage)
    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isInitialized = false;
  }
}

module.exports = { MemoryVectorStore };
