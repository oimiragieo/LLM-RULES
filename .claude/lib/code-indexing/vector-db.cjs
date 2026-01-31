const path = require('node:path');
const fs = require('node:fs');

/**
 * Vector database wrapper for storing and searching code embeddings.
 * Uses in-memory storage for now (ChromaDB integration requires server setup).
 *
 * @class VectorDatabase
 * @description Provides semantic code search capabilities with in-memory vector storage
 */
class VectorDatabase {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.path Path to database directory (for persistence in future)
   */
  constructor(options = {}) {
    this.dbPath = options.path || path.join(process.cwd(), '.claude/context/code-index/chroma');
    this.collectionName = 'code-embeddings';

    // In-memory storage for embeddings
    this.embeddings = [];
    this.metadata = [];
    this.ids = [];

    // Ensure database directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
  }

  /**
   * Get collection metadata (compatibility with ChromaDB interface)
   * @returns {Promise<Object>} Collection metadata
   */
  async getCollection() {
    return {
      name: this.collectionName,
      metadata: { description: 'Code embeddings for semantic search' },
      count: this.embeddings.length
    };
  }

  /**
   * Add code chunks with embeddings to the database
   * @param {Array<Object>} chunks Code chunks with metadata
   * @param {Array<Array<number>>} embeddings Embedding vectors
   * @param {Array<Object>} metadata Metadata for each chunk
   * @returns {Promise<void>}
   */
  async addChunks(chunks, embeddings, metadata) {
    for (let i = 0; i < chunks.length; i++) {
      const id = metadata[i]?.id || `chunk-${this.embeddings.length}`;

      // Upsert: check if ID already exists
      const existingIndex = this.ids.indexOf(id);
      if (existingIndex >= 0) {
        // Update existing
        this.embeddings[existingIndex] = embeddings[i];
        this.metadata[existingIndex] = metadata[i];
      } else {
        // Add new
        this.ids.push(id);
        this.embeddings.push(embeddings[i]);
        this.metadata.push(metadata[i]);
      }
    }
  }

  /**
   * Search for similar code chunks using cosine similarity
   * @param {Array<number>} queryEmbedding Query embedding vector
   * @param {Object} options Search options
   * @param {number} options.topK Number of results to return
   * @param {Object} options.filters Metadata filters
   * @returns {Promise<Object>} Search results with ids, distances, metadata
   */
  async search(queryEmbedding, options = {}) {
    const topK = options.topK || 10;
    const filters = options.filters || {};

    // Calculate cosine similarity for all embeddings
    const similarities = this.embeddings.map((embedding, idx) => {
      // Apply metadata filters
      if (Object.keys(filters).length > 0) {
        const meta = this.metadata[idx];
        for (const [key, value] of Object.entries(filters)) {
          if (meta[key] !== value) {
            return { idx, similarity: -1 }; // Exclude filtered items
          }
        }
      }

      const similarity = this._cosineSimilarity(queryEmbedding, embedding);
      return { idx, similarity };
    });

    // Filter out excluded items and sort by similarity (descending)
    const topResults = similarities
      .filter(s => s.similarity >= 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    // Format results to match ChromaDB query response format
    return {
      ids: [topResults.map(r => this.ids[r.idx])],
      distances: [topResults.map(r => 1 - r.similarity)], // Convert similarity to distance
      metadatas: [topResults.map(r => this.metadata[r.idx])],
      documents: [topResults.map(() => null)] // No documents stored
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   * @param {Array<number>} a First vector
   * @param {Array<number>} b Second vector
   * @returns {number} Cosine similarity (0 to 1)
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Delete all chunks from a specific file
   * @param {string} filePath File path to delete chunks for
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    // Find all indices matching filePath
    const indicesToDelete = [];
    for (let i = 0; i < this.metadata.length; i++) {
      if (this.metadata[i].filePath === filePath) {
        indicesToDelete.push(i);
      }
    }

    // Delete in reverse order to maintain indices
    for (let i = indicesToDelete.length - 1; i >= 0; i--) {
      const idx = indicesToDelete[i];
      this.ids.splice(idx, 1);
      this.embeddings.splice(idx, 1);
      this.metadata.splice(idx, 1);
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    // Count unique file paths
    const filePaths = new Set();
    const languages = new Set();

    for (const meta of this.metadata) {
      if (meta.filePath) filePaths.add(meta.filePath);
      if (meta.language) languages.add(meta.language);
    }

    return {
      count: this.embeddings.length,
      fileCount: filePaths.size,
      languages: Array.from(languages),
      collectionName: this.collectionName,
      dbPath: this.dbPath
    };
  }

  /**
   * Get metadata for a specific chunk
   * @param {string} id Chunk ID
   * @returns {Promise<Object|null>} Metadata or null if not found
   */
  async getMetadata(id) {
    const idx = this.ids.indexOf(id);
    return idx >= 0 ? this.metadata[idx] : null;
  }

  /**
   * Clear entire index
   * @returns {Promise<void>}
   */
  async clear() {
    this.ids = [];
    this.embeddings = [];
    this.metadata = [];
  }

  /**
   * Close database connection (cleanup)
   * @returns {Promise<void>}
   */
  async close() {
    // Cleanup in-memory storage
    await this.clear();
  }
}

module.exports = VectorDatabase;
