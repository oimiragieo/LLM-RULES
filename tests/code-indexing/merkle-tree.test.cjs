/**
 * Merkle tree tests
 *
 * Tests tree building, diffing, serialization, change detection,
 * exclude patterns, and persistence.
 *
 * Test execution: node --test tests/code-indexing/merkle-tree.test.cjs
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { MerkleTree, MerkleNode } = require('../../.claude/lib/code-indexing/merkle-tree.cjs');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing');
const MERKLE_TEST_DIR = path.join(FIXTURES_DIR, 'merkle-test');

describe('MerkleTree', () => {
  before(async () => {
    await fs.mkdir(MERKLE_TEST_DIR, { recursive: true });
    await fs.mkdir(path.join(MERKLE_TEST_DIR, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(MERKLE_TEST_DIR, 'a.js'), 'const a = 1;\n');
    await fs.writeFile(path.join(MERKLE_TEST_DIR, 'b.js'), 'const b = 2;\n');
    await fs.writeFile(path.join(MERKLE_TEST_DIR, 'subdir', 'c.js'), 'const c = 3;\n');
  });

  after(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('tree building', () => {
    test('builds tree from directory structure', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      const root = await tree.build();
      assert.ok(root, 'Root should be built');
      assert.strictEqual(root.type, 'directory');
      assert.ok(root.hash, 'Root should have hash');
      assert.ok(root.children, 'Root should have children');
      assert.ok(root.children['a.js'], 'Should have a.js');
      assert.ok(root.children['b.js'], 'Should have b.js');
      assert.ok(root.children['subdir'], 'Should have subdir');
      assert.strictEqual(root.children['a.js'].type, 'file');
      assert.strictEqual(root.children['subdir'].type, 'directory');
    });

    test('file hashing includes content and metadata', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      const fileHash = await tree.hashFile(path.join(MERKLE_TEST_DIR, 'a.js'));
      assert.ok(fileHash, 'Should return hash');
      assert.strictEqual(typeof fileHash, 'string');
      assert.ok(fileHash.length === 64, 'SHA256 hex length');
    });

    test('directory hashing combines children hashes', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const children = tree.root.children;
      const dirHash = tree.hashDirectory(children);
      assert.ok(dirHash, 'Should return hash');
      assert.strictEqual(tree.root.hash, dirHash, 'Root hash should match hashDirectory result');
    });

    test('empty directory returns null subtree', async () => {
      const emptyDir = path.join(MERKLE_TEST_DIR, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });
      const tree = new MerkleTree(emptyDir);
      const root = await tree.build();
      assert.strictEqual(root, null, 'Empty directory should yield null');
    });
  });

  describe('serialization / deserialization', () => {
    test('MerkleNode toJSON and fromJSON round-trip', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const json = tree.root.toJSON();
      assert.ok(json.type && json.name && json.hash);
      const restored = MerkleNode.fromJSON(json);
      assert.strictEqual(restored.type, tree.root.type);
      assert.strictEqual(restored.name, tree.root.name);
      assert.strictEqual(restored.hash, tree.root.hash);
      assert.ok(restored.children && restored.children['a.js']);
    });

    test('tree save and load', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const savePath = path.join(MERKLE_TEST_DIR, '.merkle-tree.json');
      await tree.save(savePath);
      const loaded = await MerkleTree.load(savePath);
      assert.ok(loaded, 'Should load tree');
      assert.strictEqual(loaded.hash, tree.root.hash);
      await fs.unlink(savePath).catch(() => {});
    });

    test('load returns null for missing file', async () => {
      const loaded = await MerkleTree.load(path.join(MERKLE_TEST_DIR, 'nonexistent.json'));
      assert.strictEqual(loaded, null);
    });
  });

  describe('tree diffing', () => {
    test('no changes returns empty arrays', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const diff = MerkleTree.diff(tree.root, tree.root, '');
      assert.deepStrictEqual(diff.added, []);
      assert.deepStrictEqual(diff.modified, []);
      assert.deepStrictEqual(diff.deleted, []);
    });

    test('modified file detected', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const oldRoot = tree.root;

      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'a.js'), 'const a = 99;\n');
      await tree.build();
      const diff = MerkleTree.diff(oldRoot, tree.root, '');

      assert.ok(diff.modified.length >= 1, 'Should detect modification');
      assert.ok(
        diff.modified.some(p => p === 'a.js' || p.endsWith('a.js')),
        'Modified should include a.js'
      );

      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'a.js'), 'const a = 1;\n');
    });

    test('added file detected', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const oldRoot = tree.root;

      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'new.js'), 'const x = 0;\n');
      await tree.build();
      const diff = MerkleTree.diff(oldRoot, tree.root, '');

      assert.ok(diff.added.length >= 1, 'Should detect addition');
      assert.ok(
        diff.added.some(p => p === 'new.js' || p.endsWith('new.js')),
        'Added should include new.js'
      );

      await fs.unlink(path.join(MERKLE_TEST_DIR, 'new.js')).catch(() => {});
    });

    test('deleted file detected', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'to-delete.js'), 'delete me\n');
      await tree.build();
      const oldRoot = tree.root;

      await fs.unlink(path.join(MERKLE_TEST_DIR, 'to-delete.js'));
      await tree.build();
      const diff = MerkleTree.diff(oldRoot, tree.root, '');

      assert.ok(diff.deleted.length >= 1, 'Should detect deletion');
      assert.ok(
        diff.deleted.some(p => p === 'to-delete.js' || p.endsWith('to-delete.js')),
        'Deleted should include to-delete.js'
      );
    });

    test('modify file in subdirectory detected', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const oldRoot = tree.root;

      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'subdir', 'c.js'), 'const c = 999;\n');
      await tree.build();
      const diff = MerkleTree.diff(oldRoot, tree.root, '');

      assert.ok(diff.modified.length >= 1);
      assert.ok(
        diff.modified.some(p => p.includes('subdir') && p.includes('c.js')),
        'Should detect subdir/c.js change'
      );

      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'subdir', 'c.js'), 'const c = 3;\n');
    });

    test('changes beyond first 1KB are detected', async () => {
      const longFile = path.join(MERKLE_TEST_DIR, 'long-content.js');
      const prefix = 'A'.repeat(1200);
      const suffixA = 'TAIL_ALPHA';
      const suffixB = 'TAIL_BETA';

      await fs.writeFile(longFile, `${prefix}${suffixA}\n`);
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const oldRoot = tree.root;

      await fs.writeFile(longFile, `${prefix}${suffixB}\n`);
      await tree.build();
      const diff = MerkleTree.diff(oldRoot, tree.root, '');

      assert.ok(
        diff.modified.some(p => p === 'long-content.js' || p.endsWith('long-content.js')),
        'Deep-tail content change should be detected as modified'
      );
    });
  });

  describe('exclude patterns', () => {
    test('excluded paths are not included in tree', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR, ['**/node_modules/**', '**/*.exclude']);
      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'keep.js'), 'keep\n');
      await fs.mkdir(path.join(MERKLE_TEST_DIR, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'node_modules', 'pkg.js'), 'pkg\n');
      await fs.writeFile(path.join(MERKLE_TEST_DIR, 'file.exclude'), 'exclude\n');

      await tree.build();
      const hasNodeModules = tree.root && tree.root.children && tree.root.children['node_modules'];
      const hasExclude = tree.root && tree.root.children && tree.root.children['file.exclude'];
      assert.ok(!hasNodeModules, 'node_modules should be excluded');
      assert.ok(!hasExclude, '*.exclude should be excluded');
      assert.ok(tree.root.children['keep.js'], 'keep.js should be included');

      await fs
        .rm(path.join(MERKLE_TEST_DIR, 'node_modules'), { recursive: true, force: true })
        .catch(() => {});
      await fs.unlink(path.join(MERKLE_TEST_DIR, 'file.exclude')).catch(() => {});
      await fs.unlink(path.join(MERKLE_TEST_DIR, 'keep.js')).catch(() => {});
    });
  });

  describe('hash comparison optimization', () => {
    test('identical subtree hashes skip deep diff', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await tree.build();
      const rootCopy = MerkleNode.fromJSON(tree.root.toJSON());
      const diff = MerkleTree.diff(tree.root, rootCopy, '');
      assert.strictEqual(diff.added.length, 0);
      assert.strictEqual(diff.modified.length, 0);
      assert.strictEqual(diff.deleted.length, 0);
    });
  });

  describe('save without build throws', () => {
    test('save() throws when tree not built', async () => {
      const tree = new MerkleTree(MERKLE_TEST_DIR);
      await assert.rejects(
        () => tree.save(path.join(MERKLE_TEST_DIR, 'out.json')),
        /Tree not built/
      );
    });
  });
});
