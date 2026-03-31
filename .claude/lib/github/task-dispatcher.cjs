'use strict';

/**
 * task-dispatcher.cjs — Dispatch agent tasks derived from parsed @agent-studio mentions.
 *
 * TaskDispatcher creates a task record for each dispatched mention, assigns it
 * through a configurable worker pool or injected dispatch function, and tracks
 * task lifecycle state so callers can poll the current status.
 *
 * Usage:
 *   const { TaskDispatcher } = require('.claude/lib/github/task-dispatcher.cjs');
 *
 *   // With injected dispatch function (ideal for testing)
 *   const dispatcher = new TaskDispatcher({ _dispatch: (task) => console.log(task) });
 *   const { taskId, status } = dispatcher.dispatch(mention);
 *   // => { taskId: 'task-1234567890-1', status: 'queued' }
 *   dispatcher.getTaskStatus(taskId);  // => 'queued'
 *
 *   // With a real worker pool
 *   const dispatcher = new TaskDispatcher({ workerPool: myPool });
 *   dispatcher.dispatch(parsedMention, { prNumber: 42, repo: 'owner/repo' });
 */

// ---------------------------------------------------------------------------
// Internal counter for unique task ID generation
// ---------------------------------------------------------------------------

let _counter = 0;

/**
 * Generate a unique task identifier.
 * Combines current timestamp (ms) with a monotonic counter so IDs remain
 * unique even when multiple tasks are created within the same millisecond.
 *
 * @returns {string}
 */
function generateTaskId() {
  _counter += 1;
  return `task-${Date.now()}-${_counter}`;
}

// ---------------------------------------------------------------------------
// TaskDispatcher class
// ---------------------------------------------------------------------------

class TaskDispatcher {
  /**
   * @param {object} [opts]
   * @param {object}   [opts.workerPool]  - Worker pool with an `assign(task)` method.
   *   Used when `_dispatch` is not provided.
   * @param {Function} [opts._dispatch]   - Injected dispatch function `(task) => void`.
   *   Takes precedence over `workerPool` when both are supplied.
   *   Intended for testing — lets callers intercept task objects without a real pool.
   */
  constructor({ workerPool, _dispatch } = {}) {
    this._workerPool = workerPool || null;
    this._dispatchFn = _dispatch || null;

    /**
     * Internal task registry: taskId → task record.
     * @type {Map<string, {taskId: string, status: string, instruction: string, mention: object, context: object|null}>}
     */
    this._tasks = new Map();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a task from a parsed mention and hand it off to the worker pool (or
   * injected dispatch function).  Returns immediately with the assigned task ID
   * and an initial status of `'queued'`.
   *
   * @param {{mention: string, instruction: string, position: number}} mention
   *   A mention object as returned by `MentionParser.parse()`.
   * @param {object} [context]
   *   Optional context attached to the task (e.g. `{ prNumber, repo, author }`).
   * @returns {{taskId: string, status: 'queued'}}
   */
  dispatch(mention, context) {
    const taskId = generateTaskId();

    const task = {
      taskId,
      status: 'queued',
      instruction: mention ? mention.instruction : '',
      mention: mention || null,
      context: context || null,
    };

    this._tasks.set(taskId, task);

    // Hand off to the configured dispatcher — injected fn takes priority.
    if (this._dispatchFn) {
      this._dispatchFn(task);
    } else if (this._workerPool) {
      this._workerPool.assign(task);
    }
    // If neither is provided, the task is simply queued in memory (no-op dispatch).

    return { taskId, status: 'queued' };
  }

  /**
   * Return the current status of a task.
   *
   * @param {string} taskId - ID returned by `dispatch()`.
   * @returns {string|null} Current status string, or `null` if the task is unknown.
   */
  getTaskStatus(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return null;
    return task.status;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { TaskDispatcher };
