// tests/unit/memory/entity-extraction.test.mjs
// Unit tests for entity extraction from markdown files

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import EntityExtractor (CommonJS module)
const projectRoot = path.resolve(__dirname, '../../../');
const extractorPath = path.join(projectRoot, '.claude/lib/memory/entity-extractor.cjs');

// Convert Windows path to file:// URL
const extractorUrl = new URL('file:///' + extractorPath.replace(/\\/g, '/')).href;

describe('EntityExtractor', () => {
  let EntityExtractor;
  let extractor;

  before(async () => {
    // Dynamically import CommonJS module
    const module = await import(extractorUrl);
    EntityExtractor = module.EntityExtractor;
  });

  beforeEach(() => {
    extractor = new EntityExtractor();
  });

  describe('constructor', () => {
    it('should create EntityExtractor instance', () => {
      assert.ok(extractor instanceof EntityExtractor);
    });

    it('should accept optional database path', () => {
      const customExtractor = new EntityExtractor(':memory:');
      assert.ok(customExtractor instanceof EntityExtractor);
    });
  });

  describe('extract() - learnings.md patterns', () => {
    it('should extract pattern entities from learnings.md', async () => {
      const content = `
### Pattern: TDD Red-Green-Refactor

**Context:** Task #25 - Write test first, watch it fail, implement minimal code.

**Key Learnings:**
1. RED phase catches design issues early
2. GREEN phase focuses on minimal implementation
3. REFACTOR phase improves code quality
`;

      const entities = await extractor.extract(content, 'learnings.md');

      assert.ok(Array.isArray(entities));
      assert.ok(entities.length > 0);

      const pattern = entities.find(e => e.type === 'pattern');
      assert.ok(pattern);
      assert.strictEqual(pattern.name, 'TDD Red-Green-Refactor');
      assert.ok(pattern.content.includes('RED phase'));
    });

    it('should extract concept entities from learnings.md', async () => {
      const content = `
### Concept: Hybrid Memory Architecture

**Pattern:** Files as source of truth, indexes for performance

**Context:** Task #17 - Combining ChromaDB + SQLite + files
`;

      const entities = await extractor.extract(content, 'learnings.md');

      const concept = entities.find(e => e.type === 'concept');
      assert.ok(concept);
      assert.strictEqual(concept.name, 'Hybrid Memory Architecture');
    });

    it('should extract task entities from learnings.md', async () => {
      const content = `
**Context:** Task #25 (P1-2.1) - Design SQLite entity schema

**Key Learnings:**
- Task #31 (P1-2.2): Implement entity extraction (PENDING)
`;

      const entities = await extractor.extract(content, 'learnings.md');

      const tasks = entities.filter(e => e.type === 'task');
      assert.ok(tasks.length >= 2);

      const task25 = tasks.find(t => t.name.includes('Task #25'));
      assert.ok(task25);
      assert.ok(task25.content.includes('Design SQLite entity schema'));

      const task31 = tasks.find(t => t.name.includes('Task #31'));
      assert.ok(task31);
    });

    it('should track line numbers for entities', async () => {
      const content = `Line 1
Line 2
### Pattern: Test Pattern

Content here
`;

      const entities = await extractor.extract(content, 'learnings.md');

      const pattern = entities.find(e => e.type === 'pattern');
      assert.ok(pattern);
      assert.strictEqual(pattern.line_number, 3); // "### Pattern:" is on line 3
    });
  });

  describe('extract() - decisions.md patterns', () => {
    it('should extract decision entities from decisions.md', async () => {
      const content = `
## ADR-054: Memory System Enhancement Strategy

**Status:** APPROVED
**Date:** 2026-01-28
**Context:** Research shows +10-15% accuracy improvement
**Decision:** Adopt ChromaDB + SQLite hybrid architecture
`;

      const entities = await extractor.extract(content, 'decisions.md');

      const decision = entities.find(e => e.type === 'decision');
      assert.ok(decision);
      assert.strictEqual(decision.name, 'ADR-054: Memory System Enhancement Strategy');
      assert.ok(decision.content.includes('APPROVED'));
      assert.ok(decision.content.includes('hybrid architecture'));
    });

    it('should extract multiple decisions from decisions.md', async () => {
      const content = `
## ADR-001: First Decision

Content 1

## ADR-002: Second Decision

Content 2
`;

      const entities = await extractor.extract(content, 'decisions.md');

      const decisions = entities.filter(e => e.type === 'decision');
      assert.strictEqual(decisions.length, 2);
      assert.strictEqual(decisions[0].name, 'ADR-001: First Decision');
      assert.strictEqual(decisions[1].name, 'ADR-002: Second Decision');
    });
  });

  describe('extract() - issues.md patterns', () => {
    it('should extract issue entities from issues.md', async () => {
      const content = `
### Issue: ChromaDB Server Startup Fails

**Symptom:** ChromaDB client cannot connect
**Root Cause:** Port already in use
**Workaround:** Change port in config
`;

      const entities = await extractor.extract(content, 'issues.md');

      const issue = entities.find(e => e.type === 'issue');
      assert.ok(issue);
      assert.strictEqual(issue.name, 'ChromaDB Server Startup Fails');
      assert.ok(issue.content.includes('Port already in use'));
    });

    it('should extract multiple issues from issues.md', async () => {
      const content = `
### Issue: First Problem

Content 1

### Issue: Second Problem

Content 2
`;

      const entities = await extractor.extract(content, 'issues.md');

      const issues = entities.filter(e => e.type === 'issue');
      assert.strictEqual(issues.length, 2);
    });
  });

  describe('extractRelationships()', () => {
    it('should extract "blocks" relationships', async () => {
      const content = `
Task #25 blocks Task #31
Task #31 depends on Task #25
`;

      const relationships = await extractor.extractRelationships(content, 'learnings.md');

      assert.ok(Array.isArray(relationships));

      const blocksRel = relationships.find(r => r.type === 'blocks');
      assert.ok(blocksRel);
      assert.strictEqual(blocksRel.from, 'task-25');
      assert.strictEqual(blocksRel.to, 'task-31');
    });

    it('should extract "implements" relationships', async () => {
      const content = `
Pattern WAL implements Decision ADR-054
`;

      const relationships = await extractor.extractRelationships(content, 'learnings.md');

      const implRel = relationships.find(r => r.type === 'implements');
      assert.ok(implRel);
      assert.ok(implRel.from.includes('wal'));
      assert.ok(implRel.to.includes('adr-054'));
    });

    it('should extract "references" relationships', async () => {
      const content = `
**Related Specifications:** memory-system-enhancement-spec.md (Section 6.3)
`;

      const relationships = await extractor.extractRelationships(content, 'learnings.md');

      const refRel = relationships.find(r => r.type === 'references');
      assert.ok(refRel);
    });
  });

  describe('storeEntities() - SQLite integration', () => {
    it('should store extracted entities in SQLite', async () => {
      const content = `
### Pattern: Test Pattern

Content for testing storage
`;

      const entities = await extractor.extract(content, 'learnings.md');
      await extractor.storeEntities(entities);

      // Verify entities were stored
      const db = extractor.db;
      const stored = db.prepare('SELECT * FROM entities WHERE type = ?').all('pattern');

      assert.ok(stored.length > 0);

      const pattern = stored.find(e => e.name === 'Test Pattern');
      assert.ok(pattern);
      assert.strictEqual(pattern.type, 'pattern');
      assert.strictEqual(pattern.source_file, 'learnings.md');
    });

    it('should store relationships in SQLite', async () => {
      const content = `
Task #100 blocks Task #101
`;

      // First create task entities
      const entities = [
        {
          id: 'task-100',
          type: 'task',
          name: 'Task #100',
          content: 'Test task',
          source_file: 'test.md',
          line_number: 1,
        },
        {
          id: 'task-101',
          type: 'task',
          name: 'Task #101',
          content: 'Test task',
          source_file: 'test.md',
          line_number: 2,
        },
      ];

      await extractor.storeEntities(entities);

      // Then extract and store relationships
      const relationships = await extractor.extractRelationships(content, 'test.md');
      await extractor.storeRelationships(relationships);

      // Verify relationships were stored
      const db = extractor.db;
      const stored = db
        .prepare('SELECT * FROM entity_relationships WHERE relationship_type = ?')
        .all('blocks');

      assert.ok(stored.length > 0);

      const blocksRel = stored.find(
        r => r.from_entity_id === 'task-100' && r.to_entity_id === 'task-101'
      );
      assert.ok(blocksRel);
      assert.strictEqual(blocksRel.relationship_type, 'blocks');
    });

    it('should handle duplicate entity inserts gracefully', async () => {
      const entities = [
        {
          id: 'test-duplicate',
          type: 'pattern',
          name: 'Duplicate Pattern',
          content: 'Test content',
          source_file: 'test.md',
          line_number: 1,
        },
      ];

      // Insert once
      await extractor.storeEntities(entities);

      // Insert again (should update, not error)
      await extractor.storeEntities(entities);

      const db = extractor.db;
      const stored = db.prepare('SELECT * FROM entities WHERE id = ?').all('test-duplicate');

      // Should only have one record
      assert.strictEqual(stored.length, 1);
    });
  });

  describe('extractFromFile() - file-based extraction', () => {
    it('should extract entities from actual file path', async () => {
      const testFilePath = path.join(__dirname, 'test-learnings.md');

      const testContent = `
### Pattern: File-Based Pattern

Content from file
`;

      // Create temporary test file
      fs.writeFileSync(testFilePath, testContent);

      try {
        const result = await extractor.extractFromFile(testFilePath);

        assert.ok(result.entities);
        assert.ok(result.relationships);

        const pattern = result.entities.find(e => e.type === 'pattern');
        assert.ok(pattern);
        assert.strictEqual(pattern.name, 'File-Based Pattern');
      } finally {
        // Clean up
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should handle non-existent files gracefully', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent.md');

      await assert.rejects(
        async () => {
          await extractor.extractFromFile(nonExistentPath);
        },
        {
          message: /ENOENT|no such file/,
        }
      );
    });
  });

  describe('accuracy validation', () => {
    it('should achieve >90% extraction accuracy on sample corpus', async () => {
      const sampleContent = `
### Pattern: Write-Ahead Log

**Context:** Task #26 - Sync layer implementation

### Concept: Entity Relationships

**Pattern:** Graph-based memory

### Issue: Missing Foreign Keys

**Symptom:** Orphaned relationships

## ADR-056: Observability Strategy

**Status:** APPROVED

Task #26 blocks Task #32
Pattern WAL implements ADR-056
`;

      const entities = await extractor.extract(sampleContent, 'learnings.md');
      const relationships = await extractor.extractRelationships(sampleContent, 'learnings.md');

      // Expected: 1 pattern, 1 concept, 1 decision, 1 issue, 2 tasks
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

      const expectedEntities = 6;
      const actualEntities = entities.length;
      const accuracy = (actualEntities / expectedEntities) * 100;

      console.log(
        `  Extraction accuracy: ${accuracy.toFixed(1)}% (${actualEntities}/${expectedEntities})`
      );

      // Should extract at least 90% of expected entities
      assert.ok(accuracy >= 90, `Accuracy ${accuracy}% is below 90% threshold`);

      // Expected: 2 relationships
      const expectedRelationships = 2;
      const actualRelationships = relationships.length;
      const relAccuracy = (actualRelationships / expectedRelationships) * 100;

      console.log(
        `  Relationship accuracy: ${relAccuracy.toFixed(1)}% (${actualRelationships}/${expectedRelationships})`
      );

      assert.ok(relAccuracy >= 90, `Relationship accuracy ${relAccuracy}% is below 90% threshold`);
    });
  });
});
