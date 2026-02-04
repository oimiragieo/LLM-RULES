// .claude/lib/memory/contextual-memory.cjs
// ContextualMemory aggregation layer for hybrid memory system (Task #32 - P1-4.1)

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { MemoryVectorStore } = require('./lancedb-client.cjs');
const { EntityQuery } = require('./entity-query.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');

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

const ACCESS_TRACKING_MIN_INTERVAL_MS = Number(
  process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS || 5 * 60 * 1000
);

function toSafeInt(val, fallback = 0) {
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

function computeQualityScore(accessCount) {
  const count = Number.isFinite(accessCount) ? accessCount : 0;
  const max = 20;
  const ratio = Math.min(Math.log1p(count) / Math.log1p(max), 1);
  return Math.round((0.5 + ratio * 0.5) * 1000) / 1000;
}

function ensureAccessTrackingFields(entry) {
  if (!entry || typeof entry !== 'object') return false;
  let changed = false;

  if (typeof entry.accessCount !== 'number') {
    entry.accessCount = 0;
    changed = true;
  }
  if (typeof entry.lastAccessed === 'undefined') {
    entry.lastAccessed = null;
    changed = true;
  }

  return changed;
}

function maybeTouchEntriesForAccessTracking(allEntries, returnedEntries, nowIso) {
  if (!Array.isArray(allEntries) || allEntries.length === 0) return false;
  if (!Array.isArray(returnedEntries) || returnedEntries.length === 0) {
    let schemaChanged = false;
    for (const entry of allEntries) {
      schemaChanged = ensureAccessTrackingFields(entry) || schemaChanged;
    }
    return schemaChanged;
  }

  const nowMs = Date.parse(nowIso);
  const identifiers = new Set(
    returnedEntries
      .filter(e => e && typeof e === 'object' && typeof e.text === 'string')
      .map(e => `${e.text}\n${e.timestamp || ''}`)
  );

  let changed = false;
  for (const entry of allEntries) {
    changed = ensureAccessTrackingFields(entry) || changed;

    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.text !== 'string') continue;

    const id = `${entry.text}\n${entry.timestamp || ''}`;
    if (!identifiers.has(id)) continue;

    const lastAccessedMs = entry.lastAccessed ? Date.parse(entry.lastAccessed) : 0;
    const minInterval = Number.isFinite(ACCESS_TRACKING_MIN_INTERVAL_MS)
      ? ACCESS_TRACKING_MIN_INTERVAL_MS
      : 0;

    if (!entry.lastAccessed || nowMs - lastAccessedMs >= minInterval) {
      entry.accessCount = toSafeInt(entry.accessCount, 0) + 1;
      entry.lastAccessed = nowIso;
      changed = true;
    }
  }

  return changed;
}

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
   * @param {string} config.dbPath - Path to SQLite database (default: .claude/data/memory.db)
   * @param {Object} config.lancedbConfig - LanceDB configuration (optional)
   * @param {string} config.lancedbConfig.persistDirectory - LanceDB persist directory
   * @param {string} config.lancedbConfig.collectionName - LanceDB table name
   */
  constructor(config = {}) {
    const projectRoot = config.projectRoot || PROJECT_ROOT;

    this.config = {
      projectRoot,
      memoryDir: config.memoryDir || path.join(projectRoot, '.claude/context/memory'),
      dbPath: config.dbPath || path.join(projectRoot, '.claude/data/memory.db'),
      lancedbConfig: config.lancedbConfig || {
        persistDirectory: path.join(projectRoot, '.claude/data/lancedb'),
        collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
      },
    };

    // Initialize components (undefined = not yet tried; null = tried and unavailable)
    this.vectorStore = null; // Lazy initialization
    this.entityQuery = undefined; // Lazy initialization
    this._mockModeWarned = false;
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
    const maxItems = options.maxItems || {};
    const maxChars = options.maxChars || {};
    const result = {
      gotchas: [],
      patterns: [],
      decisions: [],
      discoveries: [],
      recent_sessions: [],
      legacy_summary: '',
    };

    const memoryDir = this.config.memoryDir;
    const dbPath = this.config.dbPath;
    let dbPatternsLoaded = false;
    let dbGotchasLoaded = false;

    if (dbPath && fs.existsSync(dbPath)) {
      try {
        const db = new DatabaseSync(dbPath);
        const patterns = this._loadEntitiesFromDb(db, 'pattern', maxItems.patterns);
        if (patterns.length > 0) {
          result.patterns = patterns;
          dbPatternsLoaded = true;
        }

        const issues = this._loadEntitiesFromDb(db, 'issue', maxItems.gotchas);
        if (issues.length > 0) {
          result.gotchas = issues;
          dbGotchasLoaded = true;
        }

        const decisions = this._loadEntitiesFromDb(db, 'decision', maxItems.decisions);
        if (decisions.length > 0) {
          result.decisions = decisions;
        }

        db.close();
      } catch (e) {
        logger.debug('DB load failed', { error: e.message });
      }
    }

    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    if (!dbGotchasLoaded && fs.existsSync(gotchasFile)) {
      try {
        const allGotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
        const selectedGotchas = allGotchas.slice(-maxItems.gotchas);
        result.gotchas = this._truncateItems(selectedGotchas, maxChars.gotchas);

        const now = new Date().toISOString();
        const changed = maybeTouchEntriesForAccessTracking(allGotchas, result.gotchas, now);
        if (changed) {
          fs.writeFileSync(gotchasFile, JSON.stringify(allGotchas, null, 2));
        }
      } catch (e) {
        logger.debug('Gotchas load failed', { error: e.message });
      }
    }

    const patternsFile = path.join(memoryDir, 'patterns.json');
    if (!dbPatternsLoaded && fs.existsSync(patternsFile)) {
      try {
        const allPatterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
        const selectedPatterns = allPatterns.slice(-maxItems.patterns);
        result.patterns = this._truncateItems(selectedPatterns, maxChars.patterns);

        const now = new Date().toISOString();
        const changed = maybeTouchEntriesForAccessTracking(allPatterns, result.patterns, now);
        if (changed) {
          fs.writeFileSync(patternsFile, JSON.stringify(allPatterns, null, 2));
        }
      } catch (e) {
        logger.debug('Patterns load failed', { error: e.message });
      }
    }

    const mapFile = path.join(memoryDir, 'codebase_map.json');
    if (fs.existsSync(mapFile)) {
      try {
        const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
        const discoveries = Object.entries(map.discovered_files || {})
          .slice(-maxItems.discoveries)
          .map(([filePath, info]) => ({ path: filePath, ...info }));
        result.discoveries = this._truncateItems(discoveries, maxChars.discoveries);
      } catch (e) {
        logger.debug('Discoveries load failed', { error: e.message });
      }
    }

    try {
      const memoryTiers = require('./memory-tiers.cjs');
      const projectRoot = this.config.projectRoot || PROJECT_ROOT;
      const mtmSessions = memoryTiers.getMTMSessions(projectRoot);
      if (mtmSessions && mtmSessions.length > 0) {
        const sorted = mtmSessions
          .sort(
            (a, b) =>
              new Date(a.timestamp || a.consolidated_at || 0) -
              new Date(b.timestamp || b.consolidated_at || 0)
          )
          .slice(-maxItems.sessions);

        const sessionNumberBase = mtmSessions.length - sorted.length;
        for (let i = 0; i < sorted.length; i++) {
          const session = sorted[i];
          result.recent_sessions.push({
            session_number: sessionNumberBase + i + 1,
            timestamp: session.timestamp || session.consolidated_at,
            summary: session.summary || '',
            tasks_completed: (session.tasks_completed || []).slice(0, 5),
            source: 'mtm',
          });
        }

        const ltmDir = memoryTiers.getTierPath('LTM', projectRoot);
        if (fs.existsSync(ltmDir)) {
          try {
            const ltmFiles = fs
              .readdirSync(ltmDir)
              .filter(f => f.endsWith('.json') && f.startsWith('summary_'))
              .sort()
              .slice(-2);
            for (const file of ltmFiles) {
              try {
                const summary = JSON.parse(fs.readFileSync(path.join(ltmDir, file), 'utf8'));
                if (summary.type === 'session_summary') {
                  result.recent_sessions.unshift({
                    session_number: 0,
                    timestamp: summary.created_at,
                    summary: `[LTM Summary] ${summary.session_count} sessions from ${summary.date_range?.start || 'unknown'} to ${summary.date_range?.end || 'unknown'}`,
                    tasks_completed: [],
                    source: 'ltm',
                    key_learnings: (summary.key_learnings || []).slice(0, 3),
                  });
                }
              } catch (_e) {
                // ignore malformed LTM
              }
            }
          } catch (_e) {
            // ignore LTM read errors
          }
        }
      }
    } catch (e) {
      logger.debug('loadContextSync (mtm) error', { error: e.message });
    }

    const legacyPath = path.join(memoryDir, 'learnings.md');
    if (fs.existsSync(legacyPath)) {
      try {
        const legacyContent = fs.readFileSync(legacyPath, 'utf8');
        const limit = maxChars.legacy;
        result.legacy_summary =
          typeof limit === 'number' && legacyContent.length > limit
            ? '...' + legacyContent.slice(-limit)
            : legacyContent;
      } catch (_e) {
        // ignore legacy read errors
      }
    }

    return result;
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

    try {
      // Try LanceDB semantic search
      const vectorStore = await this._getVectorStore();

      if (!vectorStore) {
        throw new Error('LanceDB unavailable - falling back to keyword search');
      }

      const results = await vectorStore.search(query, {
        limit,
        filters: effectiveFilters,
      });

      // Filter by threshold logic if needed (LanceDB returns similarity 0-1 from our client wrapper)
      const validResults = results.filter(r => r.similarity >= threshold);

      // Format results with source metadata
      return validResults.map(result => ({
        content: result.content,
        metadata: result.metadata,
        similarity: result.similarity,
        source: 'lancedb',
      }));
    } catch (error) {
      this._logLancedbEvent('semantic_fallback', {
        message: error?.message || String(error),
      });
      // Fallback: lightweight keyword search over key memory artifacts.
      return await this._keywordSearch(query, { limit });
    }
  }

  /**
   * Get ripgrep binary path from @vscode/ripgrep npm package.
   * @private
   * @returns {string|null} Path to ripgrep binary or null if unavailable
   */
  _getRipgrepPath() {
    try {
      const { rgPath } = require('@vscode/ripgrep');
      return rgPath;
    } catch {
      // Fallback to bundled binary if npm package not available
      const bundledPath = path.join(
        process.cwd(),
        'bin',
        process.platform === 'win32' ? 'rg.exe' : 'rg'
      );
      if (fs.existsSync(bundledPath)) {
        return bundledPath;
      }
      return null;
    }
  }

  /**
   * Get ast-grep binary path from @ast-grep/cli npm package.
   * @private
   * @returns {string|null} Path to ast-grep binary or null if unavailable
   */
  _getAstGrepPath() {
    try {
      const astGrepPkgPath = require.resolve('@ast-grep/cli');
      const binDir = path.join(path.dirname(astGrepPkgPath), '../.bin');
      const binName = process.platform === 'win32' ? 'ast-grep.cmd' : 'ast-grep';
      const binPath = path.join(binDir, binName);
      if (fs.existsSync(binPath)) {
        return binPath;
      }
      // Try without .cmd extension on Windows
      if (process.platform === 'win32') {
        const altPath = path.join(binDir, 'ast-grep');
        if (fs.existsSync(altPath)) {
          return altPath;
        }
      }
    } catch {
      // Package not installed, try global or bundled
    }
    // Fallback to global installation check
    return 'ast-grep';
  }

  /**
   * Check if a binary is available by running --version.
   * @private
   * @param {string} binPath - Path to binary
   * @returns {Promise<boolean>}
   */
  async _checkBinaryAvailable(binPath) {
    return new Promise(resolve => {
      const proc = spawn(binPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.on('error', () => resolve(false));
      proc.on('close', code => resolve(code === 0));
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
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
    const rgPath = this._getRipgrepPath();
    if (!rgPath) return [];

    const available = await this._checkBinaryAvailable(rgPath);
    if (!available) return [];

    const memoryDir = this.config.memoryDir;
    const candidates = [];

    // Build ripgrep command: search query in specific files
    const args = [
      '-i', // case-insensitive
      '-n', // line numbers
      '-C',
      '2', // context lines
      '--', // end of options
      query,
    ];

    // Add file paths (absolute)
    for (const rel of files) {
      const abs = path.join(memoryDir, rel);
      if (fs.existsSync(abs)) {
        args.push(abs);
      }
    }

    if (args.length === 5) return []; // No files to search

    return new Promise(resolve => {
      const proc = spawn(rgPath, args, {
        cwd: memoryDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.on('close', code => {
        // ripgrep returns 1 when no matches found (not an error)
        if (code !== 0 && code !== 1) {
          resolve([]);
          return;
        }

        // Parse ripgrep output: "file:line:context"
        const lines = stdout.split('\n').filter(l => l.trim());
        for (const line of lines.slice(0, limit * 3)) {
          // Format: "path/to/file:123:  context line"
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match) {
            const [, filePath, , content] = match;
            const rel = path.relative(memoryDir, filePath).replace(/\\/g, '/');
            candidates.push({
              content: content.trim(),
              metadata: { path: rel },
              similarity: null,
              source: 'ripgrep',
            });
          }
        }

        resolve(candidates.slice(0, limit));
      });

      proc.on('error', () => resolve([]));
    });
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
    const limit = typeof options.limit === 'number' ? options.limit : 5;
    const q = String(query || '')
      .trim()
      .toLowerCase();
    if (!q) return [];

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
    for (const dir of ['mtm']) {
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

    // Try ripgrep first (fastest for text search)
    const ripgrepResults = await this._searchWithRipgrep(q, files, limit);
    if (ripgrepResults.length > 0) {
      return ripgrepResults;
    }

    // Fallback to file-read approach (original implementation)
    const candidates = [];
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
    if (this.vectorStore && typeof this.vectorStore.close === 'function') {
      if (typeof this.vectorStore.isShared === 'function' && this.vectorStore.isShared()) {
        this.vectorStore = null;
        return;
      }
      try {
        const result = this.vectorStore.close();
        if (result && typeof result.then === 'function') {
          result.catch(() => {});
        }
      } catch (_e) {
        // best-effort
      }
    }
    this.vectorStore = null;
  }
}

module.exports = { ContextualMemory };
