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

const { spawnSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Lazy-loaded modules
let LanceDB = null;
let Embedder = null;

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
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Hybrid search - combines ripgrep + embeddings
   * @param {string} query - Natural language or code query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Ranked results
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    const limit = options.limit || 20;

    // 1. Fast ripgrep search (always run)
    const textResults = await this.ripgrepSearch(query, {
      limit: Math.max(limit * 2, 50),
      timeout: this.config.ripgrepTimeoutMs,
    });

    // 2. If embeddings enabled and available, run semantic search
    let semanticResults = [];
    if (this.shouldRunSemanticSearch(query, textResults)) {
      try {
        semanticResults = await this.semanticSearch(query, {
          limit: Math.max(limit * 2, 50),
        });
      } catch (err) {
        // Silently fail - text search still works
        console.error('[hybrid-search] Semantic search failed:', err.message);
      }
    }

    // 3. Fuse results using Reciprocal Rank Fusion
    const fused = this.fuseResults(textResults, semanticResults, limit);

    if (this.config.debug) {
      console.log(
        `[hybrid-search] "${query.slice(0, 30)}..." - ` +
          `${textResults.length} text + ${semanticResults.length} semantic = ${fused.length} fused ` +
          `(${Date.now() - startTime}ms)`
      );
    }

    return fused;
  }

  /**
   * Heuristic gate for semantic search.
   * Skips semantic for symbol-heavy literal queries when text matches already exist.
   */
  shouldRunSemanticSearch(query, textResults = []) {
    if (!this.config.embeddingEnabled) return false;
    if (query.length <= 10) return false;

    // Symbol-heavy queries are usually exact lookups where semantic adds latency.
    const isSymbolHeavy = /[()[\]{}<>:=]/.test(query);
    if (isSymbolHeavy && textResults.length > 0) return false;

    return true;
  }

  /**
   * Instant structural analysis (no persistence)
   * @returns {Promise<Object>} Project structure
   */
  async analyzeStructure() {
    const now = Date.now();

    // Return cached if fresh
    if (this.structureCache && now - this.structureCacheTime < this.config.cacheExpiryMs) {
      return this.structureCache;
    }

    const structure = await Promise.all([
      this.getFileTree(),
      this.getEntryPoints(),
      this.getDependencies(),
    ]);

    this.structureCache = {
      timestamp: now,
      tree: structure[0],
      entryPoints: structure[1],
      dependencies: structure[2],
      diagram: this.generateMermaid(structure),
    };
    this.structureCacheTime = now;

    return this.structureCache;
  }

  /**
   * Incremental index update (post-edit)
   * @param {string} filePath - Changed file
   */
  async incrementalUpdate(filePath) {
    // Queue for background processing
    this.embedQueue.push(filePath);
    this.processEmbedQueue();
  }

  /**
   * Get file content with line numbers
   */
  async getFileContent(filePath, lineStart = 0, lineEnd = 50) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);

    const content = await fs.readFile(fullPath, 'utf8').catch(() => null);
    if (!content) return null;

    const lines = content.split('\n');
    return {
      content: lines.slice(lineStart, lineEnd).join('\n'),
      totalLines: lines.length,
      lineStart,
      lineEnd: Math.min(lineEnd, lines.length),
    };
  }

  // ============================================================================
  // RIPGREP SEARCH (Fast, Text-based)
  // ============================================================================

  async getRgPath() {
    if (this._rgPath) return this._rgPath;
    if (this._rgPathPromise) return this._rgPathPromise;

    // Get ripgrep binary path from @vscode/ripgrep
    this._rgPathPromise = (async () => {
      try {
        const { rgPath } = await import('@vscode/ripgrep');
        this._rgPath = rgPath;
      } catch {
        // Fallback to just 'rg' if package not available
        this._rgPath = 'rg';
      }
      return this._rgPath;
    })();

    return this._rgPathPromise;
  }

  /**
   * Heuristic: determine if query should be treated as regex.
   * Natural-language and symbol lookups are faster/safer as fixed-string (-F).
   * @param {string} query
   * @returns {boolean}
   */
  isRegexQuery(query) {
    if (!query || typeof query !== 'string') return false;
    // Regex metacharacters likely indicate intentional regex usage.
    return /[\\^$.*+?()[\]{}|]/.test(query);
  }

  async ripgrepSearch(query, options = {}) {
    const cacheKey = `rg:${query}:${options.limit}`;
    const cached = this.getCacheEntry(this.ripgrepCache, cacheKey);
    if (cached && Date.now() - cached.time < this.config.cacheExpiryMs) {
      return cached.results;
    }

    // Get ripgrep path
    const rgPath = await this.getRgPath();

    // Build ripgrep command
    // Note: @vscode/ripgrep may not have all type definitions, use -g patterns instead
    const args = [
      '--json', // JSON output
      '--no-config', // Avoid user-level rg config noise/overhead
      '--max-count',
      String(options.maxMatchesPerFile || this.config.maxRipgrepMatchesPerFile),
      '-S', // Smart case (faster than always -i, better precision)
      '-g',
      '*.js',
      '-g',
      '*.ts',
      '-g',
      '*.cjs',
      '-g',
      '*.mjs',
      '-g',
      '!node_modules/**',
      '-g',
      '!.git/**',
      '-g',
      '!dist/**',
      '-g',
      '!build/**',
      '-g',
      '!*.min.js',
      '-g',
      '!*.map',
    ];

    const queryText = query;
    const useRegex = this.isRegexQuery(queryText);
    const matcherArgs = useRegex ? [] : ['-F'];
    const searchArgs = [...matcherArgs, ...args, queryText, this.projectRoot];

    try {
      // SEC-LIB-001 FIX: Use spawnSync with array args to prevent command injection
      let result = spawnSync(rgPath, searchArgs, {
        encoding: 'utf8',
        timeout: options.timeout || this.config.ripgrepTimeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: false, // CRITICAL: Disable shell to prevent injection
      });

      if (result.error) {
        throw result.error;
      }

      // Fallback: treat query as literal when regex parsing fails (e.g., TaskUpdate()
      if (
        result.status === 2 &&
        typeof result.stderr === 'string' &&
        result.stderr.toLowerCase().includes('regex parse error')
      ) {
        result = spawnSync(rgPath, ['-F', ...args, queryText, this.projectRoot], {
          encoding: 'utf8',
          timeout: options.timeout || this.config.ripgrepTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          shell: false,
        });
      }

      const output = result.stdout || '';

      const results = this.parseRipgrepOutput(output, {
        maxFiles: options.limit || this.config.maxRipgrepResults,
      });

      // Cache results
      this.setCacheEntry(
        this.ripgrepCache,
        cacheKey,
        { results, time: Date.now() },
        this.config.maxRipgrepCacheEntries
      );

      return results;
    } catch (err) {
      // ripgrep exits with code 1 when no matches - not an error
      if (err.status === 1) return [];
      // Log actual errors
      console.error('[ripgrep] Error:', err.message);
      return [];
    }
  }

  parseRipgrepOutput(output, options = {}) {
    const lines = output ? output.split('\n') : [];
    const results = [];
    let current = null;
    const maxFiles = options.maxFiles || this.config.maxRipgrepResults;

    for (const line of lines) {
      if (!line) continue;
      try {
        const data = JSON.parse(line);

        if (data.type === 'begin') {
          current = { file: data.data.path.text, matches: [] };
        } else if (data.type === 'match' && current) {
          current.matches.push({
            line: data.data.line_number,
            text: data.data.lines.text,
          });
        } else if (data.type === 'end' && current) {
          results.push({
            file: current.file,
            type: 'text',
            matches: current.matches,
            score: 1.0, // Will be re-ranked
          });
          current = null;
          if (results.length >= maxFiles) break;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return results;
  }

  // ============================================================================
  // SEMANTIC SEARCH (Embeddings)
  // ============================================================================

  async semanticSearch(query, options = {}) {
    if (!this.config.embeddingEnabled) return [];
    const limit = options.limit || 20;
    const cacheKey = `sem:${query}:${limit}`;
    const cached = this.getCacheEntry(this.semanticCache, cacheKey);
    if (cached && Date.now() - cached.time < this.config.semanticCacheExpiryMs) {
      return cached.results;
    }

    // Lazy initialize LanceDB
    await this.initLanceDB();

    if (!this.table) {
      // No semantic index yet - return empty
      return [];
    }

    // Generate query embedding
    const queryVector = await this.getCachedQueryEmbedding(query);

    // Search LanceDB
    const results = await this.table.vectorSearch(queryVector).limit(limit).toArray();

    const normalized = results.map(r => {
      const metadata = this.parseMetadata(r.metadata);
      return {
        file: metadata.filePath || r.filePath || 'unknown',
        type: 'semantic',
        line: metadata.lineStart || r.lineStart || 1,
        text: r.text || r.content,
        score: 1 - (r._distance || 0),
      };
    });
    this.setCacheEntry(
      this.semanticCache,
      cacheKey,
      { results: normalized, time: Date.now() },
      this.config.maxSemanticCacheEntries
    );
    return normalized;
  }

  parseMetadata(metadata) {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch {
        return {};
      }
    }
    if (typeof metadata === 'object') return metadata;
    return {};
  }

  async embed(text) {
    // Lazy load embedder
    if (!Embedder) {
      const { pipeline } = await import('@xenova/transformers');
      Embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    const output = await Embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  async getCachedQueryEmbedding(query) {
    const key = `q:${query}`;
    const cached = this.getCacheEntry(this.embeddingCache, key);
    if (cached && Date.now() - cached.time < this.config.semanticCacheExpiryMs) {
      return cached.vector;
    }
    const vector = await this.embed(query);
    this.setCacheEntry(
      this.embeddingCache,
      key,
      { vector, time: Date.now() },
      this.config.maxEmbeddingCacheEntries
    );
    return vector;
  }

  async initLanceDB() {
    if (this.lanceDBInitialized) return;

    try {
      const lancedb = await import('@lancedb/lancedb');
      LanceDB = lancedb;

      this.db = await LanceDB.connect(this.lanceDbPath);
      const tables = await this.db.tableNames();

      if (tables.includes('code_index')) {
        this.table = await this.db.openTable('code_index');
      }

      this.lanceDBInitialized = true;
    } catch (err) {
      console.error('[hybrid-indexer] LanceDB init failed:', err.message);
      this.lanceDBInitialized = true; // Don't retry
    }
  }

  // ============================================================================
  // HYBRID FUSION (RRF)
  // ============================================================================

  fuseResults(textResults, semanticResults, limit) {
    const scores = new Map();

    // Add text scores (RRF)
    textResults.forEach((result, rank) => {
      const key = result.file;
      const score = this.config.textWeight * (1 / (this.config.rrfK + rank));
      scores.set(key, {
        file: result.file,
        type: 'hybrid',
        textScore: score,
        semanticScore: 0,
        totalScore: (scores.get(key)?.totalScore || 0) + score,
        textMatches: result.matches,
      });
    });

    // Add semantic scores (RRF)
    semanticResults.forEach((result, rank) => {
      const key = result.file;
      const score = this.config.semanticWeight * (1 / (this.config.rrfK + rank));
      const existing = scores.get(key);

      if (existing) {
        existing.semanticScore = score;
        existing.totalScore += score;
      } else {
        scores.set(key, {
          file: result.file,
          type: 'semantic',
          textScore: 0,
          semanticScore: score,
          totalScore: score,
          textMatches: [],
        });
      }
    });

    // Sort by total score and return top N
    return Array.from(scores.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }

  // ============================================================================
  // STRUCTURAL ANALYSIS
  // ============================================================================

  async getFileTree() {
    // Use manual tree on Windows (tree.exe has different syntax)
    if (process.platform === 'win32') {
      return this.manualTree();
    }

    try {
      // SEC-LIB-001 FIX: Use spawnSync with array args to prevent command injection
      const result = spawnSync('tree', ['-d', '-L', '3', '--noreport', this.projectRoot], {
        encoding: 'utf8',
        timeout: 3000,
        shell: false, // CRITICAL: Disable shell to prevent injection
      });

      if (result.error || result.status !== 0) {
        return this.manualTree();
      }

      return result.stdout || '';
    } catch {
      return this.manualTree();
    }
  }

  async manualTree() {
    const dirs = new Set();
    const topDirs = new Set();

    try {
      const rgPath = await this.getRgPath();
      // SEC-LIB-001 FIX: Use spawnSync with array args to prevent command injection
      const result = spawnSync(
        rgPath,
        ['--files', '-g', '!node_modules/**', '-g', '!.git/**', this.projectRoot],
        { encoding: 'utf8', timeout: 5000, shell: false }
      );

      if (result.error) {
        throw result.error;
      }

      const stdout = result.stdout || '';

      stdout.split('\n').forEach(file => {
        if (!file.trim()) return;
        const normalized = file.replace(/\\/g, '/');
        const relative = normalized.replace(this.projectRoot.replace(/\\/g, '/') + '/', '');
        const parts = relative.split('/');

        // Add top-level dirs
        if (parts.length > 0 && parts[0]) {
          topDirs.add(parts[0]);
        }

        // Add nested dirs
        for (let i = 1; i < parts.length && i < 4; i++) {
          const dirPath = parts.slice(0, i).join('/');
          if (dirPath) dirs.add(dirPath);
        }
      });
    } catch (err) {
      console.error('[manualTree] Error:', err.message);
    }

    // Format as tree
    const result = ['.'];
    const sorted = Array.from(dirs).sort();
    sorted.forEach(d => {
      const depth = d.split('/').length;
      const indent = '  '.repeat(depth);
      result.push(`${indent}${d.split('/').pop()}/`);
    });

    return result.join('\n');
  }

  async getEntryPoints() {
    try {
      const rgPath = await this.getRgPath();
      // SEC-LIB-001 FIX: Use spawnSync with array args to prevent command injection
      const result = spawnSync(
        rgPath,
        [
          '^export\\s+(default\\s+)?(class|function|interface|type|const)',
          '-g',
          '*.js',
          '-g',
          '*.ts',
          '-g',
          '*.cjs',
          '-g',
          '*.mjs',
          '-n',
          this.projectRoot,
        ],
        { encoding: 'utf8', timeout: 3000, shell: false }
      );

      if (result.error) {
        throw result.error;
      }

      const output = result.stdout || '';

      return output
        .split('\n')
        .filter(Boolean)
        .slice(0, 50)
        .map(line => {
          const [file, num, ...rest] = line.split(':');
          return { file, line: parseInt(num), code: rest.join(':').trim() };
        });
    } catch (err) {
      // ripgrep exits with code 1 when no matches - not an error
      if (err.status === 1) return [];
      return [];
    }
  }

  async getDependencies() {
    try {
      const rgPath = await this.getRgPath();
      // SEC-LIB-001 FIX: Use spawnSync with array args to prevent command injection
      const result = spawnSync(
        rgPath,
        [
          '^import .* from',
          '-g',
          '*.js',
          '-g',
          '*.ts',
          '-g',
          '*.cjs',
          '-g',
          '*.mjs',
          this.projectRoot,
        ],
        { encoding: 'utf8', timeout: 3000, shell: false }
      );

      if (result.error) {
        throw result.error;
      }

      const output = result.stdout || '';

      const imports = {};
      output.split('\n').forEach(line => {
        const match = line.match(/from ['"]([^'"]+)['"]/);
        if (match) {
          const dep = match[1];
          imports[dep] = (imports[dep] || 0) + 1;
        }
      });

      return Object.entries(imports)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  generateMermaid([_tree, entryPoints, deps]) {
    const lines = ['graph TD'];

    // Add entry points as nodes
    entryPoints.slice(0, 10).forEach((ep, i) => {
      const name = ep.file
        .split('/')
        .pop()
        .replace(/\.[jt]sx?$/, '');
      const nodeId = `ep${i}`;
      lines.push(`  ${nodeId}["${name}"]`);
    });

    // Add simple connections
    if (deps.length > 0) {
      deps.slice(0, 5).forEach(([dep], i) => {
        lines.push(`  ep0 -->|uses| dep${i}["${dep.split('/').pop() || dep}"]`);
      });
    }

    return lines.join('\n');
  }

  // ============================================================================
  // BACKGROUND EMBEDDING QUEUE
  // ============================================================================

  async processEmbedQueue() {
    if (this.isEmbedding || this.embedQueue.length === 0) return;

    this.isEmbedding = true;

    // Process in batches
    while (this.embedQueue.length > 0) {
      const batch = this.embedQueue.splice(0, this.config.embedBatchSize);
      await Promise.all(batch.map(f => this.embedFile(f)));
    }

    this.isEmbedding = false;
  }

  async embedFile(filePath) {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      const content = await fs.readFile(fullPath, 'utf8');

      // Quick chunking
      const chunks = this.chunkFile(content, filePath);

      // Embed chunks
      const embeddings = await Promise.all(chunks.map(c => this.embed(c.content)));

      // Store in LanceDB
      await this.storeEmbeddings(filePath, chunks, embeddings);
    } catch (err) {
      console.error(`[hybrid-indexer] Failed to embed ${filePath}:`, err.message);
    }
  }

  chunkFile(content, filePath) {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = [];
    let chunkStart = 0;

    lines.forEach((line, i) => {
      // Split on function/class definitions
      if (
        /^(export\s+)?(function|class|const|interface)\s+\w+/.test(line) &&
        currentChunk.length > 5
      ) {
        chunks.push({
          content: currentChunk.join('\n'),
          filePath,
          lineStart: chunkStart,
          lineEnd: i - 1,
        });
        currentChunk = [line];
        chunkStart = i;
      } else {
        currentChunk.push(line);
      }
    });

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join('\n'),
        filePath,
        lineStart: chunkStart,
        lineEnd: lines.length,
      });
    }

    return chunks;
  }

  async storeEmbeddings(filePath, chunks, embeddings) {
    if (!this.table) return;

    const data = chunks.map((chunk, i) => ({
      id: `${filePath}:${chunk.lineStart}`,
      vector: embeddings[i],
      text: chunk.content,
      metadata: JSON.stringify({
        filePath: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      }),
    }));

    await this.table.add(data);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  getCacheEntry(cache, key) {
    const value = cache.get(key);
    if (!value) return null;
    // LRU touch: move key to end
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  setCacheEntry(cache, key, value, maxEntries) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  clearCache() {
    this.ripgrepCache.clear();
    this.semanticCache.clear();
    this.embeddingCache.clear();
    this.structureCache = null;
    this.structureCacheTime = 0;
  }

  getStats() {
    return {
      ripgrepCacheSize: this.ripgrepCache.size,
      semanticCacheSize: this.semanticCache.size,
      embeddingCacheSize: this.embeddingCache.size,
      embedQueueLength: this.embedQueue.length,
      structureCached: !!this.structureCache,
      lanceDBConnected: !!this.table,
    };
  }
}

module.exports = { HybridLazyIndexer };
