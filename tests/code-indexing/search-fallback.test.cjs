'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { VectorStore } = require('../../.claude/lib/code-indexing/vector-store.cjs');

describe('Search fallback resilience', () => {
  test('corrupted BM25 index does not crash and hybrid search still returns sparse results', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-fallback-'));
    const bm25Path = path.join(tmpDir, 'bm25-index.json');
    fs.writeFileSync(bm25Path, '{"broken":', 'utf8');

    const store = new VectorStore({
      projectRoot: tmpDir,
      persistDirectory: tmpDir,
      embeddingMode: 'off',
    });

    await store.loadBM25Index();

    await store.addChunksToBM25([
      {
        id: 'chunk-1',
        content: 'login handler validates token',
        filePath: 'src/auth.js',
        lineStart: 1,
        lineEnd: 1,
      },
    ]);

    const results = await store.hybridSearch('login token', {
      mode: 'hybrid',
      k_sparse: 5,
      k_dense: 5,
    });
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.id === 'chunk-1' || r.metadata?.filePath === 'src/auth.js'));

    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('LANCEDB_EMBEDDING_MODE=off keeps BM25-only search functional', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-bm25-only-'));
    const prevMode = process.env.LANCEDB_EMBEDDING_MODE;
    process.env.LANCEDB_EMBEDDING_MODE = 'off';

    const store = new VectorStore({
      projectRoot: tmpDir,
      persistDirectory: tmpDir,
    });

    await store.addChunksToBM25([
      {
        id: 'chunk-2',
        content: 'memory cache invalidation strategy',
        filePath: 'src/cache.js',
        lineStart: 1,
        lineEnd: 1,
      },
    ]);

    const results = await store.hybridSearch('cache invalidation', {
      mode: 'hybrid',
      k_sparse: 5,
      k_dense: 5,
    });
    assert.ok(results.length > 0);

    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (prevMode === undefined) delete process.env.LANCEDB_EMBEDDING_MODE;
    else process.env.LANCEDB_EMBEDDING_MODE = prevMode;
  });
});
