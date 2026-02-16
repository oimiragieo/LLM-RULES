'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We'll test the function directly once it exists
let evictOldLTMSummaries;

try {
  const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
  evictOldLTMSummaries = memoryTiers.evictOldLTMSummaries;
} catch (_e) {
  // Function doesn't exist yet - expected for RED phase
}

test('test evicts oldest summary files when exceeding LTM_MAX_SUMMARIES', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-test-'));
  const ltmDir = path.join(tempDir, '.claude', 'context', 'memory', 'ltm');
  fs.mkdirSync(ltmDir, { recursive: true });

  try {
    // Create 25 summary files with timestamp-based names
    for (let i = 0; i < 25; i++) {
      const filename = `summary_2026-02-${String(i + 1).padStart(2, '0')}_000000.json`;
      fs.writeFileSync(path.join(ltmDir, filename), JSON.stringify({ data: i }));
    }

    // Verify 25 files exist
    let files = fs.readdirSync(ltmDir).filter(f => f.startsWith('summary_'));
    assert.strictEqual(files.length, 25, 'Should have 25 summary files before eviction');

    // Call eviction (function should exist after GREEN phase)
    if (typeof evictOldLTMSummaries === 'function') {
      evictOldLTMSummaries(tempDir);

      // Verify only 20 remain (LTM_MAX_SUMMARIES)
      files = fs.readdirSync(ltmDir).filter(f => f.startsWith('summary_'));
      assert.strictEqual(files.length, 20, 'Should have exactly 20 summary files after eviction');

      // Verify oldest 5 were deleted
      const remainingFiles = new Set(files);
      for (let i = 0; i < 5; i++) {
        const filename = `summary_2026-02-${String(i + 1).padStart(2, '0')}_000000.json`;
        assert.ok(!remainingFiles.has(filename), `Oldest file ${filename} should be deleted`);
      }
    } else {
      assert.fail('evictOldLTMSummaries function does not exist yet');
    }
  } finally {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('test preserves promoted_ files during eviction', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-test-'));
  const ltmDir = path.join(tempDir, '.claude', 'context', 'memory', 'ltm');
  fs.mkdirSync(ltmDir, { recursive: true });

  try {
    // Create 25 summary files + 3 promoted files
    for (let i = 0; i < 25; i++) {
      const filename = `summary_2026-02-${String(i + 1).padStart(2, '0')}_000000.json`;
      fs.writeFileSync(path.join(ltmDir, filename), JSON.stringify({ data: i }));
    }

    // Add promoted files
    fs.writeFileSync(path.join(ltmDir, 'promoted_important_20260101.json'), '{}');
    fs.writeFileSync(path.join(ltmDir, 'promoted_critical_20260102.json'), '{}');
    fs.writeFileSync(path.join(ltmDir, 'promoted_milestone_20260103.json'), '{}');

    if (typeof evictOldLTMSummaries === 'function') {
      evictOldLTMSummaries(tempDir);

      // Verify promoted files still exist
      const files = fs.readdirSync(ltmDir);
      assert.ok(
        files.includes('promoted_important_20260101.json'),
        'Promoted file 1 should be preserved'
      );
      assert.ok(
        files.includes('promoted_critical_20260102.json'),
        'Promoted file 2 should be preserved'
      );
      assert.ok(
        files.includes('promoted_milestone_20260103.json'),
        'Promoted file 3 should be preserved'
      );

      // Verify summary files were evicted correctly (only 20 remain)
      const summaryFiles = files.filter(f => f.startsWith('summary_'));
      assert.strictEqual(summaryFiles.length, 20, 'Should have exactly 20 summary files');
    } else {
      assert.fail('evictOldLTMSummaries function does not exist yet');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('test no eviction when under LTM_MAX_SUMMARIES', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-test-'));
  const ltmDir = path.join(tempDir, '.claude', 'context', 'memory', 'ltm');
  fs.mkdirSync(ltmDir, { recursive: true });

  try {
    // Create only 15 summary files (under limit of 20)
    for (let i = 0; i < 15; i++) {
      const filename = `summary_2026-02-${String(i + 1).padStart(2, '0')}_000000.json`;
      fs.writeFileSync(path.join(ltmDir, filename), JSON.stringify({ data: i }));
    }

    if (typeof evictOldLTMSummaries === 'function') {
      evictOldLTMSummaries(tempDir);

      // Verify all 15 files still exist
      const files = fs.readdirSync(ltmDir).filter(f => f.startsWith('summary_'));
      assert.strictEqual(files.length, 15, 'All 15 files should remain when under limit');
    } else {
      assert.fail('evictOldLTMSummaries function does not exist yet');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('test eviction at exact boundary (20 files)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-test-'));
  const ltmDir = path.join(tempDir, '.claude', 'context', 'memory', 'ltm');
  fs.mkdirSync(ltmDir, { recursive: true });

  try {
    // Create exactly 20 summary files (at boundary)
    for (let i = 0; i < 20; i++) {
      const filename = `summary_2026-02-${String(i + 1).padStart(2, '0')}_000000.json`;
      fs.writeFileSync(path.join(ltmDir, filename), JSON.stringify({ data: i }));
    }

    if (typeof evictOldLTMSummaries === 'function') {
      const result = evictOldLTMSummaries(tempDir);

      // Verify no eviction happened
      assert.strictEqual(result.evicted, 0, 'Should not evict when at exact boundary');

      const files = fs.readdirSync(ltmDir).filter(f => f.startsWith('summary_'));
      assert.strictEqual(files.length, 20, 'All 20 files should remain at boundary');
    } else {
      assert.fail('evictOldLTMSummaries function does not exist yet');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
