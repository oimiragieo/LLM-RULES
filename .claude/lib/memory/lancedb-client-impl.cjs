/* eslint-disable max-lines */
/**
 * LanceDB Client for Memory Vector Storage
 *
 * Replaces ChromaDB with an embedded, serverless vector database.
 * Part of Core Remediation Plan (P0 - Task #21).
 *
 * Features:
 * - In-process execution (no Docker/server required)
 * - Native Node.js bindings via @lancedb/lancedb
 * - Local embedding generation via @xenova/transformers
 */

const path = require('path');
const fs = require('fs');
const { createLogger } = require('../utils/logger.cjs');
const {
  TYPED_METADATA_FIELDS,
  buildLegacyMetadataWhereClause,
  buildTypedWhereClause,
  configureCudaPath,
  distanceToSimilarity,
  shouldUseTypedFilters,
  stableTestEmbedding,
  toSqlLiteral,
  toTypedMetadataColumns,
} = require('./lancedb-client-helpers.cjs');

const logger = createLogger('lancedb-client');
configureCudaPath();

/**
 * @typedef {Object} EmbeddingStatus
 * @property {'unknown'|'ready'|'unavailable'|'disabled'} status
 * @property {string|null} mode
 * @property {string|null} reason
 */

/**
 * @typedef {Object} VectorStoreConfig
 * @property {string} [persistDirectory]
 * @property {string} [collectionName]
 * @property {string} [embeddingMode]
 * @property {string} [embeddingModel]
 */

// Lazy load transformers
let pipeline;
let lancedbModule;

async function getLanceDb() {
  if (!lancedbModule) {
    // @lancedb/lancedb may be ESM depending on version; use dynamic import for CJS compatibility.
    lancedbModule = await import('@lancedb/lancedb');
  }
  return lancedbModule;
}

/**
 * MemoryVectorStore - LanceDB implementation
 */
class MemoryVectorStore {
  /**
   * Create a new MemoryVectorStore instance
   *
   * @param {Object} config - Configuration options
   * @param {string} [config.persistDirectory] - Directory for persistent storage
   * @param {string} [config.collectionName] - Name of the table (default: agent_memory)
   */
  constructor(config = {}) {
    this.config = {
      persistDirectory:
        config.persistDirectory || process.env.LANCEDB_URI || '.claude/context/data/lancedb',
      collectionName: config.collectionName || process.env.LANCEDB_TABLE || 'agent_memory',
      embeddingMode: config.embeddingMode || process.env.LANCEDB_EMBEDDING_MODE || 'transformers',
      embeddingModel:
        config.embeddingModel || process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      embedBatchSize: config.embedBatchSize,
      gpu: config.gpu !== undefined ? config.gpu : { enabled: true, autoTuneBatchSize: true },
    };

    this.db = null;
    this.table = null;
    this.embedder = null;
    this._fastembedModel = null;
    this.isInitialized = false;
    this._mockMode = false;
    this._tableVectorDim = null;
    this._shared = false;
    this._embeddingStatus = {
      status: 'unknown',
      mode: this.config.embeddingMode,
      reason: null,
    };
    this._typedMetadataSupported = null;
    // GPU detection state
    this.device = 'cpu'; // Default to CPU
    this.gpuDetected = false;
    this.gpuName = null;
    this.gpuMemoryMB = 0;
  }

  static _sharedStores = new Map();

  static _makeKey(config) {
    const persistDirectory =
      config.persistDirectory || process.env.LANCEDB_URI || '.claude/context/data/lancedb';
    const collectionName = config.collectionName || process.env.LANCEDB_TABLE || 'agent_memory';
    const embeddingMode =
      config.embeddingMode || process.env.LANCEDB_EMBEDDING_MODE || 'transformers';
    const embeddingModel =
      config.embeddingModel || process.env.LANCEDB_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    return [persistDirectory, collectionName, embeddingMode, embeddingModel].join('|');
  }

  static getSharedStore(config = {}) {
    const key = MemoryVectorStore._makeKey(config);
    if (MemoryVectorStore._sharedStores.has(key)) {
      return MemoryVectorStore._sharedStores.get(key);
    }
    const store = new MemoryVectorStore(config);
    store._shared = true;
    MemoryVectorStore._sharedStores.set(key, store);
    return store;
  }

  static clearSharedStores() {
    for (const [, store] of MemoryVectorStore._sharedStores) {
      store._shared = false;
      try {
        if (typeof store.close === 'function') store.close();
      } catch (_e) {
        /* ignore */
      }
    }
    MemoryVectorStore._sharedStores.clear();
  }

