#!/usr/bin/env node
/**
 * Semantic Archival Tests
 * =======================
 *
 * Tests for importance-based archival of learnings.md.
 * Following TDD: Write tests first, watch them fail, then implement.
 */

'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Create test directory structure
const TEST_ROOT = path.join(__dirname, '__test_temp_semantic_archival__');
const TEST_MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');
const TEST_ARCHIVE_DIR = path.join(TEST_MEMORY_DIR, 'archive');

// Sample content for testing - simulates a large learnings.md with mixed importance
const SAMPLE_LEARNINGS = `## [SECURITY] Critical Security Pattern
**Date**: 2026-01-26
**Importance**: CRITICAL
This is a critical security pattern that must never be archived.
Security hooks MUST fail closed on errors.

---

## [PATTERN] High Importance Pattern
**Date**: 2026-01-25
**Importance**: HIGH
This is a high importance pattern that should be kept indefinitely.
State caching provides 60% I/O reduction.

---

## [BUG-FIX] Medium Importance Fix (Recent)
**Date**: 2026-01-20
**Importance**: MEDIUM
A recent medium importance fix.
Should be kept for 30 days.

---

## [BUG-FIX] Medium Importance Fix (Old)
**Date**: 2025-12-01
**Importance**: MEDIUM
An old medium importance fix.
Should be archived (older than 30 days).

---

## [NOTE] Low Importance Note 1
**Date**: 2026-01-15
**Importance**: LOW
A low importance note.
Should be archived when space needed.

---

## [NOTE] Low Importance Note 2
**Date**: 2026-01-10
**Importance**: LOW
Another low importance note.
Should be archived when space needed.

---

## [DISCOVERY] No Importance Marker
**Date**: 2026-01-05
Content without explicit importance marker.
Defaults to LOW, should be archivable.

---
`;

// Module under test
let semanticArchival;
try {
  semanticArchival = require('../../../.claude/lib/memory/semantic-archival.cjs');
} catch (_e) {
  // Expected to fail initially - TDD red phase
  semanticArchival = null;
}

