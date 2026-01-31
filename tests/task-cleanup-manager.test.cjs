/**
 * Task Cleanup Manager Test Suite
 *
 * Tests for the TaskCleanupManager class that automatically cleans up
 * completed and stale tasks to prevent memory leaks.
 *
 * Test Categories:
 * 1. Configuration (4 tests) - Constructor, environment variables
 * 2. Task Store (5 tests) - Add, update, internal store operations
 * 3. Cleanup Logic (8 tests) - Retention, status filtering, batch cleanup
 * 4. Events (4 tests) - Event emission for cleanup operations
 * 5. Statistics (3 tests) - Stats tracking and reporting
 * 6. Lifecycle (3 tests) - Start, stop, reset
 *
 * Total: 27 tests
 */

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');

const TaskCleanupManager = require('../.claude/lib/workflow/task-cleanup-manager.cjs');
const { getGlobalManager, resetGlobalManager, DEFAULTS, CLEANABLE_STATUSES } = TaskCleanupManager;

describe('TaskCleanupManager - Category 1: Configuration (4 tests)', () => {
  afterEach(() => {
    resetGlobalManager();
    delete process.env.TASK_CLEANUP_RETENTION_MS;
    delete process.env.TASK_CLEANUP_INTERVAL_MS;
    delete process.env.TASK_CLEANUP_BATCH_SIZE;
  });

  it('should create with default configuration', () => {
    const manager = new TaskCleanupManager();

    assert.strictEqual(manager.retentionMs, DEFAULTS.retentionMs);
    assert.strictEqual(manager.interval, DEFAULTS.interval);
    assert.strictEqual(manager.batchSize, DEFAULTS.batchSize);
  });

  it('should accept custom configuration', () => {
    const manager = new TaskCleanupManager({
      retentionMs: 60000,
      interval: 30000,
      batchSize: 50,
    });

    assert.strictEqual(manager.retentionMs, 60000);
    assert.strictEqual(manager.interval, 30000);
    assert.strictEqual(manager.batchSize, 50);
  });

  it('should read configuration from environment variables', () => {
    process.env.TASK_CLEANUP_RETENTION_MS = '120000';
    process.env.TASK_CLEANUP_INTERVAL_MS = '45000';
    process.env.TASK_CLEANUP_BATCH_SIZE = '75';

    const manager = new TaskCleanupManager();

    assert.strictEqual(manager.retentionMs, 120000);
    assert.strictEqual(manager.interval, 45000);
    assert.strictEqual(manager.batchSize, 75);
  });

  it('should define CLEANABLE_STATUSES', () => {
    assert.ok(Array.isArray(CLEANABLE_STATUSES));
    assert.ok(CLEANABLE_STATUSES.includes('completed'));
    assert.ok(CLEANABLE_STATUSES.includes('failed'));
    assert.ok(CLEANABLE_STATUSES.includes('cancelled'));
    assert.ok(CLEANABLE_STATUSES.includes('deleted'));
    assert.ok(!CLEANABLE_STATUSES.includes('in_progress'));
    assert.ok(!CLEANABLE_STATUSES.includes('pending'));
  });
});

describe('TaskCleanupManager - Category 2: Task Store (5 tests)', () => {
  let manager;

  beforeEach(() => {
    manager = new TaskCleanupManager();
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.clearTaskStore();
    }
  });

  it('should add task to internal store', () => {
    manager.addTask({ id: 'task-1', status: 'pending' });

    const stats = manager.getStats();
    assert.strictEqual(stats.taskStoreSize, 1);
  });

  it('should throw error when adding task without id', () => {
    assert.throws(() => {
      manager.addTask({ status: 'pending' });
    }, /Task must have an id/);
  });

  it('should add createdAt if not provided', async () => {
    const before = Date.now();
    manager.addTask({ id: 'task-1', status: 'pending' });
    const after = Date.now();

    const tasks = await manager.getTaskList();
    const task = tasks.find(t => t.id === 'task-1');

    assert.ok(task.createdAt >= before);
    assert.ok(task.createdAt <= after);
  });

  it('should update existing task', async () => {
    manager.addTask({ id: 'task-1', status: 'pending' });
    manager.updateTask('task-1', { status: 'completed', completedAt: Date.now() });

    const tasks = await manager.getTaskList();
    const task = tasks.find(t => t.id === 'task-1');

    assert.strictEqual(task.status, 'completed');
    assert.ok(task.completedAt);
  });

  it('should clear task store', async () => {
    manager.addTask({ id: 'task-1', status: 'pending' });
    manager.addTask({ id: 'task-2', status: 'pending' });

    assert.strictEqual(manager.getStats().taskStoreSize, 2);

    manager.clearTaskStore();

    assert.strictEqual(manager.getStats().taskStoreSize, 0);
  });
});

