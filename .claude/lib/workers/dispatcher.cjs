#!/usr/bin/env node
'use strict';

/**
 * Dispatcher
 * ==========
 * EventEmitter-based dispatcher that bridges the SQLite queue with the worker pool.
 *
 * - `queueEvents` is a shared EventEmitter. Callers emit 'new-message' to wake the dispatcher.
 * - `Dispatcher` listens to 'new-message', checks budget, and claims the next pending row.
 * - A 15-second fail-safe interval re-scans for unclaimed pending rows (crash/missed-event recovery).
 * - Emits 'worker-claimed' with the claimed row for WorkerPool to consume.
 *
 * Usage:
 *   const { queueEvents, emitNewMessage, Dispatcher } = require('.claude/lib/workers/dispatcher.cjs');
 *   const dispatcher = new Dispatcher({ db, budget, maxWorkers: 3, staleThresholdMs: 300000 });
 *   dispatcher.start();
 *   dispatcher.on('worker-claimed', (row) => { ... });
 *   emitNewMessage(row.id); // trigger dispatch after enqueue
 */

const EventEmitter = require('events');
const { claimNextMessage, recoverStaleClaims, getPendingCount } = require('../db/queue-operations.cjs');

/** Shared bus for signalling new messages across the process. */
const queueEvents = new EventEmitter();
queueEvents.setMaxListeners(50);

/**
 * Helper: emit 'new-message' on the shared bus.
 * Call this after enqueueMessage() to wake the dispatcher immediately.
 *
 * @param {string} messageId
 */
function emitNewMessage(messageId) {
  queueEvents.emit('new-message', messageId);
}

class Dispatcher extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('better-sqlite3').Database} opts.db
   * @param {import('./budget-enforcement.cjs').BudgetEnforcementService} opts.budget
   * @param {number} [opts.maxWorkers=3]
   * @param {number} [opts.staleThresholdMs=300000]
   * @param {number} [opts.failSafeIntervalMs=15000]
   */
  constructor({ db, budget, maxWorkers = 3, staleThresholdMs = 300000, failSafeIntervalMs = 15000 }) {
    super();
    this._db = db;
    this._budget = budget;
    this._maxWorkers = maxWorkers;
    this._staleThresholdMs = staleThresholdMs;
    this._failSafeIntervalMs = failSafeIntervalMs;
    this._failSafeTimer = null;
    this._newMessageListener = null;
    this._running = false;
  }

  /**
   * Start the dispatcher:
   *  1. Register 'new-message' listener on queueEvents.
   *  2. Start the 15-second fail-safe interval.
   *  3. Do an immediate scan to pick up any pre-existing pending messages.
   */
  start() {
    if (this._running) return;
    this._running = true;

    this._newMessageListener = () => this._tryClaimNext();
    queueEvents.on('new-message', this._newMessageListener);

    this._failSafeTimer = setInterval(() => {
      this._recoverAndScan();
    }, this._failSafeIntervalMs);

    // Avoid keeping the process alive purely for the fail-safe interval
    if (this._failSafeTimer.unref) {
      this._failSafeTimer.unref();
    }

    // Initial sweep for any pending rows already in the queue
    this._tryClaimNext();
  }

  /**
   * Stop the dispatcher: remove listener and clear interval.
   */
  stop() {
    if (!this._running) return;
    this._running = false;

    if (this._newMessageListener) {
      queueEvents.removeListener('new-message', this._newMessageListener);
      this._newMessageListener = null;
    }

    if (this._failSafeTimer) {
      clearInterval(this._failSafeTimer);
      this._failSafeTimer = null;
    }
  }

  /**
   * Attempt to claim the next pending message and emit 'worker-claimed'.
   * Respects budget constraints — if budget is exhausted, the message stays pending
   * and will be retried on the next fail-safe interval or next 'new-message' event.
   */
  _tryClaimNext() {
    if (!this._running) return;

    const pendingCount = getPendingCount(this._db);
    if (pendingCount === 0) return;

    const slot = this._budget.acquireWorkerSlot();
    if (!slot.allowed) {
      // Budget exhausted — message stays pending, will retry via fail-safe
      return;
    }

    const row = claimNextMessage(this._db);
    if (!row) {
      // Race — another dispatcher or recovery took the row
      slot.release();
      return;
    }

    // Attach the release function so WorkerRunner can call it on completion/failure
    row._budgetRelease = slot.release;

    this.emit('worker-claimed', row);
  }

  /**
   * Fail-safe: recover stale claims, then scan for pending messages.
   * Called every failSafeIntervalMs.
   */
  _recoverAndScan() {
    if (!this._running) return;

    try {
      recoverStaleClaims(this._db, this._staleThresholdMs);
    } catch (_err) {
      // Non-fatal — log to stderr for visibility but continue
      process.stderr.write(`[Dispatcher] recoverStaleClaims error: ${_err.message}\n`);
    }

    // Emit new-message for each pending row to wake up the pool
    const pendingCount = getPendingCount(this._db);
    for (let i = 0; i < pendingCount; i++) {
      queueEvents.emit('new-message', null);
    }
  }
}

module.exports = { queueEvents, emitNewMessage, Dispatcher };
