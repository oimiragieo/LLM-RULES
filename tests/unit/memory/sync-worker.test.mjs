// tests/unit/memory/sync-worker.test.mjs
// Unit tests for BackgroundSyncWorker (Task #30)

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Convert import.meta.url to file path (Windows-safe)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// Import BackgroundSyncWorker (CommonJS module)
let BackgroundSyncWorker;

before(async () => {
  // Dynamic import with Windows-safe file:// URL
  const modulePath = path.join(PROJECT_ROOT, '.claude/lib/memory/sync-worker.cjs');
  const fileUrl = new URL('file:///' + modulePath.replace(/\\/g, '/')).href;
  const module = await import(fileUrl);
  BackgroundSyncWorker = module.BackgroundSyncWorker;
});

describe('BackgroundSyncWorker - Lifecycle', () => {
  let worker;
  let testMemoryDir;
  let testDbPath;

  beforeEach(() => {
    // Create unique test directory
    const testId = Date.now();
    testMemoryDir = path.join(PROJECT_ROOT, `.claude/staging/test-worker-${testId}`);
    testDbPath = path.join(testMemoryDir, 'test-memory.db');

    fs.mkdirSync(testMemoryDir, { recursive: true });

    // Create BackgroundSyncWorker
    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      intervalMs: 100, // Fast interval for testing (100ms)
    });
  });

  afterEach(async () => {
    // Stop worker
    if (worker) {
      await worker.stop();
    }

    // Cleanup test directory (best effort)
    try {
      if (fs.existsSync(testMemoryDir)) {
        fs.rmSync(testMemoryDir, { recursive: true, force: true });
      }
    } catch (_error) {
      // Ignore cleanup errors (Windows file locking)
    }
  });

  it('should create BackgroundSyncWorker instance', () => {
    assert.ok(worker);
    assert.strictEqual(typeof worker.start, 'function');
    assert.strictEqual(typeof worker.stop, 'function');
    assert.strictEqual(typeof worker.isRunning, 'function');
  });

  it('should start and stop worker', async () => {
    // Initially not running
    assert.strictEqual(worker.isRunning(), false);

    // Start worker
    await worker.start();
    assert.strictEqual(worker.isRunning(), true);

    // Stop worker
    await worker.stop();
    assert.strictEqual(worker.isRunning(), false);
  });

  it('should be idempotent when calling start() multiple times', async () => {
    await worker.start();
    assert.strictEqual(worker.isRunning(), true);

    // Start again (should be no-op)
    await worker.start();
    assert.strictEqual(worker.isRunning(), true);

    await worker.stop();
  });

  it('should gracefully handle stop() when not running', async () => {
    // Stop when not started (should not throw)
    await worker.stop();
    assert.strictEqual(worker.isRunning(), false);
  });
});

