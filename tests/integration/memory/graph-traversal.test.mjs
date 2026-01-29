// tests/integration/memory/graph-traversal.test.mjs
// Integration tests for EntityQuery graph traversal (Task #28 - P1-2.4)

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { EntityQuery } from '../../../.claude/lib/memory/entity-query.cjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('EntityQuery Graph Traversal Integration Tests', () => {
  let db;
  let entityQuery;
  let testDbPath;

  beforeEach(() => {
    // Create temporary database for integration tests
    testDbPath = path.join(__dirname, `test-graph-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');

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

    // Insert complex graph: P1-2 Memory System Implementation
    db.exec(`
      -- Entities: Memory System Implementation Team
      INSERT INTO entities (id, type, name, content, quality_score)
      VALUES
        -- Agents
        ('agent-developer-1', 'agent', 'Developer 1', 'Memory system backend specialist', 0.90),
        ('agent-developer-2', 'agent', 'Developer 2', 'Event system backend specialist', 0.88),
        ('agent-qa', 'agent', 'QA Agent', 'Integration testing specialist', 0.85),
        ('agent-architect', 'agent', 'Architect', 'System design specialist', 0.92),

        -- Tasks: Phase 1 (ChromaDB)
        ('task-22', 'task', 'Task #22: Install ChromaDB', 'P1-1.1: ChromaDB setup', 0.95),
        ('task-23', 'task', 'Task #23: Semantic search API', 'P1-1.3: Search implementation', 0.88),
        ('task-24', 'task', 'Task #24: Generate embeddings', 'P1-1.2: Embedding generation', 0.90),
        ('task-27', 'task', 'Task #27: Integration tests', 'P1-1.4: Semantic search tests', 0.80),

        -- Tasks: Phase 2 (SQLite)
        ('task-25', 'task', 'Task #25: SQLite schema', 'P1-2.1: Database design', 0.93),
        ('task-31', 'task', 'Task #31: Entity extraction', 'P1-2.2: Markdown extraction', 0.87),
        ('task-29', 'task', 'Task #29: Migrate memory files', 'P1-2.3: Migration script', 0.85),
        ('task-28', 'task', 'Task #28: Entity query API', 'P1-2.4: Graph queries', 0.82),

        -- Skills
        ('skill-tdd', 'skill', 'TDD Skill', 'Red-Green-Refactor methodology', 0.96),
        ('skill-debugging', 'skill', 'Debugging Skill', 'Systematic debugging', 0.94),

        -- Concepts
        ('concept-hybrid-memory', 'concept', 'Hybrid Memory', 'Files + ChromaDB + SQLite', 0.95),
        ('concept-entity-graph', 'concept', 'Entity Graph', 'Graph-based memory tracking', 0.88),

        -- Patterns
        ('pattern-wal', 'pattern', 'Write-Ahead Log', 'Reliable sync pattern', 0.90),
        ('pattern-bfs', 'pattern', 'BFS Traversal', 'Shortest path algorithm', 0.85),

        -- Decisions
        ('adr-054', 'decision', 'ADR-054: Memory Enhancement', 'Hybrid architecture decision', 0.98),

        -- Files
        ('file-entity-query-cjs', 'file', 'entity-query.cjs', 'Query API implementation', 0.75);

      -- Relationships: Task Dependencies (blocked_by chain)
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES
        -- Phase 1 dependencies
        ('task-24', 'task-22', 'blocked_by', 1.0),  -- Embeddings blocked by ChromaDB install
        ('task-23', 'task-24', 'blocked_by', 1.0),  -- Search blocked by embeddings
        ('task-27', 'task-23', 'blocked_by', 1.0),  -- Tests blocked by search

        -- Phase 2 dependencies
        ('task-31', 'task-25', 'blocked_by', 1.0),  -- Extraction blocked by schema
        ('task-29', 'task-31', 'blocked_by', 1.0),  -- Migration blocked by extraction
        ('task-28', 'task-29', 'blocked_by', 1.0),  -- Query API blocked by migration

        -- Agent assignments
        ('task-22', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-24', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-23', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-25', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-31', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-29', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-28', 'agent-developer-1', 'assigned_to', 1.0),
        ('task-27', 'agent-qa', 'assigned_to', 1.0),

        -- Skill usage
        ('agent-developer-1', 'skill-tdd', 'relates_to', 0.95),
        ('agent-developer-1', 'skill-debugging', 'relates_to', 0.90),
        ('agent-qa', 'skill-tdd', 'relates_to', 0.85),

        -- Concept implementation
        ('pattern-wal', 'concept-hybrid-memory', 'implements', 0.92),
        ('pattern-bfs', 'concept-entity-graph', 'implements', 0.88),
        ('file-entity-query-cjs', 'concept-entity-graph', 'implements', 0.85),

        -- Decision references
        ('concept-hybrid-memory', 'adr-054', 'references', 0.95),
        ('task-25', 'adr-054', 'implements', 0.90);
    `);

    // Create EntityQuery instance
    entityQuery = new EntityQuery(db);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }

    // Clean up test database file (Windows file locking delay)
    try {
      fs.unlinkSync(testDbPath.replace(/^\/([A-Z]):/, '$1:'));
    } catch (_err) {
      // Retry after delay (Windows file locking)
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.unlinkSync(testDbPath.replace(/^\/([A-Z]):/, '$1:'));
      } catch (_retryErr) {
        // Ignore cleanup errors in tests
      }
    }
  });

  describe('Multi-hop task dependency chains', () => {
    it('should find full dependency chain from task-27 to task-22', async () => {
      // task-27 → task-23 → task-24 → task-22
      const path = await entityQuery.getRelationshipPath('task-27', 'task-22');

      assert.ok(path.length >= 3, `Should find 3+ hop path, found ${path.length} hops`);
      assert.strictEqual(path[0].from_entity.id, 'task-27', 'Path should start at task-27');
      assert.strictEqual(
        path[path.length - 1].to_entity.id,
        'task-22',
        'Path should end at task-22'
      );

      // Verify all hops use 'blocked_by' relationship
      path.forEach(hop => {
        assert.strictEqual(
          hop.relationship_type,
          'blocked_by',
          'All hops should be blocked_by relationships'
        );
      });
    });

    it('should find cross-phase dependency from task-28 to task-22', async () => {
      // task-28 → task-29 → task-31 → task-25 (Phase 2)
      // No direct path to task-22 (Phase 1) exists
      const path = await entityQuery.getRelationshipPath('task-28', 'task-22');

      assert.strictEqual(path.length, 0, 'Should not find path across phases');
    });

    it('should respect maxDepth limit', async () => {
      // Limit to 2 hops: task-27 → task-23 → task-24
      const path = await entityQuery.getRelationshipPath('task-27', 'task-24', {
        maxDepth: 2,
      });

      assert.ok(path.length > 0, 'Should find path within depth limit');
      assert.ok(path.length <= 2, 'Path should not exceed maxDepth');
    });
  });

  describe('Agent work assignment queries', () => {
    it('should find all tasks assigned to Developer 1', async () => {
      const related = await entityQuery.findRelated('agent-developer-1', {
        relationshipType: 'assigned_to',
        depth: 1,
      });

      // Developer 1 assigned to 7 tasks (22, 24, 23, 25, 31, 29, 28)
      assert.ok(related.length >= 7, `Should find 7+ assigned tasks, found ${related.length}`);

      related.forEach(rel => {
        assert.strictEqual(rel.entity.type, 'task', 'All related entities should be tasks');
        assert.strictEqual(
          rel.relationship_type,
          'assigned_to',
          'All relationships should be assigned_to'
        );
      });
    });

    it('should find skills used by Developer 1', async () => {
      const related = await entityQuery.findRelated('agent-developer-1', {
        relationshipType: 'relates_to',
        depth: 1,
      });

      const skills = related.filter(rel => rel.entity.type === 'skill');
      assert.ok(skills.length >= 2, 'Should find 2+ related skills');
      assert.ok(
        skills.some(s => s.entity.id === 'skill-tdd'),
        'Should find TDD skill'
      );
      assert.ok(
        skills.some(s => s.entity.id === 'skill-debugging'),
        'Should find Debugging skill'
      );
    });
  });

  describe('Concept implementation tracking', () => {
    it('should find all patterns implementing hybrid-memory concept', async () => {
      const related = await entityQuery.findRelated('concept-hybrid-memory', {
        relationshipType: 'implements',
        depth: 1,
      });

      const patterns = related.filter(rel => rel.entity.type === 'pattern');
      assert.ok(patterns.length >= 1, 'Should find 1+ implementing patterns');
      assert.ok(
        patterns.some(p => p.entity.id === 'pattern-wal'),
        'Should find WAL pattern'
      );
    });

    it('should trace concept → ADR lineage', async () => {
      const path = await entityQuery.getRelationshipPath('concept-hybrid-memory', 'adr-054');

      assert.ok(path.length > 0, 'Should find path from concept to ADR');
      assert.strictEqual(path[0].relationship_type, 'references', 'Concept should reference ADR');
    });

    it('should find implementations across entities (2-hop traversal)', async () => {
      // concept-hybrid-memory → pattern-wal (implements) → adr-054 (references)
      const related = await entityQuery.findRelated('concept-hybrid-memory', {
        depth: 2,
      });

      // Should find: pattern-wal (depth 1), adr-054 (depth 2)
      assert.ok(related.length >= 2, 'Should find 2+ related entities at depth 2');
    });
  });

  describe('Filter queries with real data', () => {
    it('should find high-quality tasks', async () => {
      const tasks = await entityQuery.findByType('task', {
        quality_score: 0.85,
      });

      assert.ok(tasks.length >= 5, 'Should find 5+ high-quality tasks');
      tasks.forEach(task => {
        assert.ok(
          task.quality_score >= 0.85,
          `Task ${task.id} quality score ${task.quality_score} should be >= 0.85`
        );
      });
    });

    it('should find recent entities created today', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const entities = await entityQuery.findByType('task', {
        created_after: yesterday,
      });

      // All test entities created "now" should match
      assert.ok(entities.length >= 8, 'Should find 8+ recent tasks');
    });

    it('should limit results correctly', async () => {
      const tasks = await entityQuery.findByType('task', { limit: 3 });

      assert.strictEqual(tasks.length, 3, 'Should return exactly 3 tasks');
    });
  });

  describe('Performance with complex graphs', () => {
    it('should query large graphs efficiently', async () => {
      // Measure query performance
      const start = Date.now();

      // Query all task dependencies
      const tasks = await entityQuery.findByType('task');
      for (const task of tasks) {
        await entityQuery.findRelated(task.id, { depth: 3 });
      }

      const elapsed = Date.now() - start;

      // Should complete in < 500ms for 8 tasks with 3-hop traversal
      assert.ok(elapsed < 500, `Query should complete in <500ms, took ${elapsed}ms`);
    });

    it('should handle deep traversals without infinite loops', async () => {
      // Add circular relationship (task-28 resolves task-22)
      db.exec(`
        INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
        VALUES ('task-28', 'task-22', 'resolves')
      `);

      // Query with high depth limit (should terminate via visited set)
      const path = await entityQuery.getRelationshipPath('task-22', 'task-28', {
        maxDepth: 10,
      });

      assert.ok(Array.isArray(path), 'Should return array (not infinite loop)');
    });
  });

  describe('Entity result format validation', () => {
    it('should return complete entity metadata', async () => {
      const entity = await entityQuery.findById('task-25', {
        includeRelationships: true,
      });

      // Verify all required fields
      assert.ok(entity.id, 'Should have id');
      assert.ok(entity.type, 'Should have type');
      assert.ok(entity.name, 'Should have name');
      assert.ok(entity.content, 'Should have content');
      assert.ok(entity.created_at, 'Should have created_at');
      assert.ok(entity.updated_at, 'Should have updated_at');
      assert.ok(entity.quality_score !== undefined, 'Should have quality_score');
      assert.ok(Array.isArray(entity.relationships), 'Should have relationships array');
    });

    it('should format relationships with complete to_entity info', async () => {
      const entity = await entityQuery.findById('task-25', {
        includeRelationships: true,
      });

      assert.ok(entity.relationships.length > 0, 'Should have relationships');

      const rel = entity.relationships[0];
      assert.ok(rel.to_entity, 'Relationship should have to_entity');
      assert.ok(rel.to_entity.id, 'to_entity should have id');
      assert.ok(rel.to_entity.type, 'to_entity should have type');
      assert.ok(rel.to_entity.name, 'to_entity should have name');
      assert.ok(rel.type, 'Relationship should have type');
      assert.ok(rel.weight !== undefined, 'Relationship should have weight');
    });
  });
});
