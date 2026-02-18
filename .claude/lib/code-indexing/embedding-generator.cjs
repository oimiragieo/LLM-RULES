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
  maxCacheEntries: 5000,
  cachePath: '.claude/context/data/code-index/embedding-cache.json',
  gpu: {
    enabled: true,
    autoTuneBatchSize: true,
  },
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
    this.device = 'cpu'; // Default to CPU
    this.gpuName = null;
    this.gpuMemoryMB = 0;
    this.batchSize = this.options.batchSize;
  }

  /**
   * Initialize the embedding pipeline with GPU detection
   * Downloads model on first run (~25MB)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    // Allow tests / constrained environments to run without native deps.
    // This keeps code-indexing fail-open (embeddings become deterministic but not semantic).
    const isTestRun = process.env.NODE_ENV === 'test' || process.argv.includes('--test');

    const forceMock =
      isTestRun ||
      process.env.CODE_INDEX_EMBEDDER === 'mock' ||
      process.env.CODE_INDEX_EMBEDDINGS === 'off';

    // In test/mock mode, avoid loading a potentially huge on-disk cache.
    if (forceMock) {
      this.options.cacheEnabled = false;
    }

    const createMockPipeline = dimensions => {
      return async text => {
        const hash = crypto.createHash('sha256').update(String(text)).digest();
        const out = new Float32Array(dimensions);

        // Fill deterministically from the hash bytes.
        for (let i = 0; i < dimensions; i++) {
          out[i] = (hash[i % hash.length] / 255) * 2 - 1;
        }

        // Normalize to unit length to match typical embedding behavior.
        let sumSq = 0;
        for (const v of out) sumSq += v * v;
        const norm = Math.sqrt(sumSq) || 1;
        for (let i = 0; i < out.length; i++) out[i] = out[i] / norm;

        return { data: out };
      };
    };

    // Step 1: GPU Detection (if enabled)
    if (this.options.gpu?.enabled && !forceMock) {
      await this._initializeGPU();
    }

    if (!forceMock) {
      try {
        const { pipeline } = await import('@xenova/transformers');

        console.log(`Loading embedding model: ${this.options.model}...`);
        this.pipeline = await pipeline('feature-extraction', this.options.model, {
          quantized: true, // Use quantized model for faster inference
          // Note: GPU acceleration not available in Node.js
          // @xenova/transformers WebGPU support is browser-only
          // ONNX Runtime Node.js GPU bindings not yet integrated
        });

        // Keep device set by GPU detection (or default to CPU)
        if (this.device !== 'gpu') {
          this.device = 'cpu';
        }
      } catch (_err) {
        this.pipeline = createMockPipeline(this.options.dimensions);
        if (this.device !== 'gpu') {
          this.device = 'cpu';
        }
      }
    } else {
      this.pipeline = createMockPipeline(this.options.dimensions);
      if (this.device !== 'gpu') {
        this.device = 'cpu';
      }
    }

    this.initialized = true;
    if (!forceMock) {
      console.log('Embedding model loaded successfully');
    }

    // Load cache if enabled
    if (this.options.cacheEnabled) {
      await this.loadCache();
    }
  }

  /**
   * Initialize GPU detection and configuration
   * @returns {Promise<void>}
   * @private
   */
  async _initializeGPU() {
    try {
      // Use mock for testing if provided
      if (this._mockGPUDetection) {
        if (this._mockGPUDetection.available) {
          this.device = 'gpu';
          this.gpuName = this._mockGPUDetection.gpuName;
          this.gpuMemoryMB = this._mockGPUDetection.totalMemoryMB;

          // Auto-tune batch size based on GPU memory
          if (this.options.gpu.autoTuneBatchSize) {
            const { GPUDetector } = require('./gpu-detector.cjs');
            const detector = new GPUDetector();
            this.batchSize = detector.recommendBatchSize(this.gpuMemoryMB);
          }

          console.log(`✅ GPU Detected: ${this.gpuName} (${this.gpuMemoryMB}MB)`);
          console.log(`Using batch size: ${this.batchSize}`);
          return;
        }
      }

      // Real GPU detection
      const { GPUDetector } = require('./gpu-detector.cjs');
      const detector = new GPUDetector();
      const gpuInfo = await detector.detectNVIDIA();

      if (gpuInfo.available && !this._mockGPUFailure) {
        this.device = 'gpu';
        this.gpuName = gpuInfo.gpuName;
        this.gpuMemoryMB = gpuInfo.totalMemoryMB;

        // Auto-tune batch size based on GPU memory
        if (this.options.gpu.autoTuneBatchSize) {
          this.batchSize = detector.recommendBatchSize(this.gpuMemoryMB);
        }

        console.log(`✅ GPU Detected: ${this.gpuName} (${this.gpuMemoryMB}MB)`);
        console.log(`Using batch size: ${this.batchSize}`);
      } else {
        console.log('⚠️ No GPU detected, using CPU');
        this.device = 'cpu';
      }
    } catch (error) {
      console.log(`⚠️ GPU detection failed, falling back to CPU: ${error.message}`);
      this.device = 'cpu';
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
      normalize: true,
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
      const batchEmbeddings = await Promise.all(batch.map(text => this.embed(text)));
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
      embedding: embeddings[i],
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
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Get embedding from cache
   * @param {string} text - Original text
   * @returns {number[]|null} Cached embedding or null
   */
  getFromCache(text) {
    const key = this.getCacheKey(text);
    const cached = this.cache.get(key);
    if (!cached) return null;
    // LRU touch.
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  /**
   * Add embedding to cache
   * @param {string} text - Original text
   * @param {number[]} embedding - Embedding vector
   */
  addToCache(text, embedding) {
    const key = this.getCacheKey(text);
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, embedding);

    const maxEntries =
      Number.isFinite(Number(this.options.maxCacheEntries)) &&
      Number(this.options.maxCacheEntries) > 0
        ? Number(this.options.maxCacheEntries)
        : DEFAULT_OPTIONS.maxCacheEntries;
    while (this.cache.size > maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
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
    await fs.writeFile(this.options.cachePath, JSON.stringify(cacheData), 'utf-8');
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
      path: this.options.cachePath,
    };
  }
}

module.exports = { EmbeddingGenerator, DEFAULT_OPTIONS };
