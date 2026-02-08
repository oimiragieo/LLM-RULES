#!/usr/bin/env node
/**
 * Tests for memory-rotator.cjs
 * Step 3: parseSections() tests (TDD RED phase)
 * Step 4: rotateIfNeeded() tests (TDD RED phase)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// Test fixtures path
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests/fixtures/memory-management');

// Helper: Create temporary test directory
function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `memory-rotator-test-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

// Helper: Clean up temporary directory
function cleanupTempDir(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('parseSections() - parses --- delimited sections', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-learnings.md'), 'utf8');
  const sections = rotator.parseSections(content);

  assert.ok(Array.isArray(sections), 'parseSections should return array');
  assert.strictEqual(sections.length, 2, 'Should find 2 sections in sample-learnings.md');

  assert.ok(sections[0].content.includes('TDD Cycle'), 'First section should contain TDD');
  assert.ok(sections[1].content.includes('Atomic Writes'), 'Second section should contain Atomic Writes');
});

test('parseSections() - extracts dates from **Date:** pattern', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-learnings.md'), 'utf8');
  const sections = rotator.parseSections(content);

  assert.strictEqual(sections[0].date, '2026-02-08', 'First section date should be 2026-02-08');
  assert.strictEqual(sections[1].date, '2026-02-07', 'Second section date should be 2026-02-07');
});

test('parseSections() - detects [PERMANENT] tag', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = `# Test

## Entry [PERMANENT]

**Date:** 2026-02-08

This should never be archived.

---`;

  const sections = rotator.parseSections(content);

  assert.strictEqual(sections[0].isPermanent, true, 'Should detect [PERMANENT] tag');
});

test('parseSections() - detects **Status: RESOLVED**', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = `# Issues

## Bug Fix

**Date:** 2026-02-08
**Status: RESOLVED**

Bug was fixed.

---`;

  const sections = rotator.parseSections(content);

  assert.strictEqual(sections[0].isResolved, true, 'Should detect RESOLVED status');
});

test('parseSections() - handles empty content', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const sections = rotator.parseSections('');

  assert.ok(Array.isArray(sections), 'Should return array for empty content');
  assert.strictEqual(sections.length, 0, 'Should return empty array for empty content');
});

test('parseSections() - handles malformed content (no delimiters)', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = 'This is just plain text with no section markers.';
  const sections = rotator.parseSections(content);

  assert.ok(Array.isArray(sections), 'Should return array');
  assert.strictEqual(sections.length, 1, 'Should return single section for undelimited content');
  assert.ok(sections[0].content.includes('plain text'), 'Should contain the original content');
});

test('parseSections() - parses ## H2 header delimited content', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));

  const content = `# Main Title

## Section One

**Date:** 2026-02-01

Content for section one.

## Section Two

**Date:** 2026-02-02

Content for section two.`;

  const sections = rotator.parseSections(content);

  assert.ok(Array.isArray(sections), 'Should return array');
  assert.strictEqual(sections.length, 2, 'Should find 2 sections with H2 headers');

  assert.ok(sections[0].title.includes('Section One'), 'First section should have title');
  assert.ok(sections[1].title.includes('Section Two'), 'Second section should have title');

  assert.strictEqual(sections[0].date, '2026-02-01', 'First section should have correct date');
  assert.strictEqual(sections[1].date, '2026-02-02', 'Second section should have correct date');
});

// ========================================================================
// Step 4: rotateIfNeeded() tests (TDD RED phase)
// ========================================================================

test('rotateIfNeeded() - file under threshold is not rotated', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'small-file.md');
    const content = '# Small File\n\nThis is under 20KB.';
    fs.writeFileSync(testFile, content);

    const result = rotator.rotateIfNeeded(testFile, { thresholdKB: 20 });

    assert.strictEqual(result.rotated, false, 'File under threshold should not be rotated');
    assert.ok(fs.existsSync(testFile), 'Original file should still exist');
    assert.strictEqual(fs.readFileSync(testFile, 'utf8'), content, 'File content should be unchanged');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('rotateIfNeeded() - file over threshold is rotated', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'large-file.md');

    // Create a file > 20KB (15 sections of ~1.5KB each)
    let content = '# Large File\n\n';
    for (let i = 0; i < 15; i++) {
      content += `## Section ${i}\n\n**Date:** 2026-02-0${i % 9 + 1}\n\n`;
      content += 'Lorem ipsum dolor sit amet '.repeat(50) + '\n\n---\n\n';
    }
    fs.writeFileSync(testFile, content);

    const initialSize = fs.statSync(testFile).size;
    assert.ok(initialSize > 20 * 1024, 'Test file should be over 20KB');

    const result = rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 5 });

    assert.strictEqual(result.rotated, true, 'File over threshold should be rotated');
    assert.ok(result.archivedBytes > 0, 'Should report archived bytes');
    assert.ok(result.sectionsArchived > 0, 'Should report sections archived');
    assert.ok(fs.existsSync(testFile), 'Active file should still exist');

    const finalSize = fs.statSync(testFile).size;
    assert.ok(finalSize < initialSize, 'Active file should be smaller after rotation');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('rotateIfNeeded() - creates archive file with correct name', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'decisions.md');

    // Create large file
    let content = '# Decisions\n\n';
    for (let i = 0; i < 15; i++) {
      content += `## ADR-00${i}\n\n**Date:** 2026-02-01\n\n`;
      content += 'Decision content '.repeat(100) + '\n\n---\n\n';
    }
    fs.writeFileSync(testFile, content);

    rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 5 });

    // Check archive directory exists
    const archiveDir = path.join(tmpDir, 'archive');
    assert.ok(fs.existsSync(archiveDir), 'Archive directory should be created');

    // Check archive file exists with correct name format: decisions-YYYY-MM.md
    const archiveFiles = fs.readdirSync(archiveDir);
    assert.ok(archiveFiles.length > 0, 'Archive file should be created');

    const archiveFile = archiveFiles.find((f) => f.match(/^decisions-\d{4}-\d{2}\.md$/));
    assert.ok(archiveFile, 'Archive file should match format: decisions-YYYY-MM.md');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('rotateIfNeeded() - [PERMANENT] sections are never archived', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'test.md');

    // Create file with [PERMANENT] section plus others
    let content = `# Test

## Important Entry [PERMANENT]

**Date:** 2026-01-01

This should NEVER be archived.

---

`;
    // Add many more sections to exceed threshold
    for (let i = 0; i < 15; i++) {
      content += `## Section ${i}\n\n**Date:** 2026-02-0${i % 9 + 1}\n\n`;
      content += 'Content '.repeat(100) + '\n\n---\n\n';
    }
    fs.writeFileSync(testFile, content);

    rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 2 });

    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.ok(finalContent.includes('[PERMANENT]'), '[PERMANENT] section should be kept');
    assert.ok(finalContent.includes('Important Entry'), 'PERMANENT section content should be kept');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('rotateIfNeeded() - is idempotent (second call is no-op)', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'test.md');

    // Create large file (25+ sections to ensure > 20KB)
    let content = '# Test\n\n';
    for (let i = 0; i < 25; i++) {
      content += `## Section ${i}\n\n**Date:** 2026-02-0${i % 9 + 1}\n\n`;
      content += 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50) + '\n\n---\n\n';
    }
    fs.writeFileSync(testFile, content);

    // First rotation
    const result1 = rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 5 });
    assert.strictEqual(result1.rotated, true, 'First rotation should occur');

    const contentAfterFirst = fs.readFileSync(testFile, 'utf8');

    // Second rotation on already-rotated file
    const result2 = rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 5 });
    assert.strictEqual(result2.rotated, false, 'Second rotation should be no-op');

    const contentAfterSecond = fs.readFileSync(testFile, 'utf8');
    assert.strictEqual(contentAfterSecond, contentAfterFirst, 'File content should be unchanged on second call');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('rotateIfNeeded() - auto-creates archive directory if missing', () => {
  const rotator = require(path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs'));
  const tmpDir = createTempDir();

  try {
    const testFile = path.join(tmpDir, 'test.md');

    // Create large file (25+ sections to ensure > 20KB)
    let content = '# Test\n\n';
    for (let i = 0; i < 25; i++) {
      content += `## Section ${i}\n\n**Date:** 2026-02-01\n\n`;
      content += 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50) + '\n\n---\n\n';
    }
    fs.writeFileSync(testFile, content);

    // Ensure archive directory doesn't exist
    const archiveDir = path.join(tmpDir, 'archive');
    assert.ok(!fs.existsSync(archiveDir), 'Archive directory should not exist before rotation');

    rotator.rotateIfNeeded(testFile, { thresholdKB: 20, keepSections: 5 });

    assert.ok(fs.existsSync(archiveDir), 'Archive directory should be auto-created');
  } finally {
    cleanupTempDir(tmpDir);
  }
});
