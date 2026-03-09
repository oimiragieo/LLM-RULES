#!/usr/bin/env node
'use strict';

/**
 * Tests: sqlite-manager.cjs
 * =========================
 * - DB creates file if missing
 * - WAL mode is enabled after getDb()
 * - Migrations run idempotently
 * - closeDb() closes cleanly
 * - All 3 tables exist after migration
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temporary directory so tests never touch the real runtime DB
const TEST_DIR = path.join(os.tmpdir(), `agent-studio-sqlite-test-${Date.now()}`);
const TEST_DB_PATH = path.join(TEST_DIR, 'test.db');

// Load module under test (after deciding on test DB path)
const { getDb, closeDb, runMigrations } = require('../../../.claude/lib/db/sqlite-manager.cjs');

before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
  // Ensure DB is closed before cleanup
  closeDb(TEST_DB_PATH);
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('getDb()', () => {
  it('creates the DB file if it does not exist', () => {
    const dbFile = path.join(TEST_DIR, 'creates-if-missing.db');
    assert.ok(!fs.existsSync(dbFile), 'DB file should not exist before getDb()');

    const db = getDb(dbFile);
    assert.ok(db, 'getDb() should return a database instance');
    assert.ok(fs.existsSync(dbFile), 'DB file should exist after getDb()');

    closeDb(dbFile);
  });

  it('returns the same singleton instance for the same path', () => {
    const dbFile = path.join(TEST_DIR, 'singleton.db');
    const db1 = getDb(dbFile);
    const db2 = getDb(dbFile);
    assert.strictEqual(db1, db2, 'Should return the same instance');
    closeDb(dbFile);
  });

  it('enables WAL journal mode', () => {
    const dbFile = path.join(TEST_DIR, 'wal-mode.db');
    const db = getDb(dbFile);

    const row = db.pragma('journal_mode', { simple: true });
    assert.strictEqual(row, 'wal', 'journal_mode should be wal');

    closeDb(dbFile);
  });

  it('enables foreign keys', () => {
    const dbFile = path.join(TEST_DIR, 'foreign-keys.db');
    const db = getDb(dbFile);

    const fkEnabled = db.pragma('foreign_keys', { simple: true });
    assert.strictEqual(fkEnabled, 1, 'foreign_keys should be enabled (1)');

    closeDb(dbFile);
  });
});

describe('closeDb()', () => {
  it('closes the database connection cleanly', () => {
    const dbFile = path.join(TEST_DIR, 'close-test.db');
    const db = getDb(dbFile);
    assert.ok(db.open, 'DB should be open before closeDb()');

    closeDb(dbFile);
    assert.ok(!db.open, 'DB should be closed after closeDb()');
  });

  it('calling closeDb() twice does not throw', () => {
    const dbFile = path.join(TEST_DIR, 'double-close.db');
    getDb(dbFile);
    assert.doesNotThrow(() => closeDb(dbFile), 'First close should not throw');
    assert.doesNotThrow(() => closeDb(dbFile), 'Second close should not throw');
  });
});

describe('runMigrations()', () => {
  it('creates all 3 tables: message_queue, file_memory, episodic_memory', () => {
    const dbFile = path.join(TEST_DIR, 'migrations-tables.db');
    const db = getDb(dbFile);
    runMigrations(db);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map(r => r.name);

    assert.ok(tables.includes('message_queue'), 'message_queue table should exist');
    assert.ok(tables.includes('file_memory'), 'file_memory table should exist');
    assert.ok(tables.includes('episodic_memory'), 'episodic_memory table should exist');

    closeDb(dbFile);
  });

  it('is idempotent — calling runMigrations() twice does not throw', () => {
    const dbFile = path.join(TEST_DIR, 'migrations-idempotent.db');
    const db = getDb(dbFile);

    assert.doesNotThrow(() => runMigrations(db), 'First migration run should not throw');
    assert.doesNotThrow(() => runMigrations(db), 'Second migration run should not throw');

    closeDb(dbFile);
  });

  it('message_queue has expected columns', () => {
    const dbFile = path.join(TEST_DIR, 'migrations-columns.db');
    const db = getDb(dbFile);
    runMigrations(db);

    const cols = db
      .prepare(`PRAGMA table_info(message_queue)`)
      .all()
      .map(r => r.name);

    const expected = [
      'id', 'chat_id', 'user_id', 'text', 'attachments',
      'timestamp', 'status', 'worker_pid', 'claimed_at',
      'heartbeat_at', 'attempt_count', 'last_error', 'completed_at',
    ];

    for (const col of expected) {
      assert.ok(cols.includes(col), `message_queue should have column: ${col}`);
    }

    closeDb(dbFile);
  });

  it('file_memory has expected columns', () => {
    const dbFile = path.join(TEST_DIR, 'migrations-fm-columns.db');
    const db = getDb(dbFile);
    runMigrations(db);

    const cols = db
      .prepare(`PRAGMA table_info(file_memory)`)
      .all()
      .map(r => r.name);

    const expected = ['id', 'source', 'mime_type', 'hash', 'size_bytes',
      'importance_score', 'summary', 'entities', 'clean_text',
      'vision_embedded', 'indexed_at', 'expires_at'];

    for (const col of expected) {
      assert.ok(cols.includes(col), `file_memory should have column: ${col}`);
    }

    closeDb(dbFile);
  });

  it('episodic_memory has expected columns', () => {
    const dbFile = path.join(TEST_DIR, 'migrations-em-columns.db');
    const db = getDb(dbFile);
    runMigrations(db);

    const cols = db
      .prepare(`PRAGMA table_info(episodic_memory)`)
      .all()
      .map(r => r.name);

    const expected = ['id', 'session_id', 'agent_type', 'content',
      'importance_score', 'tags', 'created_at'];

    for (const col of expected) {
      assert.ok(cols.includes(col), `episodic_memory should have column: ${col}`);
    }

    closeDb(dbFile);
  });
});
