// tests/unit/memory/schema-creation.test.mjs
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Import the migration script (will create this)
const MIGRATION_SCRIPT_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/init-memory-db.cjs');

// Convert Windows path to file:// URL for ESM import
const MIGRATION_SCRIPT_URL = new URL(`file:///${MIGRATION_SCRIPT_PATH.replace(/\\/g, '/')}`).href;

describe('SQLite Entity Schema Creation', () => {
  let db;
  let tempDbPath;

  beforeEach(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(PROJECT_ROOT, `.claude/data/test-memory-${Date.now()}.db`);
    db = new Database(tempDbPath);
  });

  afterEach(async () => {
    // Cleanup
    if (db) {
      db.close();
    }
    try {
      await fs.unlink(tempDbPath);
    } catch (_err) {
      // Ignore if file doesn't exist
    }
  });

  describe('Schema Structure', () => {
    it('should create entities table with correct columns', async _t => {
      // Import and run migration
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name, type
        FROM pragma_table_info('entities')
        ORDER BY cid
      `
        )
        .all();

      const expectedColumns = [
        { name: 'id', type: 'TEXT' },
        { name: 'type', type: 'TEXT' },
        { name: 'name', type: 'TEXT' },
        { name: 'content', type: 'TEXT' },
        { name: 'source_file', type: 'TEXT' },
        { name: 'line_number', type: 'INTEGER' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' },
        { name: 'last_accessed', type: 'TIMESTAMP' },
        { name: 'access_count', type: 'INTEGER' },
        { name: 'quality_score', type: 'REAL' },
      ];

      assert.equal(result.length, expectedColumns.length, 'Should have correct number of columns');

      expectedColumns.forEach((expected, index) => {
        assert.equal(
          result[index].name,
          expected.name,
          `Column ${index} should be named ${expected.name}`
        );
        assert.equal(
          result[index].type,
          expected.type,
          `Column ${expected.name} should have type ${expected.type}`
        );
      });
    });

    it('should create relationships table with correct columns', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name, type
        FROM pragma_table_info('entity_relationships')
        ORDER BY cid
      `
        )
        .all();

      const expectedColumns = [
        { name: 'id', type: 'INTEGER' },
        { name: 'from_entity_id', type: 'TEXT' },
        { name: 'to_entity_id', type: 'TEXT' },
        { name: 'relationship_type', type: 'TEXT' },
        { name: 'weight', type: 'REAL' },
        { name: 'metadata', type: 'JSON' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ];

      assert.equal(result.length, expectedColumns.length, 'Should have correct number of columns');

      expectedColumns.forEach((expected, index) => {
        assert.equal(
          result[index].name,
          expected.name,
          `Column ${index} should be named ${expected.name}`
        );
        assert.equal(
          result[index].type,
          expected.type,
          `Column ${expected.name} should have type ${expected.type}`
        );
      });
    });

    it('should create entity_attributes table with correct columns', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name, type
        FROM pragma_table_info('entity_attributes')
        ORDER BY cid
      `
        )
        .all();

      const expectedColumns = [
        { name: 'entity_id', type: 'TEXT' },
        { name: 'attribute_key', type: 'TEXT' },
        { name: 'attribute_value', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ];

      assert.equal(result.length, expectedColumns.length, 'Should have correct number of columns');

      expectedColumns.forEach((expected, index) => {
        assert.equal(
          result[index].name,
          expected.name,
          `Column ${index} should be named ${expected.name}`
        );
        assert.equal(
          result[index].type,
          expected.type,
          `Column ${expected.name} should have type ${expected.type}`
        );
      });
    });

    it('should create schema_version table', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name, type
        FROM pragma_table_info('schema_version')
        ORDER BY cid
      `
        )
        .all();

      const expectedColumns = [
        { name: 'version', type: 'INTEGER' },
        { name: 'applied_at', type: 'TIMESTAMP' },
        { name: 'description', type: 'TEXT' },
      ];

      assert.equal(result.length, expectedColumns.length);
      expectedColumns.forEach((expected, index) => {
        assert.equal(result[index].name, expected.name);
        assert.equal(result[index].type, expected.type);
      });
    });
  });

  describe('Indexes', () => {
    it('should create idx_entities_type index', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_entities_type'
      `
        )
        .get();

      assert.ok(result, 'idx_entities_type index should exist');
    });

    it('should create idx_entities_name index', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_entities_name'
      `
        )
        .get();

      assert.ok(result, 'idx_entities_name index should exist');
    });

    it('should create idx_entities_source_file index', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_entities_source_file'
      `
        )
        .get();

      assert.ok(result, 'idx_entities_source_file index should exist');
    });

    it('should create relationship indexes', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const indexes = ['idx_relationships_from', 'idx_relationships_to', 'idx_relationships_type'];

      for (const indexName of indexes) {
        const result = db
          .prepare(
            `
          SELECT name FROM sqlite_master
          WHERE type='index' AND name=?
        `
          )
          .get(indexName);

        assert.ok(result, `${indexName} index should exist`);
      }
    });
  });

  describe('Constraints', () => {
    it('should enforce PRIMARY KEY on entities.id', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      // Insert first entity
      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('test-1', 'agent', 'Test Agent')
      `
      ).run();

      // Try to insert duplicate id
      assert.throws(
        () => {
          db.prepare(
            `
          INSERT INTO entities (id, type, name)
          VALUES ('test-1', 'task', 'Another Entity')
        `
          ).run();
        },
        { name: 'SqliteError' },
        'Should reject duplicate primary key'
      );
    });

    it('should enforce CHECK constraint on entity type', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      // Valid type should work
      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('test-1', 'agent', 'Test Agent')
      `
      ).run();

      // Invalid type should fail
      assert.throws(
        () => {
          db.prepare(
            `
          INSERT INTO entities (id, type, name)
          VALUES ('test-2', 'invalid_type', 'Bad Entity')
        `
          ).run();
        },
        { name: 'SqliteError' },
        'Should reject invalid entity type'
      );
    });

    it('should enforce CHECK constraint on relationship type', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      // Create test entities
      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('entity-1', 'agent', 'Agent 1'), ('entity-2', 'task', 'Task 1')
      `
      ).run();

      // Valid relationship type should work
      db.prepare(
        `
        INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
        VALUES ('entity-1', 'entity-2', 'assigned_to')
      `
      ).run();

      // Invalid relationship type should fail
      assert.throws(
        () => {
          db.prepare(
            `
          INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
          VALUES ('entity-1', 'entity-2', 'invalid_rel')
        `
          ).run();
        },
        { name: 'SqliteError' },
        'Should reject invalid relationship type'
      );
    });

    it('should enforce FOREIGN KEY constraints', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      // Enable foreign key constraints
      db.pragma('foreign_keys = ON');

      // Create test entity
      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('entity-1', 'agent', 'Agent 1')
      `
      ).run();

      // Try to create relationship to non-existent entity
      assert.throws(
        () => {
          db.prepare(
            `
          INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
          VALUES ('entity-1', 'non-existent', 'assigned_to')
        `
          ).run();
        },
        { name: 'SqliteError' },
        'Should reject relationship to non-existent entity'
      );
    });
  });

  describe('Default Values', () => {
    it('should set default created_at timestamp on entities', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('test-1', 'agent', 'Test Agent')
      `
      ).run();

      const result = db
        .prepare(
          `
        SELECT created_at FROM entities WHERE id='test-1'
      `
        )
        .get();

      assert.ok(result.created_at, 'Should have created_at timestamp');
      assert.ok(new Date(result.created_at).getTime() > 0, 'Should be valid ISO 8601 timestamp');
    });

    it('should set default access_count to 0', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('test-1', 'agent', 'Test Agent')
      `
      ).run();

      const result = db
        .prepare(
          `
        SELECT access_count FROM entities WHERE id='test-1'
      `
        )
        .get();

      assert.equal(result.access_count, 0, 'Should default access_count to 0');
    });

    it('should set default quality_score to 0.5', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('test-1', 'agent', 'Test Agent')
      `
      ).run();

      const result = db
        .prepare(
          `
        SELECT quality_score FROM entities WHERE id='test-1'
      `
        )
        .get();

      assert.equal(result.quality_score, 0.5, 'Should default quality_score to 0.5');
    });

    it('should set default weight to 1.0 on relationships', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      // Create test entities
      db.prepare(
        `
        INSERT INTO entities (id, type, name)
        VALUES ('entity-1', 'agent', 'Agent 1'), ('entity-2', 'task', 'Task 1')
      `
      ).run();

      // Create relationship without weight
      db.prepare(
        `
        INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
        VALUES ('entity-1', 'entity-2', 'assigned_to')
      `
      ).run();

      const result = db
        .prepare(
          `
        SELECT weight FROM entity_relationships
        WHERE from_entity_id='entity-1'
      `
        )
        .get();

      assert.equal(result.weight, 1.0, 'Should default weight to 1.0');
    });
  });

  describe('Schema Version Tracking', () => {
    it('should insert initial schema version', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);
      await initializeDatabase(db);

      const result = db
        .prepare(
          `
        SELECT version, description FROM schema_version ORDER BY version DESC LIMIT 1
      `
        )
        .get();

      assert.equal(result.version, 1, 'Should be version 1');
      assert.ok(result.description, 'Should have description');
    });

    it('should prevent duplicate schema initialization', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);

      // Initialize once
      await initializeDatabase(db);

      // Initialize again - should be idempotent
      await initializeDatabase(db);

      const versions = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM schema_version
      `
        )
        .get();

      assert.equal(versions.count, 1, 'Should only have one version entry');
    });
  });

  describe('CLI Tool', () => {
    it('should export initializeDatabase function', async _t => {
      const module = await import(MIGRATION_SCRIPT_URL);

      assert.ok(module.initializeDatabase, 'Should export initializeDatabase');
      assert.equal(typeof module.initializeDatabase, 'function', 'Should be a function');
    });

    it('should accept database path as parameter', async _t => {
      const { initializeDatabase } = await import(MIGRATION_SCRIPT_URL);

      // Should not throw with valid database instance
      assert.doesNotThrow(() => {
        initializeDatabase(db);
      });
    });
  });
});
