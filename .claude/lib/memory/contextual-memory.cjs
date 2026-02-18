// .claude/lib/memory/contextual-memory.cjs
// ContextualMemory aggregation layer for hybrid memory system (Task #32 - P1-4.1)

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MemoryVectorStore } = require('./lancedb-client.cjs');
const { EntityQuery } = require('./entity-query.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const {
  computeQualityScore,
  isPathInside,
  loadContextSync,
  toSafeInt,
} = require('./contextual-memory-context-loader.cjs');
const {
  checkBinaryAvailable,
  getAstGrepPath,
  getRipgrepPath,
  keywordSearch,
  searchWithRipgrep,
} = require('./contextual-memory-search-fallback.cjs');

const logger = createLogger('contextual-memory');

/**
 * @typedef {Object} ContextualMemoryConfig
 * @property {string} [projectRoot]
 * @property {string} [memoryDir]
 * @property {string} [dbPath]
 * @property {Object} [lancedbConfig]
 * @property {string} lancedbConfig.persistDirectory
 * @property {string} lancedbConfig.collectionName
 */

/**
 * ContextualMemory - Unified API for hybrid memory system
 *
 * Aggregates three memory sources with smart routing:
 * 1. LanceDB - Semantic search (vector similarity) - Replaces ChromaDB
 * 2. SQLite - Entity relationships (graph queries)
 * 3. File system - Raw content (backward compatibility)
 *
 * Smart routing decisions:
 * - search(query) → LanceDB (semantic search)
 * - findEntities(type) → SQLite (structured queries)
 * - getRelated(id) → SQLite (graph traversal)
 * - readFile(path) → File system (direct read)
 */
class ContextualMemory {
  /**
   * Create ContextualMemory instance
   *
   * @param {Object} config - Configuration options
   * @param {string} config.memoryDir - Directory containing memory files (default: .claude/context/memory)
   * @param {string} config.dbPath - Path to SQLite database (default: .claude/context/data/memory.db)
   * @param {Object} config.lancedbConfig - LanceDB configuration (optional)
   * @param {string} config.lancedbConfig.persistDirectory - LanceDB persist directory
   * @param {string} config.lancedbConfig.collectionName - LanceDB table name
   */
  constructor(config = {}) {
    const projectRoot = config.projectRoot || PROJECT_ROOT;

    this.config = {
      projectRoot,
      memoryDir: config.memoryDir || path.join(projectRoot, '.claude/context/memory'),
      dbPath: config.dbPath || path.join(projectRoot, '.claude/context/data/memory.db'),
      lancedbConfig: config.lancedbConfig || {
        persistDirectory: path.join(projectRoot, '.claude/context/data/lancedb'),
        collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
      },
    };

    // Initialize components (undefined = not yet tried; null = tried and unavailable)
    this.vectorStore = null; // Lazy initialization
    this.entityQuery = undefined; // Lazy initialization
    this._mockModeWarned = false;
    this._semanticFallbackWarned = false;
  }

