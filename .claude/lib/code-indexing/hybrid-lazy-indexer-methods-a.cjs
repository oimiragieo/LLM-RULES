'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { resolveRipgrepBinary } = require('../utils/binary-resolver.cjs');

class HybridLazyIndexerMethodsA {
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
    let fused = this.fuseResults(textResults, semanticResults, limit);

    // 4. Optional structural refinement with ast-grep (only for structural-looking queries)
    if (this.shouldRunAstGrepRefinement(query, textResults, fused)) {
      fused = await this.refineWithAstGrep(query, fused, {
        limit,
        textResults,
      });
    }

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
   * Gate ast-grep refinement to avoid latency regressions on normal text queries.
   */
  shouldRunAstGrepRefinement(query, textResults = [], fusedResults = []) {
    if (!this.config.astGrepRefinementEnabled) return false;
    if (!query || typeof query !== 'string') return false;
    if (query.length < 8) return false;
    if (!this.looksStructuralQuery(query)) return false;

    // If explicit ast: query, allow refinement even without text/fused candidates.
    if (String(query).trim().toLowerCase().startsWith('ast:')) return true;

    // Keep refinement narrow for non-ast-prefixed structural queries.
    if (textResults.length === 0 && fusedResults.length === 0) return false;
    return true;
  }

  looksStructuralQuery(query) {
    const q = String(query || '').trim();
    if (!q) return false;

    // Explicit structural opt-in.
    if (q.toLowerCase().startsWith('ast:')) return true;

    // Ast-grep meta variables are strong signal of structural pattern intent.
    if (/\$\$\$|\$[A-Z_][A-Z0-9_]*/.test(q)) return true;

    return false;
  }

  async isAstGrepAvailable() {
    if (this._astGrepAvailable !== null) return this._astGrepAvailable;
    if (this._astGrepCheckPromise) return this._astGrepCheckPromise;

    this._astGrepCheckPromise = (async () => {
      for (const binPath of this._astGrepBinCandidates) {
        this._astGrep.binPath = binPath;
        try {
          const available = await this._astGrep.isAvailable();
          if (available) {
            this._astGrepAvailable = true;
            return true;
          }
        } catch {
          // try next candidate
        }
      }
      this._astGrepAvailable = false;
      return false;
    })();

    return this._astGrepCheckPromise;
  }

  getAstGrepBinCandidates(preferredBinPath) {
    const candidates = [];
    const push = value => {
      if (!value || typeof value !== 'string') return;
      if (!candidates.includes(value)) candidates.push(value);
    };

    push(preferredBinPath);

    // npm package bin (preferred for deterministic workspace behavior)
    try {
      const astGrepPkgPath = require.resolve('@ast-grep/cli/package.json');
      const cliDir = path.dirname(astGrepPkgPath);
      const binDir = path.join(cliDir, 'node_modules', '.bin');
      if (process.platform === 'win32') {
        push(path.join(this.projectRoot, 'node_modules', '.bin', 'ast-grep.CMD'));
        push(path.join(this.projectRoot, 'node_modules', '.bin', 'ast-grep.cmd'));
        push(path.join(binDir, 'ast-grep.cmd'));
        push(path.join(binDir, 'ast-grep.CMD'));
        push(path.join(binDir, 'ast-grep'));
      } else {
        push(path.join(this.projectRoot, 'node_modules', '.bin', 'ast-grep'));
        push(path.join(binDir, 'ast-grep'));
      }
    } catch {
      // ignore
    }

    // Global fallbacks
    if (process.platform === 'win32') {
      const userProfile = process.env.USERPROFILE;
      if (userProfile) {
        push(path.join(userProfile, 'scoop', 'shims', 'ast-grep.exe'));
        push(path.join(userProfile, 'scoop', 'shims', 'sg.exe'));
      }
    }
    push('ast-grep');
    push('sg');

    return candidates;
  }

  normalizeFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;
    return path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(this.projectRoot, filePath));
  }

  toRelativeIfInsideProject(filePath) {
    const abs = this.normalizeFilePath(filePath);
    if (!abs) return null;
    const rel = path.relative(this.projectRoot, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.replace(/\\/g, '/');
  }

  inferStructuralLanguage(query, candidateFiles = []) {
    const q = String(query || '').toLowerCase();
    if (q.includes('interface ') || q.includes(': ') || q.includes('type ')) return 'typescript';
    if (q.includes('def ') || q.includes('self')) return 'python';
    if (q.includes('fn ') || q.includes('impl ')) return 'rust';
    if (q.includes('func ') || q.includes('package ')) return 'go';

    const counts = new Map();
    for (const file of candidateFiles) {
      const lang = this._astGrep.detectLanguage(file);
      if (!lang) continue;
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    if (counts.size === 0) return 'javascript';

    let bestLang = 'javascript';
    let bestCount = -1;
    for (const [lang, count] of counts.entries()) {
      if (count > bestCount) {
        bestLang = lang;
        bestCount = count;
      }
    }
    return bestLang;
  }

  extractStructuralPattern(query) {
    const q = String(query || '').trim();
    if (q.toLowerCase().startsWith('ast:')) return q.slice(4).trim();
    return q;
  }

  async refineWithAstGrep(query, fusedResults, options = {}) {
    try {
      const available = await this.isAstGrepAvailable();
      if (!available) return fusedResults;

      const pattern = this.extractStructuralPattern(query);
      if (!pattern) return fusedResults;

      const candidateFiles = fusedResults
        .map(r => r.file)
        .filter(Boolean)
        .slice(0, this.config.astGrepMaxCandidateFiles);
      const include = candidateFiles.map(f => this.toRelativeIfInsideProject(f)).filter(Boolean);
      const explicitAstQuery = String(query || '')
        .trim()
        .toLowerCase()
        .startsWith('ast:');
      if (include.length === 0 && !explicitAstQuery) return fusedResults;

      const language = this.inferStructuralLanguage(pattern, candidateFiles);
      const structuralMatches = await this._astGrep.search(pattern, language, {
        ...(include.length > 0 ? { include } : {}),
        maxResults: Math.max((options.limit || 20) * 3, 50),
      });

      if (!Array.isArray(structuralMatches) || structuralMatches.length === 0) {
        return fusedResults;
      }

      const matchedFiles = new Set(
        structuralMatches.map(m => this.normalizeFilePath(m.filePath)).filter(Boolean)
      );
      const boosted = fusedResults.map(result => {
        const normalized = this.normalizeFilePath(result.file);
        const matched = normalized && matchedFiles.has(normalized);
        if (!matched) return result;
        return {
          ...result,
          structuralScore: 1,
          totalScore: (result.totalScore || 0) + this.config.astGrepScoreBoost,
          type: `${result.type}+ast`,
        };
      });

      // If ast-grep finds structural matches not present in fused results,
      // surface them as deterministic structural entries.
      const existingFiles = new Set(
        boosted.map(r => this.normalizeFilePath(r.file)).filter(Boolean)
      );
      const added = [];
      for (const [rank, match] of structuralMatches.entries()) {
        const normalized = this.normalizeFilePath(match.filePath);
        if (!normalized || existingFiles.has(normalized)) continue;
        existingFiles.add(normalized);

        const baseScore = this.config.astGrepScoreBoost * (1 / (1 + rank));
        added.push({
          file: normalized,
          type: 'ast',
          textScore: 0,
          semanticScore: 0,
          structuralScore: 1,
          totalScore: baseScore,
          textMatches: [
            {
              line: match.lineStart || 1,
              text: match.code || '',
            },
          ],
        });
      }

      const combined = [...boosted, ...added];

      return combined
        .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
        .slice(0, options.limit || 20);
    } catch (err) {
      // Structural refinement is optional; fail-open to preserve baseline behavior.
      if (this.config.debug) {
        console.error('[hybrid-search] ast-grep refinement skipped:', err.message);
      }
      return fusedResults;
    }
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
    const projectRootResolved = path.resolve(this.projectRoot);
    const fullPath = path.resolve(
      path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath)
    );
    const rel = path.relative(projectRootResolved, fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return null;
    }

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

    // Resolve ripgrep from npm package, Scoop shims, node_modules/.bin, then PATH.
    this._rgPathPromise = (async () => {
      let vscodeRgPath = null;
      try {
        const { rgPath } = await import('@vscode/ripgrep');
        vscodeRgPath = rgPath;
      } catch {
        // Ignore and continue with resolver fallbacks.
      }
      this._rgPath =
        resolveRipgrepBinary({
          projectRoot: this.projectRoot,
          preferredPath: this._rgPath || process.env.RG_BIN,
          vscodeRgPath,
        }) ||
        vscodeRgPath ||
        'rg';
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
        windowsHide: true,
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
          windowsHide: true,
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
}

module.exports = { HybridLazyIndexerMethodsA };
