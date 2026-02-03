/**
 * Index Manager - Orchestrates the entire code indexing pipeline
 *
 * @module code-indexing/index-manager
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 * @see {@link .claude/context/artifacts/PHASE_1_IMPLEMENTATION_PLAN.md#task-41}
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { CodeParser } = require('./code-parser.cjs');
const { SemanticChunker } = require('./semantic-chunker.cjs');
const { VectorStore } = require('./vector-store.cjs');
const { MerkleTree } = require('./merkle-tree.cjs');

// Default configuration
const DEFAULT_OPTIONS = {
  projectRoot: process.cwd(),
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.claude/context/code-index/**', // Don't index the index itself
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/*.map',
  ],
  maxFileSize: 1 * 1024 * 1024, // 1MB
  batchSize: 50,
  verbose: false,
};

/**
 * IndexManager orchestrates the full code indexing pipeline:
 * Files → Parser → Chunker → Embedder → Vector DB
 *
 * Features:
 * - Discovers source files (respects .gitignore)
 * - Parses to AST (tree-sitter)
 * - Chunks semantically (functions, classes, methods)
 * - Generates embeddings (all-MiniLM-L6-v2)
 * - Stores in vector DB
 * - Tracks metadata for incremental updates
 */
class IndexManager {
  /**
   * Create index manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Initialize components (lazy - only when indexing)
    this.parser = null;
    this.chunker = null;
    this.vectorStore = null;
  }

  /**
   * Initialize components (lazy initialization)
   * @private
   */
  async _initializeComponents() {
    if (!this.parser) this.parser = new CodeParser();
    if (!this.chunker) {
      const minTokens = parseInt(process.env.CODE_INDEX_MIN_TOKENS || '5', 10);
      this.chunker = new SemanticChunker({ minTokens });
    }
    if (!this.vectorStore) {
      this.vectorStore = new VectorStore({
        projectRoot: this.options.projectRoot,
      });
    }
  }

