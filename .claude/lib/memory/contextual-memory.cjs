/* eslint-disable max-lines -- hybrid memory aggregation coordinates search, telemetry, and tier loading in one facade */
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
const { calendarDaysBetween } = require('../utils/calendar-days.cjs');
const {
  incrementLTMAccessCount,
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

    // null = tried and unavailable; undefined = not yet tried
    this.vectorStore = null;
    this.entityQuery = undefined;
    this._mockModeWarned = false;
    this._semanticFallbackWarned = false;
    this._semanticDisabledWarned = false;
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
        'UPDATE entities SET access_count = ?, last_accessed = ? WHERE id = ?'
      );
      for (const r of rows) {
        const nextCount = toSafeInt(r.access_count, 0) + 1;
        update.run(nextCount, nowIso, r.id);
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
   * Check whether the LanceDB index is stale relative to MTM/LTM memory files.
   *
   * Compares the newest mtime of JSON files in the MTM and LTM directories
   * against the mtime of the LanceDB persist directory. Fails-open: any error
   * returns { stale: false }.
   *
   * @returns {{ stale: boolean, newestMemoryMtime: number, indexMtime: number }}
   */
  _checkIndexStaleness() {
    try {
      const mtmDir = path.join(this.config.memoryDir, 'mtm');
      const ltmDir = path.join(this.config.memoryDir, 'ltm');
      const indexDir = this.config.lancedbConfig.persistDirectory;

      if (!fs.existsSync(indexDir)) {
        return { stale: false, newestMemoryMtime: 0, indexMtime: 0 };
      }

      // Use newest file mtime inside index dir (more reliable than dir mtime,
      // which reflects creation time rather than last index update)
      let indexMtime = 0;
      try {
        const indexFiles = fs.readdirSync(indexDir);
        if (indexFiles.length === 0) {
          // Empty index dir — use dir mtime as fallback
          indexMtime = fs.statSync(indexDir).mtimeMs;
        } else {
          for (const f of indexFiles) {
            const fMtime = fs.statSync(path.join(indexDir, f)).mtimeMs;
            if (fMtime > indexMtime) indexMtime = fMtime;
          }
        }
      } catch (_e) {
        indexMtime = fs.statSync(indexDir).mtimeMs;
      }
      let newestMemoryMtime = 0;
      for (const dir of [mtmDir, ltmDir]) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!file.endsWith('.json')) continue;
          const mtime = fs.statSync(path.join(dir, file)).mtimeMs;
          if (mtime > newestMemoryMtime) newestMemoryMtime = mtime;
        }
      }
      return { stale: newestMemoryMtime > indexMtime, newestMemoryMtime, indexMtime };
    } catch (_e) {
      return { stale: false, newestMemoryMtime: 0, indexMtime: 0 };
    }
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
    const stalenessCheck = this._checkIndexStaleness();
    if (stalenessCheck.stale) {
      process.stderr.write(
        `[contextual-memory] WARNING: LanceDB index may be stale — memory files newer than index (newestMemoryMtime=${stalenessCheck.newestMemoryMtime}, indexMtime=${stalenessCheck.indexMtime}). Run re-index to update.\n`
      );
    }
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
      this._recordSemanticDisabled();
      const kwResults = await this._keywordSearch(query, { limit });
      const weighted = this._applyRecencyWeight(kwResults);
      for (const r of weighted) {
        const fp = r?.metadata?.path;
        if (fp) incrementLTMAccessCount(fp);
      }
      return weighted;
    }

    const results = await this.hybridMemoryQuery(query, {
      ...options,
      limit,
      threshold,
      filters: effectiveFilters,
    });
    const weighted = this._applyRecencyWeight(results);
    for (const r of weighted) {
      const fp = r?.metadata?.path;
      if (fp) incrementLTMAccessCount(fp);
    }
    return weighted;
  }

  /**
   * Apply recency weighting to search results.
   * Formula: recency_weight = 1.0 / (1 + days_since_access * DECAY_RATE)
   *          final_score = original_score * (1 + RECENCY_BOOST * recency_weight)
   * Results are re-sorted by adjusted score (descending).
   *
   * @param {Array} results - Search results with rrf_score or similarity fields
   * @returns {Array} Results with recency-adjusted scores, sorted descending
   */
  _applyRecencyWeight(results) {
    if (!Array.isArray(results) || results.length === 0) return results;
    const DECAY_RATE = parseFloat(process.env.MEMORY_RECENCY_DECAY_RATE || '0.1');
    const RECENCY_BOOST = parseFloat(process.env.MEMORY_RECENCY_BOOST || '0.3');
    const now = new Date(Date.now());

    const weighted = results.map(r => {
      const meta = r?.metadata && typeof r.metadata === 'object' ? r.metadata : {};
      const ts = meta.consolidated_at || meta.created_at || meta.timestamp || null;
      let recencyWeight = 1.0;
      if (ts) {
        const daysSince = calendarDaysBetween(ts, now);
        if (Number.isFinite(daysSince)) {
          const clampedDaysSince = Math.max(0, daysSince);
          recencyWeight = 1.0 / (1 + clampedDaysSince * DECAY_RATE);
        }
      }
      const originalScore = r.rrf_score ?? r.similarity ?? 0;
      const importanceScore =
        typeof r.importance === 'number' && Number.isFinite(r.importance)
          ? r.importance
          : typeof meta.importance === 'number' && Number.isFinite(meta.importance)
            ? meta.importance
            : 0.5;
      const combinedScore =
        originalScore * 0.6 + recencyWeight * RECENCY_BOOST * 0.2 + importanceScore * 0.2;
      return {
        ...r,
        rrf_score: combinedScore,
        _recency_weight: recencyWeight,
        _importance_score: importanceScore,
      };
    });

    return weighted.sort((a, b) => (b.rrf_score ?? 0) - (a.rrf_score ?? 0));
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

  _recordSemanticDisabled(reason = 'MEMORY_SEMANTIC_SEARCH=off') {
    this._logLancedbEvent('semantic_disabled', {
      status: 'disabled',
      reason,
      mode: 'keyword',
    });
    if (!this._semanticDisabledWarned) {
      logger.warn('Semantic search disabled; using keyword fallback', { reason });
      this._semanticDisabledWarned = true;
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
      this._recordSemanticDisabled();
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

  _getRipgrepPath() {
    return getRipgrepPath(this);
  }

  _getAstGrepPath() {
    return getAstGrepPath(this);
  }

  async _checkBinaryAvailable(binPath) {
    return checkBinaryAvailable(binPath);
  }

  async _searchWithRipgrep(query, files, limit) {
    return searchWithRipgrep(this, query, files, limit);
  }

  /**
   * Keyword search fallback (ripgrep/ast-grep when available; bounded file reads otherwise).
   * @private @returns {Promise<Array>}
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
   * @example const concepts = await memory.findEntities('concept', { quality_score: 0.8, limit: 10 });
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
   * @example const related = await memory.getRelated('task-123', { relationshipType: 'blocks', depth: 2 });
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
   * @example const content = await memory.readFile('learnings.md');
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

module.exports = { ContextualMemory, incrementLTMAccessCount };
