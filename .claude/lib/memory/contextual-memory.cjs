// .claude/lib/memory/contextual-memory.cjs
// ContextualMemory aggregation layer for hybrid memory system (Task #32 - P1-4.1)

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { MemoryVectorStore } = require('./chromadb-client.cjs');
const { EntityQuery } = require('./entity-query.cjs');

/**
 * ContextualMemory - Unified API for hybrid memory system
 *
 * Aggregates three memory sources with smart routing:
 * 1. ChromaDB - Semantic search (vector similarity)
 * 2. SQLite - Entity relationships (graph queries)
 * 3. File system - Raw content (backward compatibility)
 *
 * Smart routing decisions:
 * - search(query) → ChromaDB (semantic search)
 * - findEntities(type) → SQLite (structured queries)
 * - getRelated(id) → SQLite (graph traversal)
 * - readFile(path) → File system (direct read)
 *
 * @class ContextualMemory
 *
 * @example
 * const memory = new ContextualMemory({
 *   memoryDir: '.claude/context/memory',
 *   dbPath: '.claude/data/memory.db',
 *   chromaConfig: {
 *     persistDirectory: '.claude/data/chromadb',
 *     collectionName: 'agent-studio-memory'
 *   }
 * });
 *
 * // Semantic search
 * const results = await memory.search('vector database patterns', { limit: 5 });
 *
 * // Entity queries
 * const concepts = await memory.findEntities('concept', { quality_score: 0.8 });
 *
 * // Graph traversal
 * const related = await memory.getRelated('task-123', { depth: 2 });
 *
 * // File access (backward compatible)
 * const content = await memory.readFile('learnings.md');
 */
class ContextualMemory {
  /**
   * Create ContextualMemory instance
   *
   * @param {Object} config - Configuration options
   * @param {string} config.memoryDir - Directory containing memory files (default: .claude/context/memory)
   * @param {string} config.dbPath - Path to SQLite database (default: .claude/data/memory.db)
   * @param {Object} config.chromaConfig - ChromaDB configuration (optional)
   * @param {string} config.chromaConfig.persistDirectory - ChromaDB persist directory
   * @param {string} config.chromaConfig.collectionName - ChromaDB collection name
   */
  constructor(config = {}) {
    const projectRoot = path.resolve(__dirname, '../../../');

    this.config = {
      memoryDir: config.memoryDir || path.join(projectRoot, '.claude/context/memory'),
      dbPath: config.dbPath || path.join(projectRoot, '.claude/data/memory.db'),
      chromaConfig: config.chromaConfig || {
        persistDirectory: path.join(projectRoot, '.claude/data/chromadb'),
        collectionName: 'agent-studio-memory',
      },
    };

    // Initialize components
    this.vectorStore = null; // Lazy initialization
    this.entityQuery = null; // Lazy initialization
  }

  /**
   * Initialize ChromaDB vector store (lazy)
   *
   * @private
   * @returns {Promise<MemoryVectorStore>}
   */
  async _getVectorStore() {
    if (!this.vectorStore) {
      this.vectorStore = new MemoryVectorStore(this.config.chromaConfig);
      try {
        await this.vectorStore.initialize();
      } catch (error) {
        console.warn('[ContextualMemory] ChromaDB initialization failed:', error.message);
        this.vectorStore = null; // Mark as unavailable
      }
    }
    return this.vectorStore;
  }

  /**
   * Initialize entity query API (lazy)
   *
   * @private
   * @returns {EntityQuery}
   */
  _getEntityQuery() {
    if (!this.entityQuery) {
      // Ensure database directory exists before initializing
      const dbDir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.entityQuery = new EntityQuery(this.config.dbPath);
    }
    return this.entityQuery;
  }

  /**
   * Semantic search across all memory sources
   *
   * Routes to ChromaDB for vector similarity search.
   * Falls back to keyword search if ChromaDB unavailable.
   *
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} [options.limit=5] - Maximum results
   * @param {number} [options.threshold=0.7] - Similarity threshold (0-1)
   * @param {string} [options.tier='all'] - 'all' | 'semantic' | 'entity' | 'file'
   * @returns {Promise<Array>} Ranked results with sources
   *
   * @example
   * const results = await memory.search('authentication patterns', {
   *   limit: 10,
   *   threshold: 0.8
   * });
   * // Returns: [{content, metadata, similarity, source: 'chromadb'}]
   */
  async search(query, options = {}) {
    const { limit = 5, threshold = 0.7 } = options;

    try {
      // Try ChromaDB semantic search
      const vectorStore = await this._getVectorStore();

      if (!vectorStore) {
        throw new Error('ChromaDB unavailable - falling back to keyword search');
      }

      const results = await vectorStore.search(query, {
        limit,
        minScore: threshold,
      });

      // Format results with source metadata
      return results.map(result => ({
        content: result.content,
        metadata: result.metadata,
        similarity: result.similarity,
        source: 'chromadb',
      }));
    } catch {
      // Fallback: lightweight keyword search over key memory artifacts.
      return await this._keywordSearch(query, { limit });
    }
  }

