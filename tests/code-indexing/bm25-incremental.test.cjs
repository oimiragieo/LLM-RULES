/**
 * Tests for BM25 Incremental Update — Feature 5
 *
 * Strict TDD: These tests are written FIRST (RED phase).
 * The implementation module .claude/lib/code-indexing/bm25-incremental.cjs
 * does not exist yet and these tests must fail.
 *
 * @see .claude/lib/code-indexing/bm25-incremental.cjs
 * @see .claude/lib/code-indexing/bm25-indexer.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('node:perf_hooks');
const { BM25Indexer } = require('../../.claude/lib/code-indexing/bm25-indexer.cjs');
const {
  updateFileInBM25,
  incrementalUpdateFile,
} = require('../../.claude/lib/code-indexing/bm25-incremental.cjs');

describe('BM25 Incremental Update', () => {
  let tmpDir;
  let bm25Index;
  let fileA;
  let fileB;

  beforeEach(() => {
    // Create a temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm25-incr-'));

    // Create test files
    fileA = path.join(tmpDir, 'moduleA.js');
    fileB = path.join(tmpDir, 'moduleB.js');

    fs.writeFileSync(fileA, 'function alpha() {\n  return "hello world";\n}\n', 'utf8');
    fs.writeFileSync(fileB, 'function beta() {\n  return "goodbye universe";\n}\n', 'utf8');

    // Build initial BM25 index with known documents
    bm25Index = new BM25Indexer();
    bm25Index.addDocuments([
      {
        id: `moduleA.js:0`,
        text: 'function alpha() {\n  return "hello world";\n}',
        metadata: { filePath: fileA, startLine: 1, endLine: 3 },
      },
      {
        id: `moduleB.js:0`,
        text: 'function beta() {\n  return "goodbye universe";\n}',
        metadata: { filePath: fileB, startLine: 1, endLine: 3 },
      },
    ]);
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates index when a file is modified', () => {
    // Modify fileA content
    fs.writeFileSync(fileA, 'function alpha() {\n  return "quantum computing rocks";\n}\n', 'utf8');

    const result = updateFileInBM25(fileA, bm25Index, tmpDir);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'updated');

    // Old content should not be searchable
    const oldResults = bm25Index.search('hello world');
    const oldHits = oldResults.filter(r => r.id.startsWith('moduleA.js'));
    assert.equal(oldHits.length, 0, 'Old content "hello world" should be gone from moduleA');

    // New content should be searchable
    const newResults = bm25Index.search('quantum computing');
    const newHits = newResults.filter(r => r.id.startsWith('moduleA.js'));
    assert.ok(
      newHits.length > 0,
      'New content "quantum computing" should be searchable in moduleA'
    );
  });

  it('removes old chunks for the file before adding new ones', () => {
    // Modify fileA — the old chunk must be removed, no duplicates
    fs.writeFileSync(fileA, 'function alpha() {\n  return "refactored alpha logic";\n}\n', 'utf8');

    updateFileInBM25(fileA, bm25Index, tmpDir);

    // Search for something present in both old and new content
    const results = bm25Index.search('alpha');
    const moduleAHits = results.filter(r => r.id.startsWith('moduleA.js'));

    // There should be exactly 1 chunk from moduleA, not 2 (no duplicates)
    assert.equal(moduleAHits.length, 1, 'Should have exactly 1 chunk from moduleA (no duplicates)');
  });

  it('new content is searchable after update', () => {
    // Write completely new content to fileA
    fs.writeFileSync(
      fileA,
      'class NeuralNetwork {\n  train(data) {\n    return this.layers.forward(data);\n  }\n}\n',
      'utf8'
    );

    updateFileInBM25(fileA, bm25Index, tmpDir);

    const results = bm25Index.search('NeuralNetwork train layers');
    assert.ok(results.length > 0, 'New class content should be found by search');

    // Verify the hit is from moduleA
    const moduleAHit = results.find(r => r.id.startsWith('moduleA.js'));
    assert.ok(moduleAHit, 'Result should come from moduleA.js');
  });

  it('other files remain unchanged in index', () => {
    // Verify moduleB is searchable before update
    const beforeResults = bm25Index.search('goodbye universe');
    const beforeHits = beforeResults.filter(r => r.id.startsWith('moduleB.js'));
    assert.ok(beforeHits.length > 0, 'moduleB should be searchable before update');

    // Update only fileA
    fs.writeFileSync(fileA, 'function alpha() {\n  return "changed content";\n}\n', 'utf8');
    updateFileInBM25(fileA, bm25Index, tmpDir);

    // moduleB should still be searchable and unchanged
    const afterResults = bm25Index.search('goodbye universe');
    const afterHits = afterResults.filter(r => r.id.startsWith('moduleB.js'));
    assert.ok(afterHits.length > 0, 'moduleB should still be searchable after updating moduleA');
    assert.equal(afterHits[0].id, beforeHits[0].id, 'moduleB document ID should be unchanged');
  });

  it('handles non-existent file gracefully', () => {
    const fakePath = path.join(tmpDir, 'nonexistent.js');

    // File does not exist — should not throw, should return a result
    const result = updateFileInBM25(fakePath, bm25Index, tmpDir);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'deleted');
    assert.equal(result.chunksAdded, 0);
  });

  it('handles file deletion (removes from index, no re-add)', () => {
    // Delete fileA from disk
    fs.unlinkSync(fileA);

    const result = updateFileInBM25(fileA, bm25Index, tmpDir);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'deleted');
    assert.equal(result.chunksAdded, 0);

    // fileA content should no longer be in search results
    const results = bm25Index.search('alpha hello');
    const moduleAHits = results.filter(r => r.id.startsWith('moduleA.js'));
    assert.equal(moduleAHits.length, 0, 'Deleted file should not appear in search results');

    // fileB should still be findable
    const bResults = bm25Index.search('beta goodbye');
    const moduleBHits = bResults.filter(r => r.id.startsWith('moduleB.js'));
    assert.ok(moduleBHits.length > 0, 'Other file should still be in index');
  });

  it('completes in <150ms for a single file', () => {
    // Write a moderately sized file (200 lines)
    const lines = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`const variable${i} = "value_${i}"; // line ${i}`);
    }
    const bigFile = path.join(tmpDir, 'bigfile.js');
    fs.writeFileSync(bigFile, lines.join('\n'), 'utf8');

    // Add initial doc so removal path is exercised
    bm25Index.addDocuments([
      {
        id: 'bigfile.js:0',
        text: 'old content placeholder',
        metadata: { filePath: bigFile, startLine: 1, endLine: 1 },
      },
    ]);

    const start = performance.now();
    updateFileInBM25(bigFile, bm25Index, tmpDir);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 150, `Should complete in <150ms, took ${elapsed.toFixed(2)}ms`);
  });

  it('saves BM25 index to disk after update', async () => {
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    // Create a mock vectorStore-like object with the needed methods
    const vectorStore = {
      bm25Index,
      persistDirectory: dataDir,
      async loadBM25Index() {
        // Already loaded
      },
      async saveBM25Index() {
        // Persist to disk (mimics VectorStore.saveBM25Index)
        const bm25Path = path.join(this.persistDirectory, 'bm25-index.json');
        fs.writeFileSync(bm25Path, JSON.stringify(this.bm25Index.toJSON()), 'utf8');
      },
    };

    // Modify fileA
    fs.writeFileSync(fileA, 'function alpha() {\n  return "persisted update";\n}\n', 'utf8');

    // Use the convenience function that loads, updates, and saves
    const result = await incrementalUpdateFile(fileA, vectorStore, tmpDir);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'updated');

    // Verify the BM25 index file exists on disk
    const bm25Path = path.join(dataDir, 'bm25-index.json');
    assert.ok(fs.existsSync(bm25Path), 'BM25 index file should exist on disk after update');

    // Verify we can load it back and search
    const savedData = JSON.parse(fs.readFileSync(bm25Path, 'utf8'));
    const restoredIndex = BM25Indexer.fromJSON(savedData);
    const results = restoredIndex.search('persisted update');
    assert.ok(results.length > 0, 'Saved index should contain updated content');
  });
});
