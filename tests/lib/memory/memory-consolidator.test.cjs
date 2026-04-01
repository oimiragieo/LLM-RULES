#!/usr/bin/env node
/**
 * Tests for consolidate() and extractActionableItems() in memory-consolidator.cjs
 *
 * Covers:
 *   VAL-DL-009: Reads daily logs since last consolidation (cutoff timestamp)
 *   VAL-DL-010: Merges extracted entries into correct structured files
 *   VAL-DL-011: Idempotency — second run produces no duplicate entries
 *   VAL-DL-012: Handles empty and corrupted log files gracefully
 *   VAL-DL-013: Enforces caps on affected files after merge
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const CONSOLIDATOR_PATH = path.join(PROJECT_ROOT, '.claude/lib/memory/memory-consolidator.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTempDir() {
  const d = path.join(os.tmpdir(), `consolidator-test-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function cleanupTempDir(d) {
  try {
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_e) {
    // ignore Windows EBUSY
  }
}

function getModule() {
  delete require.cache[CONSOLIDATOR_PATH];
  return require(CONSOLIDATOR_PATH);
}

/** Write a daily log file at the standard path under memoryDir. */
function writeLogFile(memoryDir, dateStr, content) {
  const [year, month] = dateStr.split('-');
  const dir = path.join(memoryDir, 'logs', year, month);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${dateStr}.md`), content, 'utf8');
}

/** Build a single formatted log entry line. */
function logLine(time, text) {
  return `- [${time}] ${text}`;
}

/** Build a large log with entries all containing 'decision' keyword. */
function buildLargeDecisionLog(count) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const hh = String(Math.floor(i / 3600) % 24).padStart(2, '0');
    const mm = String(Math.floor(i / 60) % 60).padStart(2, '0');
    const ss = String(i % 60).padStart(2, '0');
    lines.push(`- [${hh}:${mm}:${ss}] decision entry ${i}: ${'x'.repeat(120)}`);
  }
  return lines.join('\n') + '\n';
}

// ── VAL-DL-009: Reads logs since cutoff ──────────────────────────────────────

test('VAL-DL-009: only processes logs with dates strictly after sinceTimestamp', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // Before cutoff — should be skipped
    writeLogFile(tmpDir, '2026-03-29', logLine('10:00:00', 'learned old thing') + '\n');
    // After cutoff — should be processed
    writeLogFile(tmpDir, '2026-04-01', logLine('10:00:00', 'learned new thing') + '\n');

    const cutoff = new Date('2026-03-30T00:00:00.000Z').getTime();
    const result = consolidate(tmpDir, cutoff);

    assert.strictEqual(result.processed, 1, 'Only 1 log should be processed');
    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.strictEqual(patterns.length, 1, '1 pattern from recent log');
    assert.ok(patterns[0].text.includes('learned new thing'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-009: log file on the exact cutoff day is excluded (strictly after)', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // Exactly at cutoff midnight — excluded
    writeLogFile(tmpDir, '2026-04-01', logLine('23:59:59', 'learned on cutoff day') + '\n');
    // One day after cutoff — included
    writeLogFile(tmpDir, '2026-04-02', logLine('10:00:00', 'learned after cutoff') + '\n');

    const cutoff = new Date('2026-04-01T00:00:00.000Z').getTime(); // midnight of 2026-04-01
    const result = consolidate(tmpDir, cutoff);

    assert.strictEqual(result.processed, 1, 'Only 2026-04-02 should be processed');
    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.ok(patterns[0].text.includes('after cutoff'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-009: sinceTimestamp=0 processes all log files', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(tmpDir, '2026-01-01', logLine('10:00:00', 'learned first') + '\n');
    writeLogFile(tmpDir, '2026-02-15', logLine('10:00:00', 'pattern: second') + '\n');

    const result = consolidate(tmpDir, 0);

    assert.strictEqual(result.processed, 2);
    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.strictEqual(patterns.length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-DL-010: Merges entries into correct structured files ──────────────────

test('VAL-DL-010: all keyword categories route to correct structured files', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(
      tmpDir,
      '2026-04-01',
      [
        logLine('10:00:00', 'learned how to use atomic writes'),
        logLine('10:01:00', 'gotcha: Windows uses backslash paths'),
        logLine('10:02:00', 'decision: use path.join everywhere'),
        logLine('10:03:00', 'issue: test flakiness with EBUSY'),
        logLine('10:04:00', 'discovered memory leak in scheduler'),
        '',
      ].join('\n')
    );

    const result = consolidate(tmpDir, 0);

    assert.strictEqual(result.extracted, 5, 'Should extract 5 items');

    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.strictEqual(patterns.length, 1, '1 pattern (learned)');

    const gotchas = JSON.parse(fs.readFileSync(path.join(tmpDir, 'gotchas.json'), 'utf8'));
    assert.strictEqual(gotchas.length, 1, '1 gotcha');

    const decisions = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf8');
    assert.ok(decisions.includes('decision'), 'decisions.md has decision entry');

    const issues = fs.readFileSync(path.join(tmpDir, 'issues.md'), 'utf8');
    assert.ok(issues.includes('issue'), 'issues.md has issue entry');
    assert.ok(issues.includes('discovered'), 'issues.md has discovered entry');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-010: entries use correct schema (id, text, area, timestamp)', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(tmpDir, '2026-04-01', logLine('10:00:00', 'learned the schema') + '\n');

    consolidate(tmpDir, 0);

    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    const entry = patterns[0];
    assert.ok(typeof entry.id === 'string' && entry.id.length > 0, 'id must be a string');
    assert.ok(typeof entry.text === 'string' && entry.text.length > 0, 'text must be a string');
    assert.ok(typeof entry.area === 'string' && entry.area.length > 0, 'area must be a string');
    assert.ok(
      typeof entry.timestamp === 'string' && !isNaN(new Date(entry.timestamp).getTime()),
      'timestamp must be a valid ISO date'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-010: entries without keywords produce no structured entries', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(
      tmpDir,
      '2026-04-01',
      [
        logLine('10:00:00', 'regular session update'),
        logLine('10:01:00', 'all going fine'),
        '',
      ].join('\n')
    );

    const result = consolidate(tmpDir, 0);

    assert.strictEqual(result.extracted, 0);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'patterns.json')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'gotchas.json')));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-DL-011: Idempotency ──────────────────────────────────────────────────

test('VAL-DL-011: running consolidation twice produces no duplicate entries', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(
      tmpDir,
      '2026-04-01',
      [
        logLine('10:00:00', 'learned that idempotency matters'),
        logLine('10:01:00', 'gotcha: check return values'),
        logLine('10:02:00', 'decision: use UTC timestamps'),
        '',
      ].join('\n')
    );

    consolidate(tmpDir, 0);
    const decisionsAfterFirst = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf8');

    consolidate(tmpDir, 0);
    const decisionsAfterSecond = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf8');

    // JSON files: no duplicates
    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.strictEqual(patterns.length, 1, 'patterns.json: no duplicates after 2 runs');

    const gotchas = JSON.parse(fs.readFileSync(path.join(tmpDir, 'gotchas.json'), 'utf8'));
    assert.strictEqual(gotchas.length, 1, 'gotchas.json: no duplicates after 2 runs');

    // Markdown files: identical content after second run
    assert.strictEqual(
      decisionsAfterFirst,
      decisionsAfterSecond,
      'decisions.md: no changes on second run'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-011: manifest file tracks processed log paths', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(tmpDir, '2026-04-01', logLine('10:00:00', 'learned manifest tracking') + '\n');

    consolidate(tmpDir, 0);

    const manifestFile = path.join(tmpDir, '.consolidation-manifest.json');
    assert.ok(fs.existsSync(manifestFile), '.consolidation-manifest.json should be created');

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.ok(Array.isArray(manifest), 'Manifest should be an array');
    assert.strictEqual(manifest.length, 1, 'Manifest should track 1 processed log');
    assert.ok(manifest[0].includes('2026-04-01'), 'Manifest entry should reference log date');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-DL-012: Handles empty and corrupted logs gracefully ──────────────────

test('VAL-DL-012: empty log file is skipped; valid logs are still processed', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(tmpDir, '2026-04-01', ''); // empty
    writeLogFile(tmpDir, '2026-04-02', logLine('10:00:00', 'learned from valid log') + '\n');

    let threw = false;
    let result;
    try {
      result = consolidate(tmpDir, 0);
    } catch (_err) {
      threw = true;
    }

    assert.ok(!threw, 'consolidate() must not throw');
    assert.strictEqual(result.processed, 2, 'Both files marked as processed');

    const patterns = JSON.parse(fs.readFileSync(path.join(tmpDir, 'patterns.json'), 'utf8'));
    assert.strictEqual(patterns.length, 1, '1 pattern from the valid log');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-012: missing logs directory does not crash', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    let threw = false;
    let result;
    try {
      result = consolidate(tmpDir, 0);
    } catch (_err) {
      threw = true;
    }

    assert.ok(!threw);
    assert.strictEqual(result.processed, 0);
    assert.strictEqual(result.extracted, 0);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-012: whitespace-only log file is skipped without error', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(tmpDir, '2026-04-01', '   \n\n   \n');

    let threw = false;
    try {
      consolidate(tmpDir, 0);
    } catch (_err) {
      threw = true;
    }

    assert.ok(!threw, 'Should not throw for whitespace-only log');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-DL-012: log with no keywords is processed without error and extracts 0 items', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    writeLogFile(
      tmpDir,
      '2026-04-01',
      [logLine('10:00:00', 'working on things'), logLine('10:01:00', 'all fine'), ''].join('\n')
    );

    let threw = false;
    let result;
    try {
      result = consolidate(tmpDir, 0);
    } catch (_err) {
      threw = true;
    }

    assert.ok(!threw);
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.extracted, 0);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-DL-013: Enforces caps after merge ────────────────────────────────────

test('VAL-DL-013: enforces 200-line and 25KB cap on decisions.md after consolidation', () => {
  const { consolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // 100 decision entries pushes decisions.md well over both caps
    writeLogFile(tmpDir, '2026-04-01', buildLargeDecisionLog(100));

    consolidate(tmpDir, 0);

    const decisionsFile = path.join(tmpDir, 'decisions.md');
    assert.ok(fs.existsSync(decisionsFile), 'decisions.md should exist');

    const content = fs.readFileSync(decisionsFile, 'utf8');
    const lineCount = content.split('\n').length;
    const sizeBytes = fs.statSync(decisionsFile).size;

    assert.ok(lineCount <= 200, `decisions.md should be ≤ 200 lines, got ${lineCount}`);
    assert.ok(sizeBytes <= 25 * 1024, `decisions.md should be ≤ 25KB, got ${sizeBytes} bytes`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── extractActionableItems() unit tests ──────────────────────────────────────

test('extractActionableItems() parses log entries and classifies by keyword', () => {
  const { extractActionableItems } = getModule();

  const content = [
    logLine('10:00:00', 'learned the format'),
    logLine('10:01:00', 'gotcha: edge cases'),
    logLine('10:02:00', 'decision: keep it simple'),
    logLine('10:03:00', 'issue with flaky tests'),
    logLine('10:04:00', 'discovered a new bug in the system'),
    'not a log line',
    '',
  ].join('\n');

  const items = extractActionableItems(content);

  assert.strictEqual(items.length, 5, 'Should extract 5 items');
  assert.strictEqual(items[0].category, 'pattern');
  assert.strictEqual(items[1].category, 'gotcha');
  assert.strictEqual(items[2].category, 'decision');
  assert.strictEqual(items[3].category, 'issue');
  assert.strictEqual(items[4].category, 'issue'); // discovered → issue
});

test('extractActionableItems() returns [] for empty/null input', () => {
  const { extractActionableItems } = getModule();

  assert.deepStrictEqual(extractActionableItems(''), []);
  assert.deepStrictEqual(extractActionableItems(null), []);
  assert.deepStrictEqual(extractActionableItems(undefined), []);
});

test('extractActionableItems() is case-insensitive for keywords', () => {
  const { extractActionableItems } = getModule();

  const content = [
    logLine('10:00:00', 'LEARNED something uppercase'),
    logLine('10:01:00', 'Gotcha: mixed case'),
    logLine('10:02:00', 'Pattern: capitalized'),
    '',
  ].join('\n');

  const items = extractActionableItems(content);

  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].category, 'pattern');
  assert.strictEqual(items[1].category, 'gotcha');
  assert.strictEqual(items[2].category, 'pattern');
});

test('extractActionableItems() skips non-log-entry lines (no - [HH:MM:SS] prefix)', () => {
  const { extractActionableItems } = getModule();

  const content = [
    '# Daily Log',
    'learned: not a valid entry (no timestamp)',
    logLine('10:00:00', 'learned: this is valid'),
    '  - [10:01:00] indented, not valid',
    '',
  ].join('\n');

  const items = extractActionableItems(content);

  assert.strictEqual(items.length, 1, 'Only 1 valid entry should be extracted');
});

// ── Module exports ────────────────────────────────────────────────────────────

test('module exports consolidate and extractActionableItems', () => {
  const mod = getModule();
  assert.strictEqual(typeof mod.consolidate, 'function');
  assert.strictEqual(typeof mod.extractActionableItems, 'function');
});
