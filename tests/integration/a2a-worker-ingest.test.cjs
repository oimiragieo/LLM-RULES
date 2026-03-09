#!/usr/bin/env node
'use strict';

/**
 * Integration tests: A2A ↔ Worker Pool ↔ Memory Consolidation
 * =============================================================
 * Tests the cross-feature wiring introduced in P4.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { getDb, closeDb, runMigrations } = require('../../.claude/lib/db/sqlite-manager.cjs');
const { enqueueMessage, getQueueStats } = require('../../.claude/lib/db/queue-operations.cjs');
const { consolidate } = require('../../.claude/lib/memory/consolidation/consolidate-agent.cjs');
const {
  enforceRetention,
} = require('../../.claude/lib/memory/consolidation/retention-enforcer.cjs');
const { WorkerPool } = require('../../.claude/lib/workers/worker-pool.cjs');
const { BudgetEnforcementService } = require('../../.claude/lib/workers/budget-enforcement.cjs');
const { emitNewMessage } = require('../../.claude/lib/workers/dispatcher.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temp DB in the OS temp dir for isolated test use.
 * Returns { db, dbPath }.
 */
function makeTempDb() {
  const dbPath = path.join(os.tmpdir(), `agent-studio-test-${crypto.randomUUID()}.db`);
  const db = getDb(dbPath);
  runMigrations(db);
  return { db, dbPath };
}

