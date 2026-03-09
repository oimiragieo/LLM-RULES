#!/usr/bin/env node
'use strict';

/**
 * WorkerRunner
 * ============
 * Executes a single claimed message row using a user-supplied async processFn.
 *
 * Responsibilities:
 *  1. Sends periodic heartbeats to SQLite so the stale-claim recovery doesn't
 *     requeue an in-flight message.
 *  2. Calls processFn(claimedRow) and awaits the result.
 *  3. On success:  calls completeMessage() + emits 'worker-done'.
 *  4. On failure:  calls failMessage()     + emits 'worker-error'.
 *  5. Calls the budget release function attached to claimedRow._budgetRelease (if present).
 *
 * Usage:
 *   const runner = new WorkerRunner({ db, heartbeatIntervalMs: 30000 });
 *   runner.on('worker-done',  ({ id }) => { ... });
 *   runner.on('worker-error', ({ id, error }) => { ... });
 *   await runner.run(claimedRow, async (row) => { ... });
 */

const EventEmitter = require('events');
const { heartbeat, completeMessage, failMessage } = require('../db/queue-operations.cjs');

class WorkerRunner extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('better-sqlite3').Database} opts.db
   * @param {number} [opts.heartbeatIntervalMs=30000]
   */
  constructor({ db, heartbeatIntervalMs = 30000 }) {
    super();
    this._db = db;
    this._heartbeatIntervalMs = heartbeatIntervalMs;
  }

  /**
   * Execute a single claimed row.
   *
   * @param {object} claimedRow - Row returned by claimNextMessage (with _budgetRelease attached by Dispatcher)
   * @param {(row: object) => Promise<any>} processFn - Async function that processes the message
   * @returns {Promise<void>}
   */
  async run(claimedRow, processFn) {
    const id = claimedRow.id;
    let hbTimer = null;

    const stopHeartbeat = () => {
      if (hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
    };

    const releaseBudget = () => {
      if (typeof claimedRow._budgetRelease === 'function') {
        claimedRow._budgetRelease();
      }
    };

    // Start heartbeat
    hbTimer = setInterval(() => {
      try {
        heartbeat(this._db, id);
      } catch (_err) {
        process.stderr.write(`[WorkerRunner] heartbeat error for ${id}: ${_err.message}\n`);
      }
    }, this._heartbeatIntervalMs);

    // Avoid keeping the process alive only for heartbeats
    if (hbTimer.unref) {
      hbTimer.unref();
    }

    try {
      await processFn(claimedRow);

      stopHeartbeat();
      releaseBudget();
      completeMessage(this._db, id);
      this.emit('worker-done', { id, row: claimedRow });
    } catch (err) {
      stopHeartbeat();
      releaseBudget();

      try {
        failMessage(this._db, id, err);
      } catch (dbErr) {
        process.stderr.write(`[WorkerRunner] failMessage error for ${id}: ${dbErr.message}\n`);
      }

      this.emit('worker-error', { id, row: claimedRow, error: err });
    }
  }
}

module.exports = { WorkerRunner };
