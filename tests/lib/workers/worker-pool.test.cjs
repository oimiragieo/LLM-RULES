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
const { WorkerPool } = require('../../../.claude/lib/workers/worker-pool.cjs');
const { emitNewMessage } = require('../../../.claude/lib/workers/dispatcher.cjs');

/**
 * Create a unique temp DB path for each test.
 */
function makeTempDbPath() {
  return path.join(
    os.tmpdir(),
    `agent-studio-pool-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
}

/**
 * Helper: create a pool with a real SQLite DB in a temp directory.
 */
function makePool(
  processFn,
  { concurrency = 3, failSafeIntervalMs = 50, heartbeatIntervalMs = 500 } = {}
) {
  const dbPath = makeTempDbPath();
  const db = getDb(dbPath);
  runMigrations(db);
  const budget = new BudgetEnforcementService({
    maxTokensPerMinute: 400000,
    maxConcurrentWorkers: concurrency,
  });
  const pool = new WorkerPool({
    db,
    budget,
    concurrency,
    processFn,
    failSafeIntervalMs,
    heartbeatIntervalMs,
  });
  return { pool, db, dbPath, budget };
}

/**
 * Cleanup helper.
 */
function cleanupPool(dbPath) {
  closeDb(dbPath);
  try {
    fs.rmSync(dbPath, { force: true });
  } catch (_) {
    /* ignore */
  }
  try {
    fs.rmSync(dbPath + '-wal', { force: true });
  } catch (_) {
    /* ignore */
  }
  try {
    fs.rmSync(dbPath + '-shm', { force: true });
  } catch (_) {
    /* ignore */
  }
}

describe('WorkerPool', () => {
  describe('lifecycle', () => {
    it('starts and stops cleanly', () => {
      const { pool, dbPath } = makePool(async () => {});
      pool.start();
      pool.stop();
      cleanupPool(dbPath);
      // No assertion needed — just confirm no throws
    });

    it('throws if processFn is not a function', () => {
      const dbPath = makeTempDbPath();
      const db = getDb(dbPath);
      runMigrations(db);
      const budget = new BudgetEnforcementService();
      assert.throws(
        () => new WorkerPool({ db, budget, concurrency: 1, processFn: 'not-a-function' }),
        /processFn/
      );
      cleanupPool(dbPath);
    });

    it('getStats() returns correct shape', () => {
      const { pool, dbPath } = makePool(async () => {});
      pool.start();
      const stats = pool.getStats();
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'activeWorkers'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'budgetStats'));
      assert.equal(typeof stats.activeWorkers, 'number');
      pool.stop();
      cleanupPool(dbPath);
    });
  });

  describe('message processing', () => {
    it('enqueued message is processed and marked completed', (_, done) => {
      let processed = false;
      const { pool, db, dbPath } = makePool(async row => {
        assert.ok(row.id);
        assert.equal(row.chat_id, 'chat-test');
        processed = true;
      });

      pool.on('worker-done', ({ id }) => {
        // Verify the DB row was marked completed
        const row = db.prepare('SELECT status FROM message_queue WHERE id = ?').get(id);
        assert.equal(row.status, 'completed');
        assert.equal(processed, true);
        pool.stop();
        cleanupPool(dbPath);
        done();
      });

      pool.start();
      const { id } = enqueueMessage(db, { chatId: 'chat-test', text: 'process me' });
      emitNewMessage(id);
    });

    it('failed processFn results in pending or dead_letter status', (_, done) => {
      const { pool, db, dbPath } = makePool(async () => {
        throw new Error('intentional test failure');
      });

      pool.on('worker-error', ({ id }) => {
        const row = db
          .prepare('SELECT status, attempt_count FROM message_queue WHERE id = ?')
          .get(id);
        // attempt_count=1 → should be pending (retry); attempt_count>=3 → dead_letter
        assert.ok(row.status === 'pending' || row.status === 'dead_letter');
        pool.stop();
        cleanupPool(dbPath);
        done();
      });

      pool.start();
      const { id } = enqueueMessage(db, { chatId: 'chat-fail', text: 'fail me' });
      emitNewMessage(id);
    });

    it(
      'message is dead_lettered after 3 failed attempts',
      (_, done) => {
        const { pool, db, dbPath } = makePool(
          async () => {
            throw new Error('always fails');
          },
          { concurrency: 1, failSafeIntervalMs: 30 }
        );

        pool.on('worker-error', ({ id }) => {
          const row = db
            .prepare('SELECT status, attempt_count FROM message_queue WHERE id = ?')
            .get(id);
          if (row.status === 'dead_letter') {
            assert.ok(row.attempt_count >= 3);
            pool.stop();
            cleanupPool(dbPath);
            done();
          } else {
            // Message reset to pending — re-emit to avoid relying on unref'd fail-safe timer
            emitNewMessage(id);
          }
        });

        pool.start();
        const { id } = enqueueMessage(db, { chatId: 'chat-dead', text: 'kill me' });
        emitNewMessage(id);
      },
      { timeout: 10000 }
    );

    it(
      'multiple messages are processed concurrently',
      (_, done) => {
        const processed = new Set();
        const msgIds = [];
        const count = 3;

        const { pool, db, dbPath } = makePool(
          async row => {
            await new Promise(r => setTimeout(r, 10));
            processed.add(row.id);
          },
          { concurrency: 3 }
        );

        pool.on('worker-done', () => {
          if (processed.size === count) {
            pool.stop();
            cleanupPool(dbPath);
            done();
          }
        });

        pool.start();
        for (let i = 0; i < count; i++) {
          const { id } = enqueueMessage(db, { chatId: `chat-${i}`, text: `msg ${i}` });
          msgIds.push(id);
          emitNewMessage(id);
        }
      },
      { timeout: 5000 }
    );
  });
});
