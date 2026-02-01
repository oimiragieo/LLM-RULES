// tests/unit/memory/contextual-memory.test.mjs
// Unit tests for ContextualMemory aggregation layer (Task #32)

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import { ContextualMemory } from '../../../.claude/lib/memory/contextual-memory.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _projectRoot = path.resolve(__dirname, '../../../');

describe('ContextualMemory - Unit Tests', () => {
  let memory;
  let testDbPath;
  let testMemoryDir;
  let testLanceDir;
  let tempRoot;

  beforeEach(async () => {
    // Create unique test root (keep test artifacts out of the repo tree)
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-contextual-memory-'));
    testDbPath = path.join(tempRoot, 'memory.db');
    testMemoryDir = path.join(tempRoot, 'memory');
    testLanceDir = path.join(tempRoot, 'lancedb');

    // Ensure directories exist
    fs.mkdirSync(testMemoryDir, { recursive: true });
    fs.mkdirSync(testLanceDir, { recursive: true });

    // Initialize test files
    fs.writeFileSync(path.join(testMemoryDir, 'learnings.md'), '# Learnings\n\nTest content\n');
    fs.writeFileSync(path.join(testMemoryDir, 'decisions.md'), '# Decisions\n\nTest content\n');
    fs.writeFileSync(path.join(testMemoryDir, 'issues.md'), '# Issues\n\nTest content\n');

    // Initialize database schema
    const db = new DatabaseSync(testDbPath);
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

    // Insert test entities
    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      'test-concept-1',
      'concept',
      'Vector Database',
      'A database optimized for vector search',
      'learnings.md',
      0.9
    );

    db.prepare(
      `
      INSERT INTO entities (id, type, name, description, source_file, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      'test-pattern-1',
      'pattern',
      'Hybrid Memory',
      'Combining file-based and database storage',
      'learnings.md',
      0.85
    );

    // Enable foreign keys before inserting relationships
    db.exec('PRAGMA foreign_keys = ON');

    db.prepare(
      `
      INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
      VALUES (?, ?, ?, ?)
    `
    ).run('test-concept-1', 'test-pattern-1', 'relates_to', 0.8);

    db.close();

    // Create ContextualMemory instance
    memory = new ContextualMemory({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      lancedbConfig: {
        persistDirectory: testLanceDir,
        collectionName: 'test-contextual-memory',
        embeddingMode: 'test',
      },
    });
  });

  afterEach(async () => {
    // Close memory instance to release database locks
    if (memory) {
      memory.close();
    }

    // Cleanup
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    tempRoot = null;
  });

  describe('search()', () => {
    it('should search LanceDB when available', async () => {
      const results = await memory.search('vector database');
      assert.ok(Array.isArray(results), 'Results should be an array');
    });

    it('should accept search options', async () => {
      const results = await memory.search('vector database', {
        limit: 3,
        threshold: 0.7,
      });
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length <= 3, 'Results should respect limit');
    });
  });

  describe('findEntities()', () => {
    it('should find entities by type', async () => {
      const results = await memory.findEntities('concept');
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length > 0, 'Should find at least one concept entity');
      assert.strictEqual(results[0].type, 'concept');
      assert.strictEqual(results[0].name, 'Vector Database');
    });

    it('should apply filters', async () => {
      const results = await memory.findEntities('concept', {
        quality_score: 0.85,
      });
      assert.ok(Array.isArray(results), 'Results should be an array');
      results.forEach(entity => {
        assert.ok(entity.quality_score >= 0.85, 'Should filter by quality score');
      });
    });

    it('should return empty array for non-existent type', async () => {
      const results = await memory.findEntities('nonexistent-type');
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.strictEqual(results.length, 0, 'Should return empty array');
    });
  });

  describe('getRelated()', () => {
    it('should find related entities', async () => {
      const results = await memory.getRelated('test-concept-1');
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.ok(results.length > 0, 'Should find at least one related entity');
      assert.strictEqual(results[0].entity.id, 'test-pattern-1');
      assert.strictEqual(results[0].relationship_type, 'relates_to');
    });

    it('should accept relationship type filter', async () => {
      const results = await memory.getRelated('test-concept-1', {
        relationshipType: 'relates_to',
      });
      assert.ok(Array.isArray(results), 'Results should be an array');
      results.forEach(result => {
        assert.strictEqual(result.relationship_type, 'relates_to');
      });
    });

    it('should accept depth option', async () => {
      const results = await memory.getRelated('test-concept-1', {
        depth: 2,
      });
      assert.ok(Array.isArray(results), 'Results should be an array');
      // Depth 2 should traverse to related entities of related entities
    });

    it('should return empty array for non-existent entity', async () => {
      const results = await memory.getRelated('nonexistent-id');
      assert.ok(Array.isArray(results), 'Results should be an array');
      assert.strictEqual(results.length, 0, 'Should return empty array');
    });
  });

  describe('readFile()', () => {
    it('should read file contents', async () => {
      const content = await memory.readFile('learnings.md');
      assert.ok(typeof content === 'string', 'Content should be a string');
      assert.match(content, /# Learnings/, 'Should contain file header');
    });

    it('should throw error for non-existent file', async () => {
      await assert.rejects(
        async () => await memory.readFile('nonexistent.md'),
        /ENOENT|not found/i
      );
    });

    it('should handle relative paths', async () => {
      const content = await memory.readFile('learnings.md');
      assert.ok(typeof content === 'string');
    });
  });
});