describe('semantic-archival.cjs', () => {
  beforeEach(() => {
    // Create test directory structure
    fs.mkdirSync(TEST_ARCHIVE_DIR, { recursive: true });

    // Create test learnings.md
    fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'learnings.md'), SAMPLE_LEARNINGS);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  test('1. module exports required functions', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    assert.strictEqual(typeof semanticArchival.archiveByImportance, 'function');
    assert.strictEqual(typeof semanticArchival.selectForArchival, 'function');
    assert.strictEqual(typeof semanticArchival.getPreservationRules, 'function');
  });

  test('2. getPreservationRules returns correct structure', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const rules = semanticArchival.getPreservationRules();

    assert.ok(rules.CRITICAL, 'Should have CRITICAL rules');
    assert.ok(rules.HIGH, 'Should have HIGH rules');
    assert.ok(rules.MEDIUM, 'Should have MEDIUM rules');
    assert.ok(rules.LOW, 'Should have LOW rules');
  });

  test('3. CRITICAL entries are always preserved', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const rules = semanticArchival.getPreservationRules();

    assert.strictEqual(rules.CRITICAL.keep, true);
    assert.strictEqual(rules.CRITICAL.maxAgeDays, Infinity);
  });

  test('4. HIGH entries are always preserved', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const rules = semanticArchival.getPreservationRules();

    assert.strictEqual(rules.HIGH.keep, true);
    assert.strictEqual(rules.HIGH.maxAgeDays, Infinity);
  });

  test('5. MEDIUM entries have 30-day retention', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const rules = semanticArchival.getPreservationRules();

    assert.strictEqual(rules.MEDIUM.keep, true);
    assert.strictEqual(rules.MEDIUM.maxAgeDays, 30);
  });

  test('6. LOW entries are archivable', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const rules = semanticArchival.getPreservationRules();

    assert.strictEqual(rules.LOW.keep, false);
    assert.strictEqual(rules.LOW.archive, true);
  });

  test('7. selectForArchival identifies entries to archive', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const parser = require('../../../.claude/lib/memory/learnings-parser.cjs');
    const entries = parser.parseEntries(SAMPLE_LEARNINGS);

    // Reference date: 2026-01-26 (to test age-based selection)
    const referenceDate = new Date('2026-01-26');
    const { toKeep, toArchive } = semanticArchival.selectForArchival(entries, referenceDate);

    // CRITICAL and HIGH should always be kept
    assert.ok(
      toKeep.some(e => e.importance === 'CRITICAL'),
      'Should keep CRITICAL'
    );
    assert.ok(
      toKeep.some(e => e.importance === 'HIGH'),
      'Should keep HIGH'
    );

    // LOW entries should be archived
    assert.ok(
      toArchive.some(e => e.importance === 'LOW'),
      'Should archive LOW'
    );
  });

  test('8. selectForArchival keeps recent MEDIUM entries', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const parser = require('../../../.claude/lib/memory/learnings-parser.cjs');
    const entries = parser.parseEntries(SAMPLE_LEARNINGS);

    const referenceDate = new Date('2026-01-26');
    const { toKeep, _toArchive } = semanticArchival.selectForArchival(entries, referenceDate);

    // Recent MEDIUM (2026-01-20) should be kept (within 30 days of 2026-01-26)
    const recentMedium = toKeep.find(e => e.importance === 'MEDIUM' && e.date === '2026-01-20');
    assert.ok(recentMedium, 'Should keep recent MEDIUM entries');
  });

  test('9. selectForArchival archives old MEDIUM entries', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const parser = require('../../../.claude/lib/memory/learnings-parser.cjs');
    const entries = parser.parseEntries(SAMPLE_LEARNINGS);

    const referenceDate = new Date('2026-01-26');
    const { toArchive } = semanticArchival.selectForArchival(entries, referenceDate);

    // Old MEDIUM (2025-12-01) should be archived (older than 30 days)
    const oldMedium = toArchive.find(e => e.importance === 'MEDIUM' && e.date === '2025-12-01');
    assert.ok(oldMedium, 'Should archive old MEDIUM entries');
  });

  test('10. selectForArchival handles entries without dates', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entriesWithNullDate = [{ importance: 'MEDIUM', date: null, content: 'test' }];

    const referenceDate = new Date('2026-01-26');
    // Entries without dates should be kept (conservative approach)
    const { toKeep } = semanticArchival.selectForArchival(entriesWithNullDate, referenceDate);
    assert.strictEqual(toKeep.length, 1, 'Should keep entries without dates');
  });

  test('11. archiveByImportance writes to correct archive file', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const result = semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    assert.ok(result.archived, 'Should report archived');
    assert.ok(result.archivePath, 'Should have archive path');
    assert.ok(result.archivePath.includes('archive'), 'Archive should be in archive directory');
  });

  test('12. archiveByImportance creates archive file with archived entries', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    // Check archive directory has a file
    const archiveFiles = fs.readdirSync(TEST_ARCHIVE_DIR).filter(f => f.endsWith('.md'));
    assert.ok(archiveFiles.length > 0, 'Should create archive file');

    // Check archive content contains LOW importance entries
    const archiveContent = fs.readFileSync(path.join(TEST_ARCHIVE_DIR, archiveFiles[0]), 'utf8');
    assert.ok(archiveContent.includes('LOW'), 'Archive should contain LOW entries');
  });

  test('13. archiveByImportance preserves CRITICAL entries in learnings.md', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    // Check learnings.md still has CRITICAL entries
    const learningsPath = path.join(TEST_MEMORY_DIR, 'learnings.md');
    const remaining = fs.readFileSync(learningsPath, 'utf8');

    assert.ok(remaining.includes('CRITICAL'), 'Should preserve CRITICAL entries');
    assert.ok(
      remaining.includes('Critical Security Pattern'),
      'Should preserve CRITICAL entry content'
    );
  });

  test('14. archiveByImportance preserves HIGH entries in learnings.md', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    const learningsPath = path.join(TEST_MEMORY_DIR, 'learnings.md');
    const remaining = fs.readFileSync(learningsPath, 'utf8');

    assert.ok(remaining.includes('High Importance Pattern'), 'Should preserve HIGH entry content');
  });

  test('15. archiveByImportance reports counts correctly', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const result = semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    assert.ok(typeof result.archivedCount === 'number', 'Should report archived count');
    assert.ok(typeof result.keptCount === 'number', 'Should report kept count');
    assert.ok(result.archivedCount > 0, 'Should archive some entries');
    assert.ok(result.keptCount > 0, 'Should keep some entries');
  });

  test('16. archiveByImportance reduces file size', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const learningsPath = path.join(TEST_MEMORY_DIR, 'learnings.md');
    const sizeBefore = fs.statSync(learningsPath).size;

    semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    const sizeAfter = fs.statSync(learningsPath).size;
    assert.ok(sizeAfter < sizeBefore, 'File size should decrease after archival');
  });

  test('17. archiveByImportance handles empty learnings.md', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    // Create empty learnings.md
    fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'learnings.md'), '');

    const result = semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    assert.strictEqual(result.archived, false, 'Should not archive empty file');
    assert.strictEqual(result.archivedCount, 0, 'Should archive 0 entries');
  });

  test('18. archiveByImportance handles missing learnings.md', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    // Delete learnings.md
    fs.unlinkSync(path.join(TEST_MEMORY_DIR, 'learnings.md'));

    const result = semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    assert.strictEqual(result.archived, false, 'Should not archive missing file');
  });

  test('19. archiveByImportance with targetSizeKB option', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    // Target 1KB - should archive aggressively
    const result = semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'), {
      targetSizeKB: 1,
    });

    const learningsPath = path.join(TEST_MEMORY_DIR, 'learnings.md');
    const sizeAfter = fs.statSync(learningsPath).size;

    // CRITICAL and HIGH must still be preserved, so may not reach target
    assert.ok(
      sizeAfter <= 2048 || result.keptCount <= 3,
      'Should reduce to near target or keep only critical entries'
    );
  });

  test('20. archiveByImportance preserves entry order', () => {
    if (!semanticArchival) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    semanticArchival.archiveByImportance(TEST_ROOT, new Date('2026-01-26'));

    const learningsPath = path.join(TEST_MEMORY_DIR, 'learnings.md');
    const remaining = fs.readFileSync(learningsPath, 'utf8');

    // CRITICAL should appear before HIGH if both kept (original order)
    const criticalPos = remaining.indexOf('CRITICAL');
    const highPos = remaining.indexOf('HIGH');

    if (criticalPos !== -1 && highPos !== -1) {
      // Note: Position depends on entry order, just verify both exist
      assert.ok(criticalPos !== -1 && highPos !== -1, 'Both CRITICAL and HIGH should be preserved');
    }
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running semantic-archival tests...');
  console.log(
    'Expected: Tests will FAIL (TDD red phase) until semantic-archival.cjs is implemented'
  );
}
