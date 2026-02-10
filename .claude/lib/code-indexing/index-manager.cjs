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

/**
 * Check if a forward-slash-normalized relative path matches any exclude pattern.
 * Handles three pattern types:
 *   - star-star/dir/star-star   - exclude directory and all contents
 *   - star-star/name             - exclude exact file/dir name anywhere
 *   - star-star/*.ext            - exclude files matching extension pattern
 * (star-star represents double-asterisk glob pattern)
 */
function isExcluded(relativePath, patterns) {
  for (const pattern of patterns) {
    // Type 1: **/dir/** — directory exclusion
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
      const dirName = pattern.slice(3, -3);
      if (
        relativePath === dirName ||
        relativePath.startsWith(dirName + '/') ||
        relativePath.includes('/' + dirName + '/') ||
        relativePath.endsWith('/' + dirName)
      ) {
        return true;
      }
      continue;
    }

    // Type 2: **/*.ext or **/prefix*.ext — wildcard file match
    if (pattern.startsWith('**/') && pattern.includes('*', 3)) {
      const suffix = pattern.slice(3);
      const regexStr = suffix.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
      const regex = new RegExp('(^|/)' + regexStr + '$');
      if (regex.test(relativePath)) return true;
      continue;
    }

    // Type 3: **/exactname — exact file/directory name anywhere in path
    if (pattern.startsWith('**/')) {
      const name = pattern.slice(3);
      if (relativePath === name || relativePath.endsWith('/' + name)) {
        return true;
      }
      continue;
    }

    // Type 4: literal match
    if (relativePath === pattern) return true;
  }
  return false;
}

