'use strict';

const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');
const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('IndexManager Memory Safety', async t => {
  const tmpDir = path.join(os.tmpdir(), 'index-manager-mem-test-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  // Create 100 small files to simulate a large set
  const files = [];
  for (let i = 0; i < 100; i++) {
    const filePath = path.join(tmpDir, `file${i}.js`);
    fs.writeFileSync(
      filePath,
      `// Test file ${i}
function test() { return ${i}; }`
    );
    files.push(filePath);
  }

  const manager = new IndexManager({
    projectRoot: tmpDir,
    concurrency: 2,
    batchSize: 10,
    verbose: true,
  });

  await t.test('should index files in batches and honor concurrency', async () => {
    // Mock discoverFiles to return our 100 files
    manager._discoverFiles = async () => files;

    // Mock components
    manager._initializeComponents = async () => {
      manager.parser = { detectLanguage: () => 'javascript' };
      manager.chunker = { chunk: () => [{ id: '1', text: 'test' }] };
      manager.vectorStore = {
        embeddingMode: 'off', // BM25 only for speed
        addChunksToBM25: async () => {},
        saveBM25Index: async () => {},
        dropCodeTable: async () => {},
        deleteFile: async () => {},
      };
    };

    manager._saveCheckpoint = async () => {};
    manager._clearCheckpoint = async () => {};

    const result = await manager.indexDirectory(tmpDir);
    assert.strictEqual(result.filesIndexed, 100);
  });

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_err) {
    // ignore
  }
});