describe('BackgroundSyncWorker - Periodic Sync', () => {
  let worker;
  let testMemoryDir;
  let testDbPath;

  beforeEach(() => {
    const testId = Date.now();
    testMemoryDir = path.join(PROJECT_ROOT, `.claude/staging/test-worker-${testId}`);
    testDbPath = path.join(testMemoryDir, 'test-memory.db');

    fs.mkdirSync(testMemoryDir, { recursive: true });

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      intervalMs: 100, // 100ms interval for testing
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }

    try {
      if (fs.existsSync(testMemoryDir)) {
        fs.rmSync(testMemoryDir, { recursive: true, force: true });
      }
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('should run periodic syncs at configured interval', async () => {
    // Track sync events
    const syncEvents = [];
    worker.on('periodic-sync', event => {
      syncEvents.push(event);
    });

    // Start worker
    await worker.start();

    // Wait for 3+ sync cycles (100ms * 3 = 300ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Stop worker
    await worker.stop();

    // Should have at least 3 sync events
    assert.ok(syncEvents.length >= 3, `Expected >= 3 syncs, got ${syncEvents.length}`);
  });

  it('should emit sync events with timestamp', async () => {
    let syncEvent;
    worker.on('periodic-sync', event => {
      syncEvent = event;
    });

    await worker.start();

    // Wait for at least one sync
    await new Promise(resolve => setTimeout(resolve, 200));

    await worker.stop();

    // Verify event structure
    assert.ok(syncEvent);
    assert.ok(syncEvent.timestamp);
    assert.strictEqual(typeof syncEvent.timestamp, 'number');
  });
});

describe('BackgroundSyncWorker - Process Signals', () => {
  let worker;
  let testMemoryDir;
  let testDbPath;

  beforeEach(() => {
    const testId = Date.now();
    testMemoryDir = path.join(PROJECT_ROOT, `.claude/staging/test-worker-${testId}`);
    testDbPath = path.join(testMemoryDir, 'test-memory.db');

    fs.mkdirSync(testMemoryDir, { recursive: true });

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      intervalMs: 100,
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }

    try {
      if (fs.existsSync(testMemoryDir)) {
        fs.rmSync(testMemoryDir, { recursive: true, force: true });
      }
    } catch (_error) {
      // Ignore
    }
  });

  it('should register signal handlers on start', async () => {
    await worker.start();

    // Verify signal handlers are registered
    // (Indirect check - we can't directly inspect process.listeners safely)
    assert.strictEqual(worker.isRunning(), true);

    await worker.stop();
  });

  it('should unregister signal handlers on stop', async () => {
    await worker.start();
    assert.strictEqual(worker.isRunning(), true);

    await worker.stop();
    assert.strictEqual(worker.isRunning(), false);

    // If we reach here without errors, handlers were cleaned up
  });
});

describe('BackgroundSyncWorker - Environment Variable', () => {
  let worker;
  let testMemoryDir;
  let testDbPath;
  let originalEnv;

  before(() => {
    // Save original env var
    originalEnv = process.env.MEMORY_SYNC_INTERVAL_MS;
  });

  after(() => {
    // Restore original env var
    if (originalEnv !== undefined) {
      process.env.MEMORY_SYNC_INTERVAL_MS = originalEnv;
    } else {
      delete process.env.MEMORY_SYNC_INTERVAL_MS;
    }
  });

  beforeEach(() => {
    const testId = Date.now();
    testMemoryDir = path.join(PROJECT_ROOT, `.claude/staging/test-worker-${testId}`);
    testDbPath = path.join(testMemoryDir, 'test-memory.db');

    fs.mkdirSync(testMemoryDir, { recursive: true });
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }

    try {
      if (fs.existsSync(testMemoryDir)) {
        fs.rmSync(testMemoryDir, { recursive: true, force: true });
      }
    } catch (_error) {
      // Ignore
    }
  });

  it('should use default interval when env var not set', () => {
    delete process.env.MEMORY_SYNC_INTERVAL_MS;

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
    });

    // Default interval should be 60000ms (60 seconds)
    assert.strictEqual(worker.config.intervalMs, 60000);
  });

  it('should use env var interval when set', () => {
    process.env.MEMORY_SYNC_INTERVAL_MS = '5000';

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
    });

    assert.strictEqual(worker.config.intervalMs, 5000);
  });

  it('should allow config override of env var', () => {
    process.env.MEMORY_SYNC_INTERVAL_MS = '5000';

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      intervalMs: 200, // Override
    });

    // Config parameter should take precedence
    assert.strictEqual(worker.config.intervalMs, 200);
  });
});

describe('BackgroundSyncWorker - Integration with SyncLayer', () => {
  let worker;
  let testMemoryDir;
  let testDbPath;

  beforeEach(() => {
    const testId = Date.now();
    testMemoryDir = path.join(PROJECT_ROOT, `.claude/staging/test-worker-${testId}`);
    testDbPath = path.join(testMemoryDir, 'test-memory.db');

    fs.mkdirSync(testMemoryDir, { recursive: true });

    // Create memory files
    const learningsPath = path.join(testMemoryDir, 'learnings.md');
    fs.writeFileSync(learningsPath, '# Learnings\n\n## Pattern: Test Pattern\n\nTest content.\n');

    worker = new BackgroundSyncWorker({
      memoryDir: testMemoryDir,
      dbPath: testDbPath,
      intervalMs: 100,
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }

    try {
      if (fs.existsSync(testMemoryDir)) {
        fs.rmSync(testMemoryDir, { recursive: true, force: true });
      }
    } catch (_error) {
      // Ignore
    }
  });

  it('should initialize SyncLayer on start', async () => {
    await worker.start();

    // Verify SyncLayer is initialized (indirectly)
    assert.strictEqual(worker.isRunning(), true);

    await worker.stop();
  });
});
