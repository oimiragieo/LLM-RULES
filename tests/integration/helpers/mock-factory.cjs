#!/usr/bin/env node
'use strict';

/**
 * Mock Factory — Shared stubs for integration tests
 *
 * Provides 4 factory functions for cross-area integration tests:
 *   createMockDb()           – better-sqlite3-compatible stub (in-memory)
 *   createMockBudget(opts)   – BudgetEnforcementService stub
 *   createMockEnqueue()      – enqueueMessage stub that records calls
 *   createMockWorker(dir)    – processFn stub that writes synthetic handoff JSON
 *
 * Each call returns a fresh, independent instance — no shared state.
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// createMockDb
// ---------------------------------------------------------------------------

/**
 * Returns a fresh in-memory stub that mimics the synchronous better-sqlite3 API
 * used by worker-features-dispatcher and queue-operations.
 *
 * Supported methods:
 *   db.prepare(sql)         → { run(...args), get(...args), all(...args) }
 *   db.exec(sql)
 *   db.transaction(fn)      → function(...args) { return fn(...args); }
 *   db.close()
 *
 * All calls are recorded in db._calls for assertion purposes.
 *
 * @returns {object} Mock database instance
 */
function createMockDb() {
  /** @type {Array<{sql: string, args: any[], op: string, at: number}>} */
  const calls = [];

  /**
   * Build a prepared-statement stub for the given SQL string.
   * @param {string} sql
   */
  function makeStatement(sql) {
    return {
      run(...args) {
        calls.push({ sql, args, op: 'run', at: Date.now() });
        return { changes: 1, lastInsertRowid: calls.length };
      },
      get(...args) {
        calls.push({ sql, args, op: 'get', at: Date.now() });
        return undefined;
      },
      all(...args) {
        calls.push({ sql, args, op: 'all', at: Date.now() });
        return [];
      },
    };
  }

  return {
    /** Recorded calls for test assertions */
    _calls: calls,

    prepare(sql) {
      return makeStatement(sql);
    },

    exec(sql) {
      calls.push({ sql, args: [], op: 'exec', at: Date.now() });
    },

    /**
     * Returns a function that executes fn synchronously (mirrors better-sqlite3
     * transaction semantics for simple non-throwing cases).
     */
    transaction(fn) {
      return function (...args) {
        return fn(...args);
      };
    },

    close() {
      // no-op
    },
  };
}

// ---------------------------------------------------------------------------
// createMockBudget
// ---------------------------------------------------------------------------

/**
 * Returns a fresh stub that mimics BudgetEnforcementService.
 *
 * @param {object} [options]
 * @param {boolean} [options.exhausted=false]
 *   When true, acquireWorkerSlot() returns { allowed: false, reason: 'MAX_CONCURRENT', retryAfterMs: 0 }
 *
 * @returns {object} Mock budget instance with .acquireWorkerSlot() and ._calls
 */
function createMockBudget(options) {
  const opts = options || {};
  const exhausted = opts.exhausted === true;

  /** @type {Array<{estimatedTokens: number, at: number, result: object}>} */
  const calls = [];

  return {
    /** Recorded acquireWorkerSlot calls for test assertions */
    _calls: calls,

    /**
     * @param {number} [estimatedTokens=1000]
     * @returns {{ allowed: true, release: function } | { allowed: false, reason: string, retryAfterMs: number }}
     */
    acquireWorkerSlot(estimatedTokens) {
      const tokens = estimatedTokens !== undefined ? estimatedTokens : 1000;

      let result;
      if (exhausted) {
        result = { allowed: false, reason: 'MAX_CONCURRENT', retryAfterMs: 0 };
      } else {
        result = {
          allowed: true,
          release: () => {},
        };
      }

      calls.push({ estimatedTokens: tokens, at: Date.now(), result });
      return result;
    },

    getStats() {
      return {
        currentMinuteUsage: 0,
        maxTokensPerMinute: 400000,
        concurrentCount: exhausted ? 3 : 0,
        maxConcurrentWorkers: 3,
        msUntilReset: 60000,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createMockEnqueue
// ---------------------------------------------------------------------------

/**
 * Returns a fresh function stub that mimics enqueueMessage(db, payload).
 *
 * All call arguments are recorded in fn.calls for test assertions.
 * The function returns { id: 'mock-msg-N' } where N is the 1-based call index.
 *
 * @returns {function} Mock enqueue function with .calls property
 */
function createMockEnqueue() {
  /** @type {Array<{db: any, payload: object, at: number}>} */
  const calls = [];

  function mockEnqueue(db, payload) {
    calls.push({ db, payload, at: Date.now() });
    return { id: `mock-msg-${calls.length}` };
  }

  /** Exposes recorded calls for test assertions */
  mockEnqueue.calls = calls;

  return mockEnqueue;
}

// ---------------------------------------------------------------------------
// createMockWorker
// ---------------------------------------------------------------------------

/**
 * Returns a fresh function stub that mimics a worker processFn.
 *
 * When called with a featureId, it writes a synthetic handoff JSON file:
 *   { featureId, status: 'done', files: ['mock.js'] }
 * to handoffsDir/<featureId>.json.
 *
 * All invocations are recorded in fn.calls for test assertions.
 *
 * @param {string} handoffsDir - Absolute path to the handoffs output directory
 * @returns {function} Mock worker function with .calls property
 */
function createMockWorker(handoffsDir) {
  /** @type {Array<{featureId: string, handoffPath: string, at: number}>} */
  const calls = [];

  function mockWorker(featureId) {
    const handoffPath = path.join(handoffsDir, `${featureId}.json`);
    const handoff = {
      featureId,
      status: 'done',
      files: ['mock.js'],
    };

    fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
    calls.push({ featureId, handoffPath, at: Date.now() });

    return handoff;
  }

  /** Exposes recorded calls for test assertions */
  mockWorker.calls = calls;

  return mockWorker;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createMockDb,
  createMockBudget,
  createMockEnqueue,
  createMockWorker,
};
