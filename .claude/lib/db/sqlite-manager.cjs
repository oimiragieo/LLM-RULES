#!/usr/bin/env node
'use strict';

/**
 * SQLite Connection Manager
 * =========================
 * Singleton connection with WAL mode, migration runner, and graceful shutdown.
 *
 * Usage:
 *   const { getDb, closeDb, runMigrations } = require('.claude/lib/db/sqlite-manager.cjs');
 *   const db = getDb();
 *   runMigrations(db);
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Default DB path — runtime directory
const DEFAULT_DB_PATH = path.join(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'agent-studio.db'
);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Singleton map: dbPath → Database instance */
const _connections = new Map();

/**
 * Get (or create) a singleton Database connection for the given path.
 * WAL mode is enabled on first open.
 *
 * @param {string} [dbPath] - Absolute path to the SQLite file. Defaults to agent-studio.db.
 * @returns {import('better-sqlite3').Database}
 */
function getDb(dbPath) {
  const resolvedPath = path.resolve(dbPath || DEFAULT_DB_PATH);

  if (_connections.has(resolvedPath)) {
    return _connections.get(resolvedPath);
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);

  // Enable WAL mode for concurrent read performance
  db.pragma('journal_mode = WAL');
  // Enforce foreign key constraints
  db.pragma('foreign_keys = ON');

  _connections.set(resolvedPath, db);
  return db;
}

/**
 * Close and remove a database connection.
 * Call this before fs.rmSync on the DB file (Windows EBUSY prevention).
 *
 * @param {string} [dbPath] - Same path used with getDb(). Defaults to DEFAULT_DB_PATH.
 */
function closeDb(dbPath) {
  const resolvedPath = path.resolve(dbPath || DEFAULT_DB_PATH);

  const db = _connections.get(resolvedPath);
  if (db) {
    try {
      db.close();
    } catch (_e) {
      // Ignore close errors — connection may already be closed
    }
    _connections.delete(resolvedPath);
  }
}

/**
 * Close all open connections. Called on process exit.
 */
function closeAllDbs() {
  for (const [dbPath] of _connections) {
    closeDb(dbPath);
  }
}

/**
 * Run all .sql migration files from the migrations directory in filename order.
 * Idempotent — migrations use CREATE TABLE IF NOT EXISTS so safe to run multiple times.
 *
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // better-sqlite3 db.exec() handles multi-statement SQL natively —
    // no need to split; it processes all statements including PRAGMAs correctly.
    db.exec(sql);
  }
}

// Graceful shutdown: close all connections on process exit
process.on('exit', closeAllDbs);
process.on('SIGTERM', () => {
  closeAllDbs();
  process.exit(0);
});
process.on('SIGINT', () => {
  closeAllDbs();
  process.exit(0);
});

module.exports = {
  getDb,
  closeDb,
  closeAllDbs,
  runMigrations,
  DEFAULT_DB_PATH,
};
