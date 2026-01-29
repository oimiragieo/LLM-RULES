// tests/integration/memory/entity-storage.test.mjs
// Integration tests for entity extraction + SQLite storage

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import modules
const projectRoot = path.resolve(__dirname, '../../../');

const extractorPath = path.join(projectRoot, '.claude/lib/memory/entity-extractor.cjs');
const extractorUrl = new URL('file:///' + extractorPath.replace(/\\/g, '/')).href;

describe('Entity Storage Integration', () => {
  let EntityExtractor;
  let extractor;
  let testDbPath;

  before(async () => {
    const module = await import(extractorUrl);
    EntityExtractor = module.EntityExtractor;

    // Create temporary test database
    testDbPath = path.join(__dirname, 'test-entity-storage.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Close existing extractor if any
    if (extractor) {
      extractor.close();
      extractor = null;
    }

    // Wait a bit for file handles to release (Windows)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Delete test database
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (_err) {
        // If file is still locked, wait and retry once
        await new Promise(resolve => setTimeout(resolve, 100));
        fs.unlinkSync(testDbPath);
      }
    }

    // Create new extractor (will initialize schema)
    const Database = require('better-sqlite3');
    const db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');

    // Initialize schema manually (since we're using test database)
    const initMemoryDb = require(path.join(projectRoot, '.claude/tools/cli/init-memory-db.cjs'));
    initMemoryDb.initializeDatabase(db);
    db.close(); // Close this handle

    // Create extractor with path (will open new connection)
    extractor = new EntityExtractor(testDbPath);
  });

  after(async () => {
    if (extractor) {
      extractor.close();
      extractor = null;
    }

    // Wait for file handles to release
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (err) {
        console.warn('Warning: Could not delete test database:', err.message);
      }
    }
  });

  describe('End-to-end extraction + storage', () => {
    it('should extract and store learnings.md patterns', async () => {
      const content = `
### Pattern: TDD Red-Green-Refactor

**Context:** Task #25 (P1-2.1) - Design SQLite entity schema

**Key Learnings:**
1. RED phase catches design issues early
2. GREEN phase focuses on minimal implementation
3. REFACTOR phase improves code quality

### Concept: Hybrid Memory Architecture

**Pattern:** Files as source of truth, indexes for performance

**Context:** Task #17 - Combining ChromaDB + SQLite + files
`;

      // Extract entities
      const entities = await extractor.extract(content, 'learnings.md');
      assert.ok(entities.length > 0);

      // Store entities
      await extractor.storeEntities(entities);

      // Verify storage
      const db = extractor.db;
      const patterns = db.prepare('SELECT * FROM entities WHERE type = ?').all('pattern');
      const concepts = db.prepare('SELECT * FROM entities WHERE type = ?').all('concept');
      const tasks = db.prepare('SELECT * FROM entities WHERE type = ?').all('task');

      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].name, 'TDD Red-Green-Refactor');
      assert.ok(patterns[0].content.includes('RED phase'));

      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].name, 'Hybrid Memory Architecture');

      assert.ok(tasks.length >= 2); // Task #25 and Task #17
      const task25 = tasks.find(t => t.name.includes('Task #25'));
      assert.ok(task25);
      assert.ok(task25.content.includes('Design SQLite entity schema'));
    });

    it('should extract and store decisions.md ADRs', async () => {
      const content = `
## ADR-054: Memory System Enhancement Strategy

**Status:** APPROVED
**Date:** 2026-01-28
**Context:** Research shows +10-15% accuracy improvement
**Decision:** Adopt ChromaDB + SQLite hybrid architecture

## ADR-055: Event Bus Integration Strategy

**Status:** APPROVED
**Date:** 2026-01-28
`;

      // Extract and store
      const entities = await extractor.extract(content, 'decisions.md');
      await extractor.storeEntities(entities);

      // Verify
      const db = extractor.db;
      const decisions = db.prepare('SELECT * FROM entities WHERE type = ?').all('decision');

      assert.strictEqual(decisions.length, 2);

      const adr054 = decisions.find(d => d.id === 'adr-054');
      assert.ok(adr054);
      assert.strictEqual(adr054.name, 'ADR-054: Memory System Enhancement Strategy');
      assert.ok(adr054.content.includes('APPROVED'));

      const adr055 = decisions.find(d => d.id === 'adr-055');
      assert.ok(adr055);
    });

    it('should extract and store issues.md problems', async () => {
      const content = `
### Issue: ChromaDB Server Startup Fails

**Symptom:** ChromaDB client cannot connect
**Root Cause:** Port already in use
**Workaround:** Change port in config
`;

      // Extract and store
      const entities = await extractor.extract(content, 'issues.md');
      await extractor.storeEntities(entities);

      // Verify
      const db = extractor.db;
      const issues = db.prepare('SELECT * FROM entities WHERE type = ?').all('issue');

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].name, 'ChromaDB Server Startup Fails');
      assert.ok(issues[0].content.includes('Port already in use'));
    });

    it('should extract and store relationships', async () => {
      const content = `
### Pattern: TDD

**Context:** Task #25 (P1-2.1) - Design SQLite entity schema

Task #31 depends on Task #25

Pattern TDD implements ADR-054

## ADR-054: Memory Enhancement

**Status:** APPROVED
`;

      // First extract and store entities (tasks, pattern, decision)
      const entities = await extractor.extract(content, 'learnings.md');
      await extractor.storeEntities(entities);

      // Then extract and store relationships
      const relationships = await extractor.extractRelationships(content, 'learnings.md');
      await extractor.storeRelationships(relationships);

      // Verify relationships were stored
      const db = extractor.db;
      const stored = db.prepare('SELECT * FROM entity_relationships').all();

      assert.ok(stored.length > 0);

      const dependsRel = stored.find(r => r.relationship_type === 'depends_on');
      assert.ok(dependsRel);
      assert.strictEqual(dependsRel.from_entity_id, 'task-31');
      assert.strictEqual(dependsRel.to_entity_id, 'task-25');

      const implRel = stored.find(r => r.relationship_type === 'implements');
      assert.ok(implRel);
    });
  });

  describe('Extraction accuracy', () => {
    it('should achieve >90% accuracy on comprehensive sample', async () => {
      const content = `
### Pattern: Write-Ahead Log

**Context:** Task #26 - Sync layer implementation

**Key Points:**
- Files written first (blocking)
- Indexes updated asynchronously

### Concept: Entity Relationships

**Pattern:** Graph-based memory

### Issue: Missing Foreign Keys

**Symptom:** Orphaned relationships
**Root Cause:** Schema migration bug

## ADR-056: Observability Strategy

**Status:** APPROVED

Task #26 blocks Task #32
Pattern WAL implements ADR-056
`;

      // Extract entities
      const entities = await extractor.extract(content, 'learnings.md');

      // Expected entities:
      // 1 pattern (Write-Ahead Log)
      // 1 concept (Entity Relationships)
      // 1 issue (Missing Foreign Keys)
      // 1 decision (ADR-056)
      // 2 tasks (Task #26, Task #32)
      // Total: 6 expected

      const patterns = entities.filter(e => e.type === 'pattern');
      const concepts = entities.filter(e => e.type === 'concept');
      const issues = entities.filter(e => e.type === 'issue');
      const decisions = entities.filter(e => e.type === 'decision');
      const tasks = entities.filter(e => e.type === 'task');

      console.log(`  Extracted breakdown:`);
      console.log(`    Patterns: ${patterns.length}/1`);
      console.log(`    Concepts: ${concepts.length}/1`);
      console.log(`    Issues: ${issues.length}/1`);
      console.log(`    Decisions: ${decisions.length}/1`);
      console.log(`    Tasks: ${tasks.length}/2`);

      const expectedTotal = 6;
      const actualTotal = entities.length;
      const accuracy = (actualTotal / expectedTotal) * 100;

      console.log(`  Overall accuracy: ${accuracy.toFixed(1)}% (${actualTotal}/${expectedTotal})`);

      // Should extract at least 90% of expected entities
      assert.ok(accuracy >= 90, `Accuracy ${accuracy}% is below 90% threshold`);
    });
  });
});