describe('TaskCleanupManager - Category 3: Cleanup Logic (8 tests)', () => {
  let manager;

  beforeEach(() => {
    // Use very short retention for testing
    manager = new TaskCleanupManager({
      retentionMs: 100, // 100ms retention
      interval: 60000, // Long interval (we'll call manually)
      batchSize: 10,
    });
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.clearTaskStore();
    }
  });

  it('should not clean up tasks within retention period', async () => {
    const now = Date.now();
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: now, // Just completed
    });

    const result = await manager.runCleanup();

    assert.strictEqual(result.count, 0);
    assert.strictEqual(manager.getStats().taskStoreSize, 1);
  });

  it('should clean up tasks older than retention period', async () => {
    const oldTime = Date.now() - 200; // 200ms ago (older than 100ms retention)
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: oldTime,
    });

    const result = await manager.runCleanup();

    assert.strictEqual(result.count, 1);
    assert.strictEqual(manager.getStats().taskStoreSize, 0);
  });

  it('should only clean up tasks with cleanable statuses', async () => {
    const oldTime = Date.now() - 200;

    manager.addTask({ id: 'task-completed', status: 'completed', completedAt: oldTime });
    manager.addTask({ id: 'task-failed', status: 'failed', completedAt: oldTime });
    manager.addTask({ id: 'task-pending', status: 'pending', createdAt: oldTime });
    manager.addTask({ id: 'task-progress', status: 'in_progress', createdAt: oldTime });

    const result = await manager.runCleanup();

    assert.strictEqual(result.count, 2); // Only completed and failed
    assert.strictEqual(manager.getStats().taskStoreSize, 2); // pending and in_progress remain
  });

  it('should respect batch size limit', async () => {
    const oldTime = Date.now() - 200;

    // Add 15 completed tasks
    for (let i = 0; i < 15; i++) {
      manager.addTask({
        id: `task-${i}`,
        status: 'completed',
        completedAt: oldTime,
      });
    }

    const result = await manager.runCleanup();

    // Should only clean up batchSize (10) tasks
    assert.strictEqual(result.count, 10);
    assert.strictEqual(result.eligible, 15);
    assert.strictEqual(manager.getStats().taskStoreSize, 5);
  });

  it('should return cleanup details in result', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({ id: 'task-1', status: 'completed', completedAt: oldTime });

    const result = await manager.runCleanup();

    assert.ok(result.count >= 0);
    assert.ok(Array.isArray(result.tasks));
    assert.ok(result.duration >= 0);
    assert.ok(result.timestamp);

    if (result.count > 0) {
      assert.ok(result.tasks[0].id);
      assert.ok(result.tasks[0].status);
      assert.ok(result.tasks[0].age >= 0);
    }
  });

  it('should use completedAt for age calculation', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: oldTime,
      createdAt: Date.now() - 1000, // Created much earlier
    });

    const result = await manager.runCleanup();

    assert.strictEqual(result.count, 1);
    // Age should be based on completedAt, not createdAt
    assert.ok(result.tasks[0].age >= 200 && result.tasks[0].age < 1000);
  });

  it('should fall back to updatedAt then createdAt', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      updatedAt: oldTime,
      // No completedAt
    });

    const result = await manager.runCleanup();
    assert.strictEqual(result.count, 1);
  });

  it('should handle force cleanup (bypass retention)', async () => {
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: Date.now(), // Just completed
    });

    // Normal cleanup won't remove it
    const result = await manager.runCleanup();
    assert.strictEqual(result.count, 0);

    // Force cleanup will remove it
    const removed = await manager.forceCleanup('task-1');
    assert.strictEqual(removed, true);
    assert.strictEqual(manager.getStats().taskStoreSize, 0);
  });
});

describe('TaskCleanupManager - Category 4: Events (4 tests)', () => {
  let manager;

  beforeEach(() => {
    manager = new TaskCleanupManager({ retentionMs: 100 });
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.clearTaskStore();
    }
  });

  it('should emit cleanup event after cleanup cycle', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({ id: 'task-1', status: 'completed', completedAt: oldTime });

    let eventData = null;
    manager.on('cleanup', (data) => {
      eventData = data;
    });

    await manager.runCleanup();

    assert.ok(eventData !== null);
    assert.strictEqual(eventData.count, 1);
    assert.ok(eventData.timestamp);
  });

  it('should emit forceCleanup event', async () => {
    manager.addTask({ id: 'task-1', status: 'completed' });

    let eventData = null;
    manager.on('forceCleanup', (data) => {
      eventData = data;
    });

    await manager.forceCleanup('task-1');

    assert.ok(eventData !== null);
    assert.strictEqual(eventData.taskId, 'task-1');
  });

  it('should emit error event on cleanup failure', async () => {
    // Create manager with failing getTaskList
    const failingManager = new TaskCleanupManager({
      getTaskList: async () => {
        throw new Error('Database connection failed');
      },
    });

    let errorData = null;
    failingManager.on('error', (data) => {
      errorData = data;
    });

    await failingManager.runCleanup();

    assert.ok(errorData !== null);
    assert.ok(errorData.error.includes('Database connection failed'));
  });

  it('should support removing listeners with off()', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({ id: 'task-1', status: 'completed', completedAt: oldTime });

    let count = 0;
    const listener = () => { count++; };

    manager.on('cleanup', listener);
    await manager.runCleanup();
    assert.strictEqual(count, 1);

    manager.off('cleanup', listener);
    manager.addTask({ id: 'task-2', status: 'completed', completedAt: oldTime });
    await manager.runCleanup();
    assert.strictEqual(count, 1); // Should not increment
  });
});

