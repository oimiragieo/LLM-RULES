#!/usr/bin/env node
/**
 * Memory Rotator Tests
 * ====================
 *
 * Comprehensive test suite for memory-rotator.cjs
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Test Setup
// ============================================================================

// Create isolated test directory
const TEST_DIR = path.join(os.tmpdir(), `memory-rotator-test-${Date.now()}`);
const TEST_MEMORY_DIR = path.join(TEST_DIR, '.claude', 'context', 'memory');

function setupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
}

function cleanupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Mock PROJECT_ROOT for tests
const originalProjectRoot = process.env.PROJECT_ROOT;
process.env.PROJECT_ROOT = TEST_DIR;

// Load module AFTER setting environment
const rotator = require('../../../.claude/lib/memory/memory-rotator.cjs');

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_DECISIONS = `# Architecture Decision Records

## [ADR-001] Use TypeScript for Backend

**Date**: 2025-11-01
**Status**: Accepted

Decision to use TypeScript instead of JavaScript for backend services.

## [ADR-002] Adopt Microservices Architecture

**Date**: 2025-12-15
**Status**: Accepted

Transition from monolith to microservices for better scalability.

## [ADR-003] Use PostgreSQL as Primary Database

**Date**: 2026-01-10
**Status**: Accepted

PostgreSQL chosen for ACID compliance and relational data modeling.

## [ADR-004] Implement JWT Authentication

**Date**: 2026-01-25
**Status**: Accepted

JWT tokens for stateless authentication across services.
`;

const SAMPLE_ISSUES = `# Known Issues

### Database Connection Pool Exhaustion

**Status**: RESOLVED
**Date**: 2025-11-15
**Resolved**: 2025-11-20

Connection pool was exhausting under high load. Fixed by increasing pool size.

### Memory Leak in Worker Process

**Status**: OPEN
**Date**: 2026-01-15

Worker process shows memory leak pattern under sustained load. Investigating.

### API Rate Limiting Not Working

**Status**: RESOLVED
**Date**: 2026-01-20
**Resolved**: 2026-01-22

Rate limiter was not properly initialized. Fixed in PR #123.

### Circular Dependency in Module Loader

**Status**: OPEN
**Date**: 2026-01-28

Module loader has circular dependency causing initialization issues.
`;

// ============================================================================
// Tests: Utility Functions
// ============================================================================

function testCountLines() {
  console.log('TEST: countLines()');

  setupTestEnv();

  const testFile = path.join(TEST_MEMORY_DIR, 'test.txt');
  fs.writeFileSync(testFile, 'line 1\nline 2\nline 3\n');

  const count = rotator.countLines(testFile);
  assert.strictEqual(count, 4, 'Should count 4 lines (including trailing newline)');

  cleanupTestEnv();
  console.log('✅ PASS: countLines()');
}

function testGetCurrentYearMonth() {
  console.log('TEST: getCurrentYearMonth()');

  const yearMonth = rotator.getCurrentYearMonth();
  assert.match(yearMonth, /^\d{4}-\d{2}$/, 'Should return YYYY-MM format');

  cleanupTestEnv();
  console.log('✅ PASS: getCurrentYearMonth()');
}

function testGetAgeDays() {
  console.log('TEST: getAgeDays()');

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  assert.strictEqual(rotator.getAgeDays(today), 0, 'Today should be 0 days old');
  assert.strictEqual(rotator.getAgeDays(yesterday), 1, 'Yesterday should be 1 day old');
  assert.ok(rotator.getAgeDays(twoMonthsAgo) >= 59, 'Two months ago should be ~60 days old');

  cleanupTestEnv();
  console.log('✅ PASS: getAgeDays()');
}

function testParseDate() {
  console.log('TEST: parseDate()');

  const iso = rotator.parseDate('2026-01-28');
  assert.ok(iso instanceof Date, 'Should parse ISO date');
  assert.strictEqual(iso.getFullYear(), 2026);

  const us = rotator.parseDate('01/28/2026');
  assert.ok(us instanceof Date, 'Should parse US date format');
  assert.strictEqual(us.getFullYear(), 2026);

  const invalid = rotator.parseDate('invalid');
  assert.strictEqual(invalid, null, 'Should return null for invalid date');

  cleanupTestEnv();
  console.log('✅ PASS: parseDate()');
}

// ============================================================================
// Tests: ADR Parsing
// ============================================================================

function testParseDecisions() {
  console.log('TEST: parseDecisions()');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  fs.writeFileSync(decisionsPath, SAMPLE_DECISIONS);

  const adrs = rotator.parseDecisions(decisionsPath);

  assert.strictEqual(adrs.length, 4, 'Should parse 4 ADRs');
  assert.strictEqual(adrs[0].number, 1, 'First ADR should be ADR-001');
  assert.strictEqual(adrs[0].title, 'Use TypeScript for Backend');
  assert.strictEqual(adrs[0].date, '2025-11-01');
  assert.ok(adrs[0].lines > 0, 'ADR should have content lines');

  cleanupTestEnv();
  console.log('✅ PASS: parseDecisions()');
}

function testSelectADRsToArchive() {
  console.log('TEST: selectADRsToArchive()');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  fs.writeFileSync(decisionsPath, SAMPLE_DECISIONS);

  const adrs = rotator.parseDecisions(decisionsPath);
  const { toArchive, toKeep } = rotator.selectADRsToArchive(adrs, 60);

  // ADRs from 2025-11 should be archived (60+ days old)
  // ADRs from 2026-01 should be kept (< 60 days old)
  assert.ok(toArchive.length > 0, 'Should have ADRs to archive');
  assert.ok(toKeep.length > 0, 'Should have ADRs to keep');

  // Verify old ADRs are in toArchive
  const adr1 = toArchive.find(a => a.number === 1);
  assert.ok(adr1, 'ADR-001 (Nov 2025) should be archived');

  // Verify recent ADRs are in toKeep
  const adr4 = toKeep.find(a => a.number === 4);
  assert.ok(adr4, 'ADR-004 (Jan 2026) should be kept');

  cleanupTestEnv();
  console.log('✅ PASS: selectADRsToArchive()');
}

// ============================================================================
// Tests: Issue Parsing
// ============================================================================

function testParseIssues() {
  console.log('TEST: parseIssues()');

  setupTestEnv();

  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');
  fs.writeFileSync(issuesPath, SAMPLE_ISSUES);

  const issues = rotator.parseIssues(issuesPath);

  assert.strictEqual(issues.length, 4, 'Should parse 4 issues');
  assert.strictEqual(issues[0].title, 'Database Connection Pool Exhaustion');
  assert.strictEqual(issues[0].status, 'RESOLVED');
  assert.strictEqual(issues[0].date, '2025-11-20');

  assert.strictEqual(issues[1].title, 'Memory Leak in Worker Process');
  assert.strictEqual(issues[1].status, 'OPEN');

  cleanupTestEnv();
  console.log('✅ PASS: parseIssues()');
}

function testSelectIssuesToArchive() {
  console.log('TEST: selectIssuesToArchive()');

  setupTestEnv();

  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');
  fs.writeFileSync(issuesPath, SAMPLE_ISSUES);

  const issues = rotator.parseIssues(issuesPath);
  const { toArchive, toKeep } = rotator.selectIssuesToArchive(issues, 7);

  // Only RESOLVED issues older than 7 days should be archived
  // OPEN issues should always be kept
  assert.ok(toKeep.length >= 2, 'Should keep at least 2 issues (OPEN ones)');

  // Verify OPEN issues are kept
  const openIssues = toKeep.filter(i => i.status === 'OPEN');
  assert.strictEqual(openIssues.length, 2, 'All OPEN issues should be kept');

  // Verify old RESOLVED issues are archived
  const oldResolved = toArchive.find(i => i.title === 'Database Connection Pool Exhaustion');
  assert.ok(oldResolved, 'Old RESOLVED issue should be archived');

  cleanupTestEnv();
  console.log('✅ PASS: selectIssuesToArchive()');
}

// ============================================================================
// Tests: Rotation Operations
// ============================================================================

function testCheckRotationNeeded() {
  console.log('TEST: checkRotationNeeded()');

  setupTestEnv();

  // Create file with known line count
  const testFile = path.join(TEST_MEMORY_DIR, 'test.md');
  const lines = new Array(1600).fill('test line').join('\n');
  fs.writeFileSync(testFile, lines);

  const result = rotator.checkRotationNeeded(testFile, 1500);

  assert.strictEqual(result.needsRotation, true, 'Should need rotation (1600 > 1500)');
  assert.ok(result.lineCount >= 1600, 'Should report correct line count');
  assert.strictEqual(result.threshold, 'WARNING', 'Should be in WARNING threshold');

  cleanupTestEnv();
  console.log('✅ PASS: checkRotationNeeded()');
}

function testRotateDecisionsDryRun() {
  console.log('TEST: rotateDecisions (dry-run)');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  fs.writeFileSync(decisionsPath, SAMPLE_DECISIONS);

  const result = rotator.rotateDecisions(true, TEST_DIR);

  assert.strictEqual(result.success, true, 'Dry run should succeed');
  assert.strictEqual(result.dryRun, true);
  assert.ok(result.archivedCount > 0, 'Should have ADRs to archive');
  assert.ok(result.keptCount > 0, 'Should have ADRs to keep');

  // Verify original file is unchanged
  const content = fs.readFileSync(decisionsPath, 'utf8');
  assert.strictEqual(content, SAMPLE_DECISIONS, 'Original file should be unchanged in dry-run');

  cleanupTestEnv();
  console.log('✅ PASS: rotateDecisions (dry-run)');
}

function testRotateDecisions() {
  console.log('TEST: rotateDecisions (execute)');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  fs.writeFileSync(decisionsPath, SAMPLE_DECISIONS);

  const result = rotator.rotateDecisions(false, TEST_DIR);

  assert.strictEqual(result.success, true, 'Rotation should succeed');
  assert.strictEqual(result.dryRun, false);
  assert.ok(result.archivedCount > 0, 'Should have archived ADRs');
  assert.ok(result.archivePath, 'Should have archive path');

  // Verify archive file was created
  assert.ok(fs.existsSync(result.archivePath), 'Archive file should exist');

  // Verify active file was updated
  const activeContent = fs.readFileSync(decisionsPath, 'utf8');
  assert.ok(activeContent.includes('NOTICE'), 'Active file should have archival notice');
  assert.ok(activeContent.includes('ADR-004'), 'Active file should contain recent ADR');

  // Verify archive contains old ADRs
  const archiveContent = fs.readFileSync(result.archivePath, 'utf8');
  assert.ok(archiveContent.includes('ADR-001'), 'Archive should contain ADR-001');
  assert.ok(archiveContent.includes('ARCHIVED'), 'Archive should have archive header');

  cleanupTestEnv();
  console.log('✅ PASS: rotateDecisions (execute)');
}

function testRotateIssuesDryRun() {
  console.log('TEST: rotateIssues (dry-run)');

  setupTestEnv();

  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');
  fs.writeFileSync(issuesPath, SAMPLE_ISSUES);

  const result = rotator.rotateIssues(true, TEST_DIR);

  assert.strictEqual(result.success, true, 'Dry run should succeed');
  assert.strictEqual(result.dryRun, true);
  assert.ok(result.archivedCount >= 0, 'Should report archived count');
  assert.ok(result.keptCount > 0, 'Should have issues to keep (OPEN ones)');

  // Verify original file is unchanged
  const content = fs.readFileSync(issuesPath, 'utf8');
  assert.strictEqual(content, SAMPLE_ISSUES, 'Original file should be unchanged in dry-run');

  cleanupTestEnv();
  console.log('✅ PASS: rotateIssues (dry-run)');
}

function testRotateIssues() {
  console.log('TEST: rotateIssues (execute)');

  setupTestEnv();

  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');
  fs.writeFileSync(issuesPath, SAMPLE_ISSUES);

  const result = rotator.rotateIssues(false, TEST_DIR);

  assert.strictEqual(result.success, true, 'Rotation should succeed');
  assert.strictEqual(result.dryRun, false);

  // Verify active file contains OPEN issues
  const activeContent = fs.readFileSync(issuesPath, 'utf8');
  assert.ok(
    activeContent.includes('Memory Leak in Worker Process'),
    'Active file should contain OPEN issue'
  );
  assert.ok(activeContent.includes('Circular Dependency'), 'Active file should contain OPEN issue');

  // If archive was created, verify it contains only RESOLVED issues
  if (result.archivePath && fs.existsSync(result.archivePath)) {
    const archiveContent = fs.readFileSync(result.archivePath, 'utf8');
    assert.ok(archiveContent.includes('ARCHIVED'), 'Archive should have header');
  }

  cleanupTestEnv();
  console.log('✅ PASS: rotateIssues (execute)');
}

function testCheckAll() {
  console.log('TEST: checkAll()');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');

  // Create large files to trigger rotation
  const largeContent = new Array(1600).fill('test line').join('\n');
  fs.writeFileSync(decisionsPath, largeContent);
  fs.writeFileSync(issuesPath, largeContent);

  const result = rotator.checkAll(TEST_DIR);

  assert.ok(result.timestamp, 'Should have timestamp');
  assert.strictEqual(result.files.length, 2, 'Should check 2 files');
  assert.strictEqual(result.needsRotation, true, 'Should need rotation for large files');

  cleanupTestEnv();
  console.log('✅ PASS: checkAll()');
}

function testRotateAll() {
  console.log('TEST: rotateAll()');

  setupTestEnv();

  const decisionsPath = path.join(TEST_MEMORY_DIR, 'decisions.md');
  const issuesPath = path.join(TEST_MEMORY_DIR, 'issues.md');

  // Create files with old content (to trigger rotation)
  fs.writeFileSync(decisionsPath, SAMPLE_DECISIONS);
  fs.writeFileSync(issuesPath, SAMPLE_ISSUES);

  // Run rotation (files are small but have old dates, so some content will be archived)
  const result = rotator.rotateAll(false, TEST_DIR);

  assert.ok(result.timestamp, 'Should have timestamp');
  assert.strictEqual(result.dryRun, false);
  assert.ok(result.rotations.length > 0, 'Should have rotation results');

  cleanupTestEnv();
  console.log('✅ PASS: rotateAll()');
}

// ============================================================================
// Test Runner
// ============================================================================

function runAllTests() {
  console.log('\n======================================');
  console.log('Memory Rotator Test Suite');
  console.log('======================================\n');

  const tests = [
    // Utility tests
    testCountLines,
    testGetCurrentYearMonth,
    testGetAgeDays,
    testParseDate,

    // ADR parsing tests
    testParseDecisions,
    testSelectADRsToArchive,

    // Issue parsing tests
    testParseIssues,
    testSelectIssuesToArchive,

    // Rotation tests
    testCheckRotationNeeded,
    testRotateDecisionsDryRun,
    testRotateDecisions,
    testRotateIssuesDryRun,
    testRotateIssues,
    testCheckAll,
    testRotateAll,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      failed++;
      console.error(`\n❌ FAIL: ${test.name}`);
      console.error(error.message);
      console.error(error.stack);
    }
  }

  console.log('\n======================================');
  console.log('Test Summary');
  console.log('======================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${tests.length}`);

  // Restore original PROJECT_ROOT
  if (originalProjectRoot) {
    process.env.PROJECT_ROOT = originalProjectRoot;
  } else {
    delete process.env.PROJECT_ROOT;
  }

  // Final cleanup
  cleanupTestEnv();

  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
};
