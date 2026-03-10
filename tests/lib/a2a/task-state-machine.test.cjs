'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { TaskStateMachine } = require('../../../.claude/lib/a2a/task-state-machine.cjs');

describe('TaskStateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new TaskStateMachine();
  });

  describe('createTask()', () => {
    it('returns a task with submitted status and an id', () => {
      const task = sm.createTask({ input: 'hello' });
      assert.ok(typeof task.id === 'string');
      assert.ok(task.id.length > 0);
      assert.equal(task.status, 'submitted');
      assert.ok(task.createdAt);
      assert.deepEqual(task.params, { input: 'hello' });
    });

    it('returns unique ids for each task', () => {
      const a = sm.createTask();
      const b = sm.createTask();
      assert.notEqual(a.id, b.id);
    });

    it('defaults params to empty object when not provided', () => {
      const task = sm.createTask();
      assert.deepEqual(task.params, {});
    });
  });

  describe('transition()', () => {
    it('succeeds for submitted → working', () => {
      const task = sm.createTask();
      const updated = sm.transition(task.id, 'working');
      assert.equal(updated.status, 'working');
    });

    it('succeeds for working → completed', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const updated = sm.transition(task.id, 'completed');
      assert.equal(updated.status, 'completed');
    });

    it('succeeds for working → failed', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const updated = sm.transition(task.id, 'failed');
      assert.equal(updated.status, 'failed');
    });

    it('succeeds for working → input-required → working', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'input-required');
      const updated = sm.transition(task.id, 'working');
      assert.equal(updated.status, 'working');
    });

    it('throws for invalid transition submitted → completed', () => {
      const task = sm.createTask();
      assert.throws(
        () => sm.transition(task.id, 'completed'),
        /Invalid transition from 'submitted' to 'completed'/
      );
    });

    it('throws for transition from terminal state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'completed');
      assert.throws(
        () => sm.transition(task.id, 'working'),
        /Invalid transition from 'completed' to 'working'/
      );
    });

    it('throws for unknown task id', () => {
      assert.throws(() => sm.transition('no-such-id', 'working'), /Task not found/);
    });
  });

  describe('getTask()', () => {
    it('returns the task snapshot for a known id', () => {
      const task = sm.createTask({ x: 1 });
      const retrieved = sm.getTask(task.id);
      assert.equal(retrieved.id, task.id);
      assert.equal(retrieved.status, 'submitted');
    });

    it('returns null for an unknown id', () => {
      const result = sm.getTask('unknown-id');
      assert.equal(result, null);
    });

    it('returns a copy (mutation does not affect stored task)', () => {
      const task = sm.createTask();
      const snapshot = sm.getTask(task.id);
      snapshot.status = 'hacked';
      const snapshot2 = sm.getTask(task.id);
      assert.equal(snapshot2.status, 'submitted');
    });
  });

  describe('cancelTask()', () => {
    it('cancels a task in submitted state', () => {
      const task = sm.createTask();
      const canceled = sm.cancelTask(task.id);
      assert.equal(canceled.status, 'canceled');
    });

    it('cancels a task in working state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const canceled = sm.cancelTask(task.id);
      assert.equal(canceled.status, 'canceled');
    });

    it('throws when task is already in a terminal state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'completed');
      assert.throws(() => sm.cancelTask(task.id), /already in terminal state/);
    });

    it('throws for unknown task id', () => {
      assert.throws(() => sm.cancelTask('unknown-id'), /Task not found/);
    });
  });
});

// ── SQLite persistence tests ─────────────────────────────────────────────────

