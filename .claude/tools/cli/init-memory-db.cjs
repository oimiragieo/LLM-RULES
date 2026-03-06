#!/usr/bin/env node
// .claude/tools/cli/init-memory-db.cjs
// Migration script to initialize SQLite entity schema for hybrid memory system

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

/**
 * Initialize SQLite database with entity schema
 * @param {DatabaseSync|string} dbOrPath - Database instance or path to database file
 * @returns {DatabaseSync} Database instance
 */
function initializeDatabase(dbOrPath) {
  // Handle both database instance and path
  const db = typeof dbOrPath === 'string' ? new DatabaseSync(dbOrPath) : dbOrPath;

  // Enable foreign key constraints
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better concurrency

  // Check if schema already exists (idempotent)
  const tableCheck = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='schema_version'
  `
    )
    .get();

  if (tableCheck) {
    migrateSchema(db);
    console.error('Schema already initialized, migration check complete.');
    return db;
  }

  const schemaVersion = 2;

  // Create schema in a transaction
  const createSchema = () => {
    db.exec('BEGIN');
    try {
      // 1. Create entities table
      db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN (
          'agent', 'task', 'skill', 'concept', 'file',
          'pattern', 'decision', 'issue', 'memory', 'gotcha'
        )),
        name TEXT NOT NULL,
        content TEXT,
        source_file TEXT,
        line_number INTEGER,
        created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_accessed TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0.5 CHECK(quality_score BETWEEN 0 AND 1)
      );
    `);

      // 2. Create entity_relationships table
      db.exec(`
      CREATE TABLE IF NOT EXISTS entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id TEXT NOT NULL,
        to_entity_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN (
          'relates_to', 'blocks', 'blocked_by', 'implements',
          'conflicts_with', 'assigned_to', 'depends_on', 'supersedes',
          'references', 'resolves'
        )),
        weight REAL DEFAULT 1.0 CHECK(weight BETWEEN 0 AND 1),
        metadata JSON,
        created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        CHECK (from_entity_id != to_entity_id)
      );
    `);

      // 3. Create entity_attributes table
      db.exec(`
      CREATE TABLE IF NOT EXISTS entity_attributes (
        entity_id TEXT NOT NULL,
        attribute_key TEXT NOT NULL,
        attribute_value TEXT,
        created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        PRIMARY KEY (entity_id, attribute_key)
      );
    `);

      // 4. Create schema_version table
      db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        description TEXT
      );
    `);

      // 5. Create indexes for performance
      db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_source_file ON entities(source_file);
      CREATE INDEX IF NOT EXISTS idx_entities_created ON entities(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_entities_quality ON entities(quality_score DESC);

      CREATE INDEX IF NOT EXISTS idx_relationships_from ON entity_relationships(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_to ON entity_relationships(to_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_type ON entity_relationships(relationship_type);
    `);

      // 6. Insert initial schema version
      db.prepare(
        `
      INSERT INTO schema_version (version, description)
      VALUES (?, ?)
    `
      ).run(schemaVersion, 'Entity schema with memory type and relationships');

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch (_rollbackErr) {
        // ignore rollback failures
      }
      throw err;
    }
  };

  // Run the transaction
  createSchema();

  console.log('SQLite entity schema initialized successfully');
  console.log('Tables created: entities, entity_relationships, entity_attributes, schema_version');
  console.log('Indexes created: 8 performance indexes');

  return db;
}

function getSchemaVersion(db) {
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    return Number(row?.version || 0);
  } catch (_err) {
    return 0;
  }
}

function migrateToV2(db) {
  db.exec('BEGIN');
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      CREATE TABLE entities_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN (
          'agent', 'task', 'skill', 'concept', 'file',
          'pattern', 'decision', 'issue', 'memory', 'gotcha'
        )),
        name TEXT NOT NULL,
        content TEXT,
        source_file TEXT,
        line_number INTEGER,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        last_accessed TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0.5 CHECK(quality_score BETWEEN 0 AND 1)
      );
    `);
    db.exec(`
      INSERT INTO entities_new (
        id,
        type,
        name,
        content,
        source_file,
        line_number,
        created_at,
        updated_at,
        last_accessed,
        access_count,
        quality_score
      )
      SELECT
        id,
        type,
        name,
        content,
        source_file,
        line_number,
        created_at,
        updated_at,
        last_accessed,
        access_count,
        quality_score
      FROM entities;
    `);
    db.exec('DROP TABLE entities;');
    db.exec('ALTER TABLE entities_new RENAME TO entities;');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_source_file ON entities(source_file);
      CREATE INDEX IF NOT EXISTS idx_entities_created ON entities(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_entities_quality ON entities(quality_score DESC);
    `);
    db.prepare(
      `
        INSERT INTO schema_version (version, description)
        VALUES (?, ?)
      `
    ).run(2, 'Add memory entity type');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (_rollbackErr) {
      // ignore rollback failures
    }
    throw err;
  }
}

function migrateSchema(db) {
  const version = getSchemaVersion(db);
  if (version >= 2) return;
  migrateToV2(db);
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node init-memory-db.cjs [options]

Initialize SQLite entity schema for Agent Studio's hybrid memory system.

Options:
  --db-path <path>    Path to database file (default: .claude/context/data/memory.db)
  --help, -h          Show this help message

Examples:
  node init-memory-db.cjs
  node init-memory-db.cjs --db-path ./custom-memory.db
    `);
    process.exit(0);
  }

  // Parse database path
  const dbPathIndex = args.indexOf('--db-path');
  let dbPath;

  if (dbPathIndex !== -1 && args[dbPathIndex + 1]) {
    dbPath = args[dbPathIndex + 1];
  } else {
    // Default path
    const projectRoot = path.resolve(__dirname, '../../../');
    dbPath = path.join(projectRoot, '.claude/context/data/memory.db');
  }

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created directory: ${dbDir}`);
  }

  console.log(`Initializing database at: ${dbPath}`);

  try {
    const db = initializeDatabase(dbPath);

    // Verify schema
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `
      )
      .all();

    console.log('\nVerification:');
    console.log('Tables:', tables.map(t => t.name).join(', '));

    const version = db.prepare('SELECT version, description FROM schema_version').get();
    console.log(`Schema version: ${version.version}`);
    console.log(`Description: ${version.description}`);

    db.close();
    console.log('\nDatabase initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  initializeDatabase,
};

// Run CLI if executed directly
const wrappedMain = wrapCLITool(main, 'init-memory-db');

if (require.main === module) {
  wrappedMain();
}
