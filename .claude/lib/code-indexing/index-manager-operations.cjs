'use strict';

const fs = require('fs').promises;
const path = require('path');
const Piscina = require('piscina');
const { MerkleTree } = require('./merkle-tree.cjs');

async function indexDirectoryImpl(manager, projectPath, options = {}) {
  const startTime = Date.now();
  await manager._initializeComponents();

  manager.options.projectRoot = projectPath;
  const { onProgress } = options;

  const checkpoint = await manager._loadCheckpoint();
  const startIndex = checkpoint.filesProcessed;

  const allFiles = await manager._discoverFiles(projectPath);
  const files = allFiles.slice(startIndex);

  if (manager.options.verbose) {
    console.log(`[DISCOVER] ${allFiles.length} total files, ${files.length} remaining to index`);
    console.log(
      `[MEMORY] Concurrency: ${manager.options.concurrency}, Worker memory: ${manager.memoryConfig.maxOldGenerationSizeMb}MB`
    );
  }

  if (onProgress) onProgress('scan', allFiles.length, allFiles.length);

  if (startIndex === 0) {
    await manager.vectorStore.dropCodeTable();
  } else if (manager.options.verbose) {
    console.log(`[CHECKPOINT] Resuming from file ${startIndex}, skipping dropCodeTable()`);
  }
  if (startIndex > 0) {
    await manager.vectorStore.loadBM25Index();
  }

  const batchSize = manager.options.batchSize || 100;
  const totalFilesCount = allFiles.length;
  let totalChunks = checkpoint.chunksProcessed || 0;
  let totalEmbeddings = 0;
  let chunksFlushed = checkpoint.chunksProcessed || 0;
  let filesProcessed = startIndex;
  const fileHashes = {};
  const concurrency = manager.options.concurrency;
  const flushSize = manager.options.chunkFlushSize;

  const chunkBuffer = [];
  const flushPromise = Promise.resolve();

  // Worker setup moved outside loop
  const workerPath = path.resolve(__dirname, 'parse-chunk-worker.cjs');
  let pool = null;
  let parseInProcess = null;

  // OOM FIX: When embeddings are active, always use Piscina worker pool
  // (min concurrency 2). The in-process path leaks memory through LanceDB's
  // Arrow IPC buffers because the event loop never yields for GC.
  const embeddingActive = manager.vectorStore && manager.vectorStore.embeddingMode !== 'off';
  const effectiveConcurrency = embeddingActive ? Math.max(concurrency, 2) : concurrency;

  if (effectiveConcurrency <= 1) {
    console.log('[INDEX] Using in-process parsing (no worker threads)');
    parseInProcess = require(workerPath);
  } else {
    console.log(`[INDEX] Using Piscina worker pool (${effectiveConcurrency} threads)`);
    pool = new Piscina({
      filename: workerPath,
      maxThreads: effectiveConcurrency,
      minThreads: 1,
      resourceLimits: {
        maxOldGenerationSizeMb: manager.memoryConfig.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: manager.memoryConfig.maxYoungGenerationSizeMb,
      },
    });
  }

  const flushBuffer = async () => {
    if (chunkBuffer.length === 0) return;

    const toFlush = chunkBuffer.splice(0, flushSize);
    const embedBatchSize = manager.options.embedBatchSize || 32;
    const totalBatches = Math.ceil(toFlush.length / embedBatchSize) || 1;

    const mem = process.memoryUsage();
    const rss = (mem.rss / 1024 / 1024).toFixed(0);
    const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
    if (manager.options.verbose) {
      console.log(
        `[FLUSH] ${toFlush.length} chunks (buffer: ${chunkBuffer.length}, rss:${rss}MB heap:${heapUsed}MB)`
      );
    }

    if (onProgress) onProgress('embed', 0, totalBatches);

    await manager.vectorStore.addChunksOnly(toFlush, {
      embedBatchSize,
      onEmbedProgress: onProgress
        ? (batchDone, tot) => onProgress('embed', batchDone, tot)
        : undefined,
    });

    chunksFlushed += toFlush.length;
    if (onProgress) onProgress('index', chunksFlushed, totalChunks);

    if (chunksFlushed % (flushSize * 5) === 0 || chunkBuffer.length === 0) {
      await manager.vectorStore.saveBM25Index();
    }

    if (typeof global.gc === 'function') {
      global.gc();
    }
  };

  // Process in discrete batches to allow heap reclamation
  for (let b = 0; b < files.length; b += batchSize) {
    const currentBatch = files.slice(b, b + batchSize);

    if (manager.vectorStore.embeddingMode === 'off') {
      const fsSync = require('fs');
      for (let i = 0; i < currentBatch.length; i++) {
        const filePath = currentBatch[i];
        const globalIndex = startIndex + b + i + 1;
        try {
          const stats = fsSync.statSync(filePath);
          if (stats.size > manager.options.maxFileSize || stats.size === 0) continue;

          const content = fsSync.readFileSync(filePath, 'utf-8');
          const language = manager.parser.detectLanguage(filePath);
          if (!language) continue;

          const lines = content.split('\n');
          const relPath = path.relative(manager.options.projectRoot, filePath).replace(/\\/g, '/');
          const chunks = [];
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 50) {
            const text = lines
              .slice(lineIdx, lineIdx + 50)
              .join('\n')
              .trim();
            if (text.length === 0) continue;
            // Carry filePath + line metadata so incremental deleteFile()
            // (which matches on metadata.filePath) can find and remove these
            // BM25 docs. Without it, updates/deletes silently no-op and stale
            // duplicates accumulate. filePath is the absolute path, matching
            // the embedding-mode convention and deleteFile(fullPath).
            chunks.push({
              id: `${relPath}:${lineIdx}`,
              text,
              filePath,
              lineStart: lineIdx + 1,
              lineEnd: Math.min(lineIdx + 50, lines.length),
            });
          }

          filesProcessed++;
          fileHashes[filePath] = { hash: null, chunks: chunks.length };
          totalChunks += chunks.length;

          if (chunks.length > 0) {
            await manager.vectorStore.addChunksToBM25(chunks);
          }

          if (onProgress) {
            onProgress('parse', globalIndex, totalFilesCount);
            onProgress('chunk', globalIndex, totalFilesCount);
          }
        } catch (err) {
          if (manager.options.verbose) console.error(`[INDEX] Error: ${filePath}: ${err.message}`);
        }
      }
    } else {
      const runOne = async (filePath, index) => {
        const stats = await fs.stat(filePath);
        if (stats.size > manager.options.maxFileSize) {
          return { filePath, chunks: [], hash: null, skipped: true, index };
        }
        const content = await fs.readFile(filePath, 'utf-8');
        const language = manager.parser.detectLanguage(filePath);
        if (!language) return { filePath, chunks: [], hash: '', index };

        const result = parseInProcess
          ? parseInProcess({ filePath, content, language })
          : await pool.run({ filePath, content, language });
        return { ...result, index };
      };

      // OOM FIX: Process files with controlled concurrency + synchronous flush.
      // We chunk the batch into subBatches of size `effectiveConcurrency` so that
      // all Piscina worker threads are busy, but we still apply backpressure and
      // completely avoid race conditions during `flushBuffer()`.
      for (let i = 0; i < currentBatch.length; i += effectiveConcurrency) {
        const subBatch = currentBatch.slice(i, i + effectiveConcurrency);
        const results = await Promise.all(
          subBatch.map((filePath, j) => {
            const globalIndex = startIndex + b + i + j + 1;
            return runOne(filePath, globalIndex).catch(err => {
              if (manager.options.verbose) {
                console.error(`[INDEX] Error processing ${filePath}: ${err.message}`);
              }
              return null;
            });
          })
        );

        for (const result of results) {
          if (!result) continue;

          filesProcessed++;
          fileHashes[result.filePath] = { hash: result.hash, chunks: result.chunks.length };
          totalChunks += result.chunks.length;
          totalEmbeddings += result.chunks.length;

          if (onProgress) {
            onProgress('parse', result.index, totalFilesCount);
            onProgress('chunk', result.index, totalFilesCount);
          }

          if (result.chunks.length > 0) {
            chunkBuffer.push(...result.chunks);
          }
        }

        // Synchronously await flush — this is the key backpressure point.
        // Embedding + LanceDB write must complete before we read more files.
        while (chunkBuffer.length >= flushSize) {
          await flushBuffer();
        }
      }
    }

    // End of batch maintenance
    if (manager.options.enableCheckpoints) {
      await manager._saveCheckpoint(filesProcessed, totalFilesCount, totalChunks);
    }
    if (filesProcessed % 500 === 0) {
      await manager.vectorStore.saveBM25Index();
    }
    if (typeof global.gc === 'function') global.gc();
  }

  if (pool) await pool.destroy();
  await flushPromise;
  await flushBuffer();
  await manager.vectorStore.saveBM25Index();

  const byLanguage = {};
  for (const filePath of allFiles) {
    const lang = manager.parser.detectLanguage(filePath);
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
    manager.options.projectRoot,
    '.claude/context/code-index/metadata.json'
  );
  const metadataDir = path.dirname(metadataPath);
  await fs.mkdir(metadataDir, { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  const merklePath = path.join(
    manager.options.projectRoot,
    '.claude/context/code-index/merkle-tree.json'
  );
  const merkleTree = new MerkleTree(manager.options.projectRoot, manager.options.excludePatterns);
  await merkleTree.build();
  if (merkleTree.root) {
    await merkleTree.save(merklePath);
  } else {
    await fs.rm(merklePath, { force: true }).catch(err => {
      if (manager.options.verbose) {
        console.warn(`[MERKLE] failed to remove stale tree: ${err.message}`);
      }
    });
  }

  await manager._clearCheckpoint();

  return {
    filesIndexed: allFiles.length,
    chunksCreated: totalChunks,
    embeddingsGenerated: totalEmbeddings,
    timeMs: Date.now() - startTime,
  };
}

async function incrementalUpdateImpl(manager, options = {}) {
  const startTime = Date.now();
  await manager._initializeComponents();
  await manager.vectorStore.loadBM25Index();

  const merklePath = path.join(
    manager.options.projectRoot,
    '.claude/context/code-index/merkle-tree.json'
  );
  const oldTree = await MerkleTree.load(merklePath);

  if (!oldTree) {
    const result = await manager.indexDirectory(manager.options.projectRoot, options);
    const newTree = new MerkleTree(manager.options.projectRoot, manager.options.excludePatterns);
    await newTree.build();
    await newTree.save(merklePath);
    return { ...result, updateType: 'full', filesChanged: result.filesIndexed };
  }

  const newTree = new MerkleTree(manager.options.projectRoot, manager.options.excludePatterns);
  await newTree.build();

  if (!newTree.root) {
    const oldFiles = manager._collectMerkleFilePaths(oldTree);
    for (const filePath of oldFiles) {
      const fullPath = path.join(manager.options.projectRoot, filePath);
      await manager.vectorStore.deleteFile(fullPath);
    }
    await fs.rm(merklePath, { force: true }).catch(err => {
      if (manager.options.verbose) {
        console.warn(`[MERKLE] failed to remove tree during incremental reset: ${err.message}`);
      }
    });
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

  const filesToIndex = [...diff.added, ...diff.modified];
  const filesToDelete = diff.deleted;

  let chunksAdded = 0;
  let chunksUpdated = 0;
  let chunksDeleted = 0;

  for (const filePath of filesToDelete) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(manager.options.projectRoot, filePath);
    await manager.vectorStore.deleteFile(fullPath);
    chunksDeleted++;
  }

  for (const filePath of filesToIndex) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(manager.options.projectRoot, filePath);

    try {
      await fs.access(fullPath);
      const stats = await fs.stat(fullPath);
      if (stats.size > manager.options.maxFileSize) continue;

      const content = await fs.readFile(fullPath, 'utf8');
      const language = manager.parser.detectLanguage(fullPath);
      if (!language) continue;

      const parseResult = manager.parser.parse(content, language);
      const chunks = manager.chunker.chunk(parseResult, fullPath);
      if (chunks.length === 0) continue;

      await manager.vectorStore.deleteFile(fullPath);
      chunksDeleted += chunks.length;
      await manager.vectorStore.addChunksToBM25(chunks);
      await manager.vectorStore.addChunks(chunks, { addOnly: true });

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
  await manager.vectorStore.saveBM25Index();

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

async function semanticSearchImpl(manager, query, options = {}) {
  await manager._initializeComponents();

  const searchOptions = typeof options === 'number' ? { limit: options } : options || {};
  const limit = searchOptions.limit || 10;
  // Preserve an explicit minScore of 0 (return-all); `|| 0.5` would discard it.
  const minScore = typeof searchOptions.minScore === 'number' ? searchOptions.minScore : 0.5;

  let searchResults = [];
  try {
    if (manager.vectorStore.embeddingMode === 'off') {
      await manager.vectorStore.loadBM25Index();
      searchResults = await manager.vectorStore.hybridSearch(query, {
        mode: 'sparse',
        k_sparse: limit,
      });
    } else {
      searchResults = await manager.vectorStore.search(query, {
        limit,
        minScore,
        filters: searchOptions.filters || {},
      });
    }
  } catch (error) {
    if (process.env.CODE_INDEX_DEBUG) {
      console.warn('[code-indexing] Semantic search unavailable:', error.message);
    }
    return [];
  }

  const results = [];
  for (const result of searchResults) {
    const metadata = result.metadata || {};
    const lineStart = metadata.lineStart || metadata.startLine || 1;
    const lineEnd = metadata.lineEnd || metadata.endLine || lineStart;
    let code = null;

    try {
      const content = await fs.readFile(metadata.filePath, 'utf-8');
      const lines = content.split('\n');
      code = lines.slice(lineStart - 1, lineEnd).join('\n');
    } catch (_error) {
      code = null;
    }

    results.push({
      id: result.id,
      code,
      filePath: metadata.filePath,
      language: metadata.language,
      type: metadata.type,
      lineRange: [lineStart, lineEnd],
      similarity: result.similarity ?? result.score ?? result.rrf_score ?? 0,
      metadata,
    });
  }

  return results;
}

module.exports = {
  incrementalUpdateImpl,
  indexDirectoryImpl,
  semanticSearchImpl,
};
