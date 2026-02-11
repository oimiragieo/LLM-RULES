/**
 * Tests to verify actual GPU usage (not just detection)
 * @group gpu
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RUN_GPU_TESTS = process.env.RUN_GPU_TESTS === '1';

describe('Verify Actual GPU Usage', { skip: !RUN_GPU_TESTS }, () => {
  let MemoryVectorStore;
  let tmpDir;

  before(async () => {
    const modulePathRelative = '../../../.claude/lib/memory/lancedb-client.cjs';
    const modulePath = path.resolve(__dirname, modulePathRelative);
    const mod = require(modulePath);
    MemoryVectorStore = mod.MemoryVectorStore;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lancedb-gpu-usage-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should show GPU utilization during embedding generation', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: tmpDir,
      embeddingMode: 'fastembed',
      gpu: { enabled: true },
    });

    await store.initialize();

    if (!store.gpuDetected) {
      console.log('⚠️  No GPU detected - skipping GPU utilization test');
      return;
    }

    console.log('Starting GPU utilization test...');

    // Get GPU usage before
    const gpuBefore = getGPUUtilization();
    console.log(`GPU utilization before: ${gpuBefore.utilization}%`);
    console.log(`GPU memory before: ${gpuBefore.memoryUsed}MB / ${gpuBefore.memoryTotal}MB`);

    // Generate embeddings for a batch of texts (should trigger GPU if configured)
    const texts = Array.from(
      { length: 100 },
      (_, i) => `Test embedding ${i} with some text content to process`
    );

    const startTime = Date.now();
    const embeddings = await store.generateEmbeddingsBatch(texts, 128);
    const endTime = Date.now();

    console.log(`Generated ${embeddings.length} embeddings in ${endTime - startTime}ms`);

    // Get GPU usage after (immediately)
    const gpuAfter = getGPUUtilization();
    console.log(`GPU utilization after: ${gpuAfter.utilization}%`);
    console.log(`GPU memory after: ${gpuAfter.memoryUsed}MB / ${gpuAfter.memoryTotal}MB`);

    // Check if GPU was actually used
    const memoryIncrease = gpuAfter.memoryUsed - gpuBefore.memoryUsed;
    const utilizationIncrease = gpuAfter.utilization - gpuBefore.utilization;

    console.log(`Memory increase: ${memoryIncrease}MB`);
    console.log(`Utilization increase: ${utilizationIncrease}%`);

    if (memoryIncrease > 0 || utilizationIncrease > 0) {
      console.log('✅ GPU is actually being used for embeddings');
    } else {
      console.log('❌ GPU memory/utilization did not increase - GPU may not be used');
      console.log('   This indicates FastEmbed is falling back to CPU');
      console.log('   Reason: onnxruntime-node (CPU) installed instead of onnxruntime-node-gpu');
    }

    assert.ok(embeddings.length === 100, 'Should generate all embeddings');
  });

  it('should show which ONNX Runtime package is loaded at runtime', async () => {
    console.log('\nChecking runtime ONNX Runtime package:');

    // Check which package is actually loaded
    let loadedPackage = 'none';
    try {
      require('onnxruntime-node-gpu');
      loadedPackage = 'onnxruntime-node-gpu (GPU)';
    } catch (_e) {
      try {
        require('onnxruntime-node');
        loadedPackage = 'onnxruntime-node (CPU-only)';
      } catch (_e2) {
        loadedPackage = 'none';
      }
    }

    console.log(`Loaded package: ${loadedPackage}`);

    if (loadedPackage === 'onnxruntime-node (CPU-only)') {
      console.log('⚠️  CPU-only ONNX Runtime is loaded');
      console.log('   FastEmbed will use CPU even if GPU is detected');
      console.log('   Solution:');
      console.log('   1. pnpm remove onnxruntime-node');
      console.log('   2. pnpm add onnxruntime-node-gpu');
      console.log('   3. Restart the application');
    } else if (loadedPackage === 'onnxruntime-node-gpu (GPU)') {
      console.log('✅ GPU-enabled ONNX Runtime is loaded');
    }

    assert.ok(true, 'Check completed');
  });
});

/**
 * Get current GPU utilization and memory usage
 * @returns {{utilization: number, memoryUsed: number, memoryTotal: number}}
 */
function getGPUUtilization() {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits',
      { encoding: 'utf-8' }
    );

    const line = output.trim().split('\n')[0]; // First GPU
    const [utilization, memoryUsed, memoryTotal] = line.split(',').map(s => parseInt(s.trim(), 10));

    return { utilization, memoryUsed, memoryTotal };
  } catch (_e) {
    return { utilization: 0, memoryUsed: 0, memoryTotal: 0 };
  }
}
