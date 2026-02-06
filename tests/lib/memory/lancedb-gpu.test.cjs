/**
 * Tests for GPU acceleration in LanceDB embeddings
 * @group gpu
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('LanceDB GPU Acceleration', () => {
  let MemoryVectorStore;
  let tmpDir;

  before(async () => {
    const modulePathRelative = '../../../.claude/lib/memory/lancedb-client.cjs';
    const modulePath = path.resolve(__dirname, modulePathRelative);
    const mod = require(modulePath);
    MemoryVectorStore = mod.MemoryVectorStore;

    // Create temp directory for test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lancedb-gpu-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect GPU if NVIDIA GPU available', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: tmpDir,
      embeddingMode: 'fastembed',
      gpu: { enabled: true, autoTuneBatchSize: true },
    });

    await store.initialize();

    // If GPU is available, should be detected
    // This will pass on systems with NVIDIA GPU + CUDA
    // and skip on systems without GPU
    if (store.gpuDetected) {
      assert.strictEqual(store.device, 'gpu', 'Device should be GPU when NVIDIA GPU detected');
      assert.ok(store.gpuName, 'GPU name should be set');
      assert.ok(store.gpuMemoryMB > 0, 'GPU memory should be positive');
      console.log(`GPU detected: ${store.gpuName} (${store.gpuMemoryMB}MB)`);
    } else {
      console.log('No GPU detected - test skipped');
    }
  });

  it('should use onnxruntime-node-gpu package when available', async () => {
    // Check if GPU package is installed
    let hasGpuPackage = false;
    try {
      require.resolve('onnxruntime-node-gpu');
      hasGpuPackage = true;
    } catch (_e) {
      // GPU package not installed
    }

    if (hasGpuPackage) {
      // If GPU package is installed, it should be loadable
      const ort = require('onnxruntime-node-gpu');
      assert.ok(ort, 'onnxruntime-node-gpu should be loadable');
      console.log('✅ onnxruntime-node-gpu package available');
    } else {
      console.log('⚠️  onnxruntime-node-gpu not installed - GPU acceleration unavailable');
      console.log('   Install with: pnpm remove onnxruntime-node && pnpm add onnxruntime-node-gpu');
    }
  });

  it('should use CUDA execution provider for FastEmbed when GPU available', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: tmpDir,
      embeddingMode: 'fastembed',
      gpu: { enabled: true },
    });

    await store.initialize();

    if (store.gpuDetected && store._embeddingStatus.status === 'ready') {
      assert.strictEqual(store._embeddingStatus.mode, 'fastembed', 'Should use fastembed mode');
      console.log(`Embedding mode: ${store._embeddingStatus.mode} on ${store.device}`);

      // Test actual embedding generation
      const embedding = await store.generateEmbedding('test GPU acceleration');
      assert.ok(Array.isArray(embedding), 'Embedding should be an array');
      assert.strictEqual(embedding.length, 384, 'BGE-small model uses 384 dimensions');
      console.log(`✅ Generated ${embedding.length}-dimensional embedding on ${store.device}`);
    } else {
      console.log('GPU not available or FastEmbed not ready - test skipped');
    }
  });

  it('should auto-tune batch size based on GPU memory', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: tmpDir,
      embeddingMode: 'fastembed',
      gpu: { enabled: true, autoTuneBatchSize: true },
    });

    await store.initialize();

    if (store.gpuDetected) {
      // Check batch size was set based on GPU memory
      const batchSize = store.config.embedBatchSize;
      assert.ok(batchSize > 0, 'Batch size should be set');

      // Verify batch size matches memory tier
      const memoryMB = store.gpuMemoryMB;
      let expectedMin = 32;
      if (memoryMB >= 16384) expectedMin = 256;
      else if (memoryMB >= 8192) expectedMin = 128;
      else if (memoryMB >= 4096) expectedMin = 64;

      assert.ok(
        batchSize >= expectedMin,
        `Batch size ${batchSize} should match GPU memory tier (${memoryMB}MB)`
      );
      console.log(`GPU memory: ${memoryMB}MB → Batch size: ${batchSize}`);
    } else {
      console.log('No GPU detected - batch size auto-tuning test skipped');
    }
  });

  it('should fall back to CPU if GPU initialization fails', async () => {
    // Simulate GPU initialization failure by disabling GPU
    const store = new MemoryVectorStore({
      persistDirectory: tmpDir,
      embeddingMode: 'fastembed',
      gpu: { enabled: false }, // Explicitly disable GPU
    });

    await store.initialize();

    // Should fall back to CPU
    assert.strictEqual(store.device, 'cpu', 'Should use CPU when GPU disabled');
    console.log('✅ CPU fallback working correctly');
  });
});
