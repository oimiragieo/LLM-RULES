'use strict';

const fs = require('fs').promises;
const path = require('path');

class HybridLazyIndexerMethodsC {
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

module.exports = { HybridLazyIndexerMethodsC };

