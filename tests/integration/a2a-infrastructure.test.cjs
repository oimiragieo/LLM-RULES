'use strict';

/**
 * A2A Infrastructure Integration Tests
 * =====================================
 *
 * VAL-E2E-005: Dispatcher-to-Collector Round Trip
 *   Full WorkerPool pipeline using real in-memory SQLite with queue schema.
 *   BudgetEnforcementService with defaults, WorkerPool with mock processFn.
 *   Enqueue message, wake dispatcher, assert round-trip completes within 5s.
 *
 * VAL-E2E-006: Task State Machine Recovery on Restart
 *   TaskStateMachine orphan recovery: create two tasks (one working, one completed),
 *   simulate crash (destroy instance, keep db), restore with new TSM,
 *   verify working task fails with orphaned error and completed task is absent.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const Database = require('better-sqlite3');

const { enqueueMessage } = require('../../.claude/lib/db/queue-operations.cjs');
const { BudgetEnforcementService } = require('../../.claude/lib/workers/budget-enforcement.cjs');
const { WorkerPool } = require('../../.claude/lib/workers/worker-pool.cjs');
const { emitNewMessage } = require('../../.claude/lib/workers/dispatcher.cjs');
const { TaskStateMachine } = require('../../.claude/lib/a2a/task-state-machine.cjs');

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

/** SQL for message_queue table (from 001-initial-schema.sql) */
const MIGRATION_001_SQL = fs.readFileSync(
  path.join(__dirname, '../../.claude/lib/db/migrations/001-initial-schema.sql'),
  'utf8'
);

/** SQL for a2a_tasks table (from 002-a2a-tasks.sql) */
const MIGRATION_002_SQL = fs.readFileSync(
  path.join(__dirname, '../../.claude/lib/db/migrations/002-a2a-tasks.sql'),
  'utf8'
);

/**
 * Create an in-memory SQLite DB with the message_queue schema applied.
 * @returns {import('better-sqlite3').Database}
 */
function createQueueDb() {
  const db = new Database(':memory:');
  db.exec(MIGRATION_001_SQL);
  return db;
}

/**
 * Create an in-memory SQLite DB with the a2a_tasks schema applied.
 * @returns {import('better-sqlite3').Database}
 */
function createA2aDb() {
  const db = new Database(':memory:');
  db.exec(MIGRATION_002_SQL);
  return db;
}

// ---------------------------------------------------------------------------
// VAL-E2E-005: Dispatcher-to-Collector Round Trip
// ---------------------------------------------------------------------------

