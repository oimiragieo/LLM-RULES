/**
 * MemoryVectorStore GPU Integration Tests
 *
 * RED Phase: Prove that GPU detection is NOT integrated into MemoryVectorStore.initialize()
 * GREEN Phase: Implement the fix
 * REFACTOR Phase: Optimize the implementation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(__dirname, '.test-lancedb-gpu-integration');

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
  const modulePath = require.resolve('../../../.claude/lib/memory/lancedb-client.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('RED: MemoryVectorStore should attempt GPU detection during initialize()', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DIR,
    collectionName: 'test_gpu',
    embeddingMode: 'test', // Use test mode for speed
  });

  await store.initialize();

  // RED: This will FAIL because MemoryVectorStore doesn't have GPU detection
  // After fix, this property should exist
  assert.ok('gpuDetected' in store || 'device' in store,
    'Store should have GPU detection metadata after initialization');

  console.log('[RED TEST] If this test passes, GPU detection is integrated');
  console.log('[RED TEST] If this test fails, GPU detection is NOT integrated (expected initially)');
});

test('RED: MemoryVectorStore should support GPU-optimized batch sizes', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DIR,
    collectionName: 'test_gpu_batch',
    embeddingMode: 'test',
  });

  await store.initialize();

  // RED: This will FAIL because batch size isn't auto-tuned based on GPU
  // After fix, batch size should be larger when GPU is detected
  const hasBatchSizeConfig = 'batchSize' in store || 'embedBatchSize' in store.config;
  assert.ok(hasBatchSizeConfig,
    'Store should have batch size configuration based on GPU availability');

  console.log('[RED TEST] Expected to fail initially - batch size not GPU-aware');
});

test('RED: MemoryVectorStore should expose device info', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();
  const store = new MemoryVectorStore({
    persistDirectory: TEST_DIR,
    collectionName: 'test_device_info',
    embeddingMode: 'test',
  });

  await store.initialize();

  // RED: This should FAIL because device info isn't tracked
  const hasDeviceInfo = store.device || store.gpuName || store.embedder?.device;
  assert.ok(hasDeviceInfo,
    'Store should expose device information (cpu/gpu) after initialization');

  console.log('[RED TEST] Device info:', hasDeviceInfo || 'NOT AVAILABLE (expected)');
});
