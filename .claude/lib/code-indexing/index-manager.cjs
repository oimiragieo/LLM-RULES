/**
 * Index Manager - FIXED VERSION with Memory Safety
 *
 * @module code-indexing/index-manager-fixed
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 * @critical-fix Memory-safe worker pool, backpressure, checkpointing
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { CodeParser } = require('./code-parser.cjs');
const { SemanticChunker } = require('./semantic-chunker.cjs');
const { VectorStore } = require('./vector-store.cjs');
const { MerkleTree } = require('./merkle-tree.cjs');
const Piscina = require('piscina');

// CRITICAL FIX: Calculate safe memory limits based on system
function calculateSafeMemoryConfig() {
  const _totalSystemMemoryGB = os.totalmem() / 1024 / 1024 / 1024;
  const availableMemoryGB = os.freemem() / 1024 / 1024 / 1024;

  // Use at most 50% of available memory for indexing
  const maxIndexingMemoryGB = Math.min(availableMemoryGB * 0.5, 8);

  // Calculate safe concurrency (1 worker per 2GB of allowed memory, max 4)
  const safeConcurrency = Math.min(4, Math.max(1, Math.floor(maxIndexingMemoryGB / 2)));

  // Memory per worker (divide by 2 for safety margin)
  const maxOldGenMB = Math.min(
    2048,
    Math.floor((maxIndexingMemoryGB * 1024) / safeConcurrency / 2)
  );

  // Dynamic thresholds based on system
  const memoryThresholdGB = Math.max(2, maxIndexingMemoryGB * 0.6);

  return {
    concurrency: safeConcurrency,
    maxOldGenerationSizeMb: maxOldGenMB,
    maxYoungGenerationSizeMb: Math.min(256, Math.floor(maxOldGenMB / 4)),
    memoryThresholdGB,
    flushSize: 50, // Reduced from 100 for faster memory release
    emergencyThresholdGB: Math.max(3, maxIndexingMemoryGB * 0.8),
  };
}

// Default configuration with memory-safe defaults
const memoryConfig = calculateSafeMemoryConfig();

const DEFAULT_OPTIONS = {
  projectRoot: process.cwd(),
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.claude/context/code-index/**',
    '**/.claude/data/**',
    '**/local_cache/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/*.map',
    '**/.tmp/**',
    '**/.claude.archive/**',
    '**/pnpm-lock.yaml',
    '**/*.jsonl',
    '**/*.db',
  ],
  maxFileSize: 512 * 1024, // REDUCED: 512KB max (was 1MB)
  batchSize: 25, // REDUCED: 25 files per batch (was 50)
  concurrency: memoryConfig.concurrency, // DYNAMIC: Based on system memory
  chunkFlushSize: memoryConfig.flushSize, // REDUCED: 50 chunks per flush
  embedBatchSize: 32, // REDUCED: 32 embeddings per batch (was 64)
  verbose: false,
  enableCheckpoints: true, // NEW: Enable progress checkpointing
  checkpointInterval: 50, // NEW: Save every 50 files
};

/**
 * IndexManager with memory-safe defaults and backpressure
 */
