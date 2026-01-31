#!/usr/bin/env node
/**
 * Learnings Parser Tests
 * ======================
 *
 * Tests for parsing learnings.md into structured entries with importance extraction.
 * Following TDD: Write tests first, watch them fail, then implement.
 */

'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Module under test (will be created after tests fail)
let parser;
try {
  parser = require('../../../.claude/lib/memory/learnings-parser.cjs');
} catch (_e) {
  // Expected to fail initially - TDD red phase
  parser = null;
}

// Test fixtures
const SAMPLE_LEARNINGS_CONTENT = `## [SECURITY] Fail-Closed Security Hooks
**Date**: 2026-01-26
**Importance**: CRITICAL
Security hooks MUST fail closed (exit 2) on errors to prevent bypass.

---

## [PATTERN] State Cache Integration
**Date**: 2026-01-25
**Importance**: HIGH
All hooks reading state files should use the state-cache module.

---

## [BUG-FIX] Nested .claude Folder Prevention
**Date**: 2026-01-20
**Importance**: MEDIUM
Hooks that write to project directories MUST use findProjectRoot().

---

## [NOTE] Test Infrastructure
**Date**: 2026-01-15
**Importance**: LOW
Node.js native test runner uses glob patterns for file discovery.

---

## [DISCOVERY] Performance Analysis
**Date**: 2026-01-10
No importance marker - should default to LOW.
Hook execution overhead is the primary bottleneck.
`;

const TEMP_DIR = path.join(__dirname, '__test_temp_learnings_parser__');

