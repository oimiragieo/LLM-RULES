/**
 * Index Manager - FIXED VERSION with Memory Safety
 *
 * @module code-indexing/index-manager-fixed
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 * @critical-fix Memory-safe worker pool, backpressure, checkpointing
 */

'use strict';

const { CodeParser } = require('./code-parser.cjs');
const { SemanticChunker } = require('./semantic-chunker.cjs');
const { VectorStore } = require('./vector-store.cjs');
const { DEFAULT_OPTIONS, calculateSafeMemoryConfig } = require('./index-manager-config.cjs');
const {
  clearCheckpoint,
  collectMerkleFilePaths,
  discoverFiles,
  loadCheckpoint,
  saveCheckpoint,
} = require('./index-manager-files.cjs');
const {
  incrementalUpdateImpl,
  indexDirectoryImpl,
  semanticSearchImpl,
} = require('./index-manager-operations.cjs');

const memoryConfig = calculateSafeMemoryConfig();

class IndexManager {
  constructor(options = {}) {
    const mergedExclude = options.excludePatterns
      ? [...new Set([...DEFAULT_OPTIONS.excludePatterns, ...options.excludePatterns])]
      : DEFAULT_OPTIONS.excludePatterns;
    this.options = { ...DEFAULT_OPTIONS, ...options, excludePatterns: mergedExclude };

    const safeConfig = calculateSafeMemoryConfig();
    if (this.options.concurrency > safeConfig.concurrency) {
      console.log(
        `[INDEX] Config concurrency ${this.options.concurrency} capped to memory-safe ${safeConfig.concurrency}`
      );
      this.options.concurrency = safeConfig.concurrency;
    }
    if (this.options.batchSize > DEFAULT_OPTIONS.batchSize) {
      console.log(
        `[INDEX] Config batchSize ${this.options.batchSize} capped to memory-safe ${DEFAULT_OPTIONS.batchSize}`
      );
      this.options.batchSize = DEFAULT_OPTIONS.batchSize;
    }

    this.parser = null;
    this.chunker = null;
    this.vectorStore = null;
    this.memoryConfig = memoryConfig;
  }

  async _initializeComponents() {
    if (!this.parser) this.parser = new CodeParser();
    if (!this.chunker) {
      const minTokens = parseInt(process.env.CODE_INDEX_MIN_TOKENS || '5', 10);
      this.chunker = new SemanticChunker({ minTokens });
    }
    if (!this.vectorStore) {
      this.vectorStore = new VectorStore({
        projectRoot: this.options.projectRoot,
        sharedStore: false,
        bm25: this.options.bm25 || {
          k1: 1.5,
          b: 0.75,
          k_sparse: 50,
          k_dense: 10,
          rrf_k: 60,
          weights: { sparse: 0.4, dense: 0.6 },
        },
      });
    }
  }

  async _discoverFiles(dir) {
    return discoverFiles(this, dir);
  }

  _collectMerkleFilePaths(node, basePath = '') {
    return collectMerkleFilePaths(node, basePath);
  }

  async _loadCheckpoint() {
    return loadCheckpoint(this.options);
  }

  async _saveCheckpoint(filesProcessed, totalFiles, totalChunks) {
    return saveCheckpoint(this.options, filesProcessed, totalFiles, totalChunks);
  }

  async _clearCheckpoint() {
    return clearCheckpoint(this.options);
  }

  async indexDirectory(projectPath, options = {}) {
    return indexDirectoryImpl(this, projectPath, options);
  }

  async incrementalUpdate(options = {}) {
    return incrementalUpdateImpl(this, options);
  }

  async semanticSearch(query, options = {}) {
    return semanticSearchImpl(this, query, options);
  }

  async close() {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }
}

module.exports = { IndexManager, calculateSafeMemoryConfig };
