 
/**
 * Tests for sync-memory-index.cjs
 * Bug 2: DB never closed after syncJsonMemory use
 * Bug 3: gotchas misclassified as 'issue'
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

function createTempDir() {
  const tmpDir = path.join(
    os.tmpdir(),
    `sync-memory-test-${crypto.randomBytes(4).toString('hex')}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function initTestDb(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT,
      source_file TEXT,
      line_number INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_accessed TEXT,
      access_count INTEGER DEFAULT 0,
      quality_score REAL DEFAULT 0.5
    );
    CREATE TABLE IF NOT EXISTS entity_relationships (
      from_entity_id TEXT,
      to_entity_id TEXT,
      relationship_type TEXT,
      weight REAL DEFAULT 1.0,
      PRIMARY KEY (from_entity_id, to_entity_id, relationship_type)
    );
    INSERT OR IGNORE INTO schema_version VALUES (1);
  `);
  db.close();
}

// Bug 2: syncJsonMemory must close the DB even if an error occurs
test('syncJsonMemory closes DB handle after successful sync', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'memory.db');
  initTestDb(dbPath);

  // Create a valid patterns.json
  const patternsPath = path.join(tmpDir, 'patterns.json');
  fs.writeFileSync(
    patternsPath,
    JSON.stringify([{ text: 'Use try/finally for cleanup', timestamp: '2026-01-01T00:00:00Z' }])
  );

  // Clear module cache to get fresh require
  const syncPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/memory/sync-memory-index.cjs'
  );
  delete require.cache[syncPath];

  const { syncJsonMemory } = require(syncPath);

  // Run sync - should not throw
  let syncError = null;
  try {
    syncJsonMemory(patternsPath, dbPath);
  } catch (err) {
    syncError = err;
  }

  assert.strictEqual(syncError, null, `syncJsonMemory should not throw: ${syncError?.message}`);

  // After sync, the DB should be closeable (verifies the handle was released)
  let verifyError = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const verifyDb = new DatabaseSync(dbPath);
    // Check entities were inserted
    const rows = verifyDb.prepare('SELECT * FROM entities').all();
    assert.ok(rows.length > 0, 'Should have inserted entities');
    verifyDb.close();
  } catch (err) {
    verifyError = err;
  }

  assert.strictEqual(
    verifyError,
    null,
    `DB should be accessible after syncJsonMemory (no handle leak). Got: ${verifyError?.message}`
  );

  cleanupTempDir(tmpDir);
});

// Bug 2: syncJsonMemory must close DB even when JSON parse returns empty array
test('syncJsonMemory closes DB when file contains empty array', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'memory.db');
  initTestDb(dbPath);

  const patternsPath = path.join(tmpDir, 'patterns.json');
  fs.writeFileSync(patternsPath, JSON.stringify([]));

  const syncPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/memory/sync-memory-index.cjs'
  );
  delete require.cache[syncPath];

  const { syncJsonMemory } = require(syncPath);
  syncJsonMemory(patternsPath, dbPath);

  // DB should still be accessible (handle closed)
  let verifyError = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const verifyDb = new DatabaseSync(dbPath);
    verifyDb.close();
  } catch (err) {
    verifyError = err;
  }

  assert.strictEqual(
    verifyError,
    null,
    `DB should be accessible after empty array sync. Got: ${verifyError?.message}`
  );

  cleanupTempDir(tmpDir);
});

// Bug 3: gotchas.json must be classified as type 'gotcha', not 'issue'
test('syncJsonMemory classifies gotchas.json entries as type gotcha', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'memory.db');
  initTestDb(dbPath);

  const gotchasPath = path.join(tmpDir, 'gotchas.json');
  fs.writeFileSync(
    gotchasPath,
    JSON.stringify([
      { text: 'Windows paths need normalization', area: 'platform' },
      { text: 'Glob-to-regex needs root handling', area: 'search' },
    ])
  );

  const syncPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/memory/sync-memory-index.cjs'
  );
  delete require.cache[syncPath];

  const { syncJsonMemory } = require(syncPath);
  syncJsonMemory(gotchasPath, dbPath);

  // Verify type is 'gotcha' not 'issue'
  const { DatabaseSync } = require('node:sqlite');
  const verifyDb = new DatabaseSync(dbPath);
  const rows = verifyDb.prepare('SELECT * FROM entities WHERE source_file = ?').all(gotchasPath);
  verifyDb.close();

  assert.ok(rows.length === 2, `Expected 2 gotcha rows, got ${rows.length}`);
  for (const row of rows) {
    assert.strictEqual(
      row.type,
      'gotcha',
      `Gotcha entry should have type 'gotcha', got '${row.type}' for: ${row.name}`
    );
  }

  cleanupTempDir(tmpDir);
});

// Confirm patterns.json still classified as 'pattern'
test('syncJsonMemory classifies patterns.json entries as type pattern', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'memory.db');
  initTestDb(dbPath);

  const patternsPath = path.join(tmpDir, 'patterns.json');
  fs.writeFileSync(
    patternsPath,
    JSON.stringify([{ text: 'Use try/finally pattern', area: 'resource-management' }])
  );

  const syncPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/memory/sync-memory-index.cjs'
  );
  delete require.cache[syncPath];

  const { syncJsonMemory } = require(syncPath);
  syncJsonMemory(patternsPath, dbPath);

  const { DatabaseSync } = require('node:sqlite');
  const verifyDb = new DatabaseSync(dbPath);
  const rows = verifyDb.prepare('SELECT * FROM entities WHERE source_file = ?').all(patternsPath);
  verifyDb.close();

  assert.ok(rows.length === 1, `Expected 1 pattern row, got ${rows.length}`);
  assert.strictEqual(
    rows[0].type,
    'pattern',
    `Pattern entry should have type 'pattern', got '${rows[0].type}'`
  );

  cleanupTempDir(tmpDir);
});

// Regression: gotchas must NOT be type 'issue'
test('syncJsonMemory does NOT classify gotchas as issue', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'memory.db');
  initTestDb(dbPath);

  const gotchasPath = path.join(tmpDir, 'gotchas.json');
  fs.writeFileSync(
    gotchasPath,
    JSON.stringify([{ text: 'This should not be classified as issue' }])
  );

  const syncPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/memory/sync-memory-index.cjs'
  );
  delete require.cache[syncPath];

  const { syncJsonMemory } = require(syncPath);
  syncJsonMemory(gotchasPath, dbPath);

  const { DatabaseSync } = require('node:sqlite');
  const verifyDb = new DatabaseSync(dbPath);
  const issueRows = verifyDb
    .prepare("SELECT * FROM entities WHERE type = 'issue' AND source_file = ?")
    .all(gotchasPath);
  verifyDb.close();

  assert.strictEqual(
    issueRows.length,
    0,
    `Gotcha entries must not be classified as 'issue', found ${issueRows.length} issue-typed rows`
  );

  cleanupTempDir(tmpDir);
});
