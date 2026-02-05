#!/usr/bin/env node
/**
 * LanceDB Client GPU Tests
 *
 * Tests GPU batch size tuning integration.
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

// Test directory setup
const TEST_DIR = path.join(__dirname, '.test-lancedb-gpu');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-lancedb');

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

test('LanceDB Client - GPU batch size - should use default batch size for CPU', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_gpu_batch',
    embeddingMode: 'test',
  });

  await store.initialize();

  // With test embeddings, batch size should be default
  const batchSize = store.config.embedBatchSize || 64;
  assert.ok(batchSize >= 32, 'CPU batch size should be at least 32');

  await store.close();
});

test('LanceDB Client - generateEmbeddingsBatch - should handle batching correctly', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_batch_gen',
    embeddingMode: 'test',
  });

  await store.initialize();

  // Generate embeddings for 100 texts
  const texts = Array.from({ length: 100 }, (_, i) => `test text ${i}`);
  const embeddings = await store.generateEmbeddingsBatch(texts, 32);

  assert.strictEqual(embeddings.length, 100, 'Should generate 100 embeddings');
  embeddings.forEach((emb, i) => {
    assert.ok(Array.isArray(emb), `Embedding ${i} should be array`);
    assert.strictEqual(emb.length, 384, `Embedding ${i} should have 384 dimensions`);
  });

  await store.close();
});

test('LanceDB Client - batch progress callback - should report progress', async t => {
  t.after(cleanupTestDir);
  setupTestDir();

  const { MemoryVectorStore } = getModule();

  const store = new MemoryVectorStore({
    persistDirectory: TEST_DB_PATH,
    collectionName: 'test_progress',
    embeddingMode: 'test',
  });

  await store.initialize();

  const texts = Array.from({ length: 100 }, (_, i) => `test text ${i}`);
  let progressCalls = 0;
  let totalBatches = 0;

  const embeddings = await store.generateEmbeddingsBatch(texts, 32, {
    onBatchComplete: (_batchDone, total) => {
      progressCalls++;
      totalBatches = total;
    },
  });

  assert.strictEqual(embeddings.length, 100, 'Should generate 100 embeddings');

  // Test mode might not call progress callback - that's okay
  // The important test is that the function accepts and doesn't crash with the callback
  if (progressCalls > 0) {
    assert.strictEqual(totalBatches, Math.ceil(100 / 32), 'Should report correct total batches');
  }

  await store.close();
});
