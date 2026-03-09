#!/usr/bin/env node
'use strict';

/**
 * WorkerPool
 * ==========
 * Manages the full lifecycle of concurrent SQLite-backed message workers.
 *
 * - Composes Dispatcher (claim loop) + WorkerRunner (per-message execution).
 * - Maintains a count of active workers.
 * - Delegates concurrency + TPM budgeting to BudgetEnforcementService.
 *
 * Usage:
 *   const { WorkerPool } = require('.claude/lib/workers/worker-pool.cjs');
 *   const pool = new WorkerPool({ db, budget, concurrency: 3, processFn: async (row) => { ... } });
 *   pool.start();
 *   // ... later ...
 *   pool.stop();
 */

const EventEmitter = require('events');
const { Dispatcher } = require('./dispatcher.cjs');
const { WorkerRunner } = require('./worker-runner.cjs');

class WorkerPool extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('better-sqlite3').Database} opts.db
   * @param {import('./budget-enforcement.cjs').BudgetEnforcementService} opts.budget
   * @param {number} [opts.concurrency=3]
   * @param {(row: object) => Promise<any>} opts.processFn
   * @param {number} [opts.staleThresholdMs=300000]
   * @param {number} [opts.heartbeatIntervalMs=30000]
   * @param {number} [opts.failSafeIntervalMs=15000]
   */
  constructor({
    db,
    budget,
    concurrency = 3,
    processFn,
    staleThresholdMs = 300000,
    heartbeatIntervalMs = 30000,
    failSafeIntervalMs = 15000,
  }) {
    super();

    if (typeof processFn !== 'function') {
      throw new TypeError('WorkerPool requires a processFn option');
    }

    this._db = db;
    this._budget = budget;
    this._concurrency = concurrency;
    this._processFn = processFn;
    this._activeWorkers = 0;

    this._dispatcher = new Dispatcher({
      db,
      budget,
      maxWorkers: concurrency,
      staleThresholdMs,
      failSafeIntervalMs,
    });

    this._heartbeatIntervalMs = heartbeatIntervalMs;
  }

  /**
   * Start the pool: begin listening for claimed messages from the dispatcher.
   */
  start() {
    this._dispatcher.on('worker-claimed', claimedRow => this._spawnWorker(claimedRow));
    this._dispatcher.start();
  }

  /**
   * Stop the pool gracefully: stop the dispatcher (no new claims).
   * In-flight workers complete naturally.
   */
  stop() {
    this._dispatcher.stop();
    this._dispatcher.removeAllListeners('worker-claimed');
  }

  /**
   * Run a single claimed message row through a WorkerRunner.
   *
   * @param {object} claimedRow
   */
  _spawnWorker(claimedRow) {
    this._activeWorkers++;

    const runner = new WorkerRunner({
      db: this._db,
      heartbeatIntervalMs: this._heartbeatIntervalMs,
    });

    runner.on('worker-done', payload => {
      this._activeWorkers = Math.max(0, this._activeWorkers - 1);
      this.emit('worker-done', payload);
    });

    runner.on('worker-error', payload => {
      this._activeWorkers = Math.max(0, this._activeWorkers - 1);
      this.emit('worker-error', payload);
    });

    // Fire-and-forget; errors are handled by runner event emission
    runner.run(claimedRow, this._processFn).catch(err => {
      // Should never reach here (runner.run catches internally), but guard anyway
      process.stderr.write(`[WorkerPool] unexpected error in runner.run: ${err.message}\n`);
    });
  }

  /**
   * Returns a snapshot of the current pool + budget state.
   *
   * @returns {{ activeWorkers: number, budgetStats: object }}
   */
  getStats() {
    return {
      activeWorkers: this._activeWorkers,
      budgetStats: this._budget.getStats(),
    };
  }
}

module.exports = { WorkerPool };
