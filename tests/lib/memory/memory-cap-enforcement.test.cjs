#!/usr/bin/env node
/**
 * Tests for enforceMemoryCaps() and memoryHealth() in memory-rotator.cjs
 *
 * Covers VAL-ID-001 through VAL-ID-009:
 *   VAL-ID-001: Files over 25KB are pruned to ≤ 25KB
 *   VAL-ID-002: Files over 200 lines are pruned to ≤ 200 lines
 *   VAL-ID-003: Pruned content archived to archive directory
 *   VAL-ID-004: Truncation warning appended when file is truncated
 *   VAL-ID-005: memoryHealth() reports file sizes vs caps
 *   VAL-ID-006: Oversized file (50KB) pruned to under cap
 *   VAL-ID-007: Empty and missing files handled gracefully
 *   VAL-ID-008: [PERMANENT] sections preserved during pruning
 *   VAL-ID-009: Both caps enforced independently
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const ROTATOR_PATH = path.join(PROJECT_ROOT, '.claude/lib/memory/memory-rotator.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temporary isolated test directory */
function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `mem-cap-test-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/** Remove a temporary directory recursively */
function cleanupTempDir(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Build a multi-section markdown file using `---` delimiters.
 * @param {number} sectionCount   - number of non-permanent sections
 * @param {number} bytesPerSection - approximate bytes per section body
 * @param {boolean} [includePermanent] - if true, adds one [PERMANENT] section first
 * @returns {string}
 */
function buildSectionedContent(sectionCount, bytesPerSection, includePermanent = false) {
  const parts = [];

  if (includePermanent) {
    parts.push(
      `## Permanent Section [PERMANENT]\n\n**Date:** 2025-01-01\n\nThis must never be removed.\n`
    );
  }

  for (let i = 0; i < sectionCount; i++) {
    const year = 2026;
    const month = String(1 + Math.floor(i / 28)).padStart(2, '0');
    const day = String(1 + (i % 28)).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    const header = `## Section ${i}\n\n**Date:** ${date}\n\n`;
    const fillLen = Math.max(0, bytesPerSection - header.length);
    parts.push(header + 'x'.repeat(fillLen));
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build content with exactly `lineCount` lines (each line ~40 chars).
 * Uses `---` delimiters every 10 lines so parseSections works.
 */
function buildLineBasedContent(lineCount) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    if (i > 0 && i % 10 === 0) {
      lines.push('---');
    }
    lines.push(`Line ${String(i).padStart(4, '0')}: ${'y'.repeat(32)}`);
  }
  return lines.join('\n');
}

// ── Load module once ──────────────────────────────────────────────────────────

// Each test that requires the rotator does so fresh (module is not cached between
// test files, but since we run only this file, caching is fine).
function getRotator() {
  // Delete from cache so tests always get a fresh module (needed when new exports are added)
  delete require.cache[ROTATOR_PATH];
  return require(ROTATOR_PATH);
}

// ── VAL-ID-001: 25KB cap ──────────────────────────────────────────────────────

