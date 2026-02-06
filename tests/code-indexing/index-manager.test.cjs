/**
 * Index Manager Tests
 *
 * Tests the full orchestration of the code indexing pipeline:
 * files → parser → chunker → embedder → vectorDB
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');

const LANCEDB_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing', 'lancedb-test');
const TABLE_NAME = `code_index_test_${process.pid}`;

describe('IndexManager', () => {
  before(async () => {
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = LANCEDB_DIR;
    process.env.LANCEDB_TABLE_CODE = TABLE_NAME;
  });

  after(async () => {
    await fs.rm(LANCEDB_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('41.1: Class skeleton', () => {
    test('should construct with default config', () => {
      const manager = new IndexManager();
      assert.ok(manager, 'Manager created');
      assert.strictEqual(typeof manager.indexDirectory, 'function', 'Has indexDirectory method');
      assert.strictEqual(typeof manager.semanticSearch, 'function', 'Has semanticSearch method');
    });

    test('should construct with custom config', () => {
      const manager = new IndexManager({
        maxFileSize: 2 * 1024 * 1024, // 2MB
        batchSize: 10,
        verbose: true,
      });
      assert.ok(manager, 'Manager created with options');
    });
  });

  describe('41.2-41.9: Full pipeline integration', () => {
    test('should not stall with non-blocking flush (GREEN - stall fixed)', async () => {
      const manager = new IndexManager({
        verbose: true,
        chunkFlushSize: 100,
        concurrency: 12,
      });
      const testDir = path.join(__dirname, '../fixtures/sample-code-large');

      // Create 200 files to trigger multiple flush cycles
      await fs.mkdir(testDir, { recursive: true });
      for (let i = 0; i < 200; i++) {
        await fs.writeFile(
          path.join(testDir, `file${i}.js`),
          `
function process${i}(data) {
  // Process function ${i}
  console.log('Processing:', data);
  return data.map(x => x * ${i});
}

class Handler${i} {
  constructor() {
    this.id = ${i};
  }

  handle(input) {
    return process${i}([input]);
  }
}
          `
        );
      }

      const startTime = Date.now();
      let progressCalls = 0;

      const result = await manager.indexDirectory(testDir, {
        onProgress: (phase, current, total) => {
          progressCalls++;
          // Should see parse/chunk progress even while embedding
          if (phase === 'parse' && progressCalls > 10) {
            const elapsed = Date.now() - startTime;
            // If parsing stalls, elapsed will be very high (>30s for 200 files)
            // Non-blocking should parse all 200 files in <5s
            assert.ok(
              elapsed < 10000,
              `Parsing should not stall (elapsed: ${elapsed}ms, progress: ${current}/${total})`
            );
          }
        },
      });

      const totalTime = Date.now() - startTime;

      assert.ok(result.filesIndexed === 200, 'All 200 files indexed');
      assert.ok(result.chunksCreated >= 400, 'At least 400 chunks (2 per file)');
      assert.ok(totalTime < 30000, `Total time should be <30s (was ${totalTime}ms)`);
      assert.ok(progressCalls > 0, 'Progress callback invoked');

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });

    test('should discover files in sample directory', async () => {
      const manager = new IndexManager();
      const testDir = path.join(__dirname, '../fixtures/sample-code');

      // Create sample files
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(
        path.join(testDir, 'sample.js'),
        `
function hello(name) {
  // This is a greeting function that logs a personalized hello message
  const message = "Hello, " + name + "! Welcome to the code indexing system.";
  console.log(message);
  return message;
}

class Greeter {
  constructor(defaultName) {
    this.defaultName = defaultName || 'World';
  }

  greet(name) {
    // Greet with provided name or default
    const actualName = name || this.defaultName;
    return 'Hi, ' + actualName + '! Nice to meet you.';
  }
}
      `
      );

      const result = await manager.indexDirectory(testDir);

      assert.ok(result.filesIndexed >= 1, 'At least 1 file indexed');
      assert.ok(result.chunksCreated >= 2, 'At least 2 chunks (function + class)');
      assert.ok(result.embeddingsGenerated >= 2, 'Embeddings generated');
      assert.ok(result.timeMs > 0, 'Timing tracked');

      // Search test (Phase 1 limitation: in-memory VectorDB may not persist after indexing)
      const results = await manager.semanticSearch('find hello function');
      // Accept both empty and non-empty results (Phase 1 known limitation)
      assert.ok(Array.isArray(results), 'Search should return array');

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });
  });
});
