#!/usr/bin/env node
/**
 * Smart Pruner Tests
 * ==================
 *
 * Tests for utility-based scoring, semantic deduplication, and retention policy enforcement.
 * Following TDD - these tests are written BEFORE implementation.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Test setup - we'll require the module after creating it
const PRUNER_PATH = path.join(__dirname, 'smart-pruner.cjs');

// Helper to create test entries
function createEntry(overrides = {}) {
  const now = new Date();
  return {
    text: 'Test entry',
    timestamp: now.toISOString(),
    lastAccessed: overrides.lastAccessed || now.toISOString(),
    accessCount: overrides.accessCount || 1,
    ...overrides,
  };
}

// Helper to create date N days ago
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ============================================================================
// Test Suite
// ============================================================================

let pruner;
let testsPassed = 0;
let testsFailed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`  PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${error.message}`);
    testsFailed++;
  }
}

function runTests() {
  console.log('Smart Pruner Tests');
  console.log('==================\n');

  // Load the module
  try {
    pruner = require(PRUNER_PATH);
  } catch (error) {
    console.log('ERROR: Could not load smart-pruner.cjs');
    console.log(`       ${error.message}`);
    console.log('\nMake sure to implement the module first.\n');
    process.exit(1);
  }

  // ============================================================================
  // 1. Recency Score Tests
  // ============================================================================
  console.log('1. Recency Score Tests');

  runTest('getRecencyScore returns 1.0 for just accessed entry', () => {
    const score = pruner.getRecencyScore(new Date().toISOString());
    assert(score >= 0.95, `Expected >= 0.95, got ${score}`);
  });

  runTest('getRecencyScore returns ~0.5 for 30-day old entry', () => {
    const score = pruner.getRecencyScore(daysAgo(30));
    assert(score >= 0.4 && score <= 0.6, `Expected 0.4-0.6, got ${score}`);
  });

  runTest('getRecencyScore returns ~0 for 90-day old entry', () => {
    const score = pruner.getRecencyScore(daysAgo(90));
    assert(score <= 0.15, `Expected <= 0.15, got ${score}`);
  });

  runTest('getRecencyScore handles invalid date gracefully', () => {
    const score = pruner.getRecencyScore('invalid-date');
    assert(score === 0, `Expected 0 for invalid date, got ${score}`);
  });

  console.log('');

  // ============================================================================
  // 2. Frequency Score Tests
  // ============================================================================
  console.log('2. Frequency Score Tests');

  runTest('getFrequencyScore returns 0 for never accessed', () => {
    const score = pruner.getFrequencyScore(0);
    assert(score === 0, `Expected 0, got ${score}`);
  });

  runTest('getFrequencyScore returns ~0.5 for 5 accesses', () => {
    const score = pruner.getFrequencyScore(5);
    assert(score >= 0.4 && score <= 0.7, `Expected 0.4-0.7, got ${score}`);
  });

  runTest('getFrequencyScore caps at 1.0 for high access counts', () => {
    const score = pruner.getFrequencyScore(100);
    assert(score === 1.0, `Expected 1.0, got ${score}`);
  });

  console.log('');

  // ============================================================================
  // 3. Importance Score Tests
  // ============================================================================
  console.log('3. Importance Score Tests');

  runTest('getImportanceScore returns 1.0 for CRITICAL marker', () => {
    const entry = createEntry({ text: 'CRITICAL: Always update task status' });
    const score = pruner.getImportanceScore(entry);
    assert(score === 1.0, `Expected 1.0, got ${score}`);
  });

  runTest('getImportanceScore returns 0.9 for NEVER/ALWAYS markers', () => {
    const entry = createEntry({ text: 'NEVER push without tests' });
    const score = pruner.getImportanceScore(entry);
    assert(score >= 0.9, `Expected >= 0.9, got ${score}`);
  });

  runTest('getImportanceScore returns 0.8 for IMPORTANT marker', () => {
    const entry = createEntry({ text: 'IMPORTANT: Read memory files first' });
    const score = pruner.getImportanceScore(entry);
    assert(score >= 0.8, `Expected >= 0.8, got ${score}`);
  });

  runTest('getImportanceScore returns 0.8 for decision: marker', () => {
    const entry = createEntry({ text: 'decision: Use three-tier memory hierarchy' });
    const score = pruner.getImportanceScore(entry);
    assert(score >= 0.8, `Expected >= 0.8, got ${score}`);
  });

  runTest('getImportanceScore returns 0.7 for pattern: marker', () => {
    const entry = createEntry({ text: 'pattern: Always run tests after changes' });
    const score = pruner.getImportanceScore(entry);
    assert(score >= 0.7, `Expected >= 0.7, got ${score}`);
  });

  runTest('getImportanceScore returns base score for unmarked entry', () => {
    const entry = createEntry({ text: 'Regular learning note' });
    const score = pruner.getImportanceScore(entry);
    assert(score >= 0.1 && score <= 0.3, `Expected 0.1-0.3, got ${score}`);
  });

  runTest('getImportanceScore handles multiple markers (takes highest)', () => {
    const entry = createEntry({ text: 'CRITICAL pattern: Iron Law of TDD' });
    const score = pruner.getImportanceScore(entry);
    assert(score === 1.0, `Expected 1.0 (CRITICAL takes precedence), got ${score}`);
  });

  console.log('');

  // ============================================================================
  // 4. Utility Score Tests
  // ============================================================================
  console.log('4. Utility Score Tests (Combined)');

  runTest('calculateUtility combines all three scores', () => {
    const entry = createEntry({
      text: 'CRITICAL: Test entry',
      lastAccessed: new Date().toISOString(),
      accessCount: 10,
    });
    const utility = pruner.calculateUtility(entry);
    // 0.3*1.0 (recency) + 0.3*~1.0 (frequency) + 0.4*1.0 (importance) = ~1.0
    assert(utility >= 0.9, `Expected >= 0.9, got ${utility}`);
  });

  runTest('calculateUtility returns low score for old, unused, unmarked entry', () => {
    const entry = createEntry({
      text: 'Old note',
      lastAccessed: daysAgo(90),
      accessCount: 1,
    });
    const utility = pruner.calculateUtility(entry);
    assert(utility <= 0.3, `Expected <= 0.3, got ${utility}`);
  });

  runTest('calculateUtility weights importance highest (0.4)', () => {
    // Same recency and frequency, different importance
    const importantEntry = createEntry({
      text: 'CRITICAL: Important',
      lastAccessed: daysAgo(30),
      accessCount: 5,
    });
    const regularEntry = createEntry({
      text: 'Regular note',
      lastAccessed: daysAgo(30),
      accessCount: 5,
    });
    const importantScore = pruner.calculateUtility(importantEntry);
    const regularScore = pruner.calculateUtility(regularEntry);
    assert(
      importantScore > regularScore,
      `Important (${importantScore}) should be > Regular (${regularScore})`
    );
  });

  console.log('');

  // ============================================================================
  // 5. Semantic Deduplication Tests
  // ============================================================================
  console.log('5. Semantic Deduplication Tests');

  runTest('jaccardSimilarity returns 1.0 for identical strings', () => {
    const similarity = pruner.jaccardSimilarity('hello world', 'hello world');
    assert(similarity === 1.0, `Expected 1.0, got ${similarity}`);
  });

  runTest('jaccardSimilarity returns 0 for completely different strings', () => {
    const similarity = pruner.jaccardSimilarity('hello world', 'foo bar baz');
    assert(similarity === 0, `Expected 0, got ${similarity}`);
  });

  runTest('jaccardSimilarity returns ~0.5 for partially similar strings', () => {
    const similarity = pruner.jaccardSimilarity('hello world test', 'hello world foo');
    // Words: {hello, world, test} vs {hello, world, foo}
    // Intersection: {hello, world} = 2, Union: {hello, world, test, foo} = 4
    // Jaccard = 2/4 = 0.5
    assert(similarity === 0.5, `Expected 0.5, got ${similarity}`);
  });

  runTest('jaccardSimilarity is case-insensitive', () => {
    const similarity = pruner.jaccardSimilarity('Hello World', 'hello world');
    assert(similarity === 1.0, `Expected 1.0, got ${similarity}`);
  });

  runTest('findSimilarEntries groups similar entries', () => {
    const entries = [
      createEntry({ text: 'Always run tests before commit' }),
      createEntry({ text: 'Always run tests before pushing' }),
      createEntry({ text: 'Use three-tier memory hierarchy' }),
      createEntry({ text: 'Three tier memory hierarchy pattern' }),
    ];
    const groups = pruner.findSimilarEntries(entries, 0.3);
    // Should find 2 groups: tests group and memory hierarchy group
    assert(groups.length >= 2, `Expected at least 2 groups, got ${groups.length}`);
  });

  runTest('mergeEntries combines duplicates preserving best info', () => {
    const entries = [
      createEntry({
        text: 'Always run tests',
        lastAccessed: daysAgo(10),
        accessCount: 5,
      }),
      createEntry({
        text: 'Always run tests before commit',
        lastAccessed: daysAgo(2),
        accessCount: 3,
      }),
    ];
    const merged = pruner.mergeEntries(entries);
    // Should keep the longer/more descriptive text
    assert(
      merged.text.includes('before commit') || merged.text.includes('Always run tests'),
      'Merged should preserve content'
    );
    // Should keep highest access count or sum them
    assert(merged.accessCount >= 5, `Expected accessCount >= 5, got ${merged.accessCount}`);
  });

  runTest('detectDuplicates finds existing similar entry', () => {
    const existingEntries = [
      createEntry({ text: 'Always run tests before commit' }),
      createEntry({ text: 'Use TDD workflow' }),
    ];
    const newEntry = 'Always run tests before pushing';
    const duplicate = pruner.detectDuplicates(newEntry, existingEntries, 0.4);
    assert(duplicate !== null, 'Should detect similar entry');
    assert(duplicate.text.includes('tests'), 'Should match test-related entry');
  });

  runTest('detectDuplicates returns null for unique entry', () => {
    const existingEntries = [createEntry({ text: 'Always run tests before commit' })];
    const newEntry = 'Kubernetes deployment strategy';
    const duplicate = pruner.detectDuplicates(newEntry, existingEntries, 0.4);
    assert(duplicate === null, 'Should not detect duplicate for unique entry');
  });

  console.log('');

  // ============================================================================
  // 6. Retention Policy Tests
  // ============================================================================
  console.log('6. Retention Policy Tests');

  runTest('pruneByUtility removes lowest utility entries', () => {
    const entries = [
      createEntry({ text: 'CRITICAL: Keep this', accessCount: 10 }),
      createEntry({ text: 'Old unused note', lastAccessed: daysAgo(90), accessCount: 1 }),
      createEntry({ text: 'Medium importance', accessCount: 5 }),
      createEntry({ text: 'Another old note', lastAccessed: daysAgo(80), accessCount: 1 }),
    ];
    const pruned = pruner.pruneByUtility(entries, 2); // Keep only 2
    assert(pruned.kept.length === 2, `Expected 2 kept, got ${pruned.kept.length}`);
    assert(pruned.removed.length === 2, `Expected 2 removed, got ${pruned.removed.length}`);
    // CRITICAL entry should be kept
    assert(
      pruned.kept.some(e => e.text.includes('CRITICAL')),
      'Should keep CRITICAL entry'
    );
  });

  runTest('enforceRetention applies tier-specific limits', () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      createEntry({ text: `Entry ${i}`, accessCount: i })
    );
    // STM: max 5, MTM: max 15, LTM: unlimited
    const stmResult = pruner.enforceRetention(entries, 'STM');
    const mtmResult = pruner.enforceRetention(entries, 'MTM');
    const ltmResult = pruner.enforceRetention(entries, 'LTM');

    assert(
      stmResult.kept.length <= pruner.RETENTION_LIMITS.STM,
      `STM should have <= ${pruner.RETENTION_LIMITS.STM}, got ${stmResult.kept.length}`
    );
    assert(
      mtmResult.kept.length <= pruner.RETENTION_LIMITS.MTM,
      `MTM should have <= ${pruner.RETENTION_LIMITS.MTM}, got ${mtmResult.kept.length}`
    );
    // LTM should keep all (no limit or high limit)
    assert(
      ltmResult.kept.length === entries.length || ltmResult.kept.length >= 20,
      `LTM should keep most entries, got ${ltmResult.kept.length}`
    );
  });

  runTest('archiveLowValue moves entries to archive format', () => {
    const entries = [
      createEntry({ text: 'Low value entry 1', lastAccessed: daysAgo(60) }),
      createEntry({ text: 'Low value entry 2', lastAccessed: daysAgo(70) }),
    ];
    const archive = pruner.archiveLowValue(entries);
    assert(archive.type === 'archive', `Expected type 'archive', got ${archive.type}`);
    assert(
      archive.entries.length === 2,
      `Expected 2 archived entries, got ${archive.entries.length}`
    );
    assert(archive.summary !== undefined, 'Archive should have summary');
  });

  console.log('');

  // ============================================================================
  // 7. Integration Tests
  // ============================================================================
  console.log('7. Integration Tests');

  runTest('deduplicateAndPrune does full cleanup', () => {
    const entries = [
      createEntry({ text: 'CRITICAL: Run tests' }),
      createEntry({ text: 'Always run tests', lastAccessed: daysAgo(30) }),
      createEntry({ text: 'Run tests before commit', lastAccessed: daysAgo(20) }),
      createEntry({ text: 'Old unused note', lastAccessed: daysAgo(90), accessCount: 1 }),
      createEntry({ text: 'Another old note', lastAccessed: daysAgo(85), accessCount: 1 }),
      createEntry({ text: 'Recent note', accessCount: 5 }),
    ];

    const result = pruner.deduplicateAndPrune(entries, {
      targetCount: 3,
      similarityThreshold: 0.3,
    });

    assert(result.kept.length <= 3, `Expected <= 3 kept, got ${result.kept.length}`);
    assert(result.deduplicated > 0, `Expected some deduplication, got ${result.deduplicated}`);
    // Should keep CRITICAL entry
    assert(
      result.kept.some(e => e.text.includes('CRITICAL')),
      'Should keep CRITICAL entry'
    );
  });

  console.log('');

  // ============================================================================
  // Summary
  // ============================================================================
  // ============================================================================
  // 8. Error Path Coverage Tests (IMP-006)
  // ============================================================================
  console.log('8. Error Path Coverage Tests');

  runTest('getRecencyScore handles undefined gracefully', () => {
    const score = pruner.getRecencyScore(undefined);
    assert(score === 0, `Expected 0 for undefined, got ${score}`);
  });

  runTest('getRecencyScore handles null gracefully', () => {
    const score = pruner.getRecencyScore(null);
    assert(score === 0, `Expected 0 for null, got ${score}`);
  });

  runTest('getRecencyScore handles empty string gracefully', () => {
    const score = pruner.getRecencyScore('');
    assert(score === 0, `Expected 0 for empty string, got ${score}`);
  });

  runTest('getFrequencyScore handles negative values gracefully', () => {
    const score = pruner.getFrequencyScore(-5);
    assert(score === 0, `Expected 0 for negative count, got ${score}`);
  });

  runTest('getFrequencyScore handles undefined gracefully', () => {
    const score = pruner.getFrequencyScore(undefined);
    assert(score === 0, `Expected 0 for undefined, got ${score}`);
  });

  runTest('getFrequencyScore handles NaN gracefully', () => {
    const score = pruner.getFrequencyScore(NaN);
    assert(score === 0, `Expected 0 for NaN, got ${score}`);
  });

  runTest('getImportanceScore handles null entry gracefully', () => {
    const score = pruner.getImportanceScore(null);
    assert(score >= 0 && score <= 1, `Expected valid score for null, got ${score}`);
  });

  runTest('getImportanceScore handles entry with no text gracefully', () => {
    const score = pruner.getImportanceScore({ timestamp: new Date().toISOString() });
    assert(score >= 0 && score <= 1, `Expected valid score for no text, got ${score}`);
  });

  runTest('calculateUtility handles entry with missing fields gracefully', () => {
    const entry = {}; // No fields at all
    const utility = pruner.calculateUtility(entry);
    assert(utility >= 0 && utility <= 1, `Expected valid utility for empty entry, got ${utility}`);
  });

  runTest('calculateUtility handles null entry gracefully', () => {
    // calculateUtility should handle null without throwing
    try {
      const utility = pruner.calculateUtility(null);
      assert(utility >= 0, `Expected non-negative utility for null, got ${utility}`);
    } catch (e) {
      // If it throws, it should be a clear error
      assert(e.message, 'Should have error message if throwing');
    }
  });

  runTest('jaccardSimilarity handles empty strings gracefully', () => {
    const similarity = pruner.jaccardSimilarity('', '');
    assert(
      similarity === 0 || similarity === 1,
      `Expected 0 or 1 for empty strings, got ${similarity}`
    );
  });

  runTest('jaccardSimilarity handles null/undefined gracefully', () => {
    const similarity = pruner.jaccardSimilarity(null, undefined);
    assert(similarity === 0, `Expected 0 for null/undefined, got ${similarity}`);
  });

  runTest('findSimilarEntries handles empty array gracefully', () => {
    const groups = pruner.findSimilarEntries([], 0.5);
    assert(Array.isArray(groups), 'Should return array');
    assert(groups.length === 0, `Expected empty array, got ${groups.length} groups`);
  });

  runTest('mergeEntries handles single entry gracefully', () => {
    const entries = [createEntry({ text: 'Single entry' })];
    const merged = pruner.mergeEntries(entries);
    assert(merged.text === 'Single entry', 'Should return single entry unchanged');
  });

  runTest('mergeEntries handles empty array gracefully', () => {
    const merged = pruner.mergeEntries([]);
    assert(
      merged === null || merged === undefined || merged.text === '',
      'Should return null/undefined/empty for empty array'
    );
  });

  runTest('detectDuplicates handles empty existing entries gracefully', () => {
    const duplicate = pruner.detectDuplicates('new entry', [], 0.5);
    assert(duplicate === null, 'Should return null for empty existing entries');
  });

  runTest('detectDuplicates handles null new entry gracefully', () => {
    const existingEntries = [createEntry({ text: 'existing' })];
    const duplicate = pruner.detectDuplicates(null, existingEntries, 0.5);
    assert(duplicate === null, 'Should return null for null new entry');
  });

  runTest('pruneByUtility handles empty array gracefully', () => {
    const result = pruner.pruneByUtility([], 5);
    assert(result.kept.length === 0, 'Should have no kept entries');
    assert(result.removed.length === 0, 'Should have no removed entries');
  });

  runTest('pruneByUtility handles targetCount larger than entries gracefully', () => {
    const entries = [createEntry({ text: 'Entry 1' }), createEntry({ text: 'Entry 2' })];
    const result = pruner.pruneByUtility(entries, 100);
    assert(result.kept.length === 2, `Expected all entries kept, got ${result.kept.length}`);
    assert(result.removed.length === 0, 'Should have no removed entries');
  });

  runTest('pruneByUtility handles targetCount of 0 gracefully', () => {
    const entries = [createEntry({ text: 'Entry 1' })];
    const result = pruner.pruneByUtility(entries, 0);
    assert(result.kept.length === 0, 'Should have no kept entries with target 0');
    assert(result.removed.length === 1, 'Should remove all entries with target 0');
  });

  runTest('enforceRetention handles unknown tier gracefully', () => {
    const entries = [createEntry({ text: 'Entry 1' })];
    try {
      const result = pruner.enforceRetention(entries, 'UNKNOWN_TIER');
      // If it doesn't throw, should still return valid structure
      assert(Array.isArray(result.kept), 'Should have kept array');
    } catch (e) {
      // If it throws, that's also acceptable
      assert(e.message, 'Should have error message');
    }
  });

  runTest('archiveLowValue handles empty entries gracefully', () => {
    const archive = pruner.archiveLowValue([]);
    assert(archive.type === 'archive', `Expected type 'archive', got ${archive.type}`);
    assert(archive.entries.length === 0, 'Should have no archived entries');
  });

  runTest('deduplicateAndPrune handles null options gracefully', () => {
    const entries = [createEntry({ text: 'Entry 1' })];
    // Should use defaults if options is null/undefined
    const result = pruner.deduplicateAndPrune(entries, null);
    assert(Array.isArray(result.kept), 'Should return valid result');
  });

  runTest('deduplicateAndPrune handles empty entries gracefully', () => {
    const result = pruner.deduplicateAndPrune([], { targetCount: 10 });
    assert(result.kept.length === 0, 'Should have no kept entries');
    assert(result.removed.length === 0, 'Should have no removed entries');
    assert(result.deduplicated === 0, 'Should have 0 deduplicated');
  });

  console.log('');

  console.log('==================');
  console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();
