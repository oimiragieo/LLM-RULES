#!/usr/bin/env node
'use strict';

/**
 * Collector
 * =========
 * Request-response bridge over the event-driven WorkerPool.
 *
 * Callers register a pending Promise for a messageId via waitForResult().
 * The Collector listens to 'worker-done' and 'worker-error' events from the pool
 * and resolves/rejects the corresponding Promise.
 *
 * Usage:
 *   const { Collector } = require('.claude/lib/workers/collector.cjs');
 *   const collector = new Collector(pool);
 *   const { id } = enqueueMessage(db, msg);
 *   emitNewMessage(id);
 *   const result = await collector.waitForResult(id, 30000);
 */

class Collector {
  /**
   * @param {import('./worker-pool.cjs').WorkerPool} pool
   */
  constructor(pool) {
    this._pool = pool;
    /** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout|null }>} */
    this._pending = new Map();

    this._onDone = this._onDone.bind(this);
    this._onError = this._onError.bind(this);

    pool.on('worker-done', this._onDone);
    pool.on('worker-error', this._onError);
  }

  /**
   * Wait for the worker processing messageId to complete.
   *
   * @param {string} messageId
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<{ id: string, row: object }>}
   */
  waitForResult(messageId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let timer = null;

      const cleanup = () => {
        this._pending.delete(messageId);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const wrappedResolve = (value) => {
        cleanup();
        resolve(value);
      };

      const wrappedReject = (err) => {
        cleanup();
        reject(err);
      };

      timer = setTimeout(() => {
        this._pending.delete(messageId);
        reject(new Error(`Collector: timeout waiting for message ${messageId} (${timeoutMs}ms)`));
      }, timeoutMs);

      this._pending.set(messageId, { resolve: wrappedResolve, reject: wrappedReject, timer });
    });
  }

  /**
   * Stop listening to pool events. Call when the collector is no longer needed.
   */
  detach() {
    this._pool.removeListener('worker-done', this._onDone);
    this._pool.removeListener('worker-error', this._onError);

    // Reject any still-pending promises
    for (const [messageId, entry] of this._pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error(`Collector detached while waiting for message ${messageId}`));
    }
    this._pending.clear();
  }

  /**
   * @param {{ id: string, row: object }} payload
   */
  _onDone(payload) {
    const entry = this._pending.get(payload.id);
    if (entry) {
      entry.resolve(payload);
    }
  }

  /**
   * @param {{ id: string, row: object, error: Error }} payload
   */
  _onError(payload) {
    const entry = this._pending.get(payload.id);
    if (entry) {
      entry.reject(payload.error || new Error(`Worker failed for message ${payload.id}`));
    }
  }
}

module.exports = { Collector };
