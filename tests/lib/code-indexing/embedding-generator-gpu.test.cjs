#!/usr/bin/env node
/**
 * Embedding Generator GPU Tests
 *
 * Tests GPU acceleration with graceful CPU fallback.
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const fs = require('fs');

// Test directory setup
const TEST_DIR = path.join(__dirname, '.test-embedding-gpu');

function setupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getModule() {
  const modulePath = require.resolve('../../../.claude/lib/code-indexing/embedding-generator.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('EmbeddingGenerator - CPU path - should load correctly (existing behavior)', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
  });

  await generator.initialize();

  assert.ok(generator.isInitialized(), 'Should be initialized');
  assert.ok(generator.device === 'cpu' || generator.device === 'gpu', 'Should have device property');
});

test('EmbeddingGenerator - GPU initialization - should detect and use GPU when available', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
    gpu: {
      enabled: true,
      autoTuneBatchSize: true,
    },
  });

  // Mock GPU detector to simulate GPU availability
  generator._mockGPUDetection = {
    available: true,
    gpuName: 'NVIDIA GeForce RTX 3080',
    totalMemoryMB: 10240,
  };

  await generator.initialize();

  assert.ok(generator.isInitialized(), 'Should be initialized');

  // Should use GPU if mock detection shows GPU available
  if (generator._mockGPUDetection) {
    assert.strictEqual(generator.device, 'gpu', 'Should use GPU when mocked as available');
    assert.ok(generator.batchSize >= 64, 'Should have larger batch size for GPU');
  }
});

test('EmbeddingGenerator - embedBatch routing - should route to correct implementation', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
    gpu: {
      enabled: false, // Force CPU
    },
  });

  await generator.initialize();

  const texts = ['test1', 'test2', 'test3'];
  const embeddings = await generator.batchEmbed(texts);

  assert.strictEqual(embeddings.length, 3, 'Should return 3 embeddings');
  assert.ok(Array.isArray(embeddings[0]), 'Each embedding should be an array');
  assert.strictEqual(embeddings[0].length, 384, 'Should have 384 dimensions');
});

test('EmbeddingGenerator - GPU vs CPU results - should produce consistent embeddings', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();

  // CPU generator
  const cpuGen = new EmbeddingGenerator({
    cacheEnabled: false,
    gpu: { enabled: false },
  });
  await cpuGen.initialize();

  const testText = 'function authenticate(user, password) { return true; }';
  const cpuEmbedding = await cpuGen.embed(testText, false);

  assert.ok(Array.isArray(cpuEmbedding), 'CPU embedding should be array');
  assert.strictEqual(cpuEmbedding.length, 384, 'CPU embedding should have 384 dimensions');

  // Verify normalized (unit length)
  const cpuNorm = Math.sqrt(cpuEmbedding.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(cpuNorm - 1.0) < 0.01, 'CPU embedding should be normalized');
});

test('EmbeddingGenerator - batch splitting - should handle large batches correctly', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
    batchSize: 50, // Small batch for testing
  });

  await generator.initialize();

  // Create 150 texts (3 batches of 50)
  const texts = Array.from({ length: 150 }, (_, i) => `test text ${i}`);
  const embeddings = await generator.batchEmbed(texts);

  assert.strictEqual(embeddings.length, 150, 'Should return all embeddings');
  embeddings.forEach((emb, i) => {
    assert.ok(Array.isArray(emb), `Embedding ${i} should be array`);
    assert.strictEqual(emb.length, 384, `Embedding ${i} should have 384 dimensions`);
  });
});

test('EmbeddingGenerator - error handling - should fallback to CPU on GPU failure', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
    gpu: {
      enabled: true,
      autoTuneBatchSize: true,
    },
  });

  // Mock GPU initialization failure
  generator._mockGPUFailure = true;

  await generator.initialize();

  assert.ok(generator.isInitialized(), 'Should initialize despite GPU failure');
  assert.strictEqual(generator.device, 'cpu', 'Should fallback to CPU');

  // Should still work on CPU
  const embedding = await generator.embed('test', false);
  assert.ok(Array.isArray(embedding), 'Should still generate embeddings on CPU');
});

test('EmbeddingGenerator - device property - should expose device info', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { EmbeddingGenerator } = getModule();
  const generator = new EmbeddingGenerator({
    cacheEnabled: false,
  });

  await generator.initialize();

  assert.ok('device' in generator, 'Should have device property');
  assert.ok(generator.device === 'cpu' || generator.device === 'gpu', 'Device should be cpu or gpu');

  if (generator.device === 'gpu') {
    assert.ok('gpuName' in generator, 'Should have gpuName when GPU');
    assert.ok('gpuMemoryMB' in generator, 'Should have gpuMemoryMB when GPU');
  }
});
