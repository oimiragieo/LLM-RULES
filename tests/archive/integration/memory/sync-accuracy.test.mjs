// tests/integration/memory/sync-accuracy.test.mjs
// Integration tests for SyncLayer accuracy (Task #26)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import SyncLayer and EntityQuery
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const syncLayerPath = path.join(PROJECT_ROOT, '.claude/lib/memory/sync-layer.cjs');
const entityQueryPath = path.join(PROJECT_ROOT, '.claude/lib/memory/entity-query.cjs');
const initDbPath = path.join(PROJECT_ROOT, '.claude/tools/cli/init-memory-db.cjs');

const { SyncLayer } = require(syncLayerPath);
const { EntityQuery } = require(entityQueryPath);
const { initializeDatabase } = require(initDbPath);

// Test setup
const TEST_ROOT = path.resolve(PROJECT_ROOT, 'tests/data/sync-accuracy');
const TEST_MEMORY_DIR = path.join(TEST_ROOT, 'memory');
const TEST_DB_PATH = path.join(TEST_ROOT, 'memory.db');

describe('SyncLayer Integration - Accuracy', () => {
  let syncLayer;
  let entityQuery;

  before(async () => {
    // Clean test directory
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });

    // Ensure database directory exists
    const dbDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database schema
    await initializeDatabase(TEST_DB_PATH);

    // Initialize sync layer
    syncLayer = new SyncLayer({
      memoryDir: TEST_MEMORY_DIR,
      dbPath: TEST_DB_PATH,
      debounceMs: 500, // Longer debounce for reliability
    });

    await syncLayer.start();

    // Initialize entity query
    entityQuery = new EntityQuery(TEST_DB_PATH);
  });

  after(async () => {
    // Cleanup
    if (syncLayer) {
      await syncLayer.stop();
    }
    if (entityQuery) {
      entityQuery.close();
    }

    // Clean up test files (best effort)
    await new Promise(resolve => setTimeout(resolve, 500));
    if (fs.existsSync(TEST_ROOT)) {
      try {
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should sync learnings.md changes to SQLite accurately', async () => {
    const learningsFile = path.join(TEST_MEMORY_DIR, 'learnings.md');

    // Write content with pattern
    fs.writeFileSync(
      learningsFile,
      `### Pattern: Write-Ahead Log Sync\nReliable sync pattern for file monitoring\n\n### Pattern: Debounce\nDelay execution until quiet period`
    );

    // Wait for sync (debounce + processing)
    await new Promise(resolve => {
      syncLayer.once('sync-complete', resolve);
    });

    // Query entities
    const patterns = await entityQuery.findByType('pattern');

    assert.ok(patterns.length >= 2, 'Should have extracted both patterns');
    assert.ok(
      patterns.some(p => p.name.toLowerCase().includes('write-ahead')),
      'Should include Write-Ahead Log pattern'
    );
    assert.ok(
      patterns.some(p => p.name.toLowerCase().includes('debounce')),
      'Should include Debounce pattern'
    );
  });

  it('should sync decisions.md changes to SQLite accurately', async () => {
    const decisionsFile = path.join(TEST_MEMORY_DIR, 'decisions.md');

    // Write ADR content
    fs.writeFileSync(
      decisionsFile,
      `## [ADR-100] Use file watching for real-time sync\n\nContext: Need to detect file changes immediately\n\nDecision: Use fs.watch() with debouncing`
    );

    // Wait for sync
    await new Promise(resolve => {
      syncLayer.once('sync-complete', resolve);
    });

    // Query entities
    const decisions = await entityQuery.findByType('decision');

    assert.ok(decisions.length >= 1, 'Should have extracted decision');
    assert.ok(
      decisions.some(d => d.id === 'adr-100'),
      'Should have correct ADR ID'
    );
  });

  it('should sync issues.md changes to SQLite accurately', async () => {
    const issuesFile = path.join(TEST_MEMORY_DIR, 'issues.md');

    // Write issue content
    fs.writeFileSync(
      issuesFile,
      `### Issue: Windows file locking\n\nSQLite database remains locked briefly after close on Windows\n\n### Issue: Debounce timing\n\nNeed to tune debounce delay for optimal performance`
    );

    // Wait for sync
    await new Promise(resolve => {
      syncLayer.once('sync-complete', resolve);
    });

    // Query entities
    const issues = await entityQuery.findByType('issue');

    assert.ok(issues.length >= 2, 'Should have extracted both issues');
    assert.ok(
      issues.some(i => i.name.toLowerCase().includes('file locking')),
      'Should include file locking issue'
    );
  });

  it('should handle multiple rapid edits with debouncing', async () => {
    const learningsFile = path.join(TEST_MEMORY_DIR, 'learnings.md');

    // Track sync events
    let syncCount = 0;
    syncLayer.on('sync-complete', () => {
      syncCount++;
    });

    // Rapid edits
    fs.writeFileSync(learningsFile, '### Pattern: Test 1\nContent');
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.writeFileSync(learningsFile, '### Pattern: Test 2\nContent');
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.writeFileSync(learningsFile, '### Pattern: Test 3\nContent');

    // Wait for debounce + sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have debounced to 1-2 syncs (not 3)
    assert.ok(
      syncCount <= 2,
      `Should debounce rapid changes (got ${syncCount} syncs, expected ≤2)`
    );
  });

  it('should emit sync-error event when database is unavailable', async () => {
    // Create sync layer with invalid DB path
    const invalidSync = new SyncLayer({
      memoryDir: TEST_MEMORY_DIR,
      dbPath: '/invalid/path/memory.db',
      debounceMs: 500,
    });

    await invalidSync.start();

    // Wait for error event
    const errorPromise = new Promise(resolve => {
      invalidSync.once('sync-error', data => {
        resolve(data);
      });
    });

    // Trigger sync
    const testFile = path.join(TEST_MEMORY_DIR, 'test-error.md');
    fs.writeFileSync(testFile, '### Pattern: Test\nContent');

    // Wait for error
    const errorData = await errorPromise;

    assert.ok(errorData.error, 'Should emit error message');
    assert.ok(errorData.filePath, 'Should include file path in error');

    await invalidSync.stop();
  });
});