describe('TaskStateMachine (SQLite persistence)', () => {
  /**
   * Create an in-memory better-sqlite3 database with the migration 002 schema applied.
   * @returns {import('better-sqlite3').Database}
   */
  function makeDb() {
    // Require better-sqlite3 lazily so the in-memory suite can be skipped when
    // the native module is unavailable (e.g. CI without Python/C++ build tools).
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS a2a_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'submitted',
        params TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_a2a_status ON a2a_tasks(status);
    `);
    return db;
  }

  it('createTask persists a row to a2a_tasks', () => {
    const db = makeDb();
    const sm = new TaskStateMachine(db);
    const task = sm.createTask({ foo: 'bar' });

    const row = db.prepare('SELECT * FROM a2a_tasks WHERE id = ?').get(task.id);
    assert.ok(row, 'row should exist in DB');
    assert.equal(row.status, 'submitted');
    assert.equal(JSON.parse(row.params).foo, 'bar');
  });

  it('transition updates the DB row status', () => {
    const db = makeDb();
    const sm = new TaskStateMachine(db);
    const task = sm.createTask();
    sm.transition(task.id, 'working');

    const row = db.prepare('SELECT status FROM a2a_tasks WHERE id = ?').get(task.id);
    assert.equal(row.status, 'working');
  });

  it('restart recovery: tasks from previous session are loaded from DB', () => {
    const db = makeDb();

    // First "server run": create a submitted task
    const sm1 = new TaskStateMachine(db);
    const task = sm1.createTask({ x: 1 });
    assert.equal(sm1.getTask(task.id).status, 'submitted');

    // Second "server run": new state machine on same DB — should restore the task
    const sm2 = new TaskStateMachine(db);
    // submitted tasks are restored without modification
    const restored = sm2.getTask(task.id);
    assert.ok(restored, 'task should be restored');
    assert.equal(restored.status, 'submitted');
  });

  it('orphan recovery: working tasks from prior run are failed on restart', () => {
    const db = makeDb();

    // First "server run": task moves to working but server crashes before completing
    const sm1 = new TaskStateMachine(db);
    const task = sm1.createTask();
    sm1.transition(task.id, 'working');

    // Verify it's working in DB
    const rowBefore = db.prepare('SELECT status FROM a2a_tasks WHERE id = ?').get(task.id);
    assert.equal(rowBefore.status, 'working');

    // Second "server run": orphan recovery should set status to failed
    const sm2 = new TaskStateMachine(db);
    const recovered = sm2.getTask(task.id);
    assert.ok(recovered, 'orphaned task should be in memory');
    assert.equal(recovered.status, 'failed');

    // DB should also reflect failed
    const rowAfter = db.prepare('SELECT status FROM a2a_tasks WHERE id = ?').get(task.id);
    assert.equal(rowAfter.status, 'failed');
  });

  it('orphan recovery: input-required tasks from prior run are failed on restart', () => {
    const db = makeDb();

    const sm1 = new TaskStateMachine(db);
    const task = sm1.createTask();
    sm1.transition(task.id, 'working');
    sm1.transition(task.id, 'input-required');

    const sm2 = new TaskStateMachine(db);
    const recovered = sm2.getTask(task.id);
    assert.ok(recovered, 'orphaned task should be in memory');
    assert.equal(recovered.status, 'failed');
  });

  it('no-db compat: new TaskStateMachine() without db still works in-memory', () => {
    // Existing in-memory behaviour is unaffected when db is omitted
    const sm = new TaskStateMachine();
    const task = sm.createTask({ y: 2 });
    assert.equal(task.status, 'submitted');
    sm.transition(task.id, 'working');
    assert.equal(sm.getTask(task.id).status, 'working');
  });

  it('persistence errors do not crash the state machine (in-memory path unaffected)', () => {
    // Pass a broken db-like object — persistence calls should silently fail
    const brokenDb = {
      prepare: () => {
        throw new Error('DB offline');
      },
    };
    // _restoreFromDb will fail but constructor should not throw
    const sm = new TaskStateMachine(brokenDb);
    // createTask will fail to persist but in-memory task should still be created
    const task = sm.createTask({ z: 3 });
    assert.equal(task.status, 'submitted');
  });
});