describe('learnings-parser.cjs', () => {
  beforeEach(() => {
    // Create temp directory for test files
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      }
      fs.rmdirSync(TEMP_DIR);
    }
  });

  test('1. module exports required functions', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    assert.strictEqual(typeof parser.parseEntries, 'function', 'parseEntries should be exported');
    assert.strictEqual(
      typeof parser.groupByImportance,
      'function',
      'groupByImportance should be exported'
    );
    assert.strictEqual(
      typeof parser.filterByImportance,
      'function',
      'filterByImportance should be exported'
    );
    assert.strictEqual(
      typeof parser.extractImportance,
      'function',
      'extractImportance should be exported'
    );
  });

  test('2. parseEntries returns array of structured entries', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);

    assert.ok(Array.isArray(entries), 'Should return array');
    assert.strictEqual(entries.length, 5, 'Should parse 5 entries');
  });

  test('3. parseEntries extracts title and category', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const first = entries[0];

    assert.strictEqual(first.category, 'SECURITY', 'Should extract category');
    assert.strictEqual(first.title, 'Fail-Closed Security Hooks', 'Should extract title');
  });

  test('4. parseEntries extracts date', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const first = entries[0];

    assert.strictEqual(first.date, '2026-01-26', 'Should extract date');
  });

  test('5. parseEntries extracts importance marker', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);

    assert.strictEqual(entries[0].importance, 'CRITICAL', 'First entry should be CRITICAL');
    assert.strictEqual(entries[1].importance, 'HIGH', 'Second entry should be HIGH');
    assert.strictEqual(entries[2].importance, 'MEDIUM', 'Third entry should be MEDIUM');
    assert.strictEqual(entries[3].importance, 'LOW', 'Fourth entry should be LOW');
  });

  test('6. parseEntries defaults to LOW when no importance marker', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const noMarker = entries[4]; // "DISCOVERY" entry without importance

    assert.strictEqual(noMarker.importance, 'LOW', 'Should default to LOW when no marker');
  });

  test('7. parseEntries preserves content body', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const first = entries[0];

    assert.ok(first.content.includes('fail closed'), 'Should preserve content body');
    assert.ok(first.content.includes('exit 2'), 'Should preserve full content');
  });

  test('8. groupByImportance creates correct structure', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const grouped = parser.groupByImportance(entries);

    assert.ok(grouped.CRITICAL, 'Should have CRITICAL group');
    assert.ok(grouped.HIGH, 'Should have HIGH group');
    assert.ok(grouped.MEDIUM, 'Should have MEDIUM group');
    assert.ok(grouped.LOW, 'Should have LOW group');
  });

  test('9. groupByImportance puts entries in correct groups', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const grouped = parser.groupByImportance(entries);

    assert.strictEqual(grouped.CRITICAL.length, 1, 'Should have 1 CRITICAL');
    assert.strictEqual(grouped.HIGH.length, 1, 'Should have 1 HIGH');
    assert.strictEqual(grouped.MEDIUM.length, 1, 'Should have 1 MEDIUM');
    assert.strictEqual(grouped.LOW.length, 2, 'Should have 2 LOW (including no-marker)');
  });

  test('10. filterByImportance filters correctly', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);

    const critical = parser.filterByImportance(entries, ['CRITICAL']);
    assert.strictEqual(critical.length, 1, 'Should filter to 1 CRITICAL');

    const highAndUp = parser.filterByImportance(entries, ['CRITICAL', 'HIGH']);
    assert.strictEqual(highAndUp.length, 2, 'Should filter to 2 CRITICAL+HIGH');
  });

  test('11. extractImportance handles various formats', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    // Standard format
    assert.strictEqual(parser.extractImportance('**Importance**: CRITICAL'), 'CRITICAL');
    assert.strictEqual(parser.extractImportance('**Importance**: HIGH'), 'HIGH');

    // With extra spaces
    assert.strictEqual(parser.extractImportance('**Importance**:  HIGH  '), 'HIGH');

    // Lowercase (should normalize to uppercase)
    assert.strictEqual(parser.extractImportance('**Importance**: high'), 'HIGH');
  });

  test('12. parseEntries handles empty input', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries('');
    assert.ok(Array.isArray(entries), 'Should return empty array for empty input');
    assert.strictEqual(entries.length, 0, 'Should have no entries');
  });

  test('13. parseEntries handles file without standard format', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const nonStandard = `Some random content
without proper headers
just plain text`;

    const entries = parser.parseEntries(nonStandard);
    // Should handle gracefully - might return 0 entries or 1 entry with full content
    assert.ok(Array.isArray(entries), 'Should return array for non-standard input');
  });

  test('14. parseEntriesFromFile reads and parses file', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    // Create test file
    const testFile = path.join(TEMP_DIR, 'test-learnings.md');
    fs.writeFileSync(testFile, SAMPLE_LEARNINGS_CONTENT);

    const entries = parser.parseEntriesFromFile(testFile);

    assert.ok(Array.isArray(entries), 'Should return array');
    assert.strictEqual(entries.length, 5, 'Should parse 5 entries from file');
  });

  test('15. parseEntriesFromFile handles missing file gracefully', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const nonExistentFile = path.join(TEMP_DIR, 'does-not-exist.md');
    const entries = parser.parseEntriesFromFile(nonExistentFile);

    assert.ok(Array.isArray(entries), 'Should return empty array for missing file');
    assert.strictEqual(entries.length, 0, 'Should have no entries');
  });

  test('16. getEntrySize calculates character count', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const size = parser.getEntrySize(entries[0]);

    assert.ok(typeof size === 'number', 'Should return number');
    assert.ok(size > 0, 'Should be positive');
  });

  test('17. getTotalSize calculates total content size', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const totalSize = parser.getTotalSize(entries);

    assert.ok(typeof totalSize === 'number', 'Should return number');
    assert.ok(totalSize > 0, 'Should be positive');
  });

  test('18. filterByAge filters entries by date', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    // Filter to keep only entries from the last 10 days (from 2026-01-26)
    const recent = parser.filterByAge(entries, 10, new Date('2026-01-26'));

    // Should keep 2026-01-26 and 2026-01-25 entries
    assert.ok(recent.length >= 2, 'Should keep recent entries');
    assert.ok(recent.length < entries.length, 'Should filter out old entries');
  });

  test('19. serializeEntry converts entry back to markdown', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const serialized = parser.serializeEntry(entries[0]);

    assert.ok(serialized.includes('## [SECURITY]'), 'Should include header');
    assert.ok(serialized.includes('**Date**:'), 'Should include date');
    assert.ok(serialized.includes('**Importance**:'), 'Should include importance');
    assert.ok(serialized.includes('CRITICAL'), 'Should include importance value');
  });

  test('20. serializeEntries converts array back to markdown', () => {
    if (!parser) {
      assert.fail('Module not found - expected in TDD red phase');
    }

    const entries = parser.parseEntries(SAMPLE_LEARNINGS_CONTENT);
    const serialized = parser.serializeEntries(entries);

    assert.ok(typeof serialized === 'string', 'Should return string');
    assert.ok(serialized.includes('---'), 'Should include separators');
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running learnings-parser tests...');
  console.log(
    'Expected: Tests will FAIL (TDD red phase) until learnings-parser.cjs is implemented'
  );
}
