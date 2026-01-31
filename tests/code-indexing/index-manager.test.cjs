/**
 * Index Manager Tests
 *
 * Tests the full orchestration of the code indexing pipeline:
 * files → parser → chunker → embedder → vectorDB
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');

describe('IndexManager', () => {
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

      // Search test
      const results = await manager.semanticSearch('find hello function');
      assert.ok(results.length > 0, 'Search returned results');
      assert.ok(results[0].code, 'Result has code');
      assert.ok(results[0].filePath, 'Result has file path');
      assert.ok(results[0].similarity >= 0, 'Result has similarity score');

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });
  });
});
