/**
 * Vector Store - Code index vector layer (LanceDB-backed)
 *
 * @module code-indexing/vector-store
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

const path = require('path');
const { MemoryVectorStore } = require('../memory/lancedb-client.cjs');

class VectorStore {
  constructor(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const persistDirectory =
      options.persistDirectory ||
      process.env.LANCEDB_URI ||
      path.join(projectRoot, '.claude', 'data', 'lancedb');
    const collectionName = options.collectionName || process.env.LANCEDB_TABLE_CODE || 'code_index';

    this.store = MemoryVectorStore.getSharedStore({
      persistDirectory,
      collectionName,
      embeddingMode: process.env.LANCEDB_EMBEDDING_MODE || 'transformers',
      embeddingModel: process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    });
  }

  async addChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return;
    const docs = chunks.map(chunk => ({
      id: chunk.id,
      text: chunk.content,
      metadata: {
        filePath: chunk.filePath,
        language: chunk.language,
        type: chunk.type,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        name: chunk.name,
        signature: chunk.signature,
        tokenCount: chunk.tokenCount,
      },
    }));

    await this.store.upsertDocuments(docs);
  }

  async search(query, options = {}) {
    const limit = options.limit || options.topK || 10;
    const filters = options.filters || {};
    const minScore = typeof options.minScore === 'number' ? options.minScore : null;
    return await this.store.search(query, { limit, filters, minScore });
  }

  async deleteFile(filePath) {
    return await this.store.deleteByMetadata('filePath', filePath);
  }

  async getStats() {
    const tables = await this.store.listTables();
    return {
      collectionName: this.store.config?.collectionName,
      dbPath: this.store.config?.persistDirectory,
      tables,
    };
  }

  async close() {
    return this.store.close();
  }
}

module.exports = {
  VectorStore,
};
