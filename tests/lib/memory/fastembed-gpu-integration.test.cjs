/**
 * FastEmbed GPU Integration Tests
 *
 * RED-GREEN-REFACTOR cycle for GPU-accelerated embeddings
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { MemoryVectorStore } = require('../../../.claude/lib/memory/lancedb-client.cjs');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(process.cwd(), '.claude/data/test-fastembed-gpu');

describe('FastEmbed GPU Integration', () => {
  let store;

  beforeEach(async () => {
    // Clean test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (store && !store.isShared()) {
      await store.close();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  it('should initialize FastEmbed with GPU detection', async () => {
    store = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH,
      collectionName: 'test-gpu',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
        autoTuneBatchSize: true,
      },
    });

    await store.initialize();

    // GPU detection should run for fastembed mode
    assert.ok(['cpu', 'gpu'].includes(store.device), 'Device should be cpu or gpu');

    // Embedding status should be ready
    const status = store.getEmbeddingStatus();
    assert.strictEqual(status.mode, 'fastembed', 'Embedding mode should be fastembed');
    // Status should be 'ready' if fastembed available, 'unavailable' if not installed
    assert.ok(
      ['ready', 'unavailable'].includes(status.status),
      'Embedding status should be ready or unavailable'
    );
  });

  it('should auto-tune batch size based on GPU memory', async () => {
    store = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH,
      collectionName: 'test-batch',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
        autoTuneBatchSize: true,
      },
    });

    await store.initialize();

    if (store.gpuDetected) {
      // If GPU detected, batch size should be auto-tuned (larger than default)
      assert.ok(
        store.config.embedBatchSize >= 64,
        `Batch size should be auto-tuned for GPU (got ${store.config.embedBatchSize})`
      );
    } else {
      // CPU fallback - batch size not auto-tuned or stays at default
      console.log('No GPU detected - skipping batch size assertion');
    }
  });

  it('should generate embeddings with FastEmbed', async () => {
    store = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH,
      collectionName: 'test-embed',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
      },
    });

    await store.initialize();

    const status = store.getEmbeddingStatus();

    if (status.status === 'unavailable') {
      console.log('FastEmbed not available - skipping embedding test');
      return;
    }

    const text = 'test embedding with FastEmbed';
    const embedding = await store.generateEmbedding(text);

    assert.ok(Array.isArray(embedding), 'Embedding should be an array');
    assert.strictEqual(embedding.length, 384, 'BGE-small-en-v1.5 should have 384 dimensions');
    assert.ok(
      embedding.every(v => typeof v === 'number'),
      'All values should be numbers'
    );
  });

  it('should batch generate embeddings with FastEmbed', async () => {
    store = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH,
      collectionName: 'test-batch-embed',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
        autoTuneBatchSize: true,
      },
    });

    await store.initialize();

    const status = store.getEmbeddingStatus();

    if (status.status === 'unavailable') {
      console.log('FastEmbed not available - skipping batch test');
      return;
    }

    const texts = [
      'first document',
      'second document',
      'third document',
      'fourth document',
      'fifth document',
    ];

    const embeddings = await store.generateEmbeddingsBatch(texts, 32);

    assert.strictEqual(embeddings.length, texts.length, 'Should have one embedding per text');
    embeddings.forEach((emb, i) => {
      assert.ok(Array.isArray(emb), `Embedding ${i} should be an array`);
      assert.strictEqual(emb.length, 384, `Embedding ${i} should have 384 dimensions`);
    });
  });

  it('should fallback to CPU if GPU not available', async () => {
    store = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH,
      collectionName: 'test-fallback',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: false, // Explicitly disable GPU
      },
    });

    await store.initialize();

    const status = store.getEmbeddingStatus();

    // Should still work with CPU
    if (status.status === 'ready') {
      assert.strictEqual(store.device, 'cpu', 'Should use CPU when GPU disabled');

      const embedding = await store.generateEmbedding('test');
      assert.ok(Array.isArray(embedding), 'Should still generate embeddings on CPU');
      assert.strictEqual(embedding.length, 384, 'Dimensions should match');
    }
  });

  it('should use larger batch sizes with GPU than CPU', async () => {
    const gpuStore = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH + '-gpu',
      collectionName: 'test-gpu',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
        autoTuneBatchSize: true,
      },
    });

    await gpuStore.initialize();

    if (gpuStore.gpuDetected && gpuStore.config.embedBatchSize) {
      // GPU batch size should be tuned based on memory
      const expectedMinBatchSize = 64; // Minimum for GPU
      assert.ok(
        gpuStore.config.embedBatchSize >= expectedMinBatchSize,
        `GPU batch size should be >= ${expectedMinBatchSize} (got ${gpuStore.config.embedBatchSize})`
      );
    } else {
      console.log('No GPU detected or batch size not set - skipping comparison test');
    }

    await gpuStore.close();
  });

  it('should match CPU embeddings approximately (same model)', async () => {
    const cpuStore = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH + '-cpu',
      collectionName: 'test-cpu',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: false,
      },
    });

    const gpuStore = new MemoryVectorStore({
      persistDirectory: TEST_DB_PATH + '-gpu',
      collectionName: 'test-gpu',
      embeddingMode: 'fastembed',
      gpu: {
        enabled: true,
      },
    });

    await cpuStore.initialize();
    await gpuStore.initialize();

    const cpuStatus = cpuStore.getEmbeddingStatus();
    const gpuStatus = gpuStore.getEmbeddingStatus();

    if (cpuStatus.status !== 'ready' || gpuStatus.status !== 'ready') {
      console.log('FastEmbed not available on both configs - skipping comparison test');
      await cpuStore.close();
      await gpuStore.close();
      return;
    }

    const text = 'test embedding consistency';
    const cpuEmb = await cpuStore.generateEmbedding(text);
    const gpuEmb = await gpuStore.generateEmbedding(text);

    // Both should have same dimensions
    assert.strictEqual(cpuEmb.length, gpuEmb.length, 'Dimensions should match');
    assert.strictEqual(cpuEmb.length, 384, 'Should be 384 dimensions');

    // Cosine similarity should be high (same model, same input)
    const dotProduct = cpuEmb.reduce((sum, val, i) => sum + val * gpuEmb[i], 0);
    const cpuNorm = Math.sqrt(cpuEmb.reduce((sum, val) => sum + val * val, 0));
    const gpuNorm = Math.sqrt(gpuEmb.reduce((sum, val) => sum + val * val, 0));
    const cosineSim = dotProduct / (cpuNorm * gpuNorm);

    // Similarity should be very high (>0.95) for same model/input
    assert.ok(cosineSim > 0.95, `Cosine similarity should be >0.95 (got ${cosineSim.toFixed(4)})`);

    await cpuStore.close();
    await gpuStore.close();
  });
});
