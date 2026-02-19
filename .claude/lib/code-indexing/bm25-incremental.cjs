/**
 * BM25 Incremental Update - Update a single file in the BM25 index
 *
 * Provides efficient incremental updates: removes old chunks for a file,
 * re-reads the file, re-chunks it, and adds new chunks to the BM25 index.
 *
 * @module code-indexing/bm25-incremental
 * @see {@link ./bm25-indexer.cjs}
 * @see {@link ./vector-store.cjs}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LINES_PER_CHUNK = 50; // lines per chunk (matches index-manager-operations.cjs)

/**
 * Update a single file in the BM25 index (remove old chunks, add new ones).
 *
 * @param {string} filePath - Absolute path to the file
 * @param {import('./bm25-indexer.cjs').BM25Indexer} bm25Index - BM25 indexer instance
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ ok: boolean, action: string, chunksRemoved?: boolean, chunksAdded: number }}
 */
function updateFileInBM25(filePath, bm25Index, projectRoot) {
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // 1. Remove old chunks for this file
  bm25Index.removeDocumentsByMetadata('filePath', filePath);

  // 2. Check if file still exists
  if (!fs.existsSync(filePath)) {
    return { ok: true, action: 'deleted', chunksRemoved: true, chunksAdded: 0 };
  }

  // 3. Read and chunk new content
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const chunks = [];
  for (let i = 0; i < lines.length; i += LINES_PER_CHUNK) {
    const text = lines
      .slice(i, i + LINES_PER_CHUNK)
      .join('\n')
      .trim();
    if (!text) continue;
    chunks.push({
      id: `${relPath}:${i}`,
      text,
      metadata: {
        filePath,
        startLine: i + 1,
        endLine: Math.min(i + LINES_PER_CHUNK, lines.length),
      },
    });
  }

  // 4. Add new chunks
  if (chunks.length > 0) {
    bm25Index.addDocuments(chunks);
  }

  return { ok: true, action: 'updated', chunksAdded: chunks.length };
}

/**
 * Convenience function: load BM25 from VectorStore, update a file, and save.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {import('./vector-store.cjs').VectorStore} vectorStore - VectorStore instance
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Promise<{ ok: boolean, action: string, chunksAdded: number }>}
 */
async function incrementalUpdateFile(filePath, vectorStore, projectRoot) {
  if (!vectorStore.bm25Index) {
    await vectorStore.loadBM25Index();
  }
  const result = updateFileInBM25(filePath, vectorStore.bm25Index, projectRoot);
  await vectorStore.saveBM25Index();
  return result;
}

module.exports = { updateFileInBM25, incrementalUpdateFile };
