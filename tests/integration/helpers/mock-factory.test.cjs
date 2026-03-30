#!/usr/bin/env node
'use strict';

/**
 * Tests for mock-factory.cjs
 *
 * Verifies VAL-INFRA-001: Mock Factory Provides Reusable Stubs for External Dependencies
 *
 * Covers:
 * - Each factory returns a callable stub
 * - Stubs record invocations (arguments, call count)
 * - Stubs are configurable (e.g. budget exhaustion)
 * - Independent instances do not share state
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  createMockDb,
  createMockBudget,
  createMockEnqueue,
  createMockWorker,
} = require('./mock-factory.cjs');

// ---------------------------------------------------------------------------
// Test: createMockDb
// ---------------------------------------------------------------------------

describe('createMockDb', () => {
  it('returns an object with prepare(), exec(), transaction(), and close()', () => {
    const db = createMockDb();
    assert.strictEqual(typeof db, 'object');
    assert.strictEqual(typeof db.prepare, 'function');
    assert.strictEqual(typeof db.exec, 'function');
    assert.strictEqual(typeof db.transaction, 'function');
    assert.strictEqual(typeof db.close, 'function');
  });

  it('prepare() returns a statement with run(), get(), and all()', () => {
    const db = createMockDb();
    const stmt = db.prepare('SELECT 1');
    assert.strictEqual(typeof stmt.run, 'function');
    assert.strictEqual(typeof stmt.get, 'function');
    assert.strictEqual(typeof stmt.all, 'function');
  });

  it('prepare().run() records the call in _calls', () => {
    const db = createMockDb();
    db.prepare('INSERT INTO t VALUES (?)').run('hello');
    assert.strictEqual(db._calls.length, 1);
    assert.strictEqual(db._calls[0].op, 'run');
    assert.deepEqual(db._calls[0].args, ['hello']);
  });

  it('prepare().get() records the call in _calls and returns undefined by default', () => {
    const db = createMockDb();
    const result = db.prepare('SELECT * FROM t WHERE id = ?').get('x');
    assert.strictEqual(result, undefined);
    assert.strictEqual(db._calls.length, 1);
    assert.strictEqual(db._calls[0].op, 'get');
  });

  it('prepare().all() records the call in _calls and returns [] by default', () => {
    const db = createMockDb();
    const result = db.prepare('SELECT * FROM t').all();
    assert.deepEqual(result, []);
    assert.strictEqual(db._calls.length, 1);
    assert.strictEqual(db._calls[0].op, 'all');
  });

  it('exec() records the call in _calls', () => {
    const db = createMockDb();
    db.exec('CREATE TABLE t (id TEXT)');
    assert.strictEqual(db._calls.length, 1);
    assert.strictEqual(db._calls[0].op, 'exec');
  });

  it('transaction() returns a function that invokes fn', () => {
    const db = createMockDb();
    let called = false;
    const tx = db.transaction(() => {
      called = true;
      return 42;
    });
    assert.strictEqual(typeof tx, 'function');
    const result = tx();
    assert.strictEqual(called, true);
    assert.strictEqual(result, 42);
  });

  it('close() does not throw', () => {
    const db = createMockDb();
    assert.doesNotThrow(() => db.close());
  });

  it('is compatible with enqueueMessage() call pattern (prepare+run)', () => {
    const db = createMockDb();
    // Simulate what enqueueMessage() does internally
    const stmt = db.prepare(
      `INSERT INTO message_queue (id, chat_id, user_id, text, attachments, timestamp, status, attempt_count) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)`
    );
    const result = stmt.run('id1', 'chat1', null, '{}', '[]', Date.now());
    assert.strictEqual(result.changes, 1);
    assert.strictEqual(db._calls.length, 1);
    assert.strictEqual(db._calls[0].op, 'run');
  });

  it('independent instances do not share _calls state', () => {
    const db1 = createMockDb();
    const db2 = createMockDb();
    db1.prepare('SELECT 1').run();
    assert.strictEqual(db1._calls.length, 1);
    assert.strictEqual(db2._calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Test: createMockBudget
// ---------------------------------------------------------------------------

describe('createMockBudget', () => {
  it('returns an object with acquireWorkerSlot() and getStats()', () => {
    const budget = createMockBudget();
    assert.strictEqual(typeof budget, 'object');
    assert.strictEqual(typeof budget.acquireWorkerSlot, 'function');
    assert.strictEqual(typeof budget.getStats, 'function');
  });

  it('acquireWorkerSlot() returns { allowed: true, release: fn } by default', () => {
    const budget = createMockBudget();
    const slot = budget.acquireWorkerSlot();
    assert.strictEqual(slot.allowed, true);
    assert.strictEqual(typeof slot.release, 'function');
  });

  it('acquireWorkerSlot() returns { allowed: true } when called with estimatedTokens', () => {
    const budget = createMockBudget();
    const slot = budget.acquireWorkerSlot(5000);
    assert.strictEqual(slot.allowed, true);
  });

  it('acquireWorkerSlot() records calls in _calls', () => {
    const budget = createMockBudget();
    budget.acquireWorkerSlot(2000);
    budget.acquireWorkerSlot(3000);
    assert.strictEqual(budget._calls.length, 2);
    assert.strictEqual(budget._calls[0].estimatedTokens, 2000);
    assert.strictEqual(budget._calls[1].estimatedTokens, 3000);
  });

  it('release() does not throw', () => {
    const budget = createMockBudget();
    const slot = budget.acquireWorkerSlot();
    assert.doesNotThrow(() => slot.release());
  });

  it('returns { allowed: false } when configured with { exhausted: true }', () => {
    const budget = createMockBudget({ exhausted: true });
    const slot = budget.acquireWorkerSlot();
    assert.strictEqual(slot.allowed, false);
    assert.strictEqual(slot.reason, 'MAX_CONCURRENT');
    assert.strictEqual(typeof slot.retryAfterMs, 'number');
  });

  it('exhausted budget still records calls in _calls', () => {
    const budget = createMockBudget({ exhausted: true });
    budget.acquireWorkerSlot(1000);
    assert.strictEqual(budget._calls.length, 1);
    assert.strictEqual(budget._calls[0].result.allowed, false);
  });

  it('getStats() returns a stats object', () => {
    const budget = createMockBudget();
    const stats = budget.getStats();
    assert.strictEqual(typeof stats, 'object');
    assert.strictEqual(typeof stats.maxTokensPerMinute, 'number');
    assert.strictEqual(typeof stats.maxConcurrentWorkers, 'number');
  });

  it('independent instances do not share _calls state', () => {
    const b1 = createMockBudget();
    const b2 = createMockBudget();
    b1.acquireWorkerSlot();
    assert.strictEqual(b1._calls.length, 1);
    assert.strictEqual(b2._calls.length, 0);
  });

  it('exhausted and non-exhausted instances are independent', () => {
    const normal = createMockBudget();
    const exhausted = createMockBudget({ exhausted: true });
    assert.strictEqual(normal.acquireWorkerSlot().allowed, true);
    assert.strictEqual(exhausted.acquireWorkerSlot().allowed, false);
  });
});

// ---------------------------------------------------------------------------
// Test: createMockEnqueue
// ---------------------------------------------------------------------------

describe('createMockEnqueue', () => {
  it('returns a callable function', () => {
    const enqueue = createMockEnqueue();
    assert.strictEqual(typeof enqueue, 'function');
  });

  it('has a .calls array property', () => {
    const enqueue = createMockEnqueue();
    assert.ok(Array.isArray(enqueue.calls));
    assert.strictEqual(enqueue.calls.length, 0);
  });

  it('records each call in .calls with db and payload', () => {
    const enqueue = createMockEnqueue();
    const db = createMockDb();
    const payload = { chatId: 'test', text: '{"featureId":"f1"}', attachments: [] };
    enqueue(db, payload);
    assert.strictEqual(enqueue.calls.length, 1);
    assert.strictEqual(enqueue.calls[0].db, db);
    assert.deepEqual(enqueue.calls[0].payload, payload);
  });

  it('records multiple calls sequentially', () => {
    const enqueue = createMockEnqueue();
    const db = createMockDb();
    enqueue(db, { chatId: 'c1', text: 'a', attachments: [] });
    enqueue(db, { chatId: 'c2', text: 'b', attachments: [] });
    assert.strictEqual(enqueue.calls.length, 2);
    assert.strictEqual(enqueue.calls[0].payload.chatId, 'c1');
    assert.strictEqual(enqueue.calls[1].payload.chatId, 'c2');
  });

  it('returns { id: string } on each call', () => {
    const enqueue = createMockEnqueue();
    const db = createMockDb();
    const result = enqueue(db, { chatId: 'c', text: 'x', attachments: [] });
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(typeof result.id, 'string');
    assert.ok(result.id.length > 0);
  });

  it('each call returns a unique id', () => {
    const enqueue = createMockEnqueue();
    const db = createMockDb();
    const r1 = enqueue(db, { chatId: 'c', text: 'x', attachments: [] });
    const r2 = enqueue(db, { chatId: 'c', text: 'y', attachments: [] });
    assert.notStrictEqual(r1.id, r2.id);
  });

  it('independent instances do not share .calls state', () => {
    const e1 = createMockEnqueue();
    const e2 = createMockEnqueue();
    const db = createMockDb();
    e1(db, { chatId: 'c', text: 'x', attachments: [] });
    assert.strictEqual(e1.calls.length, 1);
    assert.strictEqual(e2.calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Test: createMockWorker
// ---------------------------------------------------------------------------

describe('createMockWorker', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a callable function', () => {
    const worker = createMockWorker(tmpDir);
    assert.strictEqual(typeof worker, 'function');
  });

  it('has a .calls array property', () => {
    const worker = createMockWorker(tmpDir);
    assert.ok(Array.isArray(worker.calls));
    assert.strictEqual(worker.calls.length, 0);
  });

  it('writes a handoff JSON file to handoffsDir/<featureId>.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-write-'));
    try {
      const worker = createMockWorker(dir);
      worker('feature-abc');
      const filePath = path.join(dir, 'feature-abc.json');
      assert.ok(fs.existsSync(filePath), `Expected handoff file at ${filePath}`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.strictEqual(content.featureId, 'feature-abc');
      assert.strictEqual(content.status, 'done');
      assert.deepEqual(content.files, ['mock.js']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records each call in .calls with featureId and handoffPath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-calls-'));
    try {
      const worker = createMockWorker(dir);
      worker('feat-1');
      assert.strictEqual(worker.calls.length, 1);
      assert.strictEqual(worker.calls[0].featureId, 'feat-1');
      assert.ok(worker.calls[0].handoffPath.endsWith('feat-1.json'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records multiple calls with separate featureIds', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-multi-'));
    try {
      const worker = createMockWorker(dir);
      worker('feat-a');
      worker('feat-b');
      assert.strictEqual(worker.calls.length, 2);
      assert.strictEqual(worker.calls[0].featureId, 'feat-a');
      assert.strictEqual(worker.calls[1].featureId, 'feat-b');
      assert.ok(fs.existsSync(path.join(dir, 'feat-a.json')));
      assert.ok(fs.existsSync(path.join(dir, 'feat-b.json')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the handoff object { featureId, status, files }', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-ret-'));
    try {
      const worker = createMockWorker(dir);
      const result = worker('feat-ret');
      assert.strictEqual(result.featureId, 'feat-ret');
      assert.strictEqual(result.status, 'done');
      assert.deepEqual(result.files, ['mock.js']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('independent instances do not share .calls state', () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-ind1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-ind2-'));
    try {
      const w1 = createMockWorker(dir1);
      const w2 = createMockWorker(dir2);
      w1('feat-x');
      assert.strictEqual(w1.calls.length, 1);
      assert.strictEqual(w2.calls.length, 0);
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('each worker instance uses its own handoffsDir independently', () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-idir1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-worker-idir2-'));
    try {
      const w1 = createMockWorker(dir1);
      const w2 = createMockWorker(dir2);
      w1('same-id');
      w2('same-id');
      // Both write to their respective dirs, not the same file
      assert.ok(fs.existsSync(path.join(dir1, 'same-id.json')));
      assert.ok(fs.existsSync(path.join(dir2, 'same-id.json')));
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });
});