test('VAL-ID-001: enforceMemoryCaps() prunes file over 25KB to ≤ 25KB', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'learnings.md');

    // Build ~30KB file (30 sections × ~1024 bytes each)
    const content = buildSectionedContent(30, 1024);
    fs.writeFileSync(filePath, content, 'utf8');

    const initialBytes = fs.statSync(filePath).size;
    assert.ok(
      initialBytes > 25 * 1024,
      `Pre-condition: file should be > 25KB (got ${initialBytes})`
    );

    const result = rotator.enforceMemoryCaps(filePath);

    assert.strictEqual(result.pruned, true, 'Should report pruned=true');
    const finalBytes = fs.statSync(filePath).size;
    assert.ok(
      finalBytes <= 25 * 1024,
      `File should be ≤ 25KB after pruning, got ${finalBytes} bytes`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-002: 200-line cap ──────────────────────────────────────────────────

test('VAL-ID-002: enforceMemoryCaps() prunes file over 200 lines to ≤ 200 lines', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'decisions.md');

    // 250 lines with small content (≈ 12KB, under 25KB but over 200 lines)
    const content = buildLineBasedContent(250);
    fs.writeFileSync(filePath, content, 'utf8');

    const initialLines = content.split('\n').length;
    assert.ok(
      initialLines > 200,
      `Pre-condition: file should be > 200 lines (got ${initialLines})`
    );

    const initialBytes = fs.statSync(filePath).size;
    assert.ok(
      initialBytes <= 25 * 1024,
      `Pre-condition: file should be ≤ 25KB (got ${initialBytes})`
    );

    const result = rotator.enforceMemoryCaps(filePath);

    assert.strictEqual(result.pruned, true, 'Should report pruned=true');

    const finalContent = fs.readFileSync(filePath, 'utf8');
    const finalLines = finalContent.split('\n').length;
    assert.ok(
      finalLines <= 200,
      `File should be ≤ 200 lines after pruning, got ${finalLines} lines`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-003: Archive created with timestamped filename ────────────────────

test('VAL-ID-003: pruned content archived to archive/<basename>-YYYY-MM-DD.md', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'issues.md');

    const content = buildSectionedContent(30, 1024);
    fs.writeFileSync(filePath, content, 'utf8');

    rotator.enforceMemoryCaps(filePath);

    const archiveDir = path.join(tmpDir, 'archive');
    assert.ok(fs.existsSync(archiveDir), 'Archive directory should be created');

    const archiveFiles = fs.readdirSync(archiveDir);
    assert.ok(archiveFiles.length > 0, 'At least one archive file should exist');

    // Must match issues-YYYY-MM-DD.md pattern
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const expectedName = `issues-${dateStr}.md`;
    assert.ok(
      archiveFiles.includes(expectedName),
      `Archive file "${expectedName}" should exist, found: ${archiveFiles.join(', ')}`
    );

    // Archive must contain pruned content
    const archivePath = path.join(archiveDir, expectedName);
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    assert.ok(archiveContent.length > 0, 'Archive file should contain pruned content');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-003 (append): same-day archive is appended to, not overwritten ────

test('VAL-ID-003 (append): second prune on same day appends to existing archive', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'issues.md');

    // First prune
    const content1 = buildSectionedContent(30, 1024);
    fs.writeFileSync(filePath, content1, 'utf8');
    rotator.enforceMemoryCaps(filePath);

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const archivePath = path.join(tmpDir, 'archive', `issues-${dateStr}.md`);
    const sizeAfterFirst = fs.statSync(archivePath).size;

    // Second prune — rebuild to a large file again
    const content2 = buildSectionedContent(30, 1024);
    fs.writeFileSync(filePath, content2, 'utf8');
    rotator.enforceMemoryCaps(filePath);

    const sizeAfterSecond = fs.statSync(archivePath).size;
    assert.ok(
      sizeAfterSecond > sizeAfterFirst,
      'Archive file should grow after second prune (append behavior)'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-004: Warning line appended ────────────────────────────────────────

test('VAL-ID-004: warning line appended to file after truncation', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'learnings.md');

    const content = buildSectionedContent(30, 1024);
    fs.writeFileSync(filePath, content, 'utf8');

    rotator.enforceMemoryCaps(filePath);

    const finalContent = fs.readFileSync(filePath, 'utf8');

    // Must contain the ⚠️ warning pattern
    assert.ok(
      finalContent.includes('⚠️') && finalContent.includes('archive/'),
      `Expected warning line with ⚠️ and archive/ reference.\nFinal content (last 200 chars): ${finalContent.slice(-200)}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-005: memoryHealth() ────────────────────────────────────────────────

test('VAL-ID-005: memoryHealth() reports correct sizes and cap status', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    // Create three test files:
    //   small.md  — under both caps (5 lines, ~200 bytes)
    //   big-kb.md — over KB cap but under line cap
    //   big-lines.md — over line cap but under KB cap

    const smallContent = '## Small\n\nSmall content.\n';
    fs.writeFileSync(path.join(tmpDir, 'small.md'), smallContent, 'utf8');

    const bigKbContent = buildSectionedContent(30, 1024);
    fs.writeFileSync(path.join(tmpDir, 'big-kb.md'), bigKbContent, 'utf8');

    const bigLinesContent = buildLineBasedContent(250);
    fs.writeFileSync(path.join(tmpDir, 'big-lines.md'), bigLinesContent, 'utf8');

    const report = rotator.memoryHealth({ memoryDir: tmpDir });

    assert.ok(Array.isArray(report), 'memoryHealth() should return an array');
    assert.strictEqual(report.length, 3, 'Should report 3 files');

    // Check each file is present and has the required fields
    for (const entry of report) {
      assert.ok(typeof entry.file === 'string', 'entry.file should be a string');
      assert.ok(typeof entry.sizeBytes === 'number', 'entry.sizeBytes should be a number');
      assert.ok(typeof entry.lineCount === 'number', 'entry.lineCount should be a number');
      assert.ok(typeof entry.overKBCap === 'boolean', 'entry.overKBCap should be a boolean');
      assert.ok(typeof entry.overLineCap === 'boolean', 'entry.overLineCap should be a boolean');
    }

    const small = report.find(e => e.file === 'small.md');
    assert.ok(small, 'Should include small.md');
    assert.strictEqual(small.overKBCap, false, 'small.md should not be over KB cap');
    assert.strictEqual(small.overLineCap, false, 'small.md should not be over line cap');

    const bigKb = report.find(e => e.file === 'big-kb.md');
    assert.ok(bigKb, 'Should include big-kb.md');
    assert.strictEqual(bigKb.overKBCap, true, 'big-kb.md should be over KB cap');
    assert.ok(bigKb.sizeBytes > 25 * 1024, 'big-kb.md sizeBytes should be > 25KB');

    const bigLines = report.find(e => e.file === 'big-lines.md');
    assert.ok(bigLines, 'Should include big-lines.md');
    assert.strictEqual(bigLines.overLineCap, true, 'big-lines.md should be over line cap');
    assert.ok(bigLines.lineCount > 200, 'big-lines.md lineCount should be > 200');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-006: 50KB file pruned to under 25KB ───────────────────────────────

test('VAL-ID-006: 50KB file pruned to ≤ 25KB, archive contains overflow', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'learnings.md');

    // ~50KB: 50 sections × ~1024 bytes each
    const content = buildSectionedContent(50, 1024);
    fs.writeFileSync(filePath, content, 'utf8');

    const initialBytes = fs.statSync(filePath).size;
    assert.ok(
      initialBytes > 45 * 1024,
      `Pre-condition: file should be ~50KB (got ${initialBytes})`
    );

    const result = rotator.enforceMemoryCaps(filePath);

    assert.strictEqual(result.pruned, true, 'Should report pruned=true');
    assert.ok(result.archivedBytes > 0, 'Should report archivedBytes > 0');
    assert.ok(result.sectionsArchived > 0, 'Should report sectionsArchived > 0');

    const finalBytes = fs.statSync(filePath).size;
    assert.ok(finalBytes <= 25 * 1024, `File should be ≤ 25KB after pruning, got ${finalBytes}`);

    // Archive must exist and contain overflow content
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const archivePath = path.join(tmpDir, 'archive', `learnings-${dateStr}.md`);
    assert.ok(fs.existsSync(archivePath), 'Archive file should exist');
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    assert.ok(archiveContent.length > 0, 'Archive should contain removed content');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-007: Empty and missing files handled gracefully ───────────────────

test('VAL-ID-007: missing file is a no-op without error', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const missingPath = path.join(tmpDir, 'nonexistent.md');
    assert.ok(!fs.existsSync(missingPath), 'Pre-condition: file should not exist');

    let threw = false;
    let result;
    try {
      result = rotator.enforceMemoryCaps(missingPath);
    } catch (_e) {
      threw = true;
    }

    assert.ok(!threw, 'Should not throw for missing file');
    assert.strictEqual(
      result && result.pruned,
      false,
      'Should return pruned=false for missing file'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ID-007: empty file is a no-op without error', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const emptyPath = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(emptyPath, '', 'utf8');

    let threw = false;
    let result;
    try {
      result = rotator.enforceMemoryCaps(emptyPath);
    } catch (_e) {
      threw = true;
    }

    assert.ok(!threw, 'Should not throw for empty file');
    assert.strictEqual(result && result.pruned, false, 'Should return pruned=false for empty file');
    // File should still be empty
    assert.strictEqual(
      fs.readFileSync(emptyPath, 'utf8'),
      '',
      'Empty file should remain unchanged'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ID-007: file already under both caps is a no-op', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'small.md');
    const smallContent = '## Entry\n\n**Date:** 2026-01-01\n\nSmall content.\n';
    fs.writeFileSync(filePath, smallContent, 'utf8');

    const result = rotator.enforceMemoryCaps(filePath);

    assert.strictEqual(result.pruned, false, 'Small file should not be pruned');
    assert.strictEqual(
      fs.readFileSync(filePath, 'utf8'),
      smallContent,
      'File content should be unchanged'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-008: [PERMANENT] sections preserved ───────────────────────────────

test('VAL-ID-008: [PERMANENT] sections are never pruned even when file exceeds cap', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'decisions.md');

    // Build a large file with one [PERMANENT] section + many regular sections
    const content = buildSectionedContent(30, 1024, /* includePermanent= */ true);
    fs.writeFileSync(filePath, content, 'utf8');

    assert.ok(fs.statSync(filePath).size > 25 * 1024, 'Pre-condition: file should be > 25KB');

    rotator.enforceMemoryCaps(filePath);

    const finalContent = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      finalContent.includes('[PERMANENT]'),
      'Final content must still contain [PERMANENT] tag'
    );
    assert.ok(
      finalContent.includes('This must never be removed'),
      'PERMANENT section body must be preserved'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ID-009: Both caps enforced independently ─────────────────────────────

test('VAL-ID-009: file under KB cap but over line cap triggers pruning', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'issues.md');

    // ~12KB (under 25KB) but 250 lines (over 200)
    const content = buildLineBasedContent(250);
    fs.writeFileSync(filePath, content, 'utf8');

    const initialBytes = fs.statSync(filePath).size;
    const initialLines = content.split('\n').length;
    assert.ok(
      initialBytes <= 25 * 1024,
      `Pre-condition: file should be ≤ 25KB (got ${initialBytes})`
    );
    assert.ok(
      initialLines > 200,
      `Pre-condition: file should be > 200 lines (got ${initialLines})`
    );

    const result = rotator.enforceMemoryCaps(filePath);
    assert.strictEqual(
      result.pruned,
      true,
      'Should prune when line cap exceeded even if KB is fine'
    );

    const finalContent = fs.readFileSync(filePath, 'utf8');
    const finalLines = finalContent.split('\n').length;
    assert.ok(finalLines <= 200, `File should be ≤ 200 lines, got ${finalLines}`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ID-009: file over KB cap but under line cap triggers pruning', () => {
  const rotator = getRotator();
  const tmpDir = createTempDir();
  try {
    const filePath = path.join(tmpDir, 'learnings.md');

    // Build 10 sections each with a very long single data line
    // Each section: 5 lines (header, blank, date, blank, data)
    // Between sections: 3 lines (blank, ---, blank)
    // Total lines: 10 × 5 + 9 × 3 = 77 lines (well under 200)
    // Each section: ~2650 bytes
    // 10 sections × 2650 bytes ≈ 26.5KB > 25KB
    const parts = [];
    for (let i = 0; i < 10; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      const longLine = `data: ${'z'.repeat(2600)}`;
      parts.push(`## Section ${i}\n\n**Date:** ${date}\n\n${longLine}`);
    }
    const content = parts.join('\n\n---\n\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const initialBytes = fs.statSync(filePath).size;
    const initialLines = content.split('\n').length;
    assert.ok(
      initialBytes > 25 * 1024,
      `Pre-condition: file should be > 25KB (got ${initialBytes})`
    );
    assert.ok(
      initialLines <= 200,
      `Pre-condition: file should be ≤ 200 lines (got ${initialLines})`
    );

    const result = rotator.enforceMemoryCaps(filePath);
    assert.strictEqual(
      result.pruned,
      true,
      'Should prune when KB cap exceeded even if lines are fine'
    );

    const finalBytes = fs.statSync(filePath).size;
    assert.ok(finalBytes <= 25 * 1024, `File should be ≤ 25KB, got ${finalBytes}`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── Extra: enforceMemoryCaps is exported standalone ──────────────────────────

test('enforceMemoryCaps() is exported and callable standalone', () => {
  const rotator = getRotator();
  assert.ok(
    typeof rotator.enforceMemoryCaps === 'function',
    'enforceMemoryCaps should be exported as a function'
  );
});

test('memoryHealth() is exported and callable standalone', () => {
  const rotator = getRotator();
  assert.ok(
    typeof rotator.memoryHealth === 'function',
    'memoryHealth should be exported as a function'
  );
});

test('memoryHealth() returns empty array when directory is missing', () => {
  const rotator = getRotator();
  const result = rotator.memoryHealth({
    memoryDir: path.join(os.tmpdir(), `nonexistent-${crypto.randomBytes(4).toString('hex')}`),
  });
  assert.ok(Array.isArray(result), 'Should return an array');
  assert.strictEqual(result.length, 0, 'Should return empty array for missing directory');
});