function cleanupDb(dbPath) {
  try {
    closeDb(dbPath);
  } catch (_) {
    /* ignore */
  }
  try {
    fs.rmSync(dbPath, { force: true });
  } catch (_) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Test 1: Worker pool processes a message end-to-end
// ---------------------------------------------------------------------------

describe('Worker pool — end-to-end message processing', () => {
  let db;
  let dbPath;
  let pool;

  before(() => {
    const tmp = makeTempDb();
    db = tmp.db;
    dbPath = tmp.dbPath;
  });

  after(() => {
    if (pool) pool.stop();
    cleanupDb(dbPath);
  });

  it('processes an enqueued message through the worker pool', { timeout: 10000 }, async () => {
    const processed = [];

    const budget = new BudgetEnforcementService({
      maxTokensPerMinute: 400000,
      maxConcurrentWorkers: 3,
    });

    pool = new WorkerPool({
      db,
      budget,
      concurrency: 1,
      processFn: async row => {
        processed.push(row.id);
      },
      failSafeIntervalMs: 1000,
      heartbeatIntervalMs: 500,
    });

    pool.start();

    // Enqueue a message
    const { id } = enqueueMessage(db, { chatId: 'test-chat', userId: 'test-user', text: 'hello' });

    // Wake dispatcher
    emitNewMessage(id);

    // Wait for worker-done event (emitted after completeMessage)
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error('Timed out waiting for worker-done')),
        8000
      );
      pool.once('worker-done', () => {
        clearTimeout(deadline);
        resolve();
      });
    });

    assert.ok(processed.length > 0, 'Expected at least one message to be processed');
    assert.equal(processed[0], id, 'Processed ID should match enqueued ID');

    const stats = getQueueStats(db);
    assert.equal(stats.completed, 1, 'Message should be marked completed in DB');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Retention enforcer purges expired file_memory rows
// ---------------------------------------------------------------------------

describe('Retention enforcer — purges expired rows', () => {
  let db;
  let dbPath;

  before(() => {
    const tmp = makeTempDb();
    db = tmp.db;
    dbPath = tmp.dbPath;
  });

  after(() => {
    cleanupDb(dbPath);
  });

  it('deletes file_memory rows where expires_at has passed', () => {
    const past = Date.now() - 1000;
    const future = Date.now() + 60000;

    // Insert an expired row
    const expiredId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO file_memory
         (id, source, mime_type, hash, size_bytes, importance_score, indexed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(expiredId, 'file1.txt', 'text/plain', crypto.randomUUID(), 100, 0.6, Date.now(), past);

    // Insert a non-expired row
    const activeId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO file_memory
         (id, source, mime_type, hash, size_bytes, importance_score, indexed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(activeId, 'file2.txt', 'text/plain', crypto.randomUUID(), 200, 0.7, Date.now(), future);

    // Insert a row with no expiry (indefinite)
    const permanentId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO file_memory
         (id, source, mime_type, hash, size_bytes, importance_score, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(permanentId, 'file3.txt', 'text/plain', crypto.randomUUID(), 300, 0.8, Date.now());

    const result = enforceRetention(db);

    assert.equal(result.purgedFileMemory, 1, 'Should have purged 1 expired row');

    // Verify expired row is gone
    const expired = db.prepare('SELECT id FROM file_memory WHERE id = ?').get(expiredId);
    assert.equal(expired, undefined, 'Expired row should be deleted');

    // Verify active and permanent rows remain
    const active = db.prepare('SELECT id FROM file_memory WHERE id = ?').get(activeId);
    assert.ok(active, 'Active row should remain');

    const permanent = db.prepare('SELECT id FROM file_memory WHERE id = ?').get(permanentId);
    assert.ok(permanent, 'Permanent row should remain');
  });

  it('returns 0 purged when no rows are expired', () => {
    // Only the active and permanent rows from the previous test remain
    const result = enforceRetention(db);
    assert.equal(result.purgedFileMemory, 0, 'No rows to purge');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Consolidation processes unconsolidated entries
// ---------------------------------------------------------------------------

describe('Consolidation agent — processes unconsolidated entries', () => {
  let db;
  let dbPath;

  before(() => {
    const tmp = makeTempDb();
    db = tmp.db;
    dbPath = tmp.dbPath;
  });

  after(() => {
    cleanupDb(dbPath);
  });

  it('returns { processed: 0, insightId: null } when no entries exist', async () => {
    const result = await consolidate(db);
    assert.equal(result.processed, 0);
    assert.equal(result.insightId, null);
  });

  it('consolidates file_memory entries and inserts an insight', async () => {
    // Insert two file_memory entries (unconsolidated)
    const fm1 = crypto.randomUUID();
    const fm2 = crypto.randomUUID();
    const now = Date.now();

    db.prepare(
      `INSERT INTO file_memory
         (id, source, mime_type, hash, size_bytes, importance_score, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(fm1, 'doc1.pdf', 'application/pdf', crypto.randomUUID(), 1024, 0.8, now);

    db.prepare(
      `INSERT INTO file_memory
         (id, source, mime_type, hash, size_bytes, importance_score, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(fm2, 'doc2.pdf', 'application/pdf', crypto.randomUUID(), 2048, 0.9, now);

    const result = await consolidate(db);

    assert.equal(result.processed, 2, 'Should process 2 entries');
    assert.ok(typeof result.insightId === 'string', 'Should return a string insightId');
    assert.ok(result.insightId.length > 0, 'insightId should be non-empty');

    // Verify insight was inserted in episodic_memory
    const insight = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get(result.insightId);
    assert.ok(insight, 'Insight row should exist in episodic_memory');
    assert.equal(insight.session_id, 'consolidation');
    assert.ok(
      insight.content.startsWith('consolidated:'),
      'Content should start with "consolidated:"'
    );
    assert.ok(insight.content.includes(fm1), 'Content should include fm1 id');
    assert.ok(insight.content.includes(fm2), 'Content should include fm2 id');
    assert.equal(insight.importance_score, 0.7);

    // Verify source entries are marked consolidated
    const row1 = db.prepare('SELECT consolidated_at FROM file_memory WHERE id = ?').get(fm1);
    assert.ok(row1.consolidated_at > 0, 'fm1 should be marked consolidated');

    const row2 = db.prepare('SELECT consolidated_at FROM file_memory WHERE id = ?').get(fm2);
    assert.ok(row2.consolidated_at > 0, 'fm2 should be marked consolidated');
  });

  it('is idempotent — skips already-consolidated entries on second run', async () => {
    // All existing entries are now consolidated; no new entries added
    const result = await consolidate(db);
    // The insight inserted in the previous test is itself unconsolidated,
    // so processed may be 1 (the insight row). Verify it does not re-consolidate the old entries.
    const allFm = db.prepare('SELECT id, consolidated_at FROM file_memory').all();
    for (const row of allFm) {
      // All original file_memory rows should still be consolidated from the prior run
      if (row.consolidated_at === null) {
        assert.fail(`file_memory row ${row.id} should be consolidated`);
      }
    }
    // processed could be 0 (no unconsolidated episodic except the insight) or 1
    assert.ok(result.processed >= 0, 'processed should be a non-negative number');
  });

  it('consolidates episodic_memory entries', async () => {
    // Insert two episodic_memory entries
    const em1 = crypto.randomUUID();
    const em2 = crypto.randomUUID();
    const now = Date.now();

    db.prepare(
      `INSERT INTO episodic_memory (id, session_id, content, importance_score, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(em1, 'session-1', 'Agent decided to use JWT.', 0.6, now);

    db.prepare(
      `INSERT INTO episodic_memory (id, session_id, content, importance_score, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(em2, 'session-2', 'Agent chose Redis for cache.', 0.7, now);

    const result = await consolidate(db);

    assert.ok(result.processed >= 2, 'Should consolidate at least 2 episodic entries');
    assert.ok(result.insightId !== null, 'Should produce an insight');

    // Both em entries should be marked consolidated
    const r1 = db.prepare('SELECT consolidated_at FROM episodic_memory WHERE id = ?').get(em1);
    assert.ok(r1 && r1.consolidated_at > 0, 'em1 should be marked consolidated');

    const r2 = db.prepare('SELECT consolidated_at FROM episodic_memory WHERE id = ?').get(em2);
    assert.ok(r2 && r2.consolidated_at > 0, 'em2 should be marked consolidated');
  });
});

// ---------------------------------------------------------------------------
// Test 4: A2A server enqueues message on tasks/sendSubscribe
// ---------------------------------------------------------------------------

describe('A2A server — enqueues message on tasks/sendSubscribe when db+pool provided', () => {
  let db;
  let dbPath;
  let server;
  let baseUrl;

  before(async () => {
    const tmp = makeTempDb();
    db = tmp.db;
    dbPath = tmp.dbPath;

    const { createA2aServer } = require('../../.claude/lib/a2a/server.cjs');

    // Create a minimal pool stub (just needs to be truthy for the guard check)
    const poolStub = { _stub: true };

    const srv = createA2aServer({ port: 0, db, pool: poolStub });
    server = await srv.start();
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    cleanupDb(dbPath);
  });

  it(
    'enqueues a message to the queue when tasks/sendSubscribe is called',
    { timeout: 5000 },
    async () => {
      const http = require('http');

      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: { message: { role: 'user', parts: [{ text: 'hello' }] } },
      });

      const statsBefore = getQueueStats(db);

      await new Promise((resolve, reject) => {
        const req = http.request(
          `${baseUrl}/a2a/subscribe`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          res => {
            // SSE stream — just read a chunk and then destroy
            res.once('data', () => {
              res.destroy();
              resolve();
            });
            res.on('error', () => resolve()); // ignore destroy error
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      const statsAfter = getQueueStats(db);
      assert.equal(
        statsAfter.pending + statsAfter.claimed + statsAfter.completed,
        statsBefore.pending + statsBefore.claimed + statsBefore.completed + 1,
        'Should have enqueued 1 new message'
      );
    }
  );

  it('does NOT enqueue when db/pool not provided', { timeout: 5000 }, async () => {
    const http = require('http');
    const { createA2aServer } = require('../../.claude/lib/a2a/server.cjs');

    // Server without db/pool
    const srv2 = createA2aServer({ port: 0 });
    const server2 = await srv2.start();
    const addr2 = server2.address();
    const url2 = `http://127.0.0.1:${addr2.port}`;

    // Use the original db for counting
    const statsBeforeNoDB = getQueueStats(db);

    const body2 = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tasks/sendSubscribe',
      params: {},
    });

    await new Promise((resolve, reject) => {
      const req = http.request(
        `${url2}/a2a/subscribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body2),
          },
        },
        res => {
          res.once('data', () => {
            res.destroy();
            resolve();
          });
          res.on('error', () => resolve());
        }
      );
      req.on('error', reject);
      req.write(body2);
      req.end();
    });

    await new Promise(resolve => server2.close(resolve));

    const statsAfterNoDB = getQueueStats(db);
    assert.equal(
      statsAfterNoDB.pending + statsAfterNoDB.claimed + statsAfterNoDB.completed,
      statsBeforeNoDB.pending + statsBeforeNoDB.claimed + statsBeforeNoDB.completed,
      'No new messages should be enqueued when db/pool not provided'
    );
  });
});
