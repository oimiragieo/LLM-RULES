#!/usr/bin/env node
'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { getDb, closeDb, runMigrations } = require('../../../.claude/lib/db/sqlite-manager.cjs');
const { enqueueMessage } = require('../../../.claude/lib/db/queue-operations.cjs');
const { BudgetEnforcementService } = require('../../../.claude/lib/workers/budget-enforcement.cjs');
const { queueEvents, emitNewMessage, Dispatcher } = require('../../../.claude/lib/workers/dispatcher.cjs');

/**
 * Create a temp DB path unique to each test run.
 */
function makeTempDbPath() {
  return path.join(os.tmpdir(), `agent-studio-dispatcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('Dispatcher', () => {
  let dbPath;
  let db;
  let budget;
  let dispatcher;

  beforeEach(() => {
    dbPath = makeTempDbPath();
    db = getDb(dbPath);
    runMigrations(db);
    budget = new BudgetEnforcementService({ maxTokensPerMinute: 400000, maxConcurrentWorkers: 3 });
  });

  afterEach(() => {
    if (dispatcher) {
      dispatcher.stop();
      dispatcher.removeAllListeners();
      dispatcher = null;
    }
    closeDb(dbPath);
    try { fs.rmSync(dbPath, { force: true }); } catch (_) { /* ignore */ }
    try { fs.rmSync(dbPath + '-wal', { force: true }); } catch (_) { /* ignore */ }
    try { fs.rmSync(dbPath + '-shm', { force: true }); } catch (_) { /* ignore */ }
  });

  describe('start / stop', () => {
    it('start() registers a new-message listener on queueEvents', () => {
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 999999 });
      const countBefore = queueEvents.listenerCount('new-message');
      dispatcher.start();
      const countAfter = queueEvents.listenerCount('new-message');
      assert.ok(countAfter > countBefore, 'listener count should increase after start()');
    });

    it('stop() removes the listener added by start()', () => {
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 999999 });
      dispatcher.start();
      const countAfterStart = queueEvents.listenerCount('new-message');
      dispatcher.stop();
      const countAfterStop = queueEvents.listenerCount('new-message');
      assert.ok(countAfterStop < countAfterStart, 'listener count should decrease after stop()');
    });

    it('calling start() twice does not register duplicate listeners', () => {
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 999999 });
      dispatcher.start();
      const countAfterFirstStart = queueEvents.listenerCount('new-message');
      dispatcher.start(); // second call should be a no-op
      const countAfterSecondStart = queueEvents.listenerCount('new-message');
      assert.equal(countAfterSecondStart, countAfterFirstStart);
    });
  });

  describe('new-message event triggers claim', () => {
    it('emitting new-message results in worker-claimed when a pending row exists', (_, done) => {
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 999999 });

      const { id } = enqueueMessage(db, { chatId: 'chat1', text: 'hello' });

      dispatcher.on('worker-claimed', (row) => {
        assert.equal(row.id, id);
        done();
      });

      dispatcher.start();
      emitNewMessage(id);
    });

    it('does not emit worker-claimed when queue is empty', (_, done) => {
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 999999 });

      let claimed = false;
      dispatcher.on('worker-claimed', () => { claimed = true; });

      dispatcher.start();
      emitNewMessage('nonexistent');

      // Give a tick to let async path resolve
      setImmediate(() => {
        assert.equal(claimed, false);
        done();
      });
    });
  });

  describe('fail-safe interval', () => {
    it('fail-safe scans pending rows and emits worker-claimed', (_, done) => {
      // Use a very short fail-safe interval for the test
      dispatcher = new Dispatcher({ db, budget, failSafeIntervalMs: 50 });

      const { id } = enqueueMessage(db, { chatId: 'chat2', text: 'failsafe test' });

      dispatcher.on('worker-claimed', (row) => {
        assert.equal(row.id, id);
        done();
      });

      // start without emitting new-message — rely purely on fail-safe
      dispatcher.start();
    });
  });

  describe('budget gating', () => {
    it('does not claim when MAX_CONCURRENT is reached', (_, done) => {
      const tightBudget = new BudgetEnforcementService({ maxTokensPerMinute: 400000, maxConcurrentWorkers: 0 });
      dispatcher = new Dispatcher({ db, budget: tightBudget, failSafeIntervalMs: 999999 });

      enqueueMessage(db, { chatId: 'chat3', text: 'blocked' });

      let claimed = false;
      dispatcher.on('worker-claimed', () => { claimed = true; });

      dispatcher.start();
      emitNewMessage('any');

      setImmediate(() => {
        assert.equal(claimed, false);
        done();
      });
    });
  });
});