const DEFAULT_OPTIONS = {
  projectRoot: process.cwd(),
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.claude/context/code-index/**',
    '**/.claude/context/data/**',
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
    // Merge exclude patterns (union of defaults + user-provided) instead of replacing
    const mergedExclude = options.excludePatterns
      ? [...new Set([...DEFAULT_OPTIONS.excludePatterns, ...options.excludePatterns])]
      : DEFAULT_OPTIONS.excludePatterns;
    this.options = { ...DEFAULT_OPTIONS, ...options, excludePatterns: mergedExclude };

    // CRITICAL FIX: Cap user-provided concurrency/batchSize at memory-safe calculated values
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
    // Safety valve: limit total files to prevent OOM from broken exclusions
    const MAX_DISCOVERED_FILES = 10000;

    // Log discovery start for root call
    if (dir === this.options.projectRoot) {
      console.log(`[DISCOVER] Starting file discovery in: ${dir}`);
      console.log(`[DISCOVER] Exclude patterns: ${this.options.excludePatterns.length}`);
    }

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
      const excluded = isExcluded(relativePath, this.options.excludePatterns);
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
        const subFiles = await this._discoverFiles(fullPath);
        files.push(...subFiles);
        if (files.length >= MAX_DISCOVERED_FILES) {
          console.warn(`[DISCOVER] Safety limit reached after recursing into ${relativePath}`);
          return files;
        }
      } else if (entry.isFile()) {
        const language = this.parser.detectLanguage(fullPath);
        if (language) {
          const stats = await fs.stat(fullPath);
          if (stats.size <= this.options.maxFileSize) {
            files.push(fullPath);
            if (files.length >= MAX_DISCOVERED_FILES) {
              console.warn(
                `[DISCOVER] Safety limit reached: ${MAX_DISCOVERED_FILES} files. Stopping discovery.`
              );
              return files;
            }
          } else if (this.options.verbose) {
            console.log(
              `[SKIP] File too large: ${relativePath} (${(stats.size / 1024).toFixed(0)}KB)`
            );
          }
        }
      }
    }

    // Log discovery completion for root call
    if (dir === this.options.projectRoot) {
      console.log(`[DISCOVER] Found ${files.length} indexable files`);
    }

    return files;
  }

  _collectMerkleFilePaths(node, basePath = '') {
    if (!node) return [];
    if (node.type === 'file') {
      return basePath ? [basePath.replace(/\\/g, '/')] : [];
    }
    const children = node.children || {};
    const results = [];
    for (const [name, child] of Object.entries(children)) {
      const childPath = basePath ? `${basePath}/${name}` : name;
      results.push(...this._collectMerkleFilePaths(child, childPath));
    }
    return results;
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

      const mem = process.memoryUsage();
      const rss = (mem.rss / 1024 / 1024).toFixed(0);
      const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
      if (this.options.verbose) {
        console.log(
          `[FLUSH] ${toFlush.length} chunks (buffer: ${chunkBuffer.length}, rss:${rss}MB heap:${heapUsed}MB)`
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

      // Save BM25 index periodically (not every flush) to reduce serialization overhead
      if (chunksFlushed % (flushSize * 5) === 0 || chunkBuffer.length === 0) {
        await this.vectorStore.saveBM25Index();
      }

      if (this.options.verbose) {
        const memAfter = process.memoryUsage();
        const rssAfter = (memAfter.rss / 1024 / 1024).toFixed(0);
        const heapAfter = (memAfter.heapUsed / 1024 / 1024).toFixed(0);
        console.log(
          `[FLUSH] Done ${chunksFlushed}/${totalChunks} (rss:${rssAfter}MB heap:${heapAfter}MB)`
        );
      }

      // CRITICAL FIX: Force GC after flush if available
      if (typeof global.gc === 'function') {
        global.gc();
      }
    };

    // In-process parsing when concurrency=1 to avoid Piscina worker overhead
    const workerPath = path.resolve(__dirname, 'parse-chunk-worker.cjs');
    let pool = null;
    let parseInProcess = null;

    if (concurrency <= 1) {
      console.log('[INDEX] Using in-process parsing (no worker threads)');
      parseInProcess = require(workerPath);
    } else {
      console.log(`[INDEX] Using Piscina worker pool (${concurrency} threads)`);
      pool = new Piscina({
        filename: workerPath,
        maxThreads: concurrency,
        minThreads: 1,
        resourceLimits: {
          maxOldGenerationSizeMb: this.memoryConfig.maxOldGenerationSizeMb,
          maxYoungGenerationSizeMb: this.memoryConfig.maxYoungGenerationSizeMb,
        },
      });
    }

    let filesProcessed = startIndex;

    // ════════════════════════════════════════════════════════════════════
    // SYNC FAST-PATH: BM25-only mode bypasses async pipeline to avoid
    // V8 heap fragmentation from Promise.race / inFlight tracking.
    // Uses simple 50-line chunking (no AST parsing) for minimal memory.
    // See: scratchpad/rebuild-index.cjs (proven pattern)
    // ════════════════════════════════════════════════════════════════════
    if (this.vectorStore.embeddingMode === 'off') {
      console.log('[INDEX] BM25-only sync fast-path enabled (simple 50-line chunking)');
      const fsSync = require('fs');

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const globalIndex = startIndex + i + 1;

        try {
          const stats = fsSync.statSync(filePath);
          if (stats.size > this.options.maxFileSize || stats.size === 0) continue;

          const content = fsSync.readFileSync(filePath, 'utf-8');
          const language = this.parser.detectLanguage(filePath);
          if (!language) continue;

          // Simple 50-line chunking for BM25 (no AST parsing needed)
          const lines = content.split('\n');
          const relPath = path.relative(this.options.projectRoot, filePath).replace(/\\/g, '/');
          const chunks = [];
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 50) {
            const text = lines
              .slice(lineIdx, lineIdx + 50)
              .join('\n')
              .trim();
            if (text.length === 0) continue;
            chunks.push({ id: `${relPath}:${lineIdx}`, text });
          }

          filesProcessed++;
          fileHashes[filePath] = { hash: null, chunks: chunks.length };
          totalChunks += chunks.length;

          if (chunks.length > 0) {
            await this.vectorStore.addChunksToBM25(chunks);
          }

          if (this.options.verbose && filesProcessed % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = (filesProcessed - startIndex) / elapsed;
            const remaining = allFiles.length - filesProcessed;
            const mem = process.memoryUsage();
            console.log(
              `[PROGRESS] ${filesProcessed}/${allFiles.length} (${rate.toFixed(1)}/sec, ~${(remaining / rate / 60).toFixed(1)}min left) rss:${(mem.rss / 1048576).toFixed(0)}MB heap:${(mem.heapUsed / 1048576).toFixed(0)}MB`
            );
          }

          if (onProgress) {
            onProgress('parse', globalIndex, allFiles.length);
            onProgress('chunk', globalIndex, allFiles.length);
          }

          // Checkpoint
          if (
            this.options.enableCheckpoints &&
            filesProcessed % this.options.checkpointInterval === 0
          ) {
            await this._saveCheckpoint(filesProcessed, allFiles.length, totalChunks);
          }

          // Periodic BM25 save (every 500 files)
          if (filesProcessed % 500 === 0) {
            await this.vectorStore.saveBM25Index();
          }
        } catch (err) {
          if (this.options.verbose) {
            console.error(
              `[INDEX] Error: ${path.relative(this.options.projectRoot, filePath)}: ${err.message}`
            );
          }
        }
      }

      // Final BM25 save
      await this.vectorStore.saveBM25Index();
    } else {
      // ════════════════════════════════════════════════════════════════════
      // ASYNC PIPELINE: Original async implementation for embedding mode
      // ════════════════════════════════════════════════════════════════════
      const inFlight = new Set();
      filesProcessed = startIndex;
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

        // Use in-process parsing or Piscina worker pool
        const result = parseInProcess
          ? parseInProcess({ filePath, content, language })
          : await pool.run({ filePath, content, language });
        return { ...result, index };
      };

      // CRITICAL FIX: Memory-aware processing with backpressure
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const globalIndex = startIndex + i + 1;

        // Check memory pressure before adding new work
        const mem = process.memoryUsage();
        const rssGB = mem.rss / 1024 / 1024 / 1024;

        // EMERGENCY: Pause everything if memory is critical
        if (rssGB > this.memoryConfig.emergencyThresholdGB) {
          console.warn(
            `🚨 EMERGENCY: Memory critical (rss:${rssGB.toFixed(2)}GB), draining queue...`
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
        if (rssGB > this.memoryConfig.memoryThresholdGB && inFlight.size >= concurrency) {
          console.warn(`⚠️ Backpressure: Memory at ${rssGB.toFixed(2)}GB, throttling...`);
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
              const mem = process.memoryUsage();
              const rss = (mem.rss / 1024 / 1024).toFixed(0);
              const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
              const ext = (mem.external / 1024 / 1024).toFixed(0);
              console.log(
                `[PROGRESS] ${filesProcessed}/${allFiles.length} (${filesPerSec.toFixed(1)}/sec, ~${estimatedMin.toFixed(1)}min left) rss:${rss}MB heap:${heapUsed}MB ext:${ext}MB`
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

            // Save checkpoint periodically (fire-and-forget to avoid deadlocking inFlight)
            if (
              this.options.enableCheckpoints &&
              filesProcessed % this.options.checkpointInterval === 0
            ) {
              this._saveCheckpoint(filesProcessed, allFiles.length, totalChunks).catch(err =>
                console.error('[CHECKPOINT] Save failed:', err.message)
              );
            }
          })
          .catch(err => console.error(`Error indexing ${filePath}:`, err.message))
          .finally(() => inFlight.delete(task));
      }

      await Promise.all(Array.from(inFlight));
      if (pool) await pool.destroy();

      await flushPromise;
      await flushBuffer();

      // Final BM25 index save after all processing
      await this.vectorStore.saveBM25Index();
    } // End of async pipeline else block

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
    if (merkleTree.root) {
      await merkleTree.save(merklePath);
    } else {
      // No indexable files remain; remove stale Merkle snapshot if present.
      await fs.rm(merklePath, { force: true }).catch(() => {});
    }

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

    if (!newTree.root) {
      const oldFiles = this._collectMerkleFilePaths(oldTree);
      for (const filePath of oldFiles) {
        const fullPath = path.join(this.options.projectRoot, filePath);
        await this.vectorStore.deleteFile(fullPath);
      }
      await fs.rm(merklePath, { force: true }).catch(() => {});
      return {
        updateType: 'incremental',
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: oldFiles.length,
        chunksAdded: 0,
        chunksUpdated: 0,
        chunksDeleted: oldFiles.length,
        timeMs: Date.now() - startTime,
      };
    }

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