  /**
   * Keyword search fallback for when semantic search is unavailable.
   *
   * This intentionally stays simple and fast (bounded reads and file set),
   * returning results shaped similarly to semantic results.
   *
   * @private
   * @param {string} query
   * @param {object} options
   * @param {number} options.limit
   * @returns {Promise<Array>}
   */
  async _keywordSearch(query, options = {}) {
    const limit = typeof options.limit === 'number' ? options.limit : 5;
    const q = String(query || '')
      .trim()
      .toLowerCase();
    if (!q) return [];

    const candidates = [];

    // Keep file set explicit to avoid scanning large directories.
    const files = [
      'learnings.md',
      'decisions.md',
      'issues.md',
      'active_context.md',
      'gotchas.json',
      'patterns.json',
      'codebase_map.json',
    ];

    // Include some recent sessions and MTM entries (bounded).
    for (const dir of ['sessions', 'mtm']) {
      const absDir = path.join(this.config.memoryDir, dir);
      try {
        if (!fs.existsSync(absDir)) continue;
        const names = fs
          .readdirSync(absDir)
          .filter(n => n.endsWith('.json'))
          .sort()
          .slice(-10);
        for (const n of names) files.push(path.join(dir, n));
      } catch {
        // ignore
      }
    }

    // Read up to the last N bytes to keep the search cheap.
    const MAX_BYTES = 80_000;

    for (const rel of files) {
      const abs = path.join(this.config.memoryDir, rel);
      try {
        if (!fs.existsSync(abs)) continue;
        const stat = fs.statSync(abs);
        const start = stat.size > MAX_BYTES ? stat.size - MAX_BYTES : 0;
        const fd = fs.openSync(abs, 'r');
        try {
          const buf = Buffer.alloc(stat.size - start);
          fs.readSync(fd, buf, 0, buf.length, start);
          const text = buf.toString('utf8');
          const lower = text.toLowerCase();
          const idx = lower.indexOf(q);
          if (idx === -1) continue;

          const snippetStart = Math.max(0, idx - 100);
          const snippetEnd = Math.min(text.length, idx + q.length + 300);
          const snippet = text.slice(snippetStart, snippetEnd).trim();

          candidates.push({
            content: snippet,
            metadata: { path: rel },
            similarity: null,
            source: 'keyword',
          });
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // ignore unreadable file
      }
    }

    return candidates.slice(0, limit);
  }

  /**
   * Find entities by type with optional filters
   *
   * Routes to SQLite for structured entity queries.
   *
   * @param {string} type - Entity type (agent, task, skill, concept, file, pattern, decision, issue)
   * @param {Object} filters - Query filters
   * @param {number} filters.limit - Maximum results
   * @param {number} filters.quality_score - Minimum quality score (0-1)
   * @param {string} filters.source_file - Source file filter
   * @param {string} filters.created_after - ISO 8601 timestamp
   * @returns {Promise<Array>} Array of entities matching criteria
   *
   * @example
   * const concepts = await memory.findEntities('concept', {
   *   quality_score: 0.8,
   *   limit: 10
   * });
   */
  async findEntities(type, filters = {}) {
    const entityQuery = this._getEntityQuery();
    return await entityQuery.findByType(type, filters);
  }

  /**
   * Find related entities with graph traversal
   *
   * Routes to SQLite for relationship queries.
   *
   * @param {string} id - Entity ID
   * @param {Object} options - Query options
   * @param {string} options.relationshipType - Filter by relationship type
   * @param {number} options.depth - Traversal depth (default: 1)
   * @returns {Promise<Array>} Array of {entity, relationship_type, weight}
   *
   * @example
   * const related = await memory.getRelated('task-123', {
   *   relationshipType: 'blocks',
   *   depth: 2
   * });
   */
  async getRelated(id, options = {}) {
    const entityQuery = this._getEntityQuery();
    return await entityQuery.findRelated(id, options);
  }

  /**
   * Read file contents (backward compatibility)
   *
   * Routes to file system for direct file access.
   * Preserves existing file-based memory reads.
   *
   * @param {string} relativePath - File path relative to memoryDir
   * @returns {Promise<string>} File contents
   *
   * @example
   * const content = await memory.readFile('learnings.md');
   */
  async readFile(relativePath) {
    const filePath = path.join(this.config.memoryDir, relativePath);
    return await fsPromises.readFile(filePath, 'utf8');
  }

  /**
   * Close connections (cleanup)
   */
  close() {
    if (this.entityQuery) {
      this.entityQuery.close();
      this.entityQuery = null;
    }
    // ChromaDB doesn't require explicit close
    this.vectorStore = null;
  }
}

module.exports = { ContextualMemory };
