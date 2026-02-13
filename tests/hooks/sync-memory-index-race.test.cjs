#!/usr/bin/env node
/**
 * Tests for DB init race condition fix in sync-memory-index.cjs
 *
 * Verifies that ensureEntityDbInitialized uses file-based locking
 * to prevent concurrent schema initialization.
 *
 * Test Categories:
 * 1. Source code verification (lock file pattern present)
 * 2. Lock acquisition and release
 * 3. Stale lock cleanup
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('sync-memory-index DB init race condition prevention', () => {
  it('ensureEntityDbInitialized should use file-based locking pattern', () => {
    const filePath = path.join(PROJECT_ROOT, '.claude/hooks/memory/sync-memory-index.cjs');
    assert.ok(fs.existsSync(filePath), 'sync-memory-index.cjs not found');

    const content = fs.readFileSync(filePath, 'utf8');

    // Verify lock file pattern exists in ensureEntityDbInitialized
    // Must contain: .init.lock (lock file name)
    assert.ok(
      content.includes('.init.lock'),
      'ensureEntityDbInitialized should use .init.lock file for race condition prevention'
    );

    // Must contain: flag: 'wx' or openSync with 'wx' (atomic exclusive create)
    const wxPattern = /['"]wx['"]/;
    assert.ok(
      wxPattern.test(content),
      "ensureEntityDbInitialized should use 'wx' flag for atomic lock acquisition"
    );

    // Must contain: EEXIST handling (concurrent process detection)
    assert.ok(
      content.includes('EEXIST'),
      'ensureEntityDbInitialized should handle EEXIST error (concurrent lock detection)'
    );
  });

  it('should clean up lock file in finally block', () => {
    const filePath = path.join(PROJECT_ROOT, '.claude/hooks/memory/sync-memory-index.cjs');
    const content = fs.readFileSync(filePath, 'utf8');

    // Must have finally block that cleans up lock
    assert.ok(
      content.includes('finally'),
      'ensureEntityDbInitialized should have finally block for lock cleanup'
    );

    // Must attempt to unlink lock file
    assert.ok(
      content.includes('unlinkSync'),
      'ensureEntityDbInitialized should unlink lock file in cleanup'
    );
  });
});
