/**
 * Vector Store - Code index vector layer (persistent JSON-backed)
 *
 * @module code-indexing/vector-store
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

const VectorDatabase = require('./vector-db.cjs');

class VectorStore {
  constructor(options = {}) {
    this.db = new VectorDatabase(options);
  }

  async addChunks(chunks, embeddings, metadata) {
    return this.db.addChunks(chunks, embeddings, metadata);
  }

  async search(queryEmbedding, options = {}) {
    return this.db.search(queryEmbedding, options);
  }

  async deleteFile(filePath) {
    return this.db.deleteFile(filePath);
  }

  async getStats() {
    return this.db.getStats();
  }

  async close() {
    return this.db.close();
  }
}

module.exports = {
  VectorStore,
};
