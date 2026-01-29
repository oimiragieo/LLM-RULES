// tests/integration/memory/contextual-memory-integration.test.mjs
// Integration tests for ContextualMemory aggregation layer (Task #32)

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { ContextualMemory } from '../../../.claude/lib/memory/contextual-memory.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');

describe('ContextualMemory - Integration Tests', () => {
  let memory;
  let testDbPath;
  let testMemoryDir;

  beforeEach(async () => {
    // Create unique test paths
    const timestamp = Date.now();
    testDbPath = path.join(
      projectRoot,
      `.claude/data/test-contextual-memory-integration-${timestamp}.db`
    );
    testMemoryDir = path.join(
      projectRoot,
      `.claude/context/test-contextual-memory-integration-${timestamp}`
    );

    // Ensure directories exist
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    fs.mkdirSync(testMemoryDir, { recursive: true });

    // Create realistic memory files with content
    const learningsContent = `# Learnings

## Hybrid Memory Pattern (2026-01-28)

Combining file-based memory with vector databases (ChromaDB) and entity tracking (SQLite) improves retrieval accuracy by 10-15%.

**Key Insight**: Files remain source of truth, databases serve as performance indexes.

**Related Concepts**: Vector search, semantic similarity, entity relationships

## TDD Workflow (2026-01-27)

Test-Driven Development requires writing failing tests FIRST before implementation.

**Pattern**: RED → GREEN → REFACTOR

**Related**: debugging, code-quality
`;

    const decisionsContent = `# Decisions

## [ADR-054] Memory System Enhancement Strategy (2026-01-28)

**Status**: APPROVED

**Context**: Research shows +10-15% accuracy improvement with hybrid approach.

**Decision**: Adopt ChromaDB + SQLite + files hybrid architecture.

**Consequences**: $0/mo operational cost, 4-5 weeks implementation, backward compatible.

**Related**: ChromaDB, SQLite, hybrid-memory
`;

    fs.writeFileSync(path.join(testMemoryDir, 'learnings.md'), learningsContent);
    fs.writeFileSync(path.join(testMemoryDir, 'decisions.md'), decisionsContent);
    fs.writeFileSync(path.join(testMemoryDir, 'issues.md'), '# Issues\n\nNo issues yet.\n');

    // Initialize database schema
    const db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('agent', 'task', 'skill', 'concept', 'file', 'pattern', 'decision', 'issue')),
        name TEXT NOT NULL,
        description TEXT,
        source_file TEXT,
        source_line INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0.5 CHECK(quality_score BETWEEN 0 AND 1)
      );

      CREATE TABLE IF NOT EXISTS entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id TEXT NOT NULL,
        to_entity_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN (
          'relates_to', 'blocks', 'blocked_by', 'implements', 'conflicts_with',
          'assigned_to', 'depends_on', 'supersedes', 'references', 'resolves'
        )),
        weight REAL DEFAULT 1.0 CHECK(weight BETWEEN 0 AND 1),
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        CHECK (from_entity_id != to_entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_relationships_from ON entity_relationships(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_to ON entity_relationships(to_entity_id);
    `);

    // Insert test entities (realistic data)
    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      'hybrid-memory-pattern',
      'pattern',
      'Hybrid Memory Pattern',
      'Combining file-based and database storage',
      'learnings.md',
      0.95
    );

    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      'chromadb',
      'concept',
      'ChromaDB',
      'Vector database for semantic search',
      'learnings.md',
      0.9
    );

    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run('sqlite', 'concept', 'SQLite', 'Embedded relational database', 'learnings.md', 0.85);

    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      'adr-054',
      'decision',
      'Memory System Enhancement',
      'Hybrid memory architecture decision',
      'decisions.md',
      0.92
    );

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Add relationships
    db.prepare(
      `
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES (?, ?, ?, ?)
    `
    ).run('hybrid-memory-pattern', 'chromadb', 'relates_to', 0.9);

    db.prepare(
      `
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES (?, ?, ?, ?)
    `
    ).run('hybrid-memory-pattern', 'sqlite', 'relates_to', 0.85);

    db.prepare(
      `
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES (?, ?, ?, ?)
    `
    ).run('adr-054', 'hybrid-memory-pattern', 'implements', 0.95);

    db.close();

    // Create ContextualMemory instance
    memory = new ContextualMemory({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
    });
  });

  afterEach(async () => {
    // Close memory instance
    if (memory) {
      memory.close();
    }

    // Cleanup
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testMemoryDir)) {
      fs.rmSync(testMemoryDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Scenarios', () => {
    it('should aggregate results from multiple sources', async () => {
      // Test entity queries
      const patterns = await memory.findEntities('pattern');
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].name, 'Hybrid Memory Pattern');

      const concepts = await memory.findEntities('concept');
      assert.strictEqual(concepts.length, 2); // ChromaDB and SQLite

      const decisions = await memory.findEntities('decision');
      assert.strictEqual(decisions.length, 1);
      assert.strictEqual(decisions[0].name, 'Memory System Enhancement');
    });

    it('should traverse entity relationships correctly', async () => {
      // Find entities related to Hybrid Memory Pattern
      const related = await memory.getRelated('hybrid-memory-pattern');
      assert.ok(related.length >= 2, 'Should find at least 2 related entities');

      // Verify related entities are ChromaDB and SQLite
      const relatedIds = related.map(r => r.entity.id);
      assert.ok(relatedIds.includes('chromadb'), 'Should include ChromaDB');
      assert.ok(relatedIds.includes('sqlite'), 'Should include SQLite');
    });

    it('should filter entities by quality score', async () => {
      // Find high-quality patterns (>= 0.9)
      const highQuality = await memory.findEntities('pattern', {
        quality_score: 0.9,
      });
      assert.ok(highQuality.length > 0, 'Should find high-quality patterns');
      highQuality.forEach(entity => {
        assert.ok(entity.quality_score >= 0.9, 'Quality score should be >= 0.9');
      });
    });

    it('should read file contents for backward compatibility', async () => {
      // Test backward-compatible file reads
      const learnings = await memory.readFile('learnings.md');
      assert.match(learnings, /Hybrid Memory Pattern/, 'Should contain pattern content');
      assert.match(learnings, /TDD Workflow/, 'Should contain TDD content');

      const decisions = await memory.readFile('decisions.md');
      assert.match(decisions, /ADR-054/, 'Should contain ADR content');
      assert.match(decisions, /ChromaDB \+ SQLite/, 'Should contain architecture details');
    });

    it('should handle graph traversal with depth', async () => {
      // Traverse relationships with depth = 2
      const deepRelated = await memory.getRelated('adr-054', { depth: 2 });
      assert.ok(deepRelated.length > 0, 'Should find related entities at depth 2');

      // ADR-054 → implements → hybrid-memory-pattern → relates_to → chromadb/sqlite
      // So depth 2 should reach chromadb and sqlite through hybrid-memory-pattern
      const foundIds = deepRelated.map(r => r.entity.id);
      // At minimum, should find hybrid-memory-pattern (depth 1)
      assert.ok(
        foundIds.includes('hybrid-memory-pattern'),
        'Should find hybrid-memory-pattern at depth 1'
      );
    });

    it('should filter relationships by type', async () => {
      // Find only 'implements' relationships
      const implementsRels = await memory.getRelated('adr-054', {
        relationshipType: 'implements',
      });
      assert.ok(implementsRels.length > 0, 'Should find implements relationships');
      implementsRels.forEach(rel => {
        assert.strictEqual(rel.relationship_type, 'implements');
      });

      // Find only 'relates_to' relationships
      const relatesTo = await memory.getRelated('hybrid-memory-pattern', {
        relationshipType: 'relates_to',
      });
      assert.ok(relatesTo.length > 0, 'Should find relates_to relationships');
      relatesTo.forEach(rel => {
        assert.strictEqual(rel.relationship_type, 'relates_to');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file reads gracefully', async () => {
      await assert.rejects(
        async () => await memory.readFile('nonexistent.md'),
        /ENOENT|not found/i
      );
    });

    it('should handle non-existent entity queries gracefully', async () => {
      const results = await memory.findEntities('nonexistent-type');
      assert.strictEqual(results.length, 0);
    });

    it('should handle non-existent relationship queries gracefully', async () => {
      const results = await memory.getRelated('nonexistent-id');
      assert.strictEqual(results.length, 0);
    });
  });
});
