#!/usr/bin/env node
/**
 * Tests for Vector Store Hybrid Consistency
 *
 * Verifies that operations on the VectorStore (add, delete) stay in sync
 * across both the Dense (LanceDB) and Sparse (BM25) indices.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { VectorStore } = require('../../../.claude/lib/code-indexing/vector-store.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Mock LanceDB client to avoid actual GPU/native dependencies in this test
const mockStore = {
  addDocuments: async () => {},
  upsertDocuments: async () => {},
  deleteByMetadata: async () => {},
  search: async () => [],
  close: async () => {},
};

// Mock the require so VectorStore uses our mock
require('../../../.claude/lib/memory/lancedb-client.cjs'); // Ensure it's cached
require.cache[require.resolve('../../../.claude/lib/memory/lancedb-client.cjs')] = {
  exports: {
    MemoryVectorStore: {
      getSharedStore: () => mockStore,
    },
  },
};

const TEST_DIR = path.join(PROJECT_ROOT, '.claude', 'tmp', 'vector-store-consistency');

async function testConsistency() {
  console.log('VectorStore Hybrid Consistency Tests');
  console.log('====================================');

  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('should delete from BM25 when deleteFile is called', async () => {
    const store = new VectorStore({
      projectRoot: PROJECT_ROOT,
      persistDirectory: TEST_DIR,
      embeddingMode: 'off', // Use BM25-only for this test to isolate logic
    });

    const chunks = [
      {
        id: 'chunk1',
        content: 'function test() {}',
        filePath: 'src/test.js',
        startLine: 1,
        endLine: 3,
      },
      { id: 'chunk2', content: 'const x = 1;', filePath: 'src/utils.js', startLine: 1, endLine: 1 },
    ];

    await store.addChunksOnly(chunks);

    // Verify added
    const search1 = await store.hybridSearch('test');
    if (search1.length !== 1) throw new Error('Search failed to find added doc');

    // Delete file
    await store.deleteFile('src/test.js');

    // Verify deleted from BM25
    const search2 = await store.hybridSearch('test');
    if (search2.length !== 0)
      throw new Error(`BM25 Index still contains deleted file. Found: ${search2.length}`);

    await store.close();
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testConsistency().catch(err => {
  console.error(err);
  process.exit(1);
});
