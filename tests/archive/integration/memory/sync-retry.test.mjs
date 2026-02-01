// tests/integration/memory/sync-retry.test.mjs
// Integration tests for SyncLayer retry logic with exponential backoff (Task #33)

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// Import SyncLayer and database initialization
const { SyncLayer } = require(path.join(projectRoot, '.claude/lib/memory/sync-layer.cjs'));
const { initializeDatabase } = require(
  path.join(projectRoot, '.claude/tools/cli/init-memory-db.cjs')
);

describe('SyncLayer Retry Logic (Integration)', () => {
  let testCounter = 0;
  let testMemoryDir;
  let testDbPath;
  let syncLayer;

  beforeEach(async () => {
    // Create unique test directory per test
    testCounter++;
    testMemoryDir = path.join(projectRoot, `.claude/staging/memory-test-retry-${testCounter}`);
    testDbPath = path.join(testMemoryDir, 'memory.db');

    // Ensure test directory exists
    if (!fs.existsSync(testMemoryDir)) {
      fs.mkdirSync(testMemoryDir, { recursive: true });
    }

    // Initialize database schema
    await initializeDatabase(testDbPath);
  });

  after(async () => {
    // Best-effort cleanup - Windows file locking may prevent immediate deletion
    try {
      if (syncLayer) {
        await syncLayer.stop();
      }
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('should succeed on first attempt (no retry)', async () => {
    // Create test file
    const testFile = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(testFile, `# Learnings\n\n### Pattern: Test Pattern\n\nTest content.\n`);

    syncLayer = new SyncLayer({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      debounceMs: 100,
    });

    await syncLayer.start();

    // Call syncChanges directly
    let syncCompleteEmitted = false;
    syncLayer.once('sync-complete', () => {
      syncCompleteEmitted = true;
    });

    await syncLayer.syncChanges(testFile);

    // Verify sync completed
    assert.strictEqual(syncCompleteEmitted, true, 'sync-complete event should be emitted');
  });

  it('should retry on transient error and eventually succeed', async () => {
    // Create test file
    const testFile = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(testFile, `# Learnings\n\n### Pattern: Retry Test\n\nRetry content.\n`);

    syncLayer = new SyncLayer({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      debounceMs: 100,
    });

    await syncLayer.start();

    // Mock extractor to fail first 2 attempts
    let attempts = 0;
    const originalExtractFromFile = syncLayer.extractor.extractFromFile.bind(syncLayer.extractor);
    syncLayer.extractor.extractFromFile = async filePath => {
      attempts++;
      if (attempts < 3) {
        const error = new Error('Database locked');
        error.code = 'EBUSY';
        throw error;
      }
      // Success on 3rd attempt
      return originalExtractFromFile(filePath);
    };

    // Call syncChanges
    let syncCompleteEmitted = false;
    syncLayer.once('sync-complete', () => {
      syncCompleteEmitted = true;
    });

    await syncLayer.syncChanges(testFile);

    // Verify retried 3 times and succeeded
    assert.strictEqual(attempts, 3, 'Should retry until success');
    assert.strictEqual(syncCompleteEmitted, true, 'sync-complete should be emitted after retries');
  });

  it('should emit sync-error after max retries', async () => {
    // Create test file
    const testFile = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(testFile, `# Learnings\n\n### Pattern: Max Retries Test\n\nContent.\n`);

    syncLayer = new SyncLayer({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      debounceMs: 100,
    });

    await syncLayer.start();

    // Mock extractor to always fail with transient error
    let attempts = 0;
    syncLayer.extractor.extractFromFile = async () => {
      attempts++;
      const error = new Error('Always busy');
      error.code = 'EBUSY';
      throw error;
    };

    // Call syncChanges
    let syncErrorEmitted = false;
    let errorMessage;
    syncLayer.once('sync-error', data => {
      syncErrorEmitted = true;
      errorMessage = data.error;
    });

    await syncLayer.syncChanges(testFile);

    // Verify max retries (6 attempts: 1 + 5 retries)
    assert.strictEqual(attempts, 6, 'Should attempt 6 times (1 + 5 retries)');
    assert.strictEqual(syncErrorEmitted, true, 'sync-error should be emitted after max retries');
    assert.strictEqual(errorMessage, 'Always busy', 'Error message should match');
  });

  it('should not retry on permanent error (ENOENT)', async () => {
    // Create test file
    const testFile = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(testFile, `# Learnings\n\n### Pattern: Permanent Error\n\nContent.\n`);

    syncLayer = new SyncLayer({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      debounceMs: 100,
    });

    await syncLayer.start();

    // Mock extractor to fail with permanent error
    let attempts = 0;
    syncLayer.extractor.extractFromFile = async () => {
      attempts++;
      const error = new Error('File not found');
      error.code = 'ENOENT';
      throw error;
    };

    // Call syncChanges
    let syncErrorEmitted = false;
    syncLayer.once('sync-error', () => {
      syncErrorEmitted = true;
    });

    await syncLayer.syncChanges(testFile);

    // Verify no retries on permanent error
    assert.strictEqual(attempts, 1, 'Should not retry on permanent error');
    assert.strictEqual(syncErrorEmitted, true, 'sync-error should be emitted immediately');
  });

  it('should use exponential backoff delays', async () => {
    // Create test file
    const testFile = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(testFile, `# Learnings\n\n### Pattern: Backoff Test\n\nContent.\n`);

    syncLayer = new SyncLayer({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      debounceMs: 100,
    });

    await syncLayer.start();

    // Mock extractor to fail 3 times
    let attempts = 0;
    const originalExtractFromFile = syncLayer.extractor.extractFromFile.bind(syncLayer.extractor);
    syncLayer.extractor.extractFromFile = async filePath => {
      attempts++;
      if (attempts < 4) {
        const error = new Error('EAGAIN');
        error.code = 'EAGAIN';
        throw error;
      }
      return originalExtractFromFile(filePath);
    };

    const startTime = Date.now();
    await syncLayer.syncChanges(testFile);
    const totalTime = Date.now() - startTime;

    // With default baseDelay 1000ms: 1000 + 2000 + 4000 = 7000ms minimum
    assert.ok(
      totalTime >= 7000,
      `Total time ${totalTime}ms should be >= 7000ms for exponential backoff`
    );
    assert.strictEqual(attempts, 4, 'Should have 4 attempts (1 + 3 retries)');
  });
});