class IndexManager {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
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
        bm25: this.options.bm25 || {
          k1: 1.5,
          b: 0.75,
          k_sparse: 50, // REDUCED: was 100
          k_dense: 10,
          rrf_k: 60,
          weights: { sparse: 0.4, dense: 0.6 },
        },
      });
    }
  }

  async _discoverFiles(dir) {
    const files = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return files; // Permission denied or broken path
    }

    const resolvedRoot = path.resolve(this.options.projectRoot);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Safety: ensure we haven't escaped the project root via symlinks/junctions
      const resolvedFull = path.resolve(fullPath);
      if (!resolvedFull.startsWith(resolvedRoot)) {
        if (this.options.verbose) {
          console.log(`[SKIP] Outside project root: ${fullPath}`);
        }
        continue;
      }

      // Normalize to forward slashes for cross-platform pattern matching
      const relativePath = path.relative(this.options.projectRoot, fullPath).replace(/\\/g, '/');

      // Check exclude patterns (use forward-slash normalized path)
      const excluded = this.options.excludePatterns.some(pattern => {
        // Convert glob pattern to regex with proper escaping
        const regexStr = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars (except * and ?)
          .replace(/\*\*/g, '{{GLOBSTAR}}')        // Temp placeholder
          .replace(/\*/g, '[^/]*')                  // Single * = anything except /
          .replace(/{{GLOBSTAR}}/g, '.*');          // ** = anything including /
        const regex = new RegExp('^' + regexStr + '$');
        return regex.test(relativePath);
      });
      if (excluded) continue;

      if (entry.isDirectory()) {
        // Check for symlinks pointing outside project
        if (entry.isSymbolicLink()) {
          try {
            const realPath = await fs.realpath(fullPath);
            if (!realPath.startsWith(resolvedRoot)) {
              if (this.options.verbose) {
                console.log(`[SKIP] Symlink escapes project: ${relativePath} -> ${realPath}`);
              }
              continue;
            }
          } catch {
            continue; // broken symlink
          }
        }
        files.push(...(await this._discoverFiles(fullPath)));
      } else if (entry.isFile()) {
        const language = this.parser.detectLanguage(fullPath);
        if (language) {
          const stats = await fs.stat(fullPath);
          if (stats.size <= this.options.maxFileSize) {
            files.push(fullPath);
          } else if (this.options.verbose) {
            console.log(
              `[SKIP] File too large: ${relativePath} (${(stats.size / 1024).toFixed(0)}KB)`
            );
          }
        }
      }
    }

    return files;
  }

  /**
   * NEW: Load checkpoint if exists
   */
  async _loadCheckpoint() {
    if (!this.options.enableCheckpoints) return { filesProcessed: 0, chunksProcessed: 0 };

    const checkpointPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/checkpoint.json'
    );

    try {
      const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
      console.log(
        `[CHECKPOINT] Resuming: ${checkpoint.filesProcessed}/${checkpoint.totalFiles} files already processed`
      );
      return checkpoint;
    } catch {
      return { filesProcessed: 0, chunksProcessed: 0 };
    }
  }

  /**
   * NEW: Save checkpoint
   */
  async _saveCheckpoint(filesProcessed, totalFiles, totalChunks) {
    if (!this.options.enableCheckpoints) return;

    const checkpointPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/checkpoint.json'
    );

    await fs.writeFile(
      checkpointPath,
      JSON.stringify({
        filesProcessed,
        totalFiles,
        chunksProcessed: totalChunks,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * NEW: Clear checkpoint on successful completion
   */
  async _clearCheckpoint() {
    const checkpointPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/checkpoint.json'
    );
    try {
      await fs.unlink(checkpointPath);
    } catch {
      /* Ignore */
    }
  }

  async indexDirectory(projectPath, options = {}) {
    const startTime = Date.now();
    await this._initializeComponents();

    this.options.projectRoot = projectPath;
    const { onProgress } = options;

    // Load checkpoint
    const checkpoint = await this._loadCheckpoint();
    const startIndex = checkpoint.filesProcessed;

    // Discover files
    const allFiles = await this._discoverFiles(projectPath);
    const files = allFiles.slice(startIndex);

    if (this.options.verbose) {
      console.log(`[DISCOVER] ${allFiles.length} total files, ${files.length} remaining to index`);
      console.log(
        `[MEMORY] Concurrency: ${this.options.concurrency}, Worker memory: ${this.memoryConfig.maxOldGenerationSizeMb}MB`
      );
    }

    if (onProgress) onProgress('scan', allFiles.length, allFiles.length);

    // Full reindex: drop code table
    await this.vectorStore.dropCodeTable();

    let totalChunks = checkpoint.chunksProcessed || 0;
    let totalEmbeddings = 0;
    let chunksFlushed = checkpoint.chunksProcessed || 0;
    const fileHashes = {};
    const concurrency = this.options.concurrency;
    const flushSize = this.options.chunkFlushSize;

    const chunkBuffer = [];
    let flushPromise = Promise.resolve();

    const flushBuffer = async () => {
      if (chunkBuffer.length === 0) return;

      // CRITICAL FIX: Take only flushSize chunks
      const toFlush = chunkBuffer.splice(0, flushSize);
      const embedBatchSize = this.options.embedBatchSize || 32;
      const totalBatches = Math.ceil(toFlush.length / embedBatchSize) || 1;

      const heapUsedGB = process.memoryUsage().heapUsed / 1024 / 1024 / 1024;
      if (this.options.verbose) {
        console.log(
          `[FLUSH] ${toFlush.length} chunks (buffer: ${chunkBuffer.length}, heap: ${heapUsedGB.toFixed(2)}GB)`
        );
      }

      if (onProgress) onProgress('embed', 0, totalBatches);

      await this.vectorStore.addChunksOnly(toFlush, {
        embedBatchSize,
        onEmbedProgress: onProgress
          ? (batchDone, tot) => onProgress('embed', batchDone, tot)
          : undefined,
      });

      chunksFlushed += toFlush.length;
      if (onProgress) onProgress('index', chunksFlushed, totalChunks);

      await this.vectorStore.saveBM25Index();

      if (this.options.verbose) {
        const heapAfterGB = process.memoryUsage().heapUsed / 1024 / 1024 / 1024;
        console.log(
          `[FLUSH] Done ${chunksFlushed}/${totalChunks} (heap: ${heapAfterGB.toFixed(2)}GB)`
        );
      }

      // CRITICAL FIX: Force GC after flush if available
      if (typeof global.gc === 'function') {
        global.gc();
      }
    };

    // Worker pool with SAFE memory limits
    const workerPath = path.resolve(__dirname, 'parse-chunk-worker.cjs');
    const pool = new Piscina({
      filename: workerPath,
      maxThreads: concurrency,
      minThreads: 1, // REDUCED: Start with 1 worker
      resourceLimits: {
        maxOldGenerationSizeMb: this.memoryConfig.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: this.memoryConfig.maxYoungGenerationSizeMb,
      },
    });

    const inFlight = new Set();
    let filesProcessed = startIndex;
    const parseStartTime = Date.now();

    const runOne = async (filePath, index) => {
      const stats = await fs.stat(filePath);
      if (stats.size > this.options.maxFileSize) {
        return { filePath, chunks: [], hash: null, skipped: true, index };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const language = this.parser.detectLanguage(filePath);
      if (!language) {
        return { filePath, chunks: [], hash: '', index };
      }
      const result = await pool.run({ filePath, content, language });
      return { ...result, index };
    };

    // CRITICAL FIX: Memory-aware processing with backpressure
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const globalIndex = startIndex + i + 1;

      // Check memory pressure before adding new work
      const heapUsedGB = process.memoryUsage().heapUsed / 1024 / 1024 / 1024;

      // EMERGENCY: Pause everything if memory is critical
      if (heapUsedGB > this.memoryConfig.emergencyThresholdGB) {
        console.warn(
          `🚨 EMERGENCY: Memory critical (${heapUsedGB.toFixed(2)}GB), draining queue...`
        );
        await Promise.all(Array.from(inFlight));
        await flushPromise;
        await flushBuffer();

        // Aggressive GC
        if (typeof global.gc === 'function') {
          for (let gc = 0; gc < 3; gc++) global.gc();
        }

        // Cool down
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`🔄 Resuming after memory recovery...`);
      }

      // BACKPRESSURE: If approaching threshold, wait for some work to complete
      if (heapUsedGB > this.memoryConfig.memoryThresholdGB && inFlight.size >= concurrency) {
        console.warn(`⚠️ Backpressure: Memory at ${heapUsedGB.toFixed(2)}GB, throttling...`);
        await Promise.race(Array.from(inFlight));
        await flushBuffer();
      }

      // Cap in-flight to concurrency
      while (inFlight.size >= concurrency) {
        await Promise.race(Array.from(inFlight));
      }

      const task = runOne.call(this, filePath, globalIndex);
      inFlight.add(task);

      task
        .then(async result => {
          filesProcessed++;
          fileHashes[result.filePath] = { hash: result.hash, chunks: result.chunks.length };
          totalChunks += result.chunks.length;
          totalEmbeddings += result.chunks.length;

          if (this.options.verbose && filesProcessed % 50 === 0) {
            const elapsedSec = (Date.now() - parseStartTime) / 1000;
            const filesPerSec = (filesProcessed - startIndex) / elapsedSec;
            const remainingFiles = allFiles.length - filesProcessed;
            const estimatedMin = remainingFiles / filesPerSec / 60;
            const heapGB = process.memoryUsage().heapUsed / 1024 / 1024 / 1024;
            console.log(
              `[PROGRESS] ${filesProcessed}/${allFiles.length} (${filesPerSec.toFixed(1)}/sec, ~${estimatedMin.toFixed(1)}min left) heap: ${heapGB.toFixed(2)}GB`
            );
          }

          if (onProgress) {
            onProgress('parse', result.index, allFiles.length);
            onProgress('chunk', result.index, allFiles.length);
          }

          if (result.chunks.length > 0) {
            chunkBuffer.push(...result.chunks);

            if (chunkBuffer.length >= flushSize) {
              flushPromise = flushPromise.then(() => flushBuffer());
            }
          }

          // Save checkpoint periodically
          if (
            this.options.enableCheckpoints &&
            filesProcessed % this.options.checkpointInterval === 0
          ) {
            await this._saveCheckpoint(filesProcessed, allFiles.length, totalChunks);
          }
        })
        .catch(err => console.error(`Error indexing ${filePath}:`, err.message))
        .finally(() => inFlight.delete(task));
    }

    await Promise.all(Array.from(inFlight));
    await pool.destroy();

    await flushPromise;
    await flushBuffer();

    // Build metadata
    const byLanguage = {};
    for (const filePath of allFiles) {
      const lang = this.parser.detectLanguage(filePath);
      if (lang) {
        byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      }
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      stats: {
        files: allFiles.length,
        chunks: totalChunks,
        embeddings: totalEmbeddings,
        byLanguage,
      },
      files: fileHashes,
    };

    const metadataPath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/metadata.json'
    );
    const metadataDir = path.dirname(metadataPath);
    await fs.mkdir(metadataDir, { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Build and save Merkle tree
    const merklePath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/merkle-tree.json'
    );
    const merkleTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
    await merkleTree.build();
    await merkleTree.save(merklePath);

    // Clear checkpoint on success
    await this._clearCheckpoint();

    return {
      filesIndexed: allFiles.length,
      chunksCreated: totalChunks,
      embeddingsGenerated: totalEmbeddings,
      timeMs: Date.now() - startTime,
    };
  }

  async incrementalUpdate(options = {}) {
    const startTime = Date.now();
    await this._initializeComponents();

    const merklePath = path.join(
      this.options.projectRoot,
      '.claude/context/code-index/merkle-tree.json'
    );

    const oldTree = await MerkleTree.load(merklePath);

    if (!oldTree) {
      const result = await this.indexDirectory(this.options.projectRoot, options);
      const newTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
      await newTree.build();
      await newTree.save(merklePath);
      return { ...result, updateType: 'full', filesChanged: result.filesIndexed };
    }

    const newTree = new MerkleTree(this.options.projectRoot, this.options.excludePatterns);
    await newTree.build();

    const diff = MerkleTree.diff(oldTree, newTree.root, '');

    if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) {
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

    // Process with reduced concurrency for incremental updates
    const filesToIndex = [...diff.added, ...diff.modified];
    const filesToDelete = diff.deleted;

    let chunksAdded = 0,
      chunksUpdated = 0,
      chunksDeleted = 0;

    for (const filePath of filesToDelete) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.options.projectRoot, filePath);
      await this.vectorStore.deleteFile(fullPath);
      chunksDeleted++;
    }

    // Process files sequentially for memory safety
    for (const filePath of filesToIndex) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.options.projectRoot, filePath);

      try {
        await fs.access(fullPath);
        const stats = await fs.stat(fullPath);
        if (stats.size > this.options.maxFileSize) continue;

        const content = await fs.readFile(fullPath, 'utf8');
        const language = this.parser.detectLanguage(fullPath);
        if (!language) continue;

        const parseResult = this.parser.parse(content, language);
        const chunks = this.chunker.chunk(parseResult, fullPath);
        if (chunks.length === 0) continue;

        await this.vectorStore.deleteFile(fullPath);
        chunksDeleted += chunks.length;
        await this.vectorStore.addChunks(chunks, { addOnly: true });

        if (diff.added.includes(filePath)) {
          chunksAdded += chunks.length;
        } else {
          chunksUpdated += chunks.length;
        }
      } catch (_error) {
        continue;
      }
    }

    await newTree.save(merklePath);

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

module.exports = { IndexManager, calculateSafeMemoryConfig };
