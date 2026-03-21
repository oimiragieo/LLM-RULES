'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
let LanceDB = null;
let Embedder = null;

class HybridLazyIndexerMethodsB {
  parseRipgrepOutput(output, options = {}) {
    const lines = output ? output.split('\n') : [];
    const results = [];
    let current = null;
    const maxFiles = options.maxFiles || this.config.maxRipgrepResults;

    for (const line of lines) {
      if (!line) continue;
      try {
        const data = safeParseJSON(line);

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
        return safeParseJSON(metadata);
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
        windowsHide: true,
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
        { encoding: 'utf8', timeout: 5000, shell: false, windowsHide: true }
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

      // Search both ESM exports and CJS module.exports
      const patterns = [
        '^export\\s+(default\\s+)?(class|function|interface|type|const)',
        '^module\\.exports\\s*=',
        '^exports\\.',
      ];

      const allResults = [];

      for (const pattern of patterns) {
        const result = spawnSync(
          rgPath,
          [
            pattern,
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
            '-n',
            this.projectRoot,
          ],
          { encoding: 'utf8', timeout: 5000, shell: false, windowsHide: true }
        );

        if (result.error || result.status > 1) continue;
        const output = result.stdout || '';
        allResults.push(...output.split('\n').filter(Boolean));
      }

      return allResults.slice(0, 50).map(line => {
        // Handle Windows paths (C:\path\file.cjs:123:code)
        // Split on :<number>: pattern to avoid breaking on drive letter colon
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          const rel = path.relative(this.projectRoot, match[1]).replace(/\\/g, '/');
          return { file: rel, line: parseInt(match[2]), code: match[3].trim() };
        }
        return { file: line, line: 0, code: '' };
      });
    } catch (_err) {
      return [];
    }
  }

  async getDependencies() {
    try {
      const rgPath = await this.getRgPath();

      // Search both ESM imports and CJS require() calls.
      // Use -F (fixed string) for require( to avoid regex escaping hell.
      const searches = [
        { args: ['from ', '-g', '*.js', '-g', '*.ts', '-g', '*.mjs'] },
        { args: ['-F', 'require(', '-g', '*.js', '-g', '*.cjs', '-g', '*.mjs'] },
      ];

      const imports = {};

      for (const search of searches) {
        const result = spawnSync(
          rgPath,
          [...search.args, '-g', '!node_modules/**', '-g', '!.git/**', this.projectRoot],
          { encoding: 'utf8', timeout: 5000, shell: false, windowsHide: true }
        );

        if (result.error || result.status > 1) continue;
        const output = result.stdout || '';

        output.split('\n').forEach(line => {
          // Match ESM: from 'module' or from "module"
          const esmMatch = line.match(/from ['"]([^'"]+)['"]/);
          if (esmMatch) {
            imports[esmMatch[1]] = (imports[esmMatch[1]] || 0) + 1;
            return;
          }
          // Match CJS: require('module') or require("module")
          const cjsMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
          if (cjsMatch) {
            imports[cjsMatch[1]] = (imports[cjsMatch[1]] || 0) + 1;
          }
        });
      }

      return Object.entries(imports)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  generateMermaid([_tree, entryPoints, deps]) {
    const lines = ['graph TD'];

    // Group entry points by top-level directory
    const dirGroups = {};
    for (const ep of entryPoints.slice(0, 30)) {
      const parts = (ep.file || '').split('/');
      const dir = parts.length > 1 ? parts[0] : '(root)';
      if (!dirGroups[dir]) dirGroups[dir] = [];
      dirGroups[dir].push(ep);
    }

    // Create subgraph per directory
    const dirIds = {};
    Object.entries(dirGroups).forEach(([dir, eps], gi) => {
      const safeDir = dir.replace(/[^a-zA-Z0-9_]/g, '_');
      dirIds[dir] = `dir_${safeDir}`;
      lines.push(`  subgraph ${dirIds[dir]}["${dir} (${eps.length} exports)"]`);
      eps.slice(0, 5).forEach((ep, i) => {
        const name = (ep.file || '')
          .split('/')
          .pop()
          .replace(/\.[jt]sx?$/, '')
          .replace(/\.cjs$/, '');
        const nodeId = `ep_${gi}_${i}`;
        lines.push(`    ${nodeId}["${name}"]`);
      });
      lines.push('  end');
    });

    // Add top dependencies as external nodes
    const topDeps = deps.filter(([dep]) => !dep.startsWith('.') && !dep.startsWith('/'));
    const localDeps = deps.filter(([dep]) => dep.startsWith('.') || dep.startsWith('/'));

    if (topDeps.length > 0) {
      lines.push('  subgraph ext["External Dependencies"]');
      topDeps.slice(0, 8).forEach(([dep, count], i) => {
        const name = dep.split('/').pop() || dep;
        lines.push(`    ext${i}["${name} (${count})"]`);
      });
      lines.push('  end');
    }

    // Add local dependency connections (top 5 most-imported local modules)
    localDeps.slice(0, 5).forEach(([dep, count], i) => {
      const name = dep
        .split('/')
        .pop()
        .replace(/\.[jt]sx?$/, '')
        .replace(/\.cjs$/, '');
      lines.push(`  local${i}(("${name} (${count})")):::local`);
    });

    lines.push('  classDef local fill:#e8f5e9,stroke:#388e3c');

    return lines.join('\n');
  }
}

module.exports = { HybridLazyIndexerMethodsB };