describe('TaskCleanupManager - Category 5: Statistics (3 tests)', () => {
  let manager;

  beforeEach(() => {
    manager = new TaskCleanupManager({ retentionMs: 100 });
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.clearTaskStore();
    }
  });

  it('should track cleanup statistics', async () => {
    const oldTime = Date.now() - 200;
    manager.addTask({ id: 'task-1', status: 'completed', completedAt: oldTime });
    manager.addTask({ id: 'task-2', status: 'completed', completedAt: oldTime });

    await manager.runCleanup();

    const stats = manager.getStats();

    assert.strictEqual(stats.totalCleaned, 2);
    assert.ok(stats.lastCleanupTime);
    assert.strictEqual(stats.lastCleanupCount, 2);
    assert.strictEqual(stats.cleanupCycles, 1);
  });

  it('should accumulate statistics across cycles', async () => {
    const oldTime = Date.now() - 200;

    manager.addTask({ id: 'task-1', status: 'completed', completedAt: oldTime });
    await manager.runCleanup();

    manager.addTask({ id: 'task-2', status: 'completed', completedAt: oldTime });
    await manager.runCleanup();

    const stats = manager.getStats();

    assert.strictEqual(stats.totalCleaned, 2);
    assert.strictEqual(stats.cleanupCycles, 2);
  });

  it('should generate status string', () => {
    const status = manager.getStatusString();

    assert.ok(typeof status === 'string');
    assert.ok(status.includes('Status:'));
    assert.ok(status.includes('Total cleaned:'));
    assert.ok(status.includes('Last cleanup:'));
    assert.ok(status.includes('Cycles:'));
  });
});

describe('TaskCleanupManager - Category 6: Lifecycle (3 tests)', () => {
  let manager;

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.clearTaskStore();
    }
    resetGlobalManager();
  });

  it('should start and stop correctly', async () => {
    manager = new TaskCleanupManager({ interval: 50, retentionMs: 10 });

    // Add a task that will be eligible for cleanup
    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: Date.now() - 100,
    });

    assert.strictEqual(manager.isRunning, false);

    manager.start();
    assert.strictEqual(manager.isRunning, true);

    // Wait for cleanup to run
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(manager.getStats().cleanupCycles >= 1);

    manager.stop();
    assert.strictEqual(manager.isRunning, false);

    const cyclesBefore = manager.getStats().cleanupCycles;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(manager.getStats().cleanupCycles, cyclesBefore);
  });

  it('should reset statistics', async () => {
    manager = new TaskCleanupManager({ retentionMs: 100 });

    manager.addTask({
      id: 'task-1',
      status: 'completed',
      completedAt: Date.now() - 200,
    });
    await manager.runCleanup();

    assert.ok(manager.getStats().totalCleaned > 0);

    manager.resetStats();

    const stats = manager.getStats();
    assert.strictEqual(stats.totalCleaned, 0);
    assert.strictEqual(stats.lastCleanupTime, null);
    assert.strictEqual(stats.cleanupCycles, 0);
  });

  it('should support global singleton pattern', () => {
    const manager1 = getGlobalManager({ retentionMs: 10000 });
    const manager2 = getGlobalManager({ retentionMs: 20000 }); // Config ignored

    assert.strictEqual(manager1, manager2);
    assert.strictEqual(manager1.retentionMs, 10000);

    resetGlobalManager();

    const manager3 = getGlobalManager({ retentionMs: 30000 });
    assert.notStrictEqual(manager1, manager3);
    assert.strictEqual(manager3.retentionMs, 30000);
  });
});

describe('TaskCleanupManager - Custom Task Access', () => {
  it('should support custom getTaskList and removeTask functions', async () => {
    const externalStore = new Map();
    externalStore.set('ext-1', { id: 'ext-1', status: 'completed', completedAt: Date.now() - 200 });
    externalStore.set('ext-2', { id: 'ext-2', status: 'pending', createdAt: Date.now() });

    const manager = new TaskCleanupManager({
      retentionMs: 100,
      getTaskList: async () => Array.from(externalStore.values()),
      removeTask: async (taskId) => externalStore.delete(taskId),
    });

    const result = await manager.runCleanup();

    assert.strictEqual(result.count, 1);
    assert.strictEqual(externalStore.size, 1);
    assert.ok(externalStore.has('ext-2'));
    assert.ok(!externalStore.has('ext-1'));

    manager.stop();
  });
});
