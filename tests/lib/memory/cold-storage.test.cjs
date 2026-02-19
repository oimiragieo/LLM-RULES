#!/usr/bin/env node
/**
 * Tests for Cold Storage Module
 * ===============================
 *
 * Tests archival of warm storage to cold JSONL format.
 * Following TDD: RED (failing test) → GREEN (minimal code) → REFACTOR
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test
const coldStorage = require('../../../.claude/lib/memory/cold-storage.cjs');

// Test helpers
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cold-storage-test-'));
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// RED: Test 1 - archiveWarmToCold() exists and returns status
test('archiveWarmToCold - function exists', () => {
  assert.strictEqual(typeof coldStorage.archiveWarmToCold, 'function');
});

// RED: Test 2 - archiveWarmToCold() creates cold JSONL file
test('archiveWarmToCold - creates cold JSONL file', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Create old archive file (31 days old)
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 31);
  const oldMonth = oldDate.toISOString().slice(0, 7); // YYYY-MM
  const oldArchive = path.join(archiveDir, `learnings-${oldMonth}.md`);

  const oldContent = `## Pattern 1

**Date:** ${oldDate.toISOString().slice(0, 10)}

Test pattern content

---
`;
  fs.writeFileSync(oldArchive, oldContent, 'utf8');

  // Archive to cold
  const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });

  // Verify cold file created
  const coldFiles = fs.readdirSync(coldDir);
  assert.ok(coldFiles.length > 0, 'Cold directory should contain files');
  assert.ok(coldFiles[0].startsWith('cold-'), 'Cold file should start with cold-');
  assert.ok(coldFiles[0].endsWith('.jsonl'), 'Cold file should be .jsonl');

  // Verify result
  assert.ok(result.archivedFiles > 0, 'Should report archived files');
  assert.ok(result.archivedEntries > 0, 'Should report archived entries');

  cleanupTempDir(testDir);
});

// RED: Test 3 - archiveWarmToCold() scrubs sensitive content
test('archiveWarmToCold - scrubs sensitive content', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Create archive with sensitive content
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 31);
  const oldMonth = oldDate.toISOString().slice(0, 7);
  const oldArchive = path.join(archiveDir, `learnings-${oldMonth}.md`);

  const sensitiveContent = `## Sensitive Pattern

**Date:** ${oldDate.toISOString().slice(0, 10)}

api_key: sk-1234567890abcdef
Email: user@example.com
JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

---
`;
  fs.writeFileSync(oldArchive, sensitiveContent, 'utf8');

  // Archive to cold
  coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });

  // Read cold JSONL
  const coldFile = path.join(coldDir, `cold-${oldMonth}.jsonl`);
  const coldContent = fs.readFileSync(coldFile, 'utf8');

  // Verify sensitive content is scrubbed
  assert.ok(coldContent.includes('[REDACTED]'), 'Should contain [REDACTED] placeholder');
  assert.ok(!coldContent.includes('sk-1234567890abcdef'), 'Should not contain API key');
  assert.ok(!coldContent.includes('user@example.com'), 'Should not contain email');
  assert.ok(
    !coldContent.includes(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ'
    ),
    'Should not contain JWT'
  );

  cleanupTempDir(testDir);
});

// RED: Test 4 - getStorageStats() returns hot/warm/cold stats
test('getStorageStats - returns storage statistics', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.mkdirSync(coldDir, { recursive: true });

  // Create hot file
  const hotFile = path.join(testDir, 'learnings.md');
  fs.writeFileSync(hotFile, 'Hot content', 'utf8');

  // Create warm file
  const warmFile = path.join(archiveDir, 'learnings-2026-01.md');
  fs.writeFileSync(warmFile, 'Warm content', 'utf8');

  // Create cold file
  const coldFile = path.join(coldDir, 'cold-2025-12.jsonl');
  fs.writeFileSync(coldFile, '{"entry":"Cold content"}', 'utf8');

  // Get stats
  const stats = coldStorage.getStorageStats(testDir);

  // Verify structure
  assert.ok(stats.hot, 'Should have hot stats');
  assert.ok(stats.warm, 'Should have warm stats');
  assert.ok(stats.cold, 'Should have cold stats');

  // Verify hot stats (only learnings.md exists in test, others don't)
  assert.ok(stats.hot.files >= 1, 'Should count at least 1 hot file');
  assert.ok(stats.hot.bytes > 0, 'Hot should have bytes');

  // Verify warm stats
  assert.ok(stats.warm.files >= 1, 'Should count warm files');
  assert.ok(stats.warm.bytes > 0, 'Warm should have bytes');

  // Verify cold stats
  assert.ok(stats.cold.files >= 1, 'Should count cold files');
  assert.ok(stats.cold.bytes > 0, 'Cold should have bytes');

  cleanupTempDir(testDir);
});

// RED: Test 5 - searchCold() returns empty array when no cold files exist
test('searchCold - returns empty array when no cold files exist', () => {
  const results = coldStorage.searchCold('test query');
  assert.ok(Array.isArray(results), 'Should return array');
  assert.strictEqual(results.length, 0, 'Should return empty array when no data exists');
});

// RED: Test 6 - archiveWarmToCold() respects maxAgeDays option
test('archiveWarmToCold - respects maxAgeDays option', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Create recent archive file - use current month (2026-02)
  // Since we calculate age from YYYY-MM-01, current month is ~7 days old (2026-02-08)
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); // 2026-02
  const recentArchive = path.join(archiveDir, `learnings-${currentMonth}.md`);
  fs.writeFileSync(recentArchive, '## Recent\n\nContent\n', 'utf8');

  // Archive with maxAgeDays=30 (should skip current month file - only 7 days old)
  const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });

  // Verify no files archived (too recent)
  assert.strictEqual(result.archivedFiles, 0, 'Should not archive recent files');

  cleanupTempDir(testDir);
});

// RED: Test 7 - archiveWarmToCold() handles empty archive directory
test('archiveWarmToCold - handles empty archive directory', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Archive with no files
  const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });

  // Verify graceful handling
  assert.strictEqual(result.archivedFiles, 0, 'Should handle empty archive');
  assert.strictEqual(result.archivedEntries, 0, 'Should handle empty archive');

  cleanupTempDir(testDir);
});

test('archiveWarmToCold - deletes warm source file after successful cold archival', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 45);
  const oldMonth = oldDate.toISOString().slice(0, 7);
  const oldArchive = path.join(archiveDir, `decisions-${oldMonth}.md`);
  fs.writeFileSync(
    oldArchive,
    `## Decision\n\n**Date:** ${oldDate.toISOString().slice(0, 10)}\n\nContent\n`,
    'utf8'
  );

  const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });
  assert.ok(result.archivedFiles >= 1, 'Should archive at least one file');
  assert.equal(fs.existsSync(oldArchive), false, 'Warm archive source file should be removed');

  cleanupTempDir(testDir);
});

test('searchCold - returns matching entries from cold jsonl files', () => {
  const testDir = createTempDir();
  const coldDir = path.join(testDir, 'archive', 'cold');
  fs.mkdirSync(coldDir, { recursive: true });

  const coldFile = path.join(coldDir, 'cold-2026-01.jsonl');
  fs.writeFileSync(
    coldFile,
    [
      JSON.stringify({
        title: 'Auth fix',
        content: 'JWT token rotation implementation',
        date: '2026-01-10',
      }),
      JSON.stringify({
        title: 'Unrelated',
        content: 'Cache invalidation note',
        date: '2026-01-11',
      }),
    ].join('\n') + '\n',
    'utf8'
  );

  const results = coldStorage.searchCold('token rotation', { memoryDir: testDir, limit: 5 });
  assert.ok(Array.isArray(results), 'searchCold should return an array');
  assert.equal(results.length, 1, 'search should return the matching entry');
  assert.match(results[0].title, /Auth fix/);

  cleanupTempDir(testDir);
});

test('archiveWarmToCold - appends without reading existing cold file content', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');
  fs.mkdirSync(coldDir, { recursive: true });

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 45);
  const oldMonth = oldDate.toISOString().slice(0, 7);

  // Seed an existing cold file so archive path uses append behavior.
  const coldFile = path.join(coldDir, `cold-${oldMonth}.jsonl`);
  fs.writeFileSync(coldFile, JSON.stringify({ title: 'seed', content: 'seed' }) + '\n', 'utf8');

  const oldArchive = path.join(archiveDir, `issues-${oldMonth}.md`);
  fs.writeFileSync(
    oldArchive,
    `## Archived issue\n\n**Date:** ${oldDate.toISOString().slice(0, 10)}\n\nBody\n`,
    'utf8'
  );

  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function patchedReadFileSync(targetPath, ...args) {
    if (path.resolve(targetPath) === path.resolve(coldFile)) {
      throw new Error('archiveWarmToCold must not read existing cold file before append');
    }
    return originalReadFileSync.call(fs, targetPath, ...args);
  };

  try {
    const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });
    assert.ok(result.archivedFiles >= 1, 'Should archive file into existing cold jsonl');
  } finally {
    fs.readFileSync = originalReadFileSync;
    cleanupTempDir(testDir);
  }
});
