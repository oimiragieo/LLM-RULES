// .claude/lib/memory/contextual-memory.cjs
// ContextualMemory aggregation layer for hybrid memory system (Task #32 - P1-4.1)

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { MemoryVectorStore } = require('./lancedb-client.cjs');
const { EntityQuery } = require('./entity-query.cjs');

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
    const projectRoot = path.resolve(__dirname, '../../../');

    this.config = {
      memoryDir: config.memoryDir || path.join(projectRoot, '.claude/context/memory'),
      dbPath: config.dbPath || path.join(projectRoot, '.claude/data/memory.db'),
      lancedbConfig: config.lancedbConfig || {
        persistDirectory: path.join(projectRoot, '.claude/data/lancedb'),
        collectionName: 'agent-studio-memory',
      },
    };

    // Initialize components
    this.vectorStore = null; // Lazy initialization
    this.entityQuery = null; // Lazy initialization
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
      this.vectorStore = new MemoryVectorStore(this.config.lancedbConfig);
      try {
        await this.vectorStore.initialize();
      } catch (error) {
        console.warn('[ContextualMemory] LanceDB initialization failed:', error.message);
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
   * Routes to LanceDB for vector similarity search.
   * Falls back to keyword search if LanceDB unavailable.
   *
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} [options.limit=5] - Maximum results
   * @param {number} [options.threshold=0.7] - Similarity threshold (0-1)
   * @returns {Promise<Array>} Ranked results with sources
   */
  async search(query, options = {}) {
    const { limit = 5, threshold = 0.7, filters } = options;

    try {
      // Try LanceDB semantic search
      const vectorStore = await this._getVectorStore();

      if (!vectorStore) {
        throw new Error('LanceDB unavailable - falling back to keyword search');
      }

      if (vectorStore.isMockMode()) {
        // In mock mode, semantic search returns random results.
        // Fallback to keyword search to provide meaningful results.
        return await this._keywordSearch(query, { limit });
      }

      const results = await vectorStore.search(query, {
        limit,
        filters,
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
    } catch {
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
    // Best-effort close (no-op in most embedded configurations)
    this.vectorStore = null;
  }
}

module.exports = { ContextualMemory };
