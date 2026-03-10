#!/usr/bin/env node
'use strict';

/**
 * A2A Task State Machine
 * ======================
 * Manages A2A task lifecycle with validated state transitions.
 *
 * States: submitted → working → completed | failed | canceled
 *         working → input-required → working
 *
 * Persistence (optional): pass a better-sqlite3 db instance to the constructor.
 * When db is provided:
 *   - createTask() inserts into a2a_tasks
 *   - transition() updates a2a_tasks
 *   - On construction, non-terminal rows are restored from DB (orphan recovery)
 * Persistence errors are logged but never block the in-memory path.
 */

const crypto = require('crypto');

// Valid state transitions: key = from-state, value = set of allowed to-states
const VALID_TRANSITIONS = {
  submitted: new Set(['working', 'canceled']),
  working: new Set(['completed', 'failed', 'input-required', 'canceled']),
  'input-required': new Set(['working', 'canceled']),
  completed: new Set(),
  failed: new Set(),
  canceled: new Set(),
};

const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

class TaskStateMachine {
  /**
   * @param {import('better-sqlite3').Database|null} [db] - Optional SQLite db instance.
   *   When provided, task state is persisted to the a2a_tasks table.
   *   Migration 002-a2a-tasks.sql must have been applied before passing db.
   */
  constructor(db = null) {
    /** @type {Map<string, object>} */
    this._tasks = new Map();
    /** @type {import('better-sqlite3').Database|null} */
    this._db = db || null;

    if (this._db) {
      this._restoreFromDb();
    }
  }

  // ── Persistence helpers ──────────────────────────────────────────────────

  /**
   * INSERT a new task row. Errors are logged, never thrown.
   * @param {object} task
   */
  _persistCreate(task) {
    if (!this._db) return;
    try {
      this._db
        .prepare(
          `INSERT INTO a2a_tasks (id, status, params, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(task.id, task.status, JSON.stringify(task.params), task.createdAt, task.updatedAt);
    } catch (err) {
      process.stderr.write(`[TaskStateMachine] _persistCreate error: ${err.message}\n`);
    }
  }

  /**
   * UPDATE status (and optionally error) for an existing task row.
   * @param {string} id
   * @param {string} status
   * @param {string|null} [error]
   */
  _persistTransition(id, status, error = null) {
    if (!this._db) return;
    try {
      const now = new Date().toISOString();
      this._db
        .prepare(
          `UPDATE a2a_tasks
           SET status = ?, updated_at = ?, error = ?
           WHERE id = ?`
        )
        .run(status, now, error, id);
    } catch (err) {
      process.stderr.write(`[TaskStateMachine] _persistTransition error: ${err.message}\n`);
    }
  }

  /**
   * Restore non-terminal tasks from DB on startup.
   * Tasks in 'working' or 'input-required' state are considered orphaned
   * (server crashed mid-task) and are transitioned to 'failed'.
   * Old terminal rows are pruned from the DB.
   */
  _restoreFromDb() {
    if (!this._db) return;
    try {
      // Fetch all non-terminal rows (terminal ones will be pruned below)
      const rows = this._db
        .prepare(
          `SELECT id, status, params, created_at, updated_at, error
           FROM a2a_tasks
           WHERE status NOT IN ('completed', 'failed', 'canceled')`
        )
        .all();

      for (const row of rows) {
        let params = {};
        try {
          params = JSON.parse(row.params || '{}');
        } catch (_) {
          // ignore malformed params
        }

        const task = {
          id: row.id,
          status: row.status,
          params,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        // Orphan recovery: working/input-required tasks from a prior server run
        // can never complete naturally — mark them failed so callers get a definitive answer.
        if (row.status === 'working' || row.status === 'input-required') {
          task.status = 'failed';
          try {
            this._db
              .prepare(
                `UPDATE a2a_tasks
                 SET status = 'failed', updated_at = ?, error = ?
                 WHERE id = ?`
              )
              .run(
                new Date().toISOString(),
                'orphaned: server restarted while task was in-progress',
                row.id
              );
          } catch (err) {
            process.stderr.write(`[TaskStateMachine] orphan recovery error: ${err.message}\n`);
          }
        }

        this._tasks.set(task.id, task);
      }

      // Prune terminal rows older than 1 hour to keep the table small.
      try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        this._db
          .prepare(
            `DELETE FROM a2a_tasks
             WHERE status IN ('completed', 'failed', 'canceled')
               AND updated_at < ?`
          )
          .run(cutoff);
      } catch (err) {
        process.stderr.write(`[TaskStateMachine] prune error: ${err.message}\n`);
      }
    } catch (err) {
      process.stderr.write(`[TaskStateMachine] _restoreFromDb error: ${err.message}\n`);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Create a new task in submitted state.
   * @param {object} params - Task parameters (arbitrary caller-provided data)
   * @returns {{ id: string, status: 'submitted', createdAt: string, params: object }}
   */
  createTask(params = {}) {
    const id = crypto.randomUUID();
    const task = {
      id,
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      params,
    };
    this._tasks.set(id, task);
    this._persistCreate(task);
    return { ...task };
  }

  /**
   * Transition a task to a new state.
   * @param {string} id - Task ID
   * @param {string} newStatus - Target state
   * @param {string|null} [error] - Error message (for failed transitions)
   * @returns {object} Updated task snapshot
   * @throws {Error} If task not found or transition is invalid
   */
  transition(id, newStatus, error = null) {
    const task = this._tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.has(newStatus)) {
      throw new Error(`Invalid transition from '${task.status}' to '${newStatus}' for task ${id}`);
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    this._persistTransition(id, newStatus, error);

    // Evict terminal tasks after 5 minutes to prevent unbounded Map growth.
    // .unref() so this timer does not prevent the process from exiting in tests.
    if (TERMINAL_STATES.has(newStatus)) {
      setTimeout(() => this._tasks.delete(id), 5 * 60 * 1000).unref();
    }

    return { ...task };
  }

  /**
   * Get a task by ID.
   * @param {string} id - Task ID
   * @returns {object|null} Task snapshot or null if not found
   */
  getTask(id) {
    const task = this._tasks.get(id);
    return task ? { ...task } : null;
  }

  /**
   * Cancel a task if it is not already in a terminal state.
   * @param {string} id - Task ID
   * @returns {object} Updated task snapshot
   * @throws {Error} If task not found or already terminal
   */
  cancelTask(id) {
    const task = this._tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    if (TERMINAL_STATES.has(task.status)) {
      throw new Error(`Cannot cancel task ${id}: already in terminal state '${task.status}'`);
    }
    return this.transition(id, 'canceled');
  }

  /**
   * Return whether a task is in a terminal state.
   * @param {string} id - Task ID
   * @returns {boolean}
   */
  isTerminal(id) {
    const task = this._tasks.get(id);
    return task ? TERMINAL_STATES.has(task.status) : false;
  }

  /**
   * Return all tasks (for debugging/inspection).
   * @returns {object[]}
   */
  listTasks() {
    return Array.from(this._tasks.values()).map(t => ({ ...t }));
  }
}

module.exports = { TaskStateMachine, VALID_TRANSITIONS, TERMINAL_STATES };
