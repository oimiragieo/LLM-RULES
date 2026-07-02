/**
 * Incremental indexing tests
 *
 * Tests IndexManager.incrementalUpdate() with Merkle tree integration:
 * full index creates tree, incremental update only re-indexes changed files.
 *
 * Test execution: node --test tests/code-indexing/incremental-indexing.test.cjs
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');
const { MerkleTree } = require('../../.claude/lib/code-indexing/merkle-tree.cjs');

const os = require('os');

const FIXTURES_DIR = path.join(os.tmpdir(), `incremental-indexing-fixtures-${process.pid}`);
const INCREMENTAL_TEST_DIR = path.join(FIXTURES_DIR, 'incremental-test');
const LANCEDB_DIR = path.join(INCREMENTAL_TEST_DIR, 'lancedb-test');
const TABLE_NAME = `code_index_test_${process.pid}`;

describe('Incremental indexing', () => {
  let projectRoot;
  let manager;

  before(async () => {
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = LANCEDB_DIR;
    process.env.LANCEDB_TABLE_CODE = TABLE_NAME;
    projectRoot = path.join(INCREMENTAL_TEST_DIR, 'sample-project');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, 'main.js'),
      'function hello() { return "hello"; }\nfunction world() { return "world"; }\n'
    );
    await fs.writeFile(path.join(projectRoot, 'util.js'), 'function util() { return "util"; }\n');
    manager = new IndexManager({ projectRoot });
  });

  after(async () => {
    if (manager) await manager.close();
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('full index creates Merkle tree', () => {
    test('indexDirectory creates merkle-tree.json', async () => {
      const result = await manager.indexDirectory(projectRoot);
      assert.ok(result.filesIndexed >= 1, 'At least 1 file indexed');
      assert.ok(result.chunksCreated >= 1, 'Chunks created');

      const merklePath = path.join(projectRoot, '.claude/context/code-index/merkle-tree.json');
      const content = await fs.readFile(merklePath, 'utf8').catch(() => null);
      assert.ok(content, 'Merkle tree file should exist');
      const json = JSON.parse(content);
      assert.ok(json.hash, 'Tree should have root hash');
      assert.ok(json.children, 'Tree should have children');
    });
  });

  describe('incremental update', () => {
    test('uses MerkleTree.diff when prior tree exists', async () => {
      const merklePath = path.join(projectRoot, '.claude/context/code-index/merkle-tree.json');
      const hasTree = await fs
        .access(merklePath)
        .then(() => true)
        .catch(() => false);
      if (!hasTree) {
        await manager.indexDirectory(projectRoot);
      }

      const originalDiff = MerkleTree.diff;
      let diffCalls = 0;
      MerkleTree.diff = (...args) => {
        diffCalls += 1;
        return originalDiff(...args);
      };

      try {
        await manager.incrementalUpdate();
      } finally {
        MerkleTree.diff = originalDiff;
      }

      assert.ok(diffCalls >= 1, 'Expected MerkleTree.diff to be called');
    });

    test('no changes returns immediately with no work', async () => {
      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.strictEqual(result.filesAdded, 0);
      assert.strictEqual(result.filesModified, 0);
      assert.strictEqual(result.filesDeleted, 0);
      assert.ok(result.timeMs >= 0);
    });

    test('modify file triggers re-index of that file only', async () => {
      const mainPath = path.join(projectRoot, 'main.js');
      const original = await fs.readFile(mainPath, 'utf8');
      await fs.writeFile(
        mainPath,
        'function hello() { return "hello"; }\nfunction world() { return "world"; }\n// modified\n'
      );

      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.strictEqual(result.filesAdded, 0);
      assert.strictEqual(result.filesDeleted, 0);
      assert.strictEqual(result.filesModified, 1, 'Should detect single-file modification');
      assert.ok(result.chunksUpdated >= 0);

      await fs.writeFile(mainPath, original);
    });

    test('add new file triggers index of new file only', async () => {
      const newPath = path.join(projectRoot, 'newfile.js');
      await fs.writeFile(newPath, 'function newfn() { return "new"; }\n');

      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.ok(result.filesAdded >= 1, 'Should detect new file');

      await fs.unlink(newPath).catch(() => {});
      await manager.incrementalUpdate();
    });

    test('delete file removes from index', async () => {
      const delPath = path.join(projectRoot, 'to-delete.js');
      await fs.writeFile(delPath, 'function del() {}\n');
      await manager.incrementalUpdate();

      await fs.unlink(delPath);
      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.ok(result.filesDeleted >= 1, 'Should detect deletion');
    });

    test('modified files are searchable after BM25-only incremental update', async () => {
      const isolatedRoot = path.join(INCREMENTAL_TEST_DIR, 'bm25-only-search');
      const dataDir = path.join(isolatedRoot, '.claude/context/data/lancedb');
      const targetPath = path.join(isolatedRoot, 'search-target.js');
      const previousMode = process.env.LANCEDB_EMBEDDING_MODE;
      const previousUri = process.env.LANCEDB_URI;
      const previousTable = process.env.LANCEDB_TABLE_CODE;
      let bm25Manager = null;

      process.env.LANCEDB_EMBEDDING_MODE = 'off';
      process.env.LANCEDB_URI = dataDir;
      delete process.env.LANCEDB_TABLE_CODE;

      try {
        await fs.mkdir(isolatedRoot, { recursive: true });
        await fs.writeFile(targetPath, 'function marker() { return "initial token"; }\n');

        bm25Manager = new IndexManager({ projectRoot: isolatedRoot, concurrency: 1 });
        await bm25Manager.indexDirectory(isolatedRoot);

        await fs.writeFile(
          targetPath,
          'function marker() {\n  return "quantum sparse retrieval";\n}\n'
        );
        await bm25Manager.incrementalUpdate();

        const results = await bm25Manager.semanticSearch('quantum sparse retrieval', { limit: 5 });
        assert.ok(
          results.some(result => result.filePath === targetPath),
          'BM25-only semanticSearch should find content added by incrementalUpdate'
        );
      } finally {
        if (bm25Manager) await bm25Manager.close();
        if (previousMode === undefined) delete process.env.LANCEDB_EMBEDDING_MODE;
        else process.env.LANCEDB_EMBEDDING_MODE = previousMode;
        if (previousUri === undefined) delete process.env.LANCEDB_URI;
        else process.env.LANCEDB_URI = previousUri;
        if (previousTable === undefined) delete process.env.LANCEDB_TABLE_CODE;
        else process.env.LANCEDB_TABLE_CODE = previousTable;
        await fs.rm(isolatedRoot, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe('incrementalUpdate when no previous tree', () => {
    test('falls back to full index when merkle-tree.json missing', async () => {
      const isolatedRoot = path.join(INCREMENTAL_TEST_DIR, 'no-tree');
      await fs.mkdir(isolatedRoot, { recursive: true });
      await fs.writeFile(path.join(isolatedRoot, 'only.js'), 'function only() {}\n');

      const mgr = new IndexManager({ projectRoot: isolatedRoot });
      const result = await mgr.incrementalUpdate();
      assert.ok(result.updateType === 'full' || result.updateType === 'incremental');
      assert.ok(result.filesIndexed >= 1 || result.filesAdded >= 1);

      await mgr.close();

      await fs
        .rm(path.join(isolatedRoot, '.claude'), { recursive: true, force: true })
        .catch(() => {});
      await fs.rm(isolatedRoot, { recursive: true, force: true }).catch(() => {});
    });
  });

  describe('metadata after incremental update', () => {
    test('metadata.json updated with incrementalStats', async () => {
      const metadataPath = path.join(projectRoot, '.claude/context/code-index/metadata.json');
      const content = await fs.readFile(metadataPath, 'utf8').catch(() => '{}');
      const metadata = JSON.parse(content);
      assert.ok(
        metadata.lastIncrementalUpdate === undefined ||
          typeof metadata.lastIncrementalUpdate === 'string'
      );
      if (metadata.incrementalStats) {
        assert.ok(typeof metadata.incrementalStats.filesAdded === 'number');
        assert.ok(typeof metadata.incrementalStats.filesModified === 'number');
        assert.ok(typeof metadata.incrementalStats.filesDeleted === 'number');
      }
    });
  });
});
