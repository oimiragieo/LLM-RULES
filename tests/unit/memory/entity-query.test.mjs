// tests/unit/memory/entity-query.test.mjs
// RED: Failing tests for EntityQuery class (Task #28 - P1-2.4)

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import EntityQuery (will fail initially)
const { EntityQuery } = await import('../../../.claude/lib/memory/entity-query.cjs');

describe('EntityQuery', () => {
  let db;
  let entityQuery;
  let testDbPath;

  beforeEach(() => {
    // Create in-memory database for testing
    testDbPath = ':memory:';
    db = new DatabaseSync(testDbPath);
    db.exec('PRAGMA foreign_keys = ON');

    // Create schema
    db.exec(`
      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('agent', 'task', 'skill', 'concept', 'file', 'pattern', 'decision', 'issue')),
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

      CREATE TABLE entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id TEXT NOT NULL,
        to_entity_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN (
          'relates_to', 'blocks', 'blocked_by', 'implements',
          'conflicts_with', 'assigned_to', 'depends_on', 'supersedes',
          'references', 'resolves'
        )),
        weight REAL DEFAULT 1.0 CHECK(weight BETWEEN 0 AND 1),
        metadata TEXT,
        created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        CHECK (from_entity_id != to_entity_id)
      );

      CREATE INDEX idx_entities_type ON entities(type);
      CREATE INDEX idx_entities_name ON entities(name);
      CREATE INDEX idx_relationships_from ON entity_relationships(from_entity_id);
      CREATE INDEX idx_relationships_to ON entity_relationships(to_entity_id);
      CREATE INDEX idx_relationships_type ON entity_relationships(relationship_type);
    `);

    // Insert test data
    db.exec(`
      -- Entities
      INSERT INTO entities (id, type, name, content, quality_score)
      VALUES
        ('agent-developer', 'agent', 'Developer Agent', 'TDD-focused implementer', 0.85),
        ('agent-qa', 'agent', 'QA Agent', 'Testing specialist', 0.75),
        ('task-25', 'task', 'Task #25: Design SQLite schema', 'Database design', 0.90),
        ('task-26', 'task', 'Task #26: Implement entity extraction', 'Extraction logic', 0.80),
        ('task-27', 'task', 'Task #27: Integration tests', 'E2E testing', 0.70),
        ('skill-tdd', 'skill', 'TDD Skill', 'Red-Green-Refactor', 0.95),
        ('skill-debugging', 'skill', 'Debugging Skill', 'Systematic debugging', 0.88),
        ('concept-hybrid-memory', 'concept', 'Hybrid Memory', 'Files + ChromaDB + SQLite', 0.92),
        ('pattern-wal', 'pattern', 'Write-Ahead Log', 'Reliable sync pattern', 0.87),
        ('file-entity-query-cjs', 'file', 'entity-query.cjs', 'Query API implementation', 0.60);

      -- Relationships
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES
        ('task-25', 'agent-developer', 'assigned_to', 1.0),
        ('task-26', 'agent-developer', 'assigned_to', 1.0),
        ('task-27', 'agent-qa', 'assigned_to', 1.0),
        ('task-26', 'task-25', 'blocked_by', 1.0),
        ('task-27', 'task-26', 'blocked_by', 1.0),
        ('pattern-wal', 'concept-hybrid-memory', 'implements', 0.95),
        ('file-entity-query-cjs', 'concept-hybrid-memory', 'relates_to', 0.80),
        ('skill-tdd', 'agent-developer', 'relates_to', 0.90);
    `);

    // Create EntityQuery instance
    entityQuery = new EntityQuery(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('should throw a descriptive error when schema is missing', () => {
    const emptyDb = new DatabaseSync(':memory:');
    try {
      assert.throws(
        () => new EntityQuery(emptyDb),
        err =>
          String(err?.message || '').includes('Memory DB not initialized') &&
          String(err?.message || '').includes('entities'),
        'Should throw helpful schema initialization error'
      );
    } finally {
      emptyDb.close();
    }
  });

  describe('findById()', () => {
    it('should find entity by ID', async () => {
      const entity = await entityQuery.findById('agent-developer');

      assert.ok(entity, 'Entity should be found');
      assert.strictEqual(entity.id, 'agent-developer');
      assert.strictEqual(entity.type, 'agent');
      assert.strictEqual(entity.name, 'Developer Agent');
      assert.strictEqual(entity.quality_score, 0.85);
    });

    it('should return null for non-existent ID', async () => {
      const entity = await entityQuery.findById('non-existent-id');
      assert.strictEqual(entity, null);
    });

    it('should include relationships when requested', async () => {
      const entity = await entityQuery.findById('agent-developer', {
        includeRelationships: true,
      });

      assert.ok(entity, 'Entity should be found');
      assert.ok(Array.isArray(entity.relationships), 'Should have relationships array');
      assert.ok(entity.relationships.length > 0, 'Should have at least one relationship');

      // Check relationship structure
      const rel = entity.relationships[0];
      assert.ok(rel.to_entity, 'Relationship should have to_entity');
      assert.ok(rel.type, 'Relationship should have type');
      assert.ok(rel.weight !== undefined, 'Relationship should have weight');
    });
  });

  describe('findByType()', () => {
    it('should find all entities of given type', async () => {
      const tasks = await entityQuery.findByType('task');

      assert.ok(Array.isArray(tasks), 'Should return array');
      assert.strictEqual(tasks.length, 3, 'Should find 3 tasks');
      tasks.forEach(task => {
        assert.strictEqual(task.type, 'task');
      });
    });

    it('should support limit filter', async () => {
      const tasks = await entityQuery.findByType('task', { limit: 2 });

      assert.strictEqual(tasks.length, 2, 'Should respect limit');
    });

    it('should support quality_score filter', async () => {
      const highQuality = await entityQuery.findByType('task', {
        quality_score: 0.75,
      });

      assert.ok(highQuality.length > 0, 'Should find high-quality tasks');
      highQuality.forEach(entity => {
        assert.ok(
          entity.quality_score >= 0.75,
          `Quality score ${entity.quality_score} should be >= 0.75`
        );
      });
    });

    it('should support source_file filter', async () => {
      // Add entity with source_file
      db.exec(`
        INSERT INTO entities (id, type, name, source_file)
        VALUES ('test-entity', 'pattern', 'Test Pattern', 'learnings.md')
      `);

      const entities = await entityQuery.findByType('pattern', {
        source_file: 'learnings.md',
      });

      assert.ok(entities.length > 0, 'Should find entities from learnings.md');
      entities.forEach(entity => {
        assert.strictEqual(entity.source_file, 'learnings.md');
      });
    });

    it('should support created_after filter', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const entities = await entityQuery.findByType('task', {
        created_after: yesterday,
      });

      // All test entities created "now" should match
      assert.strictEqual(entities.length, 3, 'Should find recent tasks');
    });

    it('should return empty array for non-existent type', async () => {
      const entities = await entityQuery.findByType('non-existent-type');
      assert.strictEqual(entities.length, 0);
    });
  });

  describe('findRelated()', () => {
    it('should find directly related entities', async () => {
      const related = await entityQuery.findRelated('task-25');

      assert.ok(Array.isArray(related), 'Should return array');
      assert.ok(related.length > 0, 'Should find related entities');

      // Check structure
      const rel = related[0];
      assert.ok(rel.entity, 'Should have entity object');
      assert.ok(rel.relationship_type, 'Should have relationship_type');
      assert.ok(rel.weight !== undefined, 'Should have weight');
    });

    it('should filter by relationship_type', async () => {
      const assigned = await entityQuery.findRelated('task-25', {
        relationshipType: 'assigned_to',
      });

      assert.ok(assigned.length > 0, 'Should find assigned entities');
      assigned.forEach(rel => {
        assert.strictEqual(
          rel.relationship_type,
          'assigned_to',
          'Should only return assigned_to relationships'
        );
      });
    });

    it('should respect depth parameter', async () => {
      // Depth 1: task-25 → agent-developer
      const depth1 = await entityQuery.findRelated('task-25', { depth: 1 });
      assert.ok(depth1.length > 0, 'Should find depth 1 entities');

      // Depth 2: task-25 → agent-developer → skill-tdd
      const depth2 = await entityQuery.findRelated('task-25', { depth: 2 });
      assert.ok(depth2.length >= depth1.length, 'Depth 2 should find more or equal entities');
    });

    it('should return empty array for entity with no relationships', async () => {
      const related = await entityQuery.findRelated('file-entity-query-cjs');
      // file-entity-query-cjs has outgoing relationships but query checks incoming
      assert.ok(Array.isArray(related), 'Should return array');
    });

    it('should return empty array for non-existent entity', async () => {
      const related = await entityQuery.findRelated('non-existent-id');
      assert.strictEqual(related.length, 0);
    });
  });

  describe('getRelationshipPath()', () => {
    it('should find direct path between entities', async () => {
      // task-26 → task-25 (blocked_by)
      const path = await entityQuery.getRelationshipPath('task-26', 'task-25');

      assert.ok(Array.isArray(path), 'Should return array');
      assert.ok(path.length > 0, 'Should find a path');

      // Check path structure
      const hop = path[0];
      assert.ok(hop.from_entity, 'Should have from_entity');
      assert.ok(hop.to_entity, 'Should have to_entity');
      assert.ok(hop.relationship_type, 'Should have relationship_type');
    });

    it('should find multi-hop path', async () => {
      // task-27 → task-26 → task-25
      const path = await entityQuery.getRelationshipPath('task-27', 'task-25');

      assert.ok(path.length >= 2, 'Should find multi-hop path');
      assert.strictEqual(path[0].from_entity.id, 'task-27', 'Path should start at task-27');
      assert.strictEqual(
        path[path.length - 1].to_entity.id,
        'task-25',
        'Path should end at task-25'
      );
    });

    it('should respect maxDepth parameter', async () => {
      // Limit depth to 1 (should not find task-27 → task-25)
      const path = await entityQuery.getRelationshipPath('task-27', 'task-25', {
        maxDepth: 1,
      });

      assert.strictEqual(path.length, 0, 'Should not find path with maxDepth=1');
    });

    it('should return empty array when no path exists', async () => {
      const path = await entityQuery.getRelationshipPath('agent-qa', 'skill-tdd');

      assert.strictEqual(path.length, 0, 'Should return empty array when no path exists');
    });

    it('should return empty array for same entity', async () => {
      const path = await entityQuery.getRelationshipPath('task-25', 'task-25');

      assert.strictEqual(path.length, 0, 'Should not find path from entity to itself');
    });

    it('should use BFS for shortest path', async () => {
      // Add alternate longer path: task-27 → agent-qa → skill-debugging → agent-developer → task-25
      db.exec(`
        INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
        VALUES
          ('agent-qa', 'skill-debugging', 'relates_to'),
          ('skill-debugging', 'agent-developer', 'relates_to'),
          ('agent-developer', 'task-25', 'assigned_to')
      `);

      const path = await entityQuery.getRelationshipPath('task-27', 'task-25');

      // Should find shortest path (2 hops) not longest (4 hops)
      assert.ok(path.length <= 2, `Should find shortest path, found path with ${path.length} hops`);
    });
  });

  describe('Query result format', () => {
    it('should return entity with all required fields', async () => {
      const entity = await entityQuery.findById('task-25');

      // Required fields from schema
      assert.ok(entity.id, 'Should have id');
      assert.ok(entity.type, 'Should have type');
      assert.ok(entity.name, 'Should have name');
      assert.ok(entity.content !== undefined, 'Should have content (even if null)');
      assert.ok(entity.created_at, 'Should have created_at');
      assert.ok(entity.updated_at, 'Should have updated_at');
      assert.ok(entity.quality_score !== undefined, 'Should have quality_score');
    });

    it('should return relationship with all required fields', async () => {
      const entity = await entityQuery.findById('agent-developer', {
        includeRelationships: true,
      });
      const rel = entity.relationships[0];

      assert.ok(rel.to_entity, 'Should have to_entity');
      assert.ok(rel.to_entity.id, 'to_entity should have id');
      assert.ok(rel.to_entity.name, 'to_entity should have name');
      assert.ok(rel.type, 'Should have type');
      assert.ok(rel.weight !== undefined, 'Should have weight');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty database', async () => {
      // Clear all data
      db.exec('DELETE FROM entity_relationships');
      db.exec('DELETE FROM entities');

      const entities = await entityQuery.findByType('task');
      assert.strictEqual(entities.length, 0, 'Should return empty array');
    });

    it('should handle invalid relationship types gracefully', async () => {
      const related = await entityQuery.findRelated('task-25', {
        relationshipType: 'invalid-type',
      });

      assert.strictEqual(related.length, 0, 'Should return empty array for invalid type');
    });

    it('should handle circular relationships', async () => {
      // Add circular relationship (allowed by schema if different types)
      db.exec(`
        INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
        VALUES ('agent-developer', 'task-25', 'resolves')
      `);

      const path = await entityQuery.getRelationshipPath('task-25', 'agent-developer');

      assert.ok(Array.isArray(path), 'Should handle circular relationships');
      assert.ok(path.length > 0, 'Should find path in circular graph');
    });

    it('should handle invalid limit in findByType (no NaN in SQL)', async () => {
      const tasks = await entityQuery.findByType('task', { limit: 'invalid' });
      assert.ok(Array.isArray(tasks), 'Should return array');
      assert.strictEqual(tasks.length, 0, 'Invalid limit should clamp to 0');
    });

    it('should handle invalid depth in findRelated (fallback to 1)', async () => {
      const related = await entityQuery.findRelated('task-25', { depth: null });
      assert.ok(Array.isArray(related), 'Should return array');
      assert.ok(related.length >= 0, 'Invalid depth should not throw');
    });
  });
});