  /**
   * Discover source files in directory (41.2)
   * @param {string} dir - Directory to scan
   * @returns {Promise<string[]>} List of source files
   * @private
   */
  async _discoverFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.options.projectRoot, fullPath);

      // Check exclude patterns
      const excluded = this.options.excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(relativePath);
      });
      if (excluded) continue;

      if (entry.isDirectory()) {
        files.push(...(await this._discoverFiles(fullPath)));
      } else if (entry.isFile()) {
        const language = this.parser.detectLanguage(fullPath);
        if (language) {
          // Check file size
          const stats = await fs.stat(fullPath);
          if (stats.size <= this.options.maxFileSize) {
            files.push(fullPath);
          }
        }
      }
    }

    return files;
  }

  /**
   * Index a directory (discover → parse → chunk → embed → store)
   * @param {string} projectPath - Path to project root
   * @param {Object} options - Indexing options
   * @param {Function} options.onProgress - Progress callback (phase, current, total)
   * @returns {Promise<Object>} Indexing results
   */
  async indexDirectory(projectPath, options = {}) {
    const startTime = Date.now();
    await this._initializeComponents();

    this.options.projectRoot = projectPath;
    const { onProgress } = options;

    // 41.2: Discover files
    const files = await this._discoverFiles(projectPath);
    if (this.options.verbose) {
      console.log(`Discovered ${files.length} source files`);
    }

    // Report scan complete
    if (onProgress) onProgress('scan', files.length, files.length);

    let totalChunks = 0;
    let totalEmbeddings = 0;
    const fileHashes = {};
    let fileIndex = 0;

    // Process files in batches
    for (let i = 0; i < files.length; i += this.options.batchSize) {
      const batch = files.slice(i, Math.min(i + this.options.batchSize, files.length));

      for (const filePath of batch) {
        fileIndex++;
        try {
          // 41.3: Parse file
          const content = await fs.readFile(filePath, 'utf-8');
          const language = this.parser.detectLanguage(filePath);

          let parseResult = this.parser.parse(content, language);

          if (!parseResult) {
            parseResult = buildMockParseResult(content, language);
          }

          // Report parse progress
          if (onProgress) onProgress('parse', fileIndex, files.length);

          // 41.4: Chunk file
          const chunks = this.chunker.chunk(parseResult, filePath);
          totalChunks += chunks.length;

          if (chunks.length === 0) continue;

          // Report chunk progress
          if (onProgress) onProgress('chunk', fileIndex, files.length);

          // 41.5: Store in vector DB (LanceDB embeds internally)
          await this.vectorStore.addChunks(chunks);
          totalEmbeddings += chunks.length;

          // Report index progress
          if (onProgress) onProgress('index', fileIndex, files.length);

          // Track file hash
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          fileHashes[filePath] = { hash, chunks: chunks.length };

          // 41.7: Progress tracking
          if (this.options.verbose && (i + batch.indexOf(filePath) + 1) % 10 === 0) {
            console.log(`Processed ${i + batch.indexOf(filePath) + 1}/${files.length} files`);
          }
        } catch (error) {
          console.error(`Error indexing ${filePath}:`, error.message);
        }
      }
    }

    // 41.8: Save metadata
    const byLanguage = {};
    for (const filePath of files) {
      const lang = this.parser.detectLanguage(filePath);
      if (lang) {
        byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      }
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      stats: {
        files: files.length,
        chunks: totalChunks,
        embeddings: totalEmbeddings,
        byLanguage,
      },
      files: fileHashes,
    };

    // Save metadata (use projectRoot for path)
    const metadataPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/metadata.json'
    );
    const metadataDir = path.dirname(metadataPath);
    await fs.mkdir(metadataDir, { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Build and save Merkle tree for future incremental updates
    const merklePath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/merkle-tree.json'
    );
    const merkleTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
    await merkleTree.build();
    await merkleTree.save(merklePath);

    return {
      filesIndexed: files.length,
      chunksCreated: totalChunks,
      embeddingsGenerated: totalEmbeddings,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Perform incremental update using Merkle tree change detection
   * Only re-indexes files that have changed since last index
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update results
   */
  async incrementalUpdate(options = {}) {
    const startTime = Date.now();
    await this._initializeComponents();

    const merklePath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/merkle-tree.json'
    );

    // Load old Merkle tree
    const oldTree = await MerkleTree.load(merklePath);

    if (!oldTree) {
      // No previous tree - do full index
      const result = await this.indexDirectory(this.options.projectRoot, options);
      // Save new tree
      const newTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
      await newTree.build();
      await newTree.save(merklePath);
      return {
        ...result,
        updateType: 'full',
        filesChanged: result.filesIndexed,
      };
    }

    // Build new Merkle tree
    const newTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
    await newTree.build();

    // Compare trees to find changes
    const diff = MerkleTree.diff(oldTree, newTree.root, '');

    if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) {
      // No changes
      return {
        updateType: 'incremental',
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        chunksAdded: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        timeMs: Date.now() - startTime,
      };
    }

    // Process changed files
    const filesToIndex = [...diff.added, ...diff.modified];
    const filesToDelete = diff.deleted;

    let chunksAdded = 0;
    let chunksUpdated = 0;
    let chunksDeleted = 0;

    // Delete removed files from index
    for (const filePath of filesToDelete) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.options.projectRoot, filePath);
      await this.vectorStore.deleteFile(fullPath);
      chunksDeleted++;
    }

    // Re-index changed/added files
    for (const filePath of filesToIndex) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.options.projectRoot, filePath);

      try {
        // Check if file exists and is readable
        await fs.access(fullPath);
        const stats = await fs.stat(fullPath);
        if (stats.size > this.options.maxFileSize) continue;

        // Parse, chunk, embed, and store
        const content = await fs.readFile(fullPath, 'utf8');
        const language = this.parser.detectLanguage(fullPath);
        if (!language) continue;

        const parseResult = this.parser.parse(content, language);
        const chunks = this.chunker.chunk(parseResult, fullPath);
        if (chunks.length === 0) continue;

        // Delete old chunks for this file first
        await this.vectorStore.deleteFile(fullPath);
        chunksDeleted += chunks.length;

        // Add new chunks
        await this.vectorStore.addChunks(chunks);

        if (diff.added.includes(filePath)) {
          chunksAdded += chunks.length;
        } else {
          chunksUpdated += chunks.length;
        }
      } catch (_error) {
        // File might not exist or be unreadable - skip
        continue;
      }
    }

    // Save new Merkle tree
    await newTree.save(merklePath);

    // Update metadata
    const metadataPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/metadata.json'
    );
    let metadata = {};
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (_err) {
      // Metadata doesn't exist - create new
    }

    metadata.lastIncrementalUpdate = new Date().toISOString();
    metadata.incrementalStats = {
      filesAdded: diff.added.length,
      filesModified: diff.modified.length,
      filesDeleted: diff.deleted.length,
      chunksAdded,
      chunksUpdated,
      chunksDeleted,
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return {
      updateType: 'incremental',
      filesAdded: diff.added.length,
      filesModified: diff.modified.length,
      filesDeleted: diff.deleted.length,
      chunksAdded,
      chunksUpdated,
      chunksDeleted,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Search for code using semantic similarity
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 10)
   * @param {number} options.minScore - Minimum similarity (default: 0.5)
   * @param {Object} options.filters - Metadata filters
   * @returns {Promise<Array>} Search results
   */
  async semanticSearch(query, options = {}) {
    await this._initializeComponents();

    const limit = options.limit || 10;
    const minScore = options.minScore || 0.5;
    let searchResults = [];
    try {
      searchResults = await this.vectorStore.search(query, {
        limit,
        minScore,
        filters: options.filters || {},
      });
    } catch (error) {
      if (process.env.CODE_INDEX_DEBUG) {
        console.warn('[code-indexing] Semantic search unavailable:', error.message);
      }
      return [];
    }

    const results = [];
    for (const result of searchResults) {
      const metadata = result.metadata || {};

      let code = null;
      try {
        const content = await fs.readFile(metadata.filePath, 'utf-8');
        const lines = content.split('\n');
        code = lines.slice(metadata.lineStart - 1, metadata.lineEnd).join('\n');
      } catch (_error) {
        code = null;
      }

      results.push({
        id: result.id,
        code,
        filePath: metadata.filePath,
        language: metadata.language,
        type: metadata.type,
        lineRange: [metadata.lineStart, metadata.lineEnd],
        similarity: result.similarity,
        metadata,
      });
    }

    return results;
  }
}

