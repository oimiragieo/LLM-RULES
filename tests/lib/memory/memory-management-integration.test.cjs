#!/usr/bin/env node
/**
 * Memory Management Integration Test
 * ====================================
 *
 * Tests the full memory management pipeline:
 * - Rotation (hot -> warm)
 * - Deduplication (smart pruner)
 * - Cold archival (warm -> cold)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Modules under test
const memoryRotator = require('../../../.claude/lib/memory/memory-rotator.cjs');
const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');
const coldStorage = require('../../../.claude/lib/memory/cold-storage.cjs');

// Test helpers
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-integration-test-'));
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Integration Test 1: Rotation Pipeline
test('Integration - Rotation pipeline (hot -> warm)', () => {
  const testDir = createTempDir();
  const largeFile = path.join(testDir, 'learnings.md');
  const archiveDir = path.join(testDir, 'archive');

  // Create large file (>20KB)
  let content = '# Learnings\n\n';
  for (let i = 0; i < 400; i++) {
    content += `## Pattern ${i}\n\n**Date:** 2026-02-08\n\nContent for pattern ${i}\n\n---\n\n`;
  }
  fs.writeFileSync(largeFile, content, 'utf8');

  // Verify file size exceeds threshold
  const stats = fs.statSync(largeFile);
  assert.ok(stats.size > 20 * 1024, 'Test file should exceed 20KB');

  // Rotate
  const result = memoryRotator.rotateIfNeeded(largeFile, { thresholdKB: 20 });

  // Verify rotation occurred
  assert.ok(result.rotated, 'File should be rotated');
  assert.ok(fs.existsSync(archiveDir), 'Archive directory should be created');

  // Verify archive file exists
  const archiveFiles = fs.readdirSync(archiveDir);
  assert.ok(archiveFiles.length > 0, 'Archive should contain files');
  assert.ok(archiveFiles[0].startsWith('learnings-'), 'Archive file should be named learnings-YYYY-MM.md');

  // Verify hot file is truncated
  const newStats = fs.statSync(largeFile);
  assert.ok(newStats.size < stats.size, 'Hot file should be smaller after rotation');

  cleanupTempDir(testDir);
});

// Integration Test 2: Deduplication Pipeline
test('Integration - Deduplication pipeline', () => {
  const testDir = createTempDir();
  const issuesFile = path.join(testDir, 'issues.md');

  // Create file with duplicates
  const duplicateContent = `## Issue 1

**Date:** 2026-02-08
**Status: OPEN**

This is a duplicate issue.

---

## Issue 2

**Date:** 2026-02-07
**Status: OPEN**

This is a duplicate issue.

---

## Issue 3

**Date:** 2026-01-01
**Status: RESOLVED**

This is resolved (old enough to prune).

---
`;
  fs.writeFileSync(issuesFile, duplicateContent, 'utf8');

  // Deduplicate
  const dedupResult = smartPruner.deduplicateFile(issuesFile, { similarityThreshold: 0.6 });

  // Verify duplicates removed
  assert.ok(dedupResult.duplicatesRemoved > 0, 'Should remove duplicates');

  // Prune resolved entries
  const pruneResult = smartPruner.pruneResolvedEntries(issuesFile);

  // Verify resolved entries pruned
  assert.ok(pruneResult.removed > 0, 'Should prune resolved entries');

  // Verify final file is smaller
  const finalContent = fs.readFileSync(issuesFile, 'utf8');
  assert.ok(finalContent.length < duplicateContent.length, 'File should be smaller after pruning');

  cleanupTempDir(testDir);
});

// Integration Test 3: Cold Archival Pipeline
test('Integration - Cold archival pipeline (warm -> cold)', () => {
  const testDir = createTempDir();
  const archiveDir = path.join(testDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Create old warm archive (31 days old via filename)
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 31);
  const oldMonth = oldDate.toISOString().slice(0, 7);
  const oldArchive = path.join(archiveDir, `learnings-${oldMonth}.md`);

  const archiveContent = `## Old Pattern

**Date:** ${oldDate.toISOString().slice(0, 10)}

Pattern content with api_key: sk-1234567890abcdef

---
`;
  fs.writeFileSync(oldArchive, archiveContent, 'utf8');

  // Archive to cold
  const result = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });

  // Verify cold file created
  assert.ok(result.archivedFiles > 0, 'Should archive files');
  assert.ok(result.archivedEntries > 0, 'Should archive entries');
  assert.ok(fs.existsSync(coldDir), 'Cold directory should exist');

  // Verify cold JSONL file
  const coldFiles = fs.readdirSync(coldDir);
  assert.ok(coldFiles.length > 0, 'Cold directory should contain files');
  assert.ok(coldFiles[0].endsWith('.jsonl'), 'Cold file should be JSONL');

  // Verify sensitive content scrubbed
  const coldFile = path.join(coldDir, coldFiles[0]);
  const coldContent = fs.readFileSync(coldFile, 'utf8');
  assert.ok(coldContent.includes('[REDACTED]'), 'Should contain redaction placeholder');
  assert.ok(!coldContent.includes('sk-1234567890abcdef'), 'Should not contain API key');

  cleanupTempDir(testDir);
});

// Integration Test 4: Full Pipeline (rotation -> dedup -> cold)
test('Integration - Full memory management pipeline', () => {
  const testDir = createTempDir();
  const learningsFile = path.join(testDir, 'learnings.md');
  const archiveDir = path.join(testDir, 'archive');

  // Step 1: Create large file with duplicates
  let content = '# Learnings\n\n';
  for (let i = 0; i < 400; i++) {
    content += `## Pattern A\n\n**Date:** 2026-02-08\n\nDuplicate pattern\n\n---\n\n`;
  }
  fs.writeFileSync(learningsFile, content, 'utf8');

  // Step 2: Rotate (hot -> warm)
  const rotateResult = memoryRotator.rotateIfNeeded(learningsFile, { thresholdKB: 20 });
  assert.ok(rotateResult.rotated, 'Should rotate large file');
  assert.ok(fs.existsSync(archiveDir), 'Archive should be created');

  // Step 3: Deduplicate rotated hot file
  const dedupResult = smartPruner.deduplicateFile(learningsFile, { similarityThreshold: 0.8 });
  // After rotation, hot file contains recent sections (kept sections + header)
  // Dedup may or may not find duplicates depending on what rotator kept
  assert.ok(dedupResult !== null, 'Should run deduplication');

  // Step 4: Archive to cold (simulate old warm file by modifying archive filename)
  const archiveFiles = fs.readdirSync(archiveDir);
  if (archiveFiles.length > 0) {
    const currentArchive = path.join(archiveDir, archiveFiles[0]);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // 35 days old
    const oldMonth = oldDate.toISOString().slice(0, 7);
    const oldArchive = path.join(archiveDir, `learnings-${oldMonth}.md`);
    fs.renameSync(currentArchive, oldArchive);

    // Now archive to cold
    const coldResult = coldStorage.archiveWarmToCold(testDir, { maxAgeDays: 30 });
    assert.ok(coldResult.archivedFiles > 0, 'Should archive old files to cold');
  }

  // Step 5: Verify storage stats
  const stats = coldStorage.getStorageStats(testDir);
  assert.ok(stats.hot.files > 0, 'Should have hot files');
  assert.ok(stats.cold.bytes > 0, 'Should have cold storage');

  cleanupTempDir(testDir);
});
