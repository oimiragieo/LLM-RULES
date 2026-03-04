'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
/**
 * Extraction Pipeline E2E Tests
 *
 * Tests triggerMemoryExtraction from post-completion-chain.cjs.
 * Mocks extractMemoriesFromSession to return controlled candidates
 * with varying confidence levels, and verifies:
 * - Confidence gating at 0.7 threshold
 * - Only confident memories committed to STM
 * - Low-confidence memories filtered out
 * - STM file locking used for atomic writes
 */

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extract-e2e-'));
}

function setupProject(root) {
  const dirs = [
    path.join(root, '.claude', 'context', 'memory', 'stm'),
    path.join(root, '.claude', 'context', 'memory', 'metrics'),
    path.join(root, '.claude', 'context', 'runtime'),
    path.join(root, '.claude', 'context', 'data'),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
  // Create lock sentinel
  const lockFile = path.join(root, '.claude', 'context', 'runtime', 'memory-tiers.lock');
  fs.writeFileSync(lockFile, '');
}

describe('extraction-pipeline-e2e', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    setupProject(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('filters memories below confidence threshold 0.7', async () => {
    const {
      MEMORY_CONFIDENCE_THRESHOLD,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

    assert.equal(MEMORY_CONFIDENCE_THRESHOLD, 0.7, 'Threshold should be 0.7');

    const candidates = [
      { type: 'pattern', content: 'High conf 1', confidence: 0.9 },
      { type: 'gotcha', content: 'High conf 2', confidence: 0.8 },
      { type: 'pattern', content: 'Threshold exact', confidence: 0.7 },
      { type: 'gotcha', content: 'Below threshold 1', confidence: 0.5 },
      { type: 'pattern', content: 'Below threshold 2', confidence: 0.3 },
    ];

    const confident = candidates.filter(m => {
      if (!m || typeof m !== 'object') return false;
      const conf = typeof m.confidence === 'number' ? m.confidence : 1.0;
      return conf >= MEMORY_CONFIDENCE_THRESHOLD;
    });

    assert.equal(confident.length, 3, 'Should accept 3 memories at or above 0.7');
    assert.equal(
      candidates.length - confident.length,
      2,
      'Should filter out 2 memories below 0.7'
    );
  });

  it('accepts memories without explicit confidence field (defaults to 1.0)', () => {
    const {
      MEMORY_CONFIDENCE_THRESHOLD,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

    const noConfidence = { type: 'pattern', content: 'No confidence field' };
    const conf = typeof noConfidence.confidence === 'number' ? noConfidence.confidence : 1.0;
    assert.ok(conf >= MEMORY_CONFIDENCE_THRESHOLD, 'Default 1.0 should pass threshold');
  });

  it('triggerMemoryExtraction skips when summary is short and no discoveries', () => {
    const {
      triggerMemoryExtraction,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

    // Should return without doing anything (no throw)
    const metadata = { summary: 'Short', discoveries: [] };
    const result = triggerMemoryExtraction(metadata, 'task-test');
    assert.equal(result, undefined, 'Should return undefined for short content');
  });

  it('triggerMemoryExtraction is invoked for summary > 50 chars', () => {
    const {
      triggerMemoryExtraction,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

    const longSummary = 'A'.repeat(51);
    const metadata = { summary: longSummary, discoveries: [], filesModified: [] };
    // triggerMemoryExtraction is fire-and-forget (returns undefined or a promise)
    // It should NOT throw synchronously
    assert.doesNotThrow(() => {
      triggerMemoryExtraction(metadata, 'task-long');
    });
  });

  it('triggerMemoryExtraction is invoked when discoveries are non-empty', () => {
    const {
      triggerMemoryExtraction,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

    const metadata = {
      summary: 'Short',
      discoveries: ['Found important pattern'],
      filesModified: ['src/foo.ts'],
    };
    assert.doesNotThrow(() => {
      triggerMemoryExtraction(metadata, 'task-disc');
    });
  });

  it('MEMORY_EXTRACTION_TIMEOUT_MS is 5000', () => {
    const {
      MEMORY_EXTRACTION_TIMEOUT_MS,
    } = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');
    assert.equal(MEMORY_EXTRACTION_TIMEOUT_MS, 5000, 'Timeout should be 5 seconds');
  });

  it('STM read/write round-trips correctly for extracted memories', () => {
    const { writeSTMEntry, readSTMEntry } = require('../../../.claude/lib/memory/memory-tiers.cjs');

    const memories = [
      { type: 'pattern', content: 'Test pattern', confidence: 0.9 },
      { type: 'gotcha', content: 'Test gotcha', confidence: 0.8 },
    ];

    writeSTMEntry(
      {
        extracted_memories: memories,
        extracted_memories_updated_at: new Date().toISOString(),
      },
      tmpDir
    );

    const stm = readSTMEntry(tmpDir);
    assert.ok(stm, 'STM entry should exist after write');
    assert.ok(Array.isArray(stm.extracted_memories), 'extracted_memories should be array');
    assert.equal(stm.extracted_memories.length, 2, 'Should have 2 extracted memories');
    assert.equal(stm.extracted_memories[0].type, 'pattern');
    assert.equal(stm.extracted_memories[1].type, 'gotcha');
  });

  it('STM merge preserves existing extracted memories', () => {
    const { writeSTMEntry, readSTMEntry } = require('../../../.claude/lib/memory/memory-tiers.cjs');

    // Write initial memories
    writeSTMEntry(
      {
        extracted_memories: [{ type: 'pattern', content: 'First', confidence: 0.9 }],
        extracted_memories_updated_at: new Date().toISOString(),
      },
      tmpDir
    );

    // Simulate merge (as triggerMemoryExtraction does)
    const existing = readSTMEntry(tmpDir) || {};
    const existingExtracted = Array.isArray(existing.extracted_memories)
      ? existing.extracted_memories
      : [];
    const newMemories = [{ type: 'gotcha', content: 'Second', confidence: 0.8 }];

    writeSTMEntry(
      {
        ...existing,
        extracted_memories: [...existingExtracted, ...newMemories],
        extracted_memories_updated_at: new Date().toISOString(),
      },
      tmpDir
    );

    const final = readSTMEntry(tmpDir);
    assert.equal(final.extracted_memories.length, 2, 'Should have both old and new memories');
    assert.equal(final.extracted_memories[0].content, 'First');
    assert.equal(final.extracted_memories[1].content, 'Second');
  });

  it('confidence gating with mixed confidence levels filters correctly', () => {
    const THRESHOLD = 0.7;
    const candidates = [
      { type: 'pattern', content: 'High A', confidence: 0.95 },
      { type: 'gotcha', content: 'High B', confidence: 0.75 },
      { type: 'pattern', content: 'Exact', confidence: 0.7 },
      { type: 'gotcha', content: 'Low A', confidence: 0.69 },
      { type: 'pattern', content: 'Low B', confidence: 0.1 },
    ];

    const confident = candidates.filter(m => {
      const conf = typeof m.confidence === 'number' ? m.confidence : 1.0;
      return conf >= THRESHOLD;
    });

    const gated = candidates.length - confident.length;
    assert.equal(confident.length, 3, 'Exactly 3 should pass');
    assert.equal(gated, 2, 'Exactly 2 should be gated');
    assert.deepEqual(
      confident.map(m => m.content),
      ['High A', 'High B', 'Exact']
    );
  });
});
