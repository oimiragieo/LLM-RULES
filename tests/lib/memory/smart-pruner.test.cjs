#!/usr/bin/env node
/**
 * Tests for smart-pruner.cjs
 * Step 6: jaccardSimilarity() and deduplicateFile() tests (TDD RED phase)
 * Step 7: pruneResolvedEntries() tests (TDD RED phase)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests/fixtures/memory-management');

// Helper: Create temporary test directory
function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `smart-pruner-test-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

// Helper: Clean up temporary directory
function cleanupTempDir(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ========================================================================
// Step 6: jaccardSimilarity() and deduplicateFile() tests (TDD RED phase)
// ========================================================================

test('jaccardSimilarity() - identical strings return 1.0', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const result = pruner.jaccardSimilarity('hello world', 'hello world');

  assert.strictEqual(result, 1.0, 'Identical strings should have similarity 1.0');
});

test('jaccardSimilarity() - completely different strings return 0.0', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const result = pruner.jaccardSimilarity('hello', 'goodbye');

  assert.strictEqual(result, 0.0, 'Completely different strings should have similarity 0.0');
});

test('jaccardSimilarity() - partial overlap returns correct similarity', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  // "the quick brown fox" vs "the quick red fox"
  // Overlap: {the, quick, fox} = 3 words
  // Union: {the, quick, brown, fox, red} = 5 words
  // Jaccard: 3/5 = 0.6
  const result = pruner.jaccardSimilarity('the quick brown fox', 'the quick red fox');

  assert.ok(Math.abs(result - 0.6) < 0.01, `Expected ~0.6, got ${result}`);
});

test('jaccardSimilarity() - empty strings return 0', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const result = pruner.jaccardSimilarity('', '');

  assert.strictEqual(result, 0, 'Empty strings should have similarity 0 (edge case)');
});

test('deduplicateFile() - removes near-duplicate sections', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  // Use the duplicate-issues.md fixture
  const fixtureContent = fs.readFileSync(path.join(FIXTURES_DIR, 'duplicate-issues.md'), 'utf8');

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'test-issues.md');
    fs.writeFileSync(testFile, fixtureContent);

    const result = pruner.deduplicateFile(testFile);

    assert.strictEqual(result.duplicatesFound, 2, 'Should find 2 duplicates in fixture');
    assert.strictEqual(result.duplicatesRemoved, 1, 'Should remove 1 duplicate (keep longer)');

    const finalContent = fs.readFileSync(testFile, 'utf8');
    // Should keep only one of the two "Windows Path Normalization" entries
    const matches = finalContent.match(/Windows Path Normalization/g);
    assert.ok(matches && matches.length === 1, 'Should keep only one Windows Path entry');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('deduplicateFile() - preserves [PERMANENT] sections even if similar', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const content = `# Issues

## Important Issue [PERMANENT]

**Date:** 2026-02-01

This is an important issue that should never be removed.

---

## Important Issue Duplicate

**Date:** 2026-02-02

This is an important issue that should never be removed.

---`;

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(testFile, content);

    const result = pruner.deduplicateFile(testFile);

    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.ok(finalContent.includes('[PERMANENT]'), '[PERMANENT] section should be kept');
    // Both sections should remain because one is [PERMANENT]
    const matches = finalContent.match(/Important Issue/g);
    assert.strictEqual(matches.length, 2, 'Both entries should be kept (one is PERMANENT)');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('deduplicateFile() - dryRun mode does not modify file', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const fixtureContent = fs.readFileSync(path.join(FIXTURES_DIR, 'duplicate-issues.md'), 'utf8');

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'test-issues.md');
    fs.writeFileSync(testFile, fixtureContent);

    const result = pruner.deduplicateFile(testFile, { dryRun: true });

    assert.strictEqual(result.duplicatesFound, 2, 'Should still report duplicates in dry run');
    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.strictEqual(finalContent, fixtureContent, 'File should be unchanged in dry run');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('deduplicateFile() - no duplicates returns zero counts', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const content = `# Issues

## Issue One

**Date:** 2026-02-01

Database connection pool exhaustion when running parallel migrations.

---

## Issue Two

**Date:** 2026-02-02

Frontend rendering performance degrades with large virtual DOM trees.

---`;

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(testFile, content);

    const result = pruner.deduplicateFile(testFile);

    assert.strictEqual(result.duplicatesFound, 0, 'Should find no duplicates');
    assert.strictEqual(result.duplicatesRemoved, 0, 'Should remove no duplicates');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ========================================================================
// Step 7: pruneResolvedEntries() tests (TDD RED phase)
// ========================================================================

test('pruneResolvedEntries() - removes old resolved entries', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const content = `# Issues

## Old Resolved Bug

**Date:** 2025-12-01
**Status: RESOLVED**

This was resolved over 30 days ago.

---

## Recent Resolved Bug

**Date:** 2026-02-01
**Status: RESOLVED**

This was resolved recently (within 30 days).

---

## Open Bug

**Date:** 2026-02-01

This is still open.

---`;

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'issues.md');
    fs.writeFileSync(testFile, content);

    const result = pruner.pruneResolvedEntries(testFile, { maxAgeDays: 30 });

    assert.strictEqual(result.removed, 1, 'Should remove 1 old resolved entry');

    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.ok(!finalContent.includes('Old Resolved Bug'), 'Old resolved entry should be removed');
    assert.ok(finalContent.includes('Recent Resolved Bug'), 'Recent resolved entry should be kept');
    assert.ok(finalContent.includes('Open Bug'), 'Open bug should be kept');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('pruneResolvedEntries() - preserves [PERMANENT] resolved entries', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const content = `# Issues

## Old Resolved Critical Bug [PERMANENT]

**Date:** 2025-12-01
**Status: RESOLVED**

This was resolved over 30 days ago but is permanently important.

---

## Old Resolved Normal Bug

**Date:** 2025-12-01
**Status: RESOLVED**

This was resolved over 30 days ago.

---`;

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'issues.md');
    fs.writeFileSync(testFile, content);

    const result = pruner.pruneResolvedEntries(testFile, { maxAgeDays: 30 });

    assert.strictEqual(result.removed, 1, 'Should remove only non-permanent entry');

    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.ok(finalContent.includes('[PERMANENT]'), '[PERMANENT] resolved entry should be kept');
    assert.ok(!finalContent.includes('Normal Bug'), 'Non-permanent resolved entry should be removed');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('pruneResolvedEntries() - no resolved entries returns zero removed', () => {
  const pruner = require(path.join(PROJECT_ROOT, '.claude/lib/memory/smart-pruner.cjs'));

  const content = `# Issues

## Open Bug One

**Date:** 2026-02-01

Still investigating.

---

## Open Bug Two

**Date:** 2026-02-02

Still investigating.

---`;

  const tmpDir = createTempDir();
  try {
    const testFile = path.join(tmpDir, 'issues.md');
    fs.writeFileSync(testFile, content);

    const result = pruner.pruneResolvedEntries(testFile);

    assert.strictEqual(result.removed, 0, 'Should remove no entries when none resolved');
  } finally {
    cleanupTempDir(tmpDir);
  }
});
