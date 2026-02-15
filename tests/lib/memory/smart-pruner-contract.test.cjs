'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('C-002: deduplicateFile returns canonical "removed" field', () => {
  const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');

  // Create temp file with duplicate content
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c002-'));
  const testFile = path.join(tmpDir, 'test.md');
  fs.writeFileSync(
    testFile,
    [
      '## Entry 1',
      'This is a test pattern for duplication testing purposes.',
      '',
      '---',
      '',
      '## Entry 2',
      'This is a test pattern for duplication testing purposes.',
    ].join('\n')
  );

  const result = smartPruner.deduplicateFile(testFile, { threshold: 0.6 });

  // Contract: "removed" field MUST exist and be a number
  assert.strictEqual(
    typeof result.removed,
    'number',
    'deduplicateFile must return "removed" field (canonical)'
  );
  assert.ok(result.removed >= 0, 'removed must be non-negative');

  // Backward compat: duplicatesRemoved still present
  assert.strictEqual(
    typeof result.duplicatesRemoved,
    'number',
    'duplicatesRemoved must still exist for backward compat'
  );

  // Canonical and compat must match
  assert.strictEqual(result.removed, result.duplicatesRemoved, 'removed === duplicatesRemoved');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('C-002: deduplicateFile with no file returns removed=0', () => {
  const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');

  const result = smartPruner.deduplicateFile('/nonexistent/path/file.md');

  assert.strictEqual(typeof result.removed, 'number', 'removed field must exist');
  assert.strictEqual(result.removed, 0, 'removed must be 0 for nonexistent file');
});

test('C-002: pruneResolvedEntries returns canonical "removed" field', () => {
  const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c002-'));
  const testFile = path.join(tmpDir, 'issues.md');
  const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  fs.writeFileSync(
    testFile,
    [
      '## Old Issue',
      `**Date:** ${oldDate}`,
      '**Status:** RESOLVED',
      '',
      'This is a resolved issue from 60 days ago.',
    ].join('\n')
  );

  const result = smartPruner.pruneResolvedEntries(testFile, { maxAgeDays: 30 });

  assert.strictEqual(typeof result.removed, 'number', 'removed must be a number');
  assert.ok(result.removed >= 0, 'removed must be non-negative');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('C-002: validateResultContract catches missing "removed" field', () => {
  const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');

  // Must export validateResultContract
  assert.ok(
    typeof smartPruner.validateResultContract === 'function',
    'validateResultContract must be exported'
  );

  // Valid result
  assert.doesNotThrow(() => {
    smartPruner.validateResultContract({ removed: 5 }, 'test');
  });

  // Missing removed
  assert.throws(() => {
    smartPruner.validateResultContract({ duplicatesRemoved: 5 }, 'test');
  }, /Contract violation/);

  // Wrong type
  assert.throws(() => {
    smartPruner.validateResultContract({ removed: '5' }, 'test');
  }, /Contract violation/);

  // Negative
  assert.throws(() => {
    smartPruner.validateResultContract({ removed: -1 }, 'test');
  }, /non-negative/);
});

test('C-002: memory-scheduler uses correct field from deduplicateFile', () => {
  // This verifies the INTEGRATION between scheduler and pruner
  const schedulerPath = require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs');
  const schedulerTasksPath =
    require.resolve('../../../.claude/lib/memory/memory-scheduler-tasks.cjs');
  const schedulerSource = fs.readFileSync(schedulerPath, 'utf8');
  const schedulerTasksSource = fs.readFileSync(schedulerTasksPath, 'utf8');
  const combinedSource = `${schedulerSource}\n${schedulerTasksSource}`;

  // After fix: scheduler should use dedupResult.removed (not dedupResult.entriesRemoved)
  // Line ~421 should use .duplicatesRemoved or .removed
  const hasDuplicatesRemoved = combinedSource.includes('dedupResult.duplicatesRemoved');
  const hasRemoved = combinedSource.includes('dedupResult.removed');

  assert.ok(
    hasDuplicatesRemoved || hasRemoved,
    'memory-scheduler must use dedupResult.duplicatesRemoved or dedupResult.removed'
  );

  // Should NOT use entriesRemoved (the bug)
  const hasEntriesRemoved = combinedSource.includes('dedupResult.entriesRemoved');
  assert.strictEqual(
    hasEntriesRemoved,
    false,
    'memory-scheduler must NOT use dedupResult.entriesRemoved (bug field)'
  );
});