  /**
   * Log LanceDB/embedding event to metrics JSONL for observability in headless environments.
   * @private
   * @param {string} event - Event name (e.g. 'mock_mode_detected')
   * @param {Object} [payload] - Optional extra fields
   */
  _logLancedbEvent(event, payload = {}) {
    try {
      const metricsDir = path.join(this.config.memoryDir, 'metrics');
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }
      const eventsPath = path.join(metricsDir, 'lancedb-events.jsonl');
      const line =
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event,
          ...payload,
        }) + '\n';
      fs.appendFileSync(eventsPath, line);
    } catch (_e) {
      // Best-effort; do not throw
    }
  }

  /**
   * Initialize LanceDB vector store (lazy)
   *
   * @private
   * @returns {Promise<MemoryVectorStore>}
   */
  async _getVectorStore() {
    if (process.env.MEMORY_SEMANTIC_SEARCH === 'off') {
      return null;
    }

    if (!this.vectorStore) {
      this.vectorStore = MemoryVectorStore.getSharedStore(this.config.lancedbConfig);
      try {
        await this.vectorStore.initialize();
        if (this.vectorStore && typeof this.vectorStore.getEmbeddingStatus === 'function') {
          const status = this.vectorStore.getEmbeddingStatus();
          if (status && status.status !== 'ready') {
            if (status.status === 'unavailable' && !this._mockModeWarned) {
              logger.warn(`Semantic search disabled: ${status.reason || status.status}`);
              this._mockModeWarned = true;
            }
            this._logLancedbEvent('semantic_disabled', {
              status: status.status,
              reason: status.reason || null,
              mode: status.mode || null,
            });
            return null;
          }
        }
      } catch (error) {
        logger.warn('LanceDB initialization failed', { error: error.message });
        this.vectorStore = null; // Mark as unavailable
        this._logLancedbEvent('lancedb_init_failed', {
          message: error?.message || String(error),
        });
      }
    }
    return this.vectorStore;
  }

  /**
   * Initialize entity query API (lazy).
   * Ensures entity DB and schema exist before creating EntityQuery (avoids "Required table 'entities' not found").
   *
   * @private
   * @returns {EntityQuery|null}
   */
  _getEntityQuery() {
    if (this.entityQuery !== undefined) {
      return this.entityQuery;
    }
    const dbDir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    try {
      const init = require('../../tools/cli/init-memory-db.cjs');
      const db = init.initializeDatabase(this.config.dbPath);
      if (db && typeof db.close === 'function') {
        db.close();
      }
    } catch (_e) {
      this.entityQuery = null;
      return null;
    }
    try {
      this.entityQuery = new EntityQuery(this.config.dbPath);
    } catch (_e) {
      this.entityQuery = null;
    }
    return this.entityQuery;
  }

  _loadEntitiesFromDb(db, type, limit) {
    const rows = db
      .prepare(
        'SELECT id, name, content, created_at, access_count, last_accessed FROM entities WHERE type = ? ORDER BY quality_score DESC, created_at DESC LIMIT ?'
      )
      .all(type, limit);

    if (rows.length === 0) return [];

    const mapped = rows.map(r => ({
      text: r.name + (r.content ? '\n' + r.content : ''),
      timestamp: r.created_at,
    }));

    try {
      const nowIso = new Date().toISOString();
      const update = db.prepare(
        'UPDATE entities SET access_count = ?, last_accessed = ?, quality_score = ? WHERE id = ?'
      );
      for (const r of rows) {
        const nextCount = toSafeInt(r.access_count, 0) + 1;
        update.run(nextCount, nowIso, computeQualityScore(nextCount), r.id);
      }
    } catch (_e) {
      // best-effort
    }

    return mapped;
  }

  _truncateItems(items, maxChars) {
    let totalChars = 0;
    const result = [];

    for (const item of items) {
      const itemStr = JSON.stringify(item);
      if (totalChars + itemStr.length > maxChars) {
        break;
      }
      totalChars += itemStr.length;
      result.push(item);
    }

    return result;
  }

  /**
   * Load memory context using the unified ContextualMemory read path.
   *
   * @param {Object} options
   * @param {Object} options.maxItems - Limits for each memory section
   * @param {Object} options.maxChars - Character caps for each memory section
   * @returns {Object} Memory context object
   */
  loadContextSync(options = {}) {
    return loadContextSync(this, options);
  }

  async loadContext(options = {}) {
    return this.loadContextSync(options);
  }

  /**
   * Semantic search across all memory sources
   *
   * Routes to LanceDB for vector similarity search.
   * Falls back to keyword search if LanceDB unavailable.
   *
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} [options.limit=5] - Maximum results
   * @param {number} [options.threshold] - Similarity threshold (0-1); default from memory-constants
   * @returns {Promise<Array>} Ranked results with sources
   */
  async search(query, options = {}) {
    const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = require('./memory-constants.cjs');
    const { limit = 5, threshold = SEMANTIC_SEARCH_DEFAULT_THRESHOLD, filters } = options;
    const metadataFilters = {};
    if (options.contextType) {
      metadataFilters.type = options.contextType;
    }
    if (options.category) {
      metadataFilters.category = options.category;
    }
    if (options.area) {
      metadataFilters.area = options.area;
    }
    const hasMetadataFilters = Object.keys(metadataFilters).length > 0;
    let effectiveFilters = filters;
    if (hasMetadataFilters) {
      if (!filters) {
        effectiveFilters = metadataFilters;
      } else if (typeof filters === 'string') {
        const clauses = [];
        for (const [key, value] of Object.entries(metadataFilters)) {
          const k = String(key).replace(/'/g, "''");
          const v = String(value).replace(/'/g, "''");
          clauses.push(`metadata LIKE '%"${k}":"${v}"%'`);
        }
        if (clauses.length > 0) {
          effectiveFilters = `${filters} AND ${clauses.join(' AND ')}`;
        }
      } else if (typeof filters === 'object') {
        effectiveFilters = { ...filters, ...metadataFilters };
      }
    }

    if (process.env.MEMORY_SEMANTIC_SEARCH === 'off') {
      return await this._keywordSearch(query, { limit });
    }

    return await this.hybridMemoryQuery(query, {
      ...options,
      limit,
      threshold,
      filters: effectiveFilters,
    });
  }

  _buildHybridResultId(result) {
    const metadata = result?.metadata && typeof result.metadata === 'object' ? result.metadata : {};
    if (metadata.id) return `id:${metadata.id}`;

    const position =
      metadata.chunkPos ??
      metadata.pos ??
      metadata.position ??
      metadata.line ??
      metadata.lineNumber;
    if (metadata.path && position !== undefined && position !== null) {
      return `pathpos:${metadata.path}:${position}`;
    }

    const payload = `${metadata.path || ''}\n${String(result?.content || '').trim()}`;
    const digest = crypto.createHash('sha256').update(payload).digest('hex');
    return `hash:${digest}`;
  }

  _normalizeHybridResult(raw, source) {
    const metadata = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const similarity =
      typeof raw?.similarity === 'number' && Number.isFinite(raw.similarity)
        ? raw.similarity
        : null;
    const normalized = {
      content: String(raw?.content || ''),
      metadata: { ...metadata },
      similarity,
      source,
    };
    normalized.id = this._buildHybridResultId(normalized);
    return normalized;
  }

  _recordSemanticFallback(error) {
    this._logLancedbEvent('semantic_fallback', {
      message: error?.message || String(error),
    });
    if (!this._semanticFallbackWarned) {
      logger.warn('Semantic search unavailable; falling back to keyword search', {
        error: error?.message || String(error),
      });
      this._semanticFallbackWarned = true;
    }
  }

  _fuseHybridResultsRRF(keywordResults, vectorResults) {
    const map = new Map();
    const rrfK = Number(process.env.MEMORY_HYBRID_RRF_K || 60);
    const keywordWeight = Number(process.env.MEMORY_HYBRID_KEYWORD_WEIGHT || 0.4);
    const vectorWeight = Number(process.env.MEMORY_HYBRID_VECTOR_WEIGHT || 0.6);

    for (let rank = 0; rank < keywordResults.length; rank++) {
      const item = keywordResults[rank];
      const score = keywordWeight / (rrfK + rank + 1);
      const existing = map.get(item.id);
      if (existing) {
        existing.rrf_score += score;
        existing.sourceSet.add('keyword');
      } else {
        map.set(item.id, { ...item, rrf_score: score, sourceSet: new Set(['keyword']) });
      }
    }

    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = vectorWeight / (rrfK + rank + 1);
      const existing = map.get(item.id);
      if (existing) {
        existing.rrf_score += score;
        existing.sourceSet.add('lancedb');
        if (typeof item.similarity === 'number') {
          existing.similarity =
            typeof existing.similarity === 'number'
              ? Math.max(existing.similarity, item.similarity)
              : item.similarity;
        }
      } else {
        map.set(item.id, { ...item, rrf_score: score, sourceSet: new Set(['lancedb']) });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .map(item => {
        const source =
          item.sourceSet.size > 1
            ? 'hybrid'
            : item.sourceSet.has('lancedb')
              ? 'lancedb'
              : 'keyword';
        return {
          content: item.content,
          metadata: item.metadata,
          similarity: item.similarity,
          source,
          rrf_score: item.rrf_score,
        };
      });
  }

  /**
   * Hybrid query (keyword + vector + RRF fusion) with fail-safe branch isolation.
   *
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} [options.limit=5] - Maximum final results
   * @param {number} [options.threshold] - Vector similarity threshold
   * @param {Object|string} [options.filters] - Vector metadata filters
   * @returns {Promise<Array>} Fused results in standard memory search shape
   */
  async hybridMemoryQuery(query, options = {}) {
    const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = require('./memory-constants.cjs');
    const limit = typeof options.limit === 'number' ? options.limit : 5;
    const threshold =
      typeof options.threshold === 'number' ? options.threshold : SEMANTIC_SEARCH_DEFAULT_THRESHOLD;
    const branchLimit = Math.max(limit * 2, 10);
    const vectorBranchLimitMode = process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE;
    const vectorLimit = vectorBranchLimitMode === 'expanded' ? branchLimit : limit;

    if (process.env.MEMORY_SEMANTIC_SEARCH === 'off') {
      return await this._keywordSearch(query, { limit });
    }

    const keywordPromise = this._keywordSearch(query, { limit: branchLimit });
    const vectorPromise = (async () => {
      try {
        const vectorStore = await this._getVectorStore();
        if (!vectorStore) return [];
        const results = await vectorStore.search(query, {
          limit: vectorLimit,
          filters: options.filters,
        });
        return Array.isArray(results) ? results : [];
      } catch (error) {
        this._recordSemanticFallback(error);
        return [];
      }
    })();

    const [keywordSettled, vectorSettled] = await Promise.allSettled([
      keywordPromise,
      vectorPromise,
    ]);

    const keywordRaw =
      keywordSettled.status === 'fulfilled' && Array.isArray(keywordSettled.value)
        ? keywordSettled.value
        : [];
    const vectorRaw =
      vectorSettled.status === 'fulfilled' && Array.isArray(vectorSettled.value)
        ? vectorSettled.value
        : [];

    const keywordNormalized = keywordRaw.map(item => this._normalizeHybridResult(item, 'keyword'));
    const vectorNormalized = vectorRaw
      .filter(item => typeof item?.similarity === 'number' && item.similarity >= threshold)
      .map(item => this._normalizeHybridResult(item, 'lancedb'));

    if (keywordNormalized.length > 0 && vectorNormalized.length > 0) {
      this._logLancedbEvent('hybrid_fusion_used', {
        keyword_count: keywordNormalized.length,
        vector_count: vectorNormalized.length,
      });
    }

    const fused = this._fuseHybridResultsRRF(keywordNormalized, vectorNormalized).filter(
      item => typeof item.content === 'string' && item.content.trim().length > 0
    );
    return fused.slice(0, limit);
  }

  /**
   * Get ripgrep binary path from @vscode/ripgrep npm package.
   * @private
   * @returns {string|null} Path to ripgrep binary or null if unavailable
   */
  _getRipgrepPath() {
    return getRipgrepPath(this);
  }

  /**
   * Get ast-grep binary path from @ast-grep/cli npm package.
   * @private
   * @returns {string|null} Path to ast-grep binary or null if unavailable
   */
  _getAstGrepPath() {
    return getAstGrepPath(this);
  }

  /**
   * Check if a binary is available by running --version.
   * @private
   * @param {string} binPath - Path to binary
   * @returns {Promise<boolean>}
   */
  async _checkBinaryAvailable(binPath) {
    return await checkBinaryAvailable(binPath);
  }

  /**
   * Use ripgrep to search memory files.
   * @private
   * @param {string} query - Search query
   * @param {string[]} files - Relative file paths to search
   * @param {number} limit - Max results
   * @returns {Promise<Array>}
   */
  async _searchWithRipgrep(query, files, limit) {
    return await searchWithRipgrep(this, query, files, limit);
  }

  /**
   * Keyword search fallback for when semantic search is unavailable.
   *
   * Enhanced to use ripgrep and ast-grep when available for faster searches.
   * Falls back to bounded file reads if tools unavailable.
   *
   * @private
   * @param {string} query
   * @param {object} options
   * @param {number} options.limit
   * @returns {Promise<Array>}
   */
  async _keywordSearch(query, options = {}) {
    return await keywordSearch(this, query, options);
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
    if (!entityQuery) return [];
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
    if (!entityQuery) return [];
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
    const filePath = path.resolve(this.config.memoryDir, relativePath);
    if (!isPathInside(this.config.memoryDir, filePath)) {
      throw new Error('Invalid memory path: outside memory directory');
    }
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
    if (this.vectorStore && typeof this.vectorStore.close === 'function') {
      if (typeof this.vectorStore.isShared === 'function' && this.vectorStore.isShared()) {
        this.vectorStore = null;
        return;
      }
      try {
        const result = this.vectorStore.close();
        if (result && typeof result.then === 'function') {
          result.catch(err => {
            logger.debug('Vector store close failed', { error: err?.message || String(err) });
          });
        }
      } catch (_e) {
        // best-effort
      }
    }
    this.vectorStore = null;
  }
}

module.exports = { ContextualMemory };
