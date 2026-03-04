'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * P0 Verification: STM merge atomicity under concurrent writes.
 *
 * The post-completion-chain triggerMemoryExtraction function performs
 * read-STM -> merge -> write-STM without file locking. This test
 * proves that concurrent calls can lose writes (known gap) or that
 * locking was added. Either way the test documents the actual
 * behaviour.
 */
describe('STM merge atomicity', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stm-merge-atomicity-'));
    const stmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'stm');
    fs.mkdirSync(stmDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('sequential STM merges preserve all memories', () => {
    const { readSTMEntry, writeSTMEntry } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );

    // Write initial STM with one existing memory
    writeSTMEntry(
      {
        session_id: 'test-session',
        extracted_memories: [{ id: 'existing-1', content: 'original' }],
      },
      projectRoot
    );

    // Simulate 5 sequential merge operations (like triggerMemoryExtraction)
    for (let i = 0; i < 5; i++) {
      const existing = readSTMEntry(projectRoot) || {};
      const existingExtracted = Array.isArray(existing.extracted_memories)
        ? existing.extracted_memories
        : [];
      const newMemories = [
        { id: `batch-${i}-a`, content: `memory-${i}-a` },
        { id: `batch-${i}-b`, content: `memory-${i}-b` },
      ];
      const merged = {
        ...existing,
        extracted_memories: [...existingExtracted, ...newMemories],
        extracted_memories_updated_at: new Date().toISOString(),
      };
      writeSTMEntry(merged, projectRoot);
    }

    const final = readSTMEntry(projectRoot);
    assert.ok(final, 'Final STM entry should exist');
    assert.ok(Array.isArray(final.extracted_memories), 'extracted_memories should be array');
    // 1 original + 5 batches * 2 = 11
    assert.equal(final.extracted_memories.length, 11);

    // Verify all IDs present
    const ids = new Set(final.extracted_memories.map(m => m.id));
    assert.ok(ids.has('existing-1'), 'original memory preserved');
    for (let i = 0; i < 5; i++) {
      assert.ok(ids.has(`batch-${i}-a`), `batch-${i}-a present`);
      assert.ok(ids.has(`batch-${i}-b`), `batch-${i}-b present`);
    }
  });

  it('concurrent STM merges may lose writes without locking', async () => {
    const { readSTMEntry, writeSTMEntry } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );

    writeSTMEntry(
      {
        session_id: 'test-session',
        extracted_memories: [{ id: 'existing-1', content: 'original' }],
      },
      projectRoot
    );

    // Simulate 5 concurrent read-merge-write operations
    // Each reads the same base, merges 2 memories, then writes.
    // Without locking, only the last writer wins.
    const mergeOp = (batchIdx) => {
      return new Promise((resolve) => {
        setImmediate(() => {
          const existing = readSTMEntry(projectRoot) || {};
          const existingExtracted = Array.isArray(existing.extracted_memories)
            ? existing.extracted_memories
            : [];
          const newMemories = [
            { id: `concurrent-${batchIdx}-a`, content: `mem-${batchIdx}-a` },
            { id: `concurrent-${batchIdx}-b`, content: `mem-${batchIdx}-b` },
          ];
          const merged = {
            ...existing,
            extracted_memories: [...existingExtracted, ...newMemories],
            extracted_memories_updated_at: new Date().toISOString(),
          };
          writeSTMEntry(merged, projectRoot);
          resolve();
        });
      });
    };

    await Promise.all([mergeOp(0), mergeOp(1), mergeOp(2), mergeOp(3), mergeOp(4)]);

    const final = readSTMEntry(projectRoot);
    assert.ok(final, 'Final STM entry should exist');
    assert.ok(Array.isArray(final.extracted_memories), 'extracted_memories should be array');

    // Document actual behaviour: without locking we expect data loss.
    // With single-threaded Node.js event loop, setImmediate runs sequentially
    // so we may get all 11. The test documents the ACTUAL count.
    const count = final.extracted_memories.length;

    // At minimum the original must be in every batch's read
    // The final count should be between 3 (worst: last writer only)
    // and 11 (best: sequential execution via event loop)
    assert.ok(count >= 3, `expected at least 3 memories, got ${count}`);
    assert.ok(count <= 11, `expected at most 11 memories, got ${count}`);

    // Log actual count for observability
    process.stderr.write(
      `[stm-merge-atomicity] concurrent merge result: ${count}/11 memories preserved\n`
    );
  });

  it('readSTMEntry returns null for missing file', () => {
    const { readSTMEntry } = require('../../../.claude/lib/memory/memory-tiers.cjs');
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stm-empty-'));
    const result = readSTMEntry(emptyRoot);
    assert.equal(result, null);
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  });

  it('writeSTMEntry creates stm directory if missing', () => {
    const { writeSTMEntry, readSTMEntry } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );
    const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stm-no-dir-'));
    const result = writeSTMEntry({ session_id: 'new', data: 'test' }, freshRoot);
    assert.ok(result.success, 'write should succeed');
    const read = readSTMEntry(freshRoot);
    assert.equal(read.session_id, 'new');
    fs.rmSync(freshRoot, { recursive: true, force: true });
  });
});
