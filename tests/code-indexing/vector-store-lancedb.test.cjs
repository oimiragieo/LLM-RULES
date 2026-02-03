/**
 * VectorStore (LanceDB) Tests
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { VectorStore } = require('../../.claude/lib/code-indexing/vector-store.cjs');

describe('VectorStore (LanceDB)', () => {
  const lancedbDir = path.join(os.tmpdir(), `code-index-lancedb-${process.pid}`);
  const tableName = `code_index_test_${process.pid}`;
  let store;

  before(async () => {
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = lancedbDir;
    process.env.LANCEDB_TABLE_CODE = tableName;
    store = new VectorStore({ projectRoot: process.cwd(), collectionName: tableName });
  });

  after(async () => {
    await fs.rm(lancedbDir, { recursive: true, force: true }).catch(() => {});
  });

  test('upsert + search round-trip', async () => {
    await store.addChunks([
      {
        id: 'chunk-1',
        content: 'function hello() { return "hello"; }',
        filePath: 'src/hello.js',
        language: 'javascript',
        type: 'function',
        lineStart: 1,
        lineEnd: 1,
      },
    ]);

    const results = await store.search('hello function', { limit: 5 });
    assert.ok(results.length > 0, 'Expected search results');
    assert.strictEqual(results[0].metadata.filePath, 'src/hello.js');
  });

  test('deleteFile removes matching docs', async () => {
    await store.addChunks([
      {
        id: 'chunk-2',
        content: 'const removeMe = true;\n',
        filePath: 'src/remove.js',
        language: 'javascript',
        type: 'other',
        lineStart: 1,
        lineEnd: 1,
      },
    ]);

    await store.deleteFile('src/remove.js');
    const results = await store.search('removeMe', { limit: 5 });
    const hasRemoved = results.some(r => r.metadata.filePath === 'src/remove.js');
    assert.strictEqual(hasRemoved, false);
  });
});