  /**
   * Initialize GPU detection and configuration
   * @returns {Promise<void>}
   * @private
   */
  async _initializeGPU() {
    try {
      const { GPUDetector } = require('../code-indexing/gpu-detector.cjs');
      const detector = new GPUDetector();
      const gpuInfo = await detector.detectNVIDIA();

      if (gpuInfo.available) {
        this.device = 'gpu';
        this.gpuDetected = true;
        this.gpuName = gpuInfo.gpuName;
        this.gpuMemoryMB = gpuInfo.totalMemoryMB;

        // Auto-tune batch size based on GPU memory
        if (this.config.gpu.autoTuneBatchSize && !this.config.embedBatchSize) {
          this.config.embedBatchSize = detector.recommendBatchSize(this.gpuMemoryMB);
        }

        logger.info(`GPU detected: ${this.gpuName} (${this.gpuMemoryMB}MB)`, {
          batchSize: this.config.embedBatchSize,
        });
      } else {
        logger.info('No GPU detected, using CPU for embeddings');
        this.device = 'cpu';
      }
    } catch (error) {
      logger.warn(`GPU detection failed, falling back to CPU: ${error.message}`);
      this.device = 'cpu';
    }
  }

  /**
   * Initialize the LanceDB connection and embedding model
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 1. Initialize DB Connection
      const dbPath = path.resolve(this.config.persistDirectory);
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      const lancedb = await getLanceDb();
      this.db = await lancedb.connect(dbPath);

      // 2. GPU Detection (if enabled)
      if (
        this.config.gpu?.enabled &&
        (this.config.embeddingMode === 'transformers' ||
          this.config.embeddingMode === 'fastembed' ||
          this.config.embeddingMode === 'test')
      ) {
        await this._initializeGPU();
      }

      // 3. Initialize Embedding Model (Local)
      if (this.config.embeddingMode === 'transformers') {
        if (!pipeline) {
          // @xenova/transformers is an ESM module in recent versions.
          // We use dynamic import and property access to get the pipeline function safely.
          try {
            // @xenova/transformers is an ESM module in recent versions.
            // We use dynamic import and property access to get the pipeline function safely.
            const transformerModule = await import('@xenova/transformers');
            pipeline = transformerModule.pipeline;

            // Use efficient MiniLM model (384 dimensions)
            // 'feature-extraction' allows raw vector output
            this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
            this._embeddingStatus = { status: 'ready', mode: 'transformers', reason: null };
            this._mockMode = false;
          } catch (e) {
            logger.warn(
              'Failed to load local embedding model (likely missing dependencies like "sharp"). Disabling semantic embeddings.',
              { error: e.message }
            );

            // Fail-closed: no mock embeddings
            this.embedder = null;
            this._mockMode = true;
            this._embeddingStatus = {
              status: 'unavailable',
              mode: 'transformers',
              reason: e.message,
            };
          }
        } else {
          // Already loaded pipeline, just ensure embedder is ready
          try {
            this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
            this._embeddingStatus = { status: 'ready', mode: 'transformers', reason: null };
            this._mockMode = false;
          } catch (e) {
            logger.warn(
              'Failed to initialize embedding model on reuse. Disabling semantic embeddings.',
              { error: e.message }
            );
            this.embedder = null;
            this._mockMode = true;
            this._embeddingStatus = {
              status: 'unavailable',
              mode: 'transformers',
              reason: e.message,
            };
          }
        }
      } else if (this.config.embeddingMode === 'test') {
        // Deterministic, fast embedding for tests (no network/model download)
        this.embedder = null;
        this._embeddingStatus = { status: 'ready', mode: 'test', reason: null };
        this._mockMode = true;
      } else if (this.config.embeddingMode === 'fastembed') {
        this.embedder = null;
        // When subprocess embedding is active (default for bulk indexing),
        // skip loading fastembed in the main process entirely. The subprocess
        // worker handles model loading in its own isolated memory space.
        // This avoids the 300MB+ ONNX native memory allocation in main process.
        const useSubprocess = process.env.EMBED_SUBPROCESS !== 'off';
        if (useSubprocess) {
          this._fastembedModel = null;
          this._embeddingStatus = { status: 'ready', mode: 'fastembed', reason: null };
          this._mockMode = false;
          logger.info('FastEmbed will use subprocess isolation (ONNX memory leak workaround)');
        } else {
          try {
            const fastembed = require('fastembed');

            // Initialize with GPU support if available
            const initOptions = {
              model: fastembed.EmbeddingModel.BGESmallENV15,
              // FastEmbed handles execution providers automatically
              // GPU will be used if CUDA is available, otherwise falls back to CPU
            };

            if (this.device === 'gpu' && this.gpuDetected) {
              logger.info('FastEmbed initializing with GPU (CUDA) support');
            } else {
              logger.info('FastEmbed initializing with CPU');
            }

            this._fastembedModel = await fastembed.FlagEmbedding.init(initOptions);
            this._embeddingStatus = { status: 'ready', mode: 'fastembed', reason: null };
            this._mockMode = false;
            logger.info(
              `FastEmbed initialized successfully (${this.device === 'gpu' ? 'GPU' : 'CPU'} mode)`
            );
          } catch (e) {
            // Try CPU fallback if GPU initialization fails
            logger.warn(`FastEmbed initialization failed: ${e.message}`);

            if (this.device === 'gpu') {
              logger.info('Retrying FastEmbed initialization with CPU fallback...');
              try {
                const fastembed = require('fastembed');
                this._fastembedModel = await fastembed.FlagEmbedding.init({
                  model: fastembed.EmbeddingModel.BGESmallENV15,
                });
                this._embeddingStatus = { status: 'ready', mode: 'fastembed', reason: null };
                this._mockMode = false;
                this.device = 'cpu'; // Update device after fallback
                logger.info('FastEmbed initialized with CPU fallback');
              } catch (cpuErr) {
                logger.warn('FastEmbed CPU fallback also failed', { error: cpuErr.message });
                this._fastembedModel = null;
                this._embeddingStatus = {
                  status: 'unavailable',
                  mode: 'fastembed',
                  reason: cpuErr.message || 'Install optional dependency: pnpm add fastembed',
                };
              }
            } else {
              this._fastembedModel = null;
              this._embeddingStatus = {
                status: 'unavailable',
                mode: 'fastembed',
                reason: e.message || 'Install optional dependency: pnpm add fastembed',
              };
            }
          }
        } // end !useSubprocess
      } else if (this.config.embeddingMode === 'off') {
        this.embedder = null;
        this._embeddingStatus = {
          status: 'disabled',
          mode: 'off',
          reason: 'LANCEDB_EMBEDDING_MODE=off',
        };
        this._mockMode = false;
      } else {
        throw new Error(`Unknown embeddingMode: ${this.config.embeddingMode}`);
      }

      // 3. Open Table if exists
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.config.collectionName)) {
        this.table = await this.db.openTable(this.config.collectionName);
      }
      // If table doesn't exist, we wait for first add() to create it with schema inference

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize LanceDB: ${error.message}`);
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text
   * @returns {Promise<Array<number>>} Vector
   */
  async generateEmbedding(text) {
    if (this.config.embeddingMode === 'off') {
      throw new Error('Embeddings disabled (LANCEDB_EMBEDDING_MODE=off)');
    }

    if (this.config.embeddingMode === 'test') {
      return stableTestEmbedding(text, 384);
    }

    if (this._embeddingStatus?.status === 'unavailable') {
      throw new Error(
        `Embeddings unavailable${this._embeddingStatus.reason ? `: ${this._embeddingStatus.reason}` : ''}`
      );
    }

    if (this.config.embeddingMode === 'fastembed' && this._fastembedModel) {
      const gen = this._fastembedModel.embed([text], 1);
      for await (const batch of gen) {
        return Array.from(batch[0] || []);
      }
      return [];
    }

    // Subprocess embedding path supports single-query generation too.
    // This keeps behavior consistent when fastembed/transformers is configured
    // for subprocess isolation and no in-process model is loaded.
    const useSubprocess =
      process.env.EMBED_SUBPROCESS !== 'off' &&
      (this.config.embeddingMode === 'fastembed' || this.config.embeddingMode === 'transformers');
    if (useSubprocess) {
      const vectors = await this._embedViaSubprocess([text], this.config.embedBatchSize || 32);
      return Array.isArray(vectors) && Array.isArray(vectors[0]) ? vectors[0] : [];
    }

    if (!this.embedder) throw new Error('Embedder not initialized');

    // Real Transformers pipeline
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Generate embeddings via an isolated subprocess.
   *
   * Works around ONNX Runtime's native memory arena leak
   * (microsoft/onnxruntime#25325, qdrant/fastembed#570) by running
   * the embedding model in a child process. After maxCallsBeforeRestart
   * batches the child is killed and a fresh one spawned, reclaiming all
   * leaked native memory.
   *
   * @param {string[]} texts
   * @param {number} batchSize
   * @returns {Promise<number[][]>}
   * @private
   */
  async _embedViaSubprocessWorker(worker, texts, batchSize) {
    if (!worker.proc || worker.proc.killed || !worker.proc.stdin?.writable) {
      await this._initSingleWorker(worker);
    }

    worker.callCount += 1;
    if (worker.callCount > worker.maxCalls) {
      await this._killSingleWorker(worker);
      await this._initSingleWorker(worker);
      worker.callCount = 1;
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      const cleanup = () => {
        worker.proc.stdout.removeListener('data', onData);
        worker.proc.removeListener('error', onError);
        worker.proc.removeListener('exit', onExit);
      };

      const onError = err => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(err);
      };

      const onExit = code => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error(`Embed subprocess exited unexpectedly (code ${code})`));
      };

      const onData = chunk => {
        worker.stdoutBuf = (worker.stdoutBuf || '') + chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) continue;
            if (resolved) return;
            resolved = true;
            cleanup();
            if (msg.ok && msg.vectors) {
              resolve(msg.vectors);
            } else {
              reject(new Error(msg.error || 'Embed subprocess returned error'));
            }
          } catch (e) {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(e);
          }
          return;
        }
      };

      worker.proc.stdout.on('data', onData);
      worker.proc.on('error', onError);
      worker.proc.on('exit', onExit);

      try {
        worker.proc.stdin.write(JSON.stringify({ action: 'embed', texts, batchSize }) + '\n');
      } catch (e) {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(e);
        }
      }
    });
  }

  async _spawnEmbedWorkers() {
    if (this._embedWorkers && this._embedWorkers.length > 0) return;

    let gpuCount = 1;
    try {
      const { GPUDetector } = require('../code-indexing/gpu-detector.cjs');
      const gpuInfo = await new GPUDetector().detectNVIDIA();
      if (gpuInfo && gpuInfo.gpuCount > 1) gpuCount = gpuInfo.gpuCount;
    } catch (_e) {
      /* ignore */
    }

    const count = process.env.EMBED_SUBPROCESS_MAX_WORKERS
      ? parseInt(process.env.EMBED_SUBPROCESS_MAX_WORKERS, 10)
      : gpuCount;

    this._embedWorkers = Array.from({ length: count }).map((_, i) => ({
      id: i,
      proc: null,
      stdoutBuf: '',
      callCount: 0,
      maxCalls: 50
    }));

    await Promise.all(this._embedWorkers.map(w => this._initSingleWorker(w)));
  }

  async _initSingleWorker(worker) {
    const { spawn } = require('child_process');
    const workerPath = require('path').resolve(
      __dirname,
      '..',
      'code-indexing',
      'embed-subprocess.cjs'
    );

    worker.stdoutBuf = '';
    worker.callCount = 0;

    // Distribute workers across GPUs safely
    const env = { ...process.env };
    if (this.config.embeddingMode !== 'transformers') {
      env.CUDA_VISIBLE_DEVICES = worker.id.toString();
    }

    worker.proc = spawn(process.execPath, [workerPath], {
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: false,
      windowsHide: true,
    });

    worker.proc.stdout.setEncoding('utf-8');

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Embed worker start timeout')), 60000);
      const onData = chunk => {
        worker.stdoutBuf += chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) {
              clearTimeout(timeout);
              worker.proc.stdout.removeListener('data', onData);
              resolve();
              return;
            }
          } catch (_e) {
            /* ignore */
          }
        }
      };
      worker.proc.stdout.on('data', onData);
      worker.proc.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const initResult = await new Promise((resolve, reject) => {
      const onData = chunk => {
        worker.stdoutBuf += chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            worker.proc.stdout.removeListener('data', onData);
            if (msg.ok) {
              resolve(msg);
            } else {
              reject(new Error(msg.error || 'Init failed'));
            }
          } catch (e) {
            worker.proc.stdout.removeListener('data', onData);
            reject(e);
          }
          return;
        }
      };
      worker.proc.stdout.on('data', onData);
      worker.proc.stdin.write(
        JSON.stringify({
          action: 'init',
          mode: this.config.embeddingMode,
          model: this.config.embeddingModel,
        }) + '\n'
      );
    });

    logger.info(`Embed subprocess worker ${worker.id} started`, {
      mode: this.config.embeddingMode,
      device: initResult?.device || 'unknown',
      gpuName: initResult?.gpuName || null,
    });
  }

  async _killSingleWorker(worker) {
    if (worker.proc && !worker.proc.killed) {
      try {
        worker.proc.stdin.end();
        worker.proc.kill();
      } catch (_e) {
        /* ignore */
      }
      await new Promise(resolve => {
        if (worker.proc.killed) return resolve();
        worker.proc.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
      logger.info(`Embed subprocess worker ${worker.id} restarted (ONNX memory reclaim)`);
    }
    worker.proc = null;
    worker.stdoutBuf = '';
  }

  async _killEmbedWorker() {
    if (!this._embedWorkers) return;
    await Promise.all(this._embedWorkers.map(w => this._killSingleWorker(w)));
    this._embedWorkers = null;
  }

  /**
   * Generate embeddings for multiple texts in batches.
   *
   * @param {string[]} texts
   * @param {number} [batchSize=32]
   * @param {{ onBatchComplete?: (batchDone: number, totalBatches: number) => void }} [progressOptions]
   * @returns {Promise<Array<number[]>>} Array of vectors in same order as texts
   */
  async generateEmbeddingsBatch(texts, batchSize = 32, progressOptions) {
    if (!texts || texts.length === 0) return [];
    if (this.config.embeddingMode === 'test') {
      return texts.map(t => stableTestEmbedding(t, 384));
    }
    if (this.config.embeddingMode === 'off' || this._embeddingStatus?.status === 'unavailable') {
      throw new Error('Embedder not available for batch');
    }

    const useSubprocess =
      process.env.EMBED_SUBPROCESS !== 'off' &&
      (this.config.embeddingMode === 'fastembed' || this.config.embeddingMode === 'transformers');

    if (useSubprocess) {
      await this._spawnEmbedWorkers();

      const batches = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        batches.push(texts.slice(i, i + batchSize));
      }

      const results = new Array(batches.length);
      const totalBatches = batches.length;
      let batchDone = 0;

      // Group batches by worker index round-robin
      const workerTasks = this._embedWorkers.map(() => []);
      batches.forEach((batch, batchIdx) => {
        workerTasks[batchIdx % this._embedWorkers.length].push({ batch, batchIdx });
      });

      await Promise.all(
        this._embedWorkers.map(async (worker, wIdx) => {
          for (const { batch, batchIdx } of workerTasks[wIdx]) {
            const vectors = await this._embedViaSubprocessWorker(worker, batch, batchSize);
            results[batchIdx] = vectors;
            batchDone += 1;
            if (progressOptions?.onBatchComplete) {
              progressOptions.onBatchComplete(batchDone, totalBatches);
            }
          }
        })
      );

      return results.flat();
    }

    // In-process fallback (for single queries / search, not bulk indexing)
    const totalBatches = Math.ceil(texts.length / batchSize) || 1;
    if (this.config.embeddingMode === 'fastembed' && this._fastembedModel) {
      return this._fastembedBatch(texts, batchSize, progressOptions, totalBatches);
    }
    if (!this.embedder) throw new Error('Embedder not initialized');
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
      const batchVectors = await this._embedBatch(batch);
      results.push(...batchVectors);
      if (progressOptions?.onBatchComplete) {
        const batchDone = Math.min(totalBatches, Math.floor((i + batch.length) / batchSize));
        progressOptions.onBatchComplete(batchDone, totalBatches);
      }
    }
    return results;
  }

  /**
   * FastEmbed batch: collect all batches from async generator.
   * @param {string[]} texts
   * @param {number} batchSize
   * @param {{ onBatchComplete?: (batchDone: number, totalBatches: number) => void }} [progressOptions]
   * @param {number} [totalBatches]
   * @returns {Promise<Array<number[]>>}
   * @private
   */
  async _fastembedBatch(texts, batchSize, progressOptions, totalBatches = 1) {
    const results = [];
    let batchDone = 0;
    const gen = this._fastembedModel.embed(texts, batchSize);
    for await (const batch of gen) {
      for (const row of batch) {
        // Handle both regular arrays and typed arrays (Float32Array, etc.)
        if (row && typeof row === 'object' && (Array.isArray(row) || row.length !== undefined)) {
          results.push(Array.from(row));
        } else {
          // Log unexpected types for debugging
          logger.warn(`Unexpected embedding type: ${typeof row}, value:`, row);
          results.push([]);
        }
      }
      batchDone += 1;
      if (progressOptions?.onBatchComplete)
        progressOptions.onBatchComplete(batchDone, totalBatches);
    }
    return results;
  }

  /**
   * One batch: try pipeline array input (single forward pass), else fall back to parallel single-text calls.
   * @param {string[]} batch - Non-empty array of texts
   * @returns {Promise<Array<number[]>>} Vectors in same order as batch
   * @private
   */
  async _embedBatch(batch) {
    if (batch.length === 1) {
      const vec = await this.generateEmbedding(batch[0]);
      return [vec];
    }
    try {
      const output = await this.embedder(batch, { pooling: 'mean', normalize: true });
      if (!output || typeof output.data === 'undefined')
        throw new Error('Unexpected pipeline output');
      const data = output.data;
      const dims = output.dims;
      if (!Array.isArray(dims) || dims.length < 2) throw new Error('Expected [batchSize, dim]');
      const [rows, dim] = dims;
      if (rows !== batch.length) throw new Error('Batch size mismatch');
      const vecSize = dim;
      const vectors = [];
      for (let r = 0; r < rows; r++) {
        const start = r * vecSize;
        vectors.push(Array.from(data.slice(start, start + vecSize)));
      }
      return vectors;
    } catch (err) {
      logger.debug(
        'Pipeline batch input failed, using parallel single-text fallback:',
        err?.message
      );
      return Promise.all(batch.map(t => this.generateEmbedding(t)));
    }
  }

  async getTableVectorDimension() {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return null;
    if (Number.isFinite(this._tableVectorDim)) {
      return this._tableVectorDim;
    }
    try {
      const schema = await this.table.schema();
      const field = schema?.fields?.find(f => f.name === 'vector');
      const listSize = field?.type?.listSize;
      if (Number.isFinite(listSize)) {
        this._tableVectorDim = listSize;
        return listSize;
      }
    } catch (_e) {
      // best-effort
    }
    return null;
  }

  async getEmbeddingDimension() {
    if (this.config.embeddingMode === 'off') return null;
    if (this.config.embeddingMode === 'test') return 384;
    if (this.config.embeddingMode === 'fastembed') return this._fastembedModel ? 384 : null;
    if (this._embeddingStatus?.status === 'unavailable') return null;
    if (!this.embedder) return null;
    const vec = await this.generateEmbedding('dimension_check');
    return Array.isArray(vec) ? vec.length : null;
  }

  _buildDimensionMismatchStatus(expectedDimension, actualDimension, context = 'vector') {
    const reason =
      `embedding dimension mismatch (table ${expectedDimension} vs ${context} ${actualDimension}). ` +
      'Re-indexing Required (pnpm run memory:reindex).';
    return {
      status: 'reindex_required',
      reason,
      expectedDimension,
      actualDimension,
    };
  }

  async validateDimensions(vector, context = 'vector') {
    if (!this.isInitialized) await this.initialize();
    const expectedDimension = await this.getTableVectorDimension();
    const actualDimension = Array.isArray(vector) ? vector.length : null;

    if (!Number.isFinite(expectedDimension) || !Number.isFinite(actualDimension)) {
      return {
        status: 'unknown',
        reason: 'dimension_unavailable',
        expectedDimension: Number.isFinite(expectedDimension) ? expectedDimension : null,
        actualDimension: Number.isFinite(actualDimension) ? actualDimension : null,
      };
    }

    if (expectedDimension === actualDimension) {
      return {
        status: 'ok',
        reason: null,
        expectedDimension,
        actualDimension,
      };
    }

    const mismatch = this._buildDimensionMismatchStatus(
      expectedDimension,
      actualDimension,
      context
    );
    this._embeddingStatus = {
      status: 'unavailable',
      mode: this._embeddingStatus?.mode || this.config.embeddingMode,
      reason: mismatch.reason,
    };
    return mismatch;
  }

  async safeRebuild(_options = {}) {
    if (!this.isInitialized) await this.initialize();

    const archiveDir = path.join(
      path.resolve(this.config.persistDirectory),
      'archives',
      this.config.collectionName
    );
    fs.mkdirSync(archiveDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `rebuild-${stamp}.json`);

    let archivedRows = 0;
    let tableExisted = false;
    if (this.table) {
      tableExisted = true;
      try {
        if (typeof this.table.query === 'function') {
          const rows = await this.table.query().limit(1000000).toArray();
          archivedRows = Array.isArray(rows) ? rows.length : 0;
          fs.writeFileSync(
            archivePath,
            JSON.stringify(
              {
                archivedAt: new Date().toISOString(),
                collectionName: this.config.collectionName,
                tableVectorDimension: this._tableVectorDim,
                rowCount: archivedRows,
                rows,
              },
              null,
              2
            ),
            'utf8'
          );
        } else {
          fs.writeFileSync(
            archivePath,
            JSON.stringify(
              {
                archivedAt: new Date().toISOString(),
                collectionName: this.config.collectionName,
                tableVectorDimension: this._tableVectorDim,
                rowCount: 0,
                note: 'table.query() unavailable; metadata-only archive',
              },
              null,
              2
            ),
            'utf8'
          );
        }
      } catch (err) {
        fs.writeFileSync(
          archivePath,
          JSON.stringify(
            {
              archivedAt: new Date().toISOString(),
              collectionName: this.config.collectionName,
              tableVectorDimension: this._tableVectorDim,
              rowCount: archivedRows,
              archiveError: err?.message || String(err),
            },
            null,
            2
          ),
          'utf8'
        );
      }
    }

    await this.dropTable();
    this.table = null;
    this._tableVectorDim = null;

    return {
      status: 'rebuilt',
      tableExisted,
      archivedRows,
      archivePath,
    };
  }

  /**
   * Optimize the vector store by compacting files and cleaning up old versions.
   */
  async optimize() {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return { status: 'skipped', reason: 'no_table' };

    const results = {
      compacted: false,
      cleanedUp: false,
    };

    try {
      if (typeof this.table.compactFiles === 'function') {
        await this.table.compactFiles();
        results.compacted = true;
      }
      if (typeof this.table.cleanupOldVersions === 'function') {
        await this.table.cleanupOldVersions();
        results.cleanedUp = true;
      }
      return { status: 'optimized', ...results };
    } catch (err) {
      logger.warn(`Optimization failed: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  }

  async searchResilient(query, options = {}) {
    try {
      const results = await this.search(query, options);
      return { status: 'ok', results };
    } catch (error) {
      if (error?.code === 'LANCEDB_REINDEX_REQUIRED') {
        return { status: 'reindex_required', results: [], reason: error.message };
      }
      throw error;
    }
  }

  async listTables() {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) return [];
    return await this.db.tableNames();
  }

  async dropTable() {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) return false;
    const tableNames = await this.db.tableNames();
    if (!tableNames.includes(this.config.collectionName)) return false;

    if (typeof this.db.dropTable === 'function') {
      await this.db.dropTable(this.config.collectionName);
      this.table = null;
      this._tableVectorDim = null;
      return true;
    }

    // FIXED (Issue #1 - CRITICAL): Remove destructive fs.rmSync that deletes entire directory
    // When this is the only table, just mark it as dropped without deleting the DB directory.
    // This allows multi-table usage and prevents catastrophic data loss.
    this.table = null;
    this._tableVectorDim = null;
    logger.info(`Table "${this.config.collectionName}" marked as dropped (metadata cleared)`);
    return true;
  }

  /**
   * Add documents to the store (batch embedding: one forward pass per batch when pipeline supports it).
   *
   * OOM FIX: Embeds and writes in small micro-batches to prevent unbounded
   * memory growth from ONNX runtime native allocations. Previously, all
   * documents were embedded into a single vectors array before writing,
   * causing OOM at 32GB with only 30/2834 files.
   *
   * @param {Array<{id: string, text: string, metadata: Object}>} documents
   * @param {number} [embedBatchSize] - Default from config or 64
   * @param {{ onEmbedProgress?: (batchDone: number, totalBatches: number) => void }} [options]
   */
  async addDocuments(documents, embedBatchSize, options) {
    // Cap batch size to prevent ONNX runtime from accumulating too much
    // native memory per forward pass. GPU auto-tune can set this to 128
    // which is too large for sustained indexing.
    const maxSafeBatch = 16;
    const requestedBatch = Number.isFinite(embedBatchSize)
      ? embedBatchSize
      : this.config.embedBatchSize || 64;
    const batchSize = Math.min(requestedBatch, maxSafeBatch);

    if (!documents || documents.length === 0) return;
    if (!this.isInitialized) await this.initialize();

    const toEmbed = documents.filter(d => (d.text || d.content || '').trim());
    if (toEmbed.length === 0) return;

    const tableDim = await this.getTableVectorDimension();
    const totalBatches = Math.ceil(toEmbed.length / batchSize) || 1;
    let batchesDone = 0;

    // Process in micro-batches: embed a small batch, build rows, write to
    // LanceDB, then release references before the next batch. This keeps
    // peak memory proportional to batchSize instead of toEmbed.length.
    for (let start = 0; start < toEmbed.length; start += batchSize) {
      const slice = toEmbed.slice(start, start + batchSize);
      const texts = slice.map(d => d.text || d.content || '');

      // Embed just this micro-batch
      const vectors = await this.generateEmbeddingsBatch(texts, batchSize);

      // Build rows for this micro-batch
      const data = slice.map((doc, i) => {
        const vector = vectors[i];
        if (Number.isFinite(tableDim) && vector.length !== tableDim) {
          const mismatch = this._buildDimensionMismatchStatus(tableDim, vector.length, 'vector');
          this._embeddingStatus = {
            status: 'unavailable',
            mode: this._embeddingStatus?.mode || this.config.embeddingMode,
            reason: mismatch.reason,
          };
          const err = new Error(mismatch.reason);
          err.code = 'LANCEDB_REINDEX_REQUIRED';
          err.reindexRequired = true;
          err.status = mismatch;
          throw err;
        }
        const text = doc.text || doc.content || '';
        const metadataObj = typeof doc.metadata === 'object' && doc.metadata ? doc.metadata : {};
        const typedMetadata = this._toTypedMetadataColumns(metadataObj);
        return {
          id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          vector,
          text,
          metadata: JSON.stringify(metadataObj),
          ...typedMetadata,
          timestamp: Date.now(),
        };
      });

      // Write this micro-batch to LanceDB immediately
      if (!this.table) {
        try {
          this.table = await this.db.createTable(this.config.collectionName, data);
          const firstVector = data[0]?.vector;
          if (Array.isArray(firstVector)) {
            this._tableVectorDim = firstVector.length;
          }
          this._typedMetadataSupported = true;
        } catch (err) {
          if (err.message && err.message.includes('already exists')) {
            this.table = await this.db.openTable(this.config.collectionName);
            await this.table.add(data);
            const firstVector = data[0]?.vector;
            if (Array.isArray(firstVector)) {
              this._tableVectorDim = firstVector.length;
            }
          } else {
            throw err;
          }
        }
      } else {
        try {
          await this.table.add(data);
          if (this._typedMetadataSupported === null) {
            this._typedMetadataSupported = true;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (
            this._typedMetadataSupported === false ||
            !/schema|column|field|arrow/i.test(message)
          ) {
            throw err;
          }
          this._typedMetadataSupported = false;
          const legacyData = data.map(row => {
            const clone = { ...row };
            for (const col of Object.values(TYPED_METADATA_FIELDS)) {
              delete clone[col];
            }
            return clone;
          });
          await this.table.add(legacyData);
        }
      }

      batchesDone++;
      if (options?.onEmbedProgress) {
        options.onEmbedProgress(batchesDone, totalBatches);
      }
    }
  }

  /**
   * Upsert documents by deleting matching ids then adding.
   *
   * @param {Array<{id: string, text: string, metadata: Object}>} documents
   */
  async upsertDocuments(documents) {
    if (!documents || documents.length === 0) return;
    if (!this.isInitialized) await this.initialize();

    if (this.table) {
      for (const doc of documents) {
        if (!doc?.id) continue;
        const escaped = String(doc.id).replace(/'/g, "''");
        try {
          await this.table.delete(`id = '${escaped}'`);
        } catch {
          // Ignore delete failures (e.g. table doesn't support delete yet)
        }
      }
    }

    await this.addDocuments(documents);
  }

  /**
   * Search for similar documents
   * @param {string} query
   * @param {Object} options
   * @returns {Promise<Array<{id: string, content: string, metadata: Object, similarity: number}>>}
   */
  async search(query, options = {}) {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return []; // No table = no results yet

    const limit = options.limit || 10;
    const minScore =
      typeof options.minScore === 'number'
        ? options.minScore
        : typeof options.threshold === 'number'
          ? options.threshold
          : null;
    const queryVector = await this.generateEmbedding(query);
    const tableDim = await this.getTableVectorDimension();
    if (Number.isFinite(tableDim) && queryVector.length !== tableDim) {
      const mismatch = this._buildDimensionMismatchStatus(tableDim, queryVector.length, 'query');
      this._embeddingStatus = {
        status: 'unavailable',
        mode: this._embeddingStatus?.mode || this.config.embeddingMode,
        reason: mismatch.reason,
      };
      const err = new Error(mismatch.reason);
      err.code = 'LANCEDB_REINDEX_REQUIRED';
      err.reindexRequired = true;
      err.status = mismatch;
      throw err;
    }

    let searchBuilder = this.table.vectorSearch(queryVector).limit(limit);

    // Apply filters if present.
    // LanceDB supports SQL filtering string in .where().
    if (options.filters) {
      if (typeof options.filters === 'string') {
        searchBuilder = searchBuilder.where(options.filters);
      } else if (typeof options.filters === 'object') {
        const typedClause = this._shouldUseTypedFilters(options.filters, options)
          ? this._buildTypedWhereClause(options.filters)
          : null;
        if (typedClause && this._typedMetadataSupported !== false) {
          try {
            searchBuilder = searchBuilder.where(typedClause);
            this._typedMetadataSupported = true;
          } catch {
            this._typedMetadataSupported = false;
            const legacyClause = this._buildLegacyMetadataWhereClause(options.filters);
            if (legacyClause) {
              searchBuilder = searchBuilder.where(legacyClause);
            }
          }
        } else {
          const legacyClause = this._buildLegacyMetadataWhereClause(options.filters);
          if (legacyClause) {
            searchBuilder = searchBuilder.where(legacyClause);
          }
        }
      }
    }

    const results = await searchBuilder.toArray();

    // detailed results map matching standard MemoryVectorStore interface
    const mapped = results.map(r => {
      let metadata = {};
      try {
        metadata = JSON.parse(r.metadata);
      } catch (_e) {
        metadata = { raw: r.metadata };
      }

      return {
        id: r.id,
        content: r.text,
        metadata: metadata,
        similarity: distanceToSimilarity(r._distance),
      };
    });

    if (minScore === null) return mapped;
    return mapped.filter(r => typeof r.similarity === 'number' && r.similarity >= minScore);
  }

  /**
   * Delete documents by metadata match.
   *
   * @param {string} field
   * @param {string|number|boolean} value
   * @returns {Promise<boolean>}
   */
  async deleteByMetadata(field, value) {
    if (!this.isInitialized) await this.initialize();
    if (!this.table) return false;

    const typedColumn = TYPED_METADATA_FIELDS[field];
    let clause = null;
    if (typedColumn && this._typedMetadataSupported !== false) {
      clause = `${typedColumn} = ${this._toSqlLiteral(value)}`;
    } else {
      const k = String(field).replace(/'/g, "''");
      const v = String(value).replace(/'/g, "''");
      clause = `metadata LIKE '%"${k}":"${v}"%'`;
    }

    try {
      await this.table.delete(clause);
      if (typedColumn) this._typedMetadataSupported = true;
      return true;
    } catch (_e) {
      if (typedColumn) {
        try {
          const k = String(field).replace(/'/g, "''");
          const v = String(value).replace(/'/g, "''");
          await this.table.delete(`metadata LIKE '%"${k}":"${v}"%'`);
          this._typedMetadataSupported = false;
          return true;
        } catch (_fallbackErr) {
          // fallback delete failed; caller will get false
          void _fallbackErr;
        }
      }
      return false;
    }
  }

  _toSqlLiteral(value) {
    return toSqlLiteral(value);
  }

  _toTypedMetadataColumns(metadata) {
    return toTypedMetadataColumns(metadata);
  }

  _buildTypedWhereClause(filters) {
    return buildTypedWhereClause(filters);
  }

  _shouldUseTypedFilters(filters, options = {}) {
    return shouldUseTypedFilters(filters, options);
  }

  _buildLegacyMetadataWhereClause(filters) {
    return buildLegacyMetadataWhereClause(filters);
  }

  /**
   * Check availability (always true if init logic passes)
   */
  async isAvailable() {
    try {
      if (!this.isInitialized) await this.initialize();
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check if running in mock mode
   */
  isMockMode() {
    return this._mockMode;
  }

  getEmbeddingStatus() {
    return { ...this._embeddingStatus };
  }

  async close() {
    if (this._shared) return;
    await this._killEmbedWorker();
    // Best-effort (LanceDB doesn't require explicit close in typical usage)
    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isInitialized = false;
  }

  isShared() {
    return this._shared;
  }
}

module.exports = { MemoryVectorStore };
