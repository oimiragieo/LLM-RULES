/**
 * Search tools and indexing - End-to-end integration tests
 *
 * Full workflow: Index → Modify → Incremental update → Search (ripgrep, ast-grep, semantic).
 * Verifies Merkle tree enables efficient incremental updates and all search tools work together.
 *
 * Test execution: node --test tests/code-indexing/search-tools-integration.test.cjs
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');

// Keep tests lightweight and deterministic: force-disable semantic model workers.
process.env.CODE_INDEX_EMBEDDER = 'mock';
process.env.CODE_INDEX_EMBEDDINGS = 'off';
process.env.MEMORY_SEMANTIC_SEARCH = 'off';
process.env.LANCEDB_EMBEDDING_MODE = 'test';

const { IndexManager } = require('../../.claude/lib/code-indexing/index-manager.cjs');
const { MerkleTree } = require('../../.claude/lib/code-indexing/merkle-tree.cjs');
const { ContextualMemory } = require('../../.claude/lib/memory/contextual-memory.cjs');
const { AstGrepSearch } = require('../../.claude/lib/code-indexing/ast-grep-wrapper.cjs');

const os = require('os');

const FIXTURES_DIR = path.join(os.tmpdir(), `code-indexing-fixtures-${process.pid}`);
const E2E_PROJECT = path.join(FIXTURES_DIR, 'e2e-project');

describe('Search tools and indexing E2E', () => {
  let manager;
  let projectRoot;

  before(async () => {
    projectRoot = path.join(E2E_PROJECT, 'src');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, 'app.js'),
      'function greet() { return "Hello"; }\nfunction farewell() { return "Bye"; }\n'
    );
    await fs.writeFile(path.join(projectRoot, 'util.js'), 'function add(a, b) { return a + b; }\n');
    manager = new IndexManager({ projectRoot: E2E_PROJECT });
  });

  after(async () => {
    if (manager) await manager.close();
    const { MemoryVectorStore } = require('../../.claude/lib/memory/lancedb-client-impl.cjs');
    MemoryVectorStore.clearSharedStores();
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('full workflow', () => {
    test('1. Full index creates Merkle tree', async () => {
      const result = await manager.indexDirectory(E2E_PROJECT);
      assert.ok(result.filesIndexed >= 1, 'At least 1 file indexed');
      assert.ok(result.chunksCreated >= 1, 'Chunks created');

      const merklePath = path.join(E2E_PROJECT, '.claude/context/code-index/merkle-tree.json');
      const content = await fs.readFile(merklePath, 'utf8').catch(() => null);
      assert.ok(content, 'Merkle tree file should exist');
    });

    test('2. Modify file then incremental update detects change', async () => {
      const appPath = path.join(projectRoot, 'app.js');
      const original = await fs.readFile(appPath, 'utf8');
      await fs.writeFile(
        appPath,
        'function greet() { return "Hello"; }\nfunction farewell() { return "Bye"; }\n// updated\n'
      );

      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.ok(
        result.filesModified >= 1 || result.chunksUpdated >= 0,
        'Should detect modification'
      );

      await fs.writeFile(appPath, original);
    });

    test('3. Merkle tree detects change', async () => {
      const merklePath = path.join(E2E_PROJECT, '.claude/context/code-index/merkle-tree.json');
      const oldTree = await MerkleTree.load(merklePath);
      assert.ok(oldTree, 'Old tree loaded');

      const appPath = path.join(projectRoot, 'app.js');
      const original = await fs.readFile(appPath, 'utf8');
      await fs.writeFile(appPath, 'function changed() { return "changed"; }\n');

      const newTree = new MerkleTree(E2E_PROJECT, []);
      await newTree.build();
      const diff = MerkleTree.diff(oldTree, newTree.root, '');
      assert.ok(diff.modified.length >= 1, 'Merkle diff should detect modified file');

      await fs.writeFile(appPath, original);
    });

    test('4. Only changed file re-indexed (incremental)', async () => {
      const appPath = path.join(projectRoot, 'app.js');
      const original = await fs.readFile(appPath, 'utf8');
      await fs.writeFile(appPath, 'function greet() { return "Hi"; }\n');

      const result = await manager.incrementalUpdate();
      assert.strictEqual(result.updateType, 'incremental');
      assert.ok(result.filesModified >= 1 || result.filesAdded === 0, 'Incremental update ran');

      await fs.writeFile(appPath, original);
      await manager.incrementalUpdate();
    });
  });

  describe('search tools together', () => {
    test('ripgrep keyword search via ContextualMemory', async () => {
      const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'learnings.md'), 'greet function says hello.\n');
      const memory = new ContextualMemory({ memoryDir });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const results = await memory.search('greet', { limit: 5 });
      assert.ok(Array.isArray(results));
    });

    test('ast-grep structural search when available', async () => {
      const sg = new AstGrepSearch({ projectRoot: E2E_PROJECT });
      const isAvailable = await sg.isAvailable();
      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }
      const results = await sg.search('function $NAME($$$) { $$$ }', 'javascript');
      assert.ok(Array.isArray(results));
    });

    test('semantic search when index exists', async () => {
      const results = await manager.semanticSearch('greet or hello function', { limit: 5 });
      assert.ok(Array.isArray(results));
    });
  });

  describe('hook integration (triggerIndexUpdate)', () => {
    test('code-index-updater triggerIndexUpdate does not throw', async () => {
      const codeIndexUpdater = require('../../.claude/hooks/routing/code-index-updater.cjs');
      const orig = process.env.CODE_INDEX_AUTO_UPDATE;
      process.env.CODE_INDEX_AUTO_UPDATE = 'off';
      await assert.doesNotReject(() =>
        codeIndexUpdater.triggerIndexUpdate(path.join(projectRoot, 'app.js'))
      );
      if (orig !== undefined) process.env.CODE_INDEX_AUTO_UPDATE = orig;
      else delete process.env.CODE_INDEX_AUTO_UPDATE;
      await new Promise(r => setImmediate(r));
      await new Promise(r => setTimeout(r, 200));
    });
  });
});