describe('VAL-E2E-005: Dispatcher-to-Collector Round Trip', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {BudgetEnforcementService} */
  let budget;
  /** @type {WorkerPool} */
  let pool;
  /** Tracks how many times processFn was called */
  let processFnCalls = 0;
  /** Captured message ID from enqueueMessage */
  let enqueuedId = null;
  /** Captured worker-done payload (prefixed _ to satisfy no-unused-vars rule) */
  let _donePayload = null;

  /**
   * Mock processFn: records the call and resolves after 100ms.
   * Returns { result: 'ok' } to simulate a successful worker.
   *
   * @param {object} _row - Claimed message row from the DB
   * @returns {Promise<{result: string}>}
   */
  const processFn = async (_row) => {
    processFnCalls++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { result: 'ok' };
  };

  before(() => {
    db = createQueueDb();
    budget = new BudgetEnforcementService(); // default: maxConcurrentWorkers=3, maxTPM=400000

    pool = new WorkerPool({
      db,
      budget,
      concurrency: 3,
      processFn,
      staleThresholdMs: 300000,
      heartbeatIntervalMs: 30000,
      // Long fail-safe interval to prevent it from interfering during the test
      failSafeIntervalMs: 60000,
    });

    pool.start();
  });

  after(() => {
    pool.stop();
    db.close();
  });

  it('waitForResult resolves within 5 seconds', async () => {
    // Enqueue the message into the SQLite DB
    const msg = enqueueMessage(db, {
      chatId: 'test-chat-e2e-005',
      userId: 'test-user',
      text: 'hello a2a integration test',
    });
    enqueuedId = msg.id;

    // Register listener BEFORE waking the dispatcher to avoid missing the event
    const workerDonePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout: worker-done event not received within 5 seconds'));
      }, 5000);

      pool.once('worker-done', (payload) => {
        clearTimeout(timer);
        _donePayload = payload;
        resolve(payload);
      });
    });

    // Wake the dispatcher so it claims the pending message immediately
    emitNewMessage(enqueuedId);

    // Await resolution (should complete within 5s)
    const payload = await workerDonePromise;

    assert.ok(payload, 'worker-done payload should be defined');
    assert.strictEqual(
      payload.id,
      enqueuedId,
      'worker-done payload id should match the enqueued message id'
    );
  });

  it('processFn was called exactly once', () => {
    assert.strictEqual(processFnCalls, 1, 'processFn should have been called exactly once');
  });

  it('BudgetEnforcementService reports concurrentCount === 0 after completion', () => {
    const stats = budget.getStats();
    assert.strictEqual(
      stats.concurrentCount,
      0,
      `Budget should report 0 concurrent workers after completion, got ${stats.concurrentCount}`
    );
  });

  it('SQLite row status is completed after processing', () => {
    assert.ok(enqueuedId, 'enqueuedId must be set by prior test');
    const row = db
      .prepare('SELECT id, status FROM message_queue WHERE id = ?')
      .get(enqueuedId);
    assert.ok(row, 'Message row should exist in the DB');
    assert.strictEqual(
      row.status,
      'completed',
      `DB row status should be 'completed', got '${row.status}'`
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-E2E-006: Task State Machine Recovery on Restart
// ---------------------------------------------------------------------------

describe('VAL-E2E-006: Task State Machine Recovery on Restart', () => {
  /** Shared SQLite DB — both TSM instances use this same connection */
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** ID of Task-A (working at crash time) */
  let taskAId;
  /** ID of Task-B (completed before crash) */
  let taskBId;
  /** Second TSM instance (post-restart) — used for all assertions */
  /** @type {TaskStateMachine} */
  let tsm2;

  before(() => {
    db = createA2aDb();

    // ── First TSM instance: simulates original server run ──────────────────
    const tsm1 = new TaskStateMachine(db);

    // Task-A: submitted → working (will be orphaned by crash)
    const taskA = tsm1.createTask({ label: 'task-a' });
    taskAId = taskA.id;
    tsm1.transition(taskAId, 'working');

    // Task-B: submitted → working → completed (gracefully finished before crash)
    const taskB = tsm1.createTask({ label: 'task-b' });
    taskBId = taskB.id;
    tsm1.transition(taskBId, 'working');
    tsm1.transition(taskBId, 'completed');

    // Simulate crash: stop watchdog so the interval doesn't keep the process alive
    tsm1.stopWatchdog();
    // tsm1 is now effectively discarded; the db object is kept alive

    // ── Second TSM instance: simulates server restart with same db ─────────
    // The constructor calls _restoreFromDb(), which:
    //   - Reads non-terminal rows (Task-A in 'working' state)
    //   - Marks orphaned working tasks as 'failed' with 'orphaned: server restarted...'
    //   - Does NOT load terminal rows (Task-B in 'completed' state)
    tsm2 = new TaskStateMachine(db);
  });

  after(() => {
    // Stop watchdog to prevent open handles that would keep the process alive
    if (tsm2) {
      tsm2.stopWatchdog();
    }
    db.close();
  });

  it('Task-A in-memory status is failed after orphan recovery', () => {
    const taskA = tsm2.getTask(taskAId);
    assert.ok(taskA, 'Task-A should be present in restored TSM (orphaned tasks are loaded)');
    assert.strictEqual(
      taskA.status,
      'failed',
      `Task-A status should be 'failed' after orphan recovery, got '${taskA.status}'`
    );
  });

  it('Task-A DB row has failed status with orphaned error message', () => {
    const row = db
      .prepare('SELECT status, error FROM a2a_tasks WHERE id = ?')
      .get(taskAId);
    assert.ok(row, 'Task-A DB row should exist');
    assert.strictEqual(
      row.status,
      'failed',
      `Task-A DB row status should be 'failed', got '${row.status}'`
    );
    assert.ok(
      typeof row.error === 'string' && row.error.includes('orphaned'),
      `Task-A DB row error should contain 'orphaned', got: '${row.error}'`
    );
  });

  it('Task-B is absent from memory after recovery (completed tasks not restored)', () => {
    const taskB = tsm2.getTask(taskBId);
    assert.strictEqual(
      taskB,
      null,
      'Task-B (completed) should not be in restored TSM memory — completed tasks are not loaded'
    );
  });

  it('no tasks remain in working state after restore', () => {
    const allTasks = tsm2.listTasks();
    const workingTasks = allTasks.filter((t) => t.status === 'working');
    assert.strictEqual(
      workingTasks.length,
      0,
      `No tasks should be in 'working' state after restore, found ${workingTasks.length}: ${JSON.stringify(workingTasks)}`
    );
  });
});
