/**
 * task-pool.cjs — Concurrent task routing table for the channel daemon
 *
 * Manages background task execution with configurable concurrency limits.
 * Tasks run as async functions (typically wrapping child_process.spawn).
 * The pool tracks all task lifecycle states and emits events for each
 * transition, allowing the dispatcher to stay non-blocking.
 *
 * Events: 'task-started', 'task-completed', 'task-failed', 'task-queued',
 *         'task-cancelled', 'task-timeout'
 */
'use strict';

const { EventEmitter } = require('node:events');

const TASK_TIMEOUT_SIGNAL = Symbol('task-timeout');
const TASK_CANCELLED_SIGNAL = Symbol('task-cancelled');

class TaskPool extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxConcurrent=3] - Max concurrent running tasks
   * @param {number} [opts.maxHistory=50] - Max completed tasks to retain
   * @param {Function} [opts.log] - Logger function
   */
  constructor(opts = {}) {
    super();
    this.maxConcurrent = opts.maxConcurrent || 3;
    this.maxHistory = opts.maxHistory || 50;
    this.log = opts.log || (() => {});
    this.tasks = new Map(); // id → TaskEntry
    this.queue = []; // overflow queue for tasks waiting for a slot
    this._runningCount = 0;
    this._taskPromises = new Map(); // id → Promise (for drain)
  }

  /**
   * Spawn a task. If under concurrency limit, starts immediately.
   * Otherwise queues it.
   *
   * @param {string} id - Unique task ID
   * @param {Function} fn - Async function to execute. Should return a promise.
   *   May also return { promise, cancel } for cancellable tasks.
   * @param {Object} meta - Task metadata
   * @param {string} meta.description - Human-readable description
   * @param {string} meta.chatId - Chat that requested this task
   * @param {string} meta.user - User who requested this task
   * @param {number} [meta.timeout] - Task timeout in ms (0 = no timeout)
   * @param {Function} [meta.onProgress] - Progress callback
   * @param {Function} [meta.cancel] - External cancel function (e.g., kill child process)
   * @returns {TaskEntry}
   */
  spawn(id, fn, meta = {}) {
    const entry = {
      id,
      status: 'queued',
      description: meta.description || '',
      chatId: meta.chatId || '',
      user: meta.user || '',
      startTime: null,
      endTime: null,
      result: null,
      error: null,
      fn,
      timeout: meta.timeout || 0,
      onProgress: meta.onProgress || null,
      _cancel: meta.cancel || null,
      _timeoutTimer: null,
      _terminalSignalPromise: null,
      _terminalSignalResolve: null,
      // Forward arbitrary metadata (e.g., _progressTimer, _sink, _messageId)
      _progressTimer: meta._progressTimer || null,
      _sink: meta._sink || null,
      _messageId: meta._messageId || null,
    };

    this.tasks.set(id, entry);

    if (this._runningCount < this.maxConcurrent) {
      this._startTask(entry);
    } else {
      this.queue.push(entry);
      this.emit('task-queued', entry);
      this.log(`[pool] Task ${id} queued (${this.queue.length} in queue)`);
    }

    return entry;
  }

  /**
   * Cancel a task by ID. Works for both running and queued tasks.
   * @param {string} id
   * @returns {boolean} true if task was found and cancelled
   */
  cancel(id) {
    const entry = this.tasks.get(id);
    if (!entry) return false;

    if (entry.status === 'queued') {
      // Remove from queue
      const idx = this.queue.findIndex(t => t.id === id);
      if (idx >= 0) this.queue.splice(idx, 1);
      entry.status = 'cancelled';
      entry.endTime = Date.now();
      this.emit('task-cancelled', entry);
      this.log(`[pool] Task ${id} cancelled (was queued)`);
      return true;
    }

    if (entry.status === 'running') {
      // Kill the running task
      if (entry._cancel) {
        try {
          entry._cancel();
        } catch {
          /* ignored */
        }
      }
      if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);
      entry.status = 'cancelled';
      entry.endTime = Date.now();
      this._signalTerminal(entry, TASK_CANCELLED_SIGNAL);
      this.emit('task-cancelled', entry);
      this._runningCount--;
      this._dequeue();
      this.log(`[pool] Task ${id} cancelled (was running)`);
      return true;
    }

    return false; // already completed/failed
  }

  /**
   * Get a specific task by ID.
   * @param {string} id
   * @returns {TaskEntry|null}
   */
  getTask(id) {
    return this.tasks.get(id) || null;
  }

  /**
   * Get all currently running tasks.
   * @returns {TaskEntry[]}
   */
  getRunning() {
    return [...this.tasks.values()].filter(t => t.status === 'running');
  }

  /**
   * Get all tasks (running, completed, failed, etc.).
   * @param {number} [limit]
   * @returns {TaskEntry[]}
   */
  getAll(limit) {
    const all = [...this.tasks.values()];
    return limit ? all.slice(-limit) : all;
  }

  /**
   * Wait for all running and queued tasks to complete.
   * @returns {Promise<void>}
   */
  async drain() {
    // Wait for all tracked task promises to settle
    while (this._taskPromises.size > 0 || this.queue.length > 0) {
      const promises = [...this._taskPromises.values()];
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      } else {
        // Queue has items but no promises yet — wait a tick for dequeue
        await new Promise(r => setTimeout(r, 5));
      }
    }
  }

  /**
   * Start a task (internal).
   * @private
   */
  _startTask(entry) {
    entry.status = 'running';
    entry.startTime = Date.now();
    this._runningCount++;
    this.emit('task-started', entry);
    this.log(`[pool] Task ${entry.id} started (${this._runningCount}/${this.maxConcurrent} slots)`);

    entry._terminalSignalPromise = new Promise(resolve => {
      entry._terminalSignalResolve = resolve;
    });

    // Set up timeout if configured
    if (entry.timeout > 0) {
      entry._timeoutTimer = setTimeout(() => {
        if (entry.status !== 'running') return;
        entry.status = 'timeout';
        entry.endTime = Date.now();
        entry.error = `Task timed out after ${entry.timeout}ms`;
        if (entry._cancel) {
          try {
            entry._cancel();
          } catch {
            /* ignored */
          }
        }
        this._signalTerminal(entry, TASK_TIMEOUT_SIGNAL);
        this._runningCount--;
        this.emit('task-timeout', entry);
        this._dequeue();
        this._evictHistory();
      }, entry.timeout);
    }

    // Execute the task function and track the promise for drain()
    const taskPromise = this._executeAndTrack(entry);
    this._taskPromises.set(entry.id, taskPromise);
  }

  /**
   * Execute a task's function and handle its result.
   * @private
   */
  async _executeAndTrack(entry) {
    try {
      const taskResult = entry.fn();

      let executionPromise;
      if (taskResult && typeof taskResult.then === 'function') {
        executionPromise = taskResult;
      } else if (taskResult && taskResult.promise) {
        if (taskResult.cancel && !entry._cancel) {
          entry._cancel = taskResult.cancel;
        }
        executionPromise = taskResult.promise;
      } else {
        executionPromise = Promise.resolve(taskResult);
      }

      const result = entry._terminalSignalPromise
        ? await Promise.race([executionPromise, entry._terminalSignalPromise])
        : await executionPromise;

      if (result === TASK_TIMEOUT_SIGNAL || result === TASK_CANCELLED_SIGNAL) {
        return;
      }

      this._finishTask(entry, result, null);
    } catch (err) {
      this._finishTask(entry, null, err);
    } finally {
      entry._terminalSignalPromise = null;
      entry._terminalSignalResolve = null;
      this._taskPromises.delete(entry.id);
    }
  }

  /**
   * Mark a task as finished (completed or failed).
   * @private
   */
  _finishTask(entry, result, err) {
    // Guard against double-finish (e.g., timeout + completion race)
    if (entry.status !== 'running') return;

    if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);

    if (err) {
      entry.status = 'failed';
      entry.error = err.message || String(err);
      entry.endTime = Date.now();
      this.emit('task-failed', entry);
      this.log(`[pool] Task ${entry.id} failed: ${entry.error.slice(0, 80)}`);
    } else {
      entry.status = 'completed';
      entry.result = result;
      entry.endTime = Date.now();
      this.emit('task-completed', entry);
      this.log(`[pool] Task ${entry.id} completed`);
    }

    this._runningCount--;
    this._dequeue();
    this._evictHistory();
  }

  /**
   * Start the next queued task if a slot is available.
   * @private
   */
  _dequeue() {
    while (this._runningCount < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next.status === 'queued') {
        this._startTask(next);
      }
    }
  }

  /**
   * Evict old completed/failed tasks when over maxHistory.
   * @private
   */
  _evictHistory() {
    const finished = [...this.tasks.entries()].filter(([, t]) =>
      ['completed', 'failed', 'cancelled', 'timeout'].includes(t.status)
    );

    if (finished.length > this.maxHistory) {
      // Sort by endTime, evict oldest
      finished.sort((a, b) => (a[1].endTime || 0) - (b[1].endTime || 0));
      const toEvict = finished.length - this.maxHistory;
      for (let i = 0; i < toEvict; i++) {
        this.tasks.delete(finished[i][0]);
      }
    }
  }

  _signalTerminal(entry, signal) {
    if (typeof entry._terminalSignalResolve === 'function') {
      entry._terminalSignalResolve(signal);
      entry._terminalSignalResolve = null;
    }
  }
}

module.exports = { TaskPool };