function buildMockParseResult(content, language) {
  const lines = content.split('\n');
  const mockNodes = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const funcMatch = line.match(/function\s+(\w+)\s*\(/);
    const constFuncMatch = line.match(/const\s+(\w+)\s*=\s*function/);
    const arrowMatch = line.match(/const\s+(\w+)\s*=\s*\(/);

    if (funcMatch || constFuncMatch || arrowMatch) {
      const name = funcMatch?.[1] || constFuncMatch?.[1] || arrowMatch?.[1];
      let braceCount = 0;
      let foundOpen = false;
      let endLine = i;

      for (let j = i; j < lines.length; j++) {
        const chars = lines[j];
        for (const char of chars) {
          if (char === '{') {
            braceCount++;
            foundOpen = true;
          }
          if (char === '}') braceCount--;
          if (foundOpen && braceCount === 0) {
            endLine = j;
            break;
          }
        }
        if (foundOpen && braceCount === 0) break;
      }

      const functionContent = lines.slice(i, endLine + 1).join('\n');
      if (functionContent.trim().length > 0) {
        mockNodes.push({
          type: 'function_declaration',
          text: functionContent,
          startPosition: { row: i },
          endPosition: { row: endLine },
          children: [{ type: 'identifier', text: name || 'anonymous' }],
        });
      }
      i = endLine + 1;
    } else if (line.match(/class\s+(\w+)/)) {
      const className = line.match(/class\s+(\w+)/)?.[1];
      let braceCount = 0;
      let foundOpen = false;
      let endLine = i;

      for (let j = i; j < lines.length; j++) {
        const chars = lines[j];
        for (const char of chars) {
          if (char === '{') {
            braceCount++;
            foundOpen = true;
          }
          if (char === '}') braceCount--;
          if (foundOpen && braceCount === 0) {
            endLine = j;
            break;
          }
        }
        if (foundOpen && braceCount === 0) break;
      }

      const classContent = lines.slice(i, endLine + 1).join('\n');
      if (classContent.trim().length > 0) {
        mockNodes.push({
          type: 'class_declaration',
          text: classContent,
          startPosition: { row: i },
          endPosition: { row: endLine },
          children: [{ type: 'identifier', text: className || 'Unknown' }],
        });
      }
      i = endLine + 1;
    } else {
      i++;
    }
  }

  return {
    content,
    language,
    rootNode: { children: mockNodes },
  };
}

module.exports = { IndexManager };
