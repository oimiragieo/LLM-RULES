/**
 * Embedding Generator - Local Embeddings via transformers.js
 *
 * @module code-indexing/embedding-generator
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Default configuration for embedding generation
const DEFAULT_OPTIONS = {
  model: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  batchSize: 100,
  cacheEnabled: true,
  cachePath: '.claude/data/code-index/embedding-cache.json'
};

/**
 * Generates semantic embeddings for code chunks using local ML models
 *
 * Features:
 * - Local embeddings (no API calls, privacy-preserving)
 * - 384-dimensional vectors (all-MiniLM-L6-v2)
 * - Batch processing with progress callbacks
 * - MD5-based caching for performance
 * - Automatic model downloading (~25MB first run)
 */
class EmbeddingGenerator {
  /**
   * Create embedding generator
   * @param {Object} options - Configuration options
   * @param {string} options.model - HuggingFace model name
   * @param {number} options.dimensions - Embedding dimensions
   * @param {number} options.batchSize - Batch size for processing
   * @param {boolean} options.cacheEnabled - Enable embedding cache
   * @param {string} options.cachePath - Cache file path
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pipeline = null;
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the embedding pipeline
   * Downloads model on first run (~25MB)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    const { pipeline } = await import('@xenova/transformers');

    console.log(`Loading embedding model: ${this.options.model}...`);
    this.pipeline = await pipeline('feature-extraction', this.options.model, {
      quantized: true // Use quantized model for faster inference
    });

    this.initialized = true;
    console.log('Embedding model loaded successfully');

    // Load cache if enabled
    if (this.options.cacheEnabled) {
      await this.loadCache();
    }
  }

  /**
   * Check if generator is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get embedding dimensions
   * @returns {number}
   */
  getDimensions() {
    return this.options.dimensions;
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, useCache = true) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache
    if (useCache && this.options.cacheEnabled) {
      const cached = this.getFromCache(text);
      if (cached) return cached;
    }

    // Generate embedding
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to array
    const embedding = Array.from(output.data);

    // Cache result
    if (useCache && this.options.cacheEnabled) {
      this.addToCache(text, embedding);
    }

    return embedding;
  }

  /**
   * Batch generate embeddings
   * @param {string[]} texts - Array of texts
   * @param {Function} [onProgress] - Progress callback (index, total)
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async batchEmbed(texts, onProgress = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const embeddings = [];
    const batchSize = this.options.batchSize;
    const total = texts.length;

    for (let i = 0; i < total; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, total));
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embed(text))
      );
      embeddings.push(...batchEmbeddings);

      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }
    }

    return embeddings;
  }

  /**
   * Embed code chunks with metadata
   * @param {CodeChunk[]} chunks - Array of code chunks
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<{chunk: CodeChunk, embedding: number[]}[]>}
   */
  async embedChunks(chunks, onProgress = null) {
    const texts = chunks.map(chunk => this.prepareForEmbedding(chunk));
    const embeddings = await this.batchEmbed(texts, onProgress);

    return chunks.map((chunk, i) => ({
      chunk,
      embedding: embeddings[i]
    }));
  }

  /**
   * Prepare chunk content for embedding
   * Adds context prefix for better code embeddings
   * @param {CodeChunk} chunk - Code chunk
   * @returns {string} Prepared text
   */
  prepareForEmbedding(chunk) {
    const prefix = `[${chunk.language}] [${chunk.type}]`;
    const signature = chunk.signature ? `Signature: ${chunk.signature}\n` : '';
    const name = chunk.name ? `Name: ${chunk.name}\n` : '';

    return `${prefix}\n${name}${signature}Code:\n${chunk.content}`;
  }

  /**
   * Generate cache key for text
   * @param {string} text - Text to hash
   * @returns {string} Cache key
   */
  getCacheKey(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Get embedding from cache
   * @param {string} text - Original text
   * @returns {number[]|null} Cached embedding or null
   */
  getFromCache(text) {
    const key = this.getCacheKey(text);
    return this.cache.get(key) || null;
  }

  /**
   * Add embedding to cache
   * @param {string} text - Original text
   * @param {number[]} embedding - Embedding vector
   */
  addToCache(text, embedding) {
    const key = this.getCacheKey(text);
    this.cache.set(key, embedding);
  }

  /**
   * Save cache to disk
   * @returns {Promise<void>}
   */
  async saveCache() {
    if (!this.options.cacheEnabled) return;

    const cacheDir = path.dirname(this.options.cachePath);
    await fs.mkdir(cacheDir, { recursive: true });

    const cacheData = Object.fromEntries(this.cache);
    await fs.writeFile(
      this.options.cachePath,
      JSON.stringify(cacheData),
      'utf-8'
    );
  }

  /**
   * Load cache from disk
   * @returns {Promise<void>}
   */
  async loadCache() {
    if (!this.options.cacheEnabled) return;

    try {
      const data = await fs.readFile(this.options.cachePath, 'utf-8');
      const cacheData = JSON.parse(data);
      this.cache = new Map(Object.entries(cacheData));
      console.log(`Loaded ${this.cache.size} cached embeddings`);
    } catch (_error) {
      // Cache file doesn't exist or is invalid
      this.cache = new Map();
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.options.cacheEnabled,
      path: this.options.cachePath
    };
  }
}

module.exports = { EmbeddingGenerator, DEFAULT_OPTIONS };
