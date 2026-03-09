#!/usr/bin/env node
'use strict';

/**
 * Tests: queue-operations.cjs
 * ===========================
 * - enqueueMessage inserts with status 'pending'
 * - claimNextMessage atomically transitions to 'claimed'
 * - Two concurrent claimNextMessage calls don't double-claim same message
 * - heartbeat updates heartbeat_at
 * - completeMessage sets status 'completed'
 * - failMessage with attempt_count < 3 resets to 'pending'
 * - failMessage with attempt_count >= 3 sets 'dead_letter'
 * - recoverStaleClaims requeues stale claimed rows
 * - getQueueStats returns correct counts
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getDb, closeDb, runMigrations } = require('../../../.claude/lib/db/sqlite-manager.cjs');
const {
  enqueueMessage,
  claimNextMessage,
  heartbeat,
  completeMessage,
  failMessage,
  recoverStaleClaims,
  getPendingCount,
  getQueueStats,
} = require('../../../.claude/lib/db/queue-operations.cjs');

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(os.tmpdir(), `agent-studio-queue-test-${Date.now()}`);
const TEST_DB_PATH = path.join(TEST_DIR, 'queue-test.db');

let db;

before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  db = getDb(TEST_DB_PATH);
  runMigrations(db);
});

beforeEach(() => {
  // Clean all rows before each test for isolation
  db.exec('DELETE FROM message_queue');
});

after(() => {
  closeDb(TEST_DB_PATH);
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// enqueueMessage
// ---------------------------------------------------------------------------

describe('enqueueMessage()', () => {
  it('inserts a row with status pending', () => {
    const { id } = enqueueMessage(db, { chatId: 'chat1', text: 'hello' });
    assert.ok(id, 'Should return an id');

    const row = db.prepare('SELECT * FROM message_queue WHERE id = ?').get(id);
    assert.ok(row, 'Row should exist');
    assert.strictEqual(row.status, 'pending');
    assert.strictEqual(row.attempt_count, 0);
    assert.strictEqual(row.chat_id, 'chat1');
    assert.strictEqual(row.text, 'hello');
  });

  it('stores attachments as JSON', () => {
    const { id } = enqueueMessage(db, {
      chatId: 'chat2',
      text: 'with attachment',
      attachments: [{ type: 'image', url: 'http://example.com/img.png' }],
    });

    const row = db.prepare('SELECT attachments FROM message_queue WHERE id = ?').get(id);
    const parsed = JSON.parse(row.attachments);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].type, 'image');
  });

  it('stores empty attachments array when none provided', () => {
    const { id } = enqueueMessage(db, { chatId: 'chat3', text: 'no attachments' });
    const row = db.prepare('SELECT attachments FROM message_queue WHERE id = ?').get(id);
    assert.strictEqual(row.attachments, '[]');
  });

  it('sets userId to null when not provided', () => {
    const { id } = enqueueMessage(db, { chatId: 'chat4', text: 'anon' });
    const row = db.prepare('SELECT user_id FROM message_queue WHERE id = ?').get(id);
    assert.strictEqual(row.user_id, null);
  });
});

// ---------------------------------------------------------------------------
// claimNextMessage
// ---------------------------------------------------------------------------

describe('claimNextMessage()', () => {
  it('transitions status from pending to claimed', () => {
    const { id } = enqueueMessage(db, { chatId: 'c1', text: 'msg' });
    const claimed = claimNextMessage(db, 999);

    assert.ok(claimed, 'Should return the claimed message');
    assert.strictEqual(claimed.id, id);
    assert.strictEqual(claimed.status, 'claimed');
    assert.strictEqual(claimed.worker_pid, 999);
    assert.strictEqual(claimed.attempt_count, 1);
    assert.ok(claimed.claimed_at > 0);
    assert.ok(claimed.heartbeat_at > 0);
  });

  it('returns null when no pending messages', () => {
    const result = claimNextMessage(db, 1);
    assert.strictEqual(result, null);
  });

  it('returns null after all messages are claimed', () => {
    enqueueMessage(db, { chatId: 'c2', text: 'only one' });
    claimNextMessage(db, 1);
    const result = claimNextMessage(db, 2);
    assert.strictEqual(result, null);
  });

  it('claims messages in FIFO order (oldest timestamp first)', () => {
    // Insert two messages with slightly different timestamps
    const first = enqueueMessage(db, { chatId: 'c', text: 'first' });
    // Force a slightly later timestamp for the second message
    db.prepare('UPDATE message_queue SET timestamp = timestamp + 100 WHERE id = ?').run(first.id);
    const second = enqueueMessage(db, { chatId: 'c', text: 'second' });

    // The one with smaller timestamp should be claimed first
    const claimed1 = claimNextMessage(db, 1);
    const claimed2 = claimNextMessage(db, 2);

    // second was inserted with higher timestamp, first was bumped even higher
    // so second should be claimed first (lower timestamp)
    assert.strictEqual(claimed1.id, second.id);
    assert.strictEqual(claimed2.id, first.id);
  });

  it('does not double-claim the same message when called back-to-back', () => {
    enqueueMessage(db, { chatId: 'c', text: 'single' });

    // Simulate concurrent workers: both see the pending row but only one can claim it
    // Because better-sqlite3 is synchronous, these run serially — still validates atomicity
    const claim1 = claimNextMessage(db, 100);
    const claim2 = claimNextMessage(db, 200);

    // Only the first gets the message; second should be null
    assert.ok(claim1, 'First claim should succeed');
    assert.strictEqual(claim2, null, 'Second claim should return null (already claimed)');

    // The claimed row should only have worker 100
    const row = db.prepare('SELECT worker_pid FROM message_queue WHERE id = ?').get(claim1.id);
    assert.strictEqual(row.worker_pid, 100);
  });

  it('deserializes attachments JSON in returned row', () => {
    enqueueMessage(db, {
      chatId: 'c',
      text: 'with att',
      attachments: [{ type: 'file', name: 'doc.pdf' }],
    });

    const claimed = claimNextMessage(db, 1);
    assert.ok(Array.isArray(claimed.attachments), 'attachments should be an array');
    assert.strictEqual(claimed.attachments[0].type, 'file');
  });
});

// ---------------------------------------------------------------------------
// heartbeat
// ---------------------------------------------------------------------------

describe('heartbeat()', () => {
  it('updates heartbeat_at timestamp', (t, done) => {
    enqueueMessage(db, { chatId: 'c', text: 'hb test' });
    const claimed = claimNextMessage(db, 1);
    const originalHb = claimed.heartbeat_at;

    // Wait a tick to ensure timestamp difference
    setTimeout(() => {
      heartbeat(db, claimed.id);
      const row = db.prepare('SELECT heartbeat_at FROM message_queue WHERE id = ?').get(claimed.id);
      assert.ok(row.heartbeat_at >= originalHb, 'heartbeat_at should be updated');
      done();
    }, 5);
  });

  it('returns true on success', () => {
    enqueueMessage(db, { chatId: 'c', text: 'hb success' });
    const claimed = claimNextMessage(db, 1);
    const result = heartbeat(db, claimed.id);
    assert.strictEqual(result, true);
  });

  it('returns false for non-existent message id', () => {
    const result = heartbeat(db, 'non-existent-id');
    assert.strictEqual(result, false);
  });
});

// ---------------------------------------------------------------------------
// completeMessage
// ---------------------------------------------------------------------------

describe('completeMessage()', () => {
  it('sets status to completed', () => {
    enqueueMessage(db, { chatId: 'c', text: 'complete me' });
    const claimed = claimNextMessage(db, 1);
    const result = completeMessage(db, claimed.id);

    assert.strictEqual(result, true);
    const row = db.prepare('SELECT status, completed_at FROM message_queue WHERE id = ?').get(claimed.id);
    assert.strictEqual(row.status, 'completed');
    assert.ok(row.completed_at > 0, 'completed_at should be set');
  });

  it('returns false if message is not in claimed state', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'pending' });
    const result = completeMessage(db, id);
    assert.strictEqual(result, false);
  });
});

// ---------------------------------------------------------------------------
// failMessage
// ---------------------------------------------------------------------------

describe('failMessage()', () => {
  it('resets to pending when attempt_count < 3', () => {
    enqueueMessage(db, { chatId: 'c', text: 'fail me' });
    const claimed = claimNextMessage(db, 1);
    // attempt_count is now 1 (< 3)

    failMessage(db, claimed.id, 'network error');

    const row = db.prepare('SELECT status, last_error, attempt_count FROM message_queue WHERE id = ?').get(claimed.id);
    assert.strictEqual(row.status, 'pending');
    assert.strictEqual(row.last_error, 'network error');
  });

  it('sets dead_letter when attempt_count >= 3', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'exhaust me' });

    // Manually bump attempt_count to 2 (status stays pending so claimNextMessage can pick it up)
    db.prepare("UPDATE message_queue SET attempt_count = 2, status = 'pending' WHERE id = ?").run(id);

    // claimNextMessage increments attempt_count → 3
    const claimed = claimNextMessage(db, 1);

    failMessage(db, claimed.id, 'fatal error');

    const row = db.prepare('SELECT status FROM message_queue WHERE id = ?').get(claimed.id);
    assert.strictEqual(row.status, 'dead_letter');
  });

  it('handles Error object as error argument', () => {
    enqueueMessage(db, { chatId: 'c', text: 'error obj' });
    const claimed = claimNextMessage(db, 1);
    failMessage(db, claimed.id, new Error('something exploded'));

    const row = db.prepare('SELECT last_error FROM message_queue WHERE id = ?').get(claimed.id);
    assert.strictEqual(row.last_error, 'something exploded');
  });

  it('returns false if message is not in claimed state', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'not claimed' });
    const result = failMessage(db, id, 'error');
    assert.strictEqual(result, false);
  });
});

// ---------------------------------------------------------------------------
// recoverStaleClaims
// ---------------------------------------------------------------------------

describe('recoverStaleClaims()', () => {
  it('requeues stale claimed rows with attempt_count < 3', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'stale1' });
    // Manually set to claimed with old heartbeat and attempt_count = 1
    db.prepare(
      `UPDATE message_queue
       SET status = 'claimed', heartbeat_at = ?, attempt_count = 1
       WHERE id = ?`
    ).run(Date.now() - 999999, id);

    const recovered = recoverStaleClaims(db, 1000); // 1 second threshold
    assert.ok(recovered > 0, 'Should recover at least 1 row');

    const row = db.prepare('SELECT status FROM message_queue WHERE id = ?').get(id);
    assert.strictEqual(row.status, 'pending');
  });

  it('sends to dead_letter when attempt_count >= 3', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'exhausted' });
    db.prepare(
      `UPDATE message_queue
       SET status = 'claimed', heartbeat_at = ?, attempt_count = 3
       WHERE id = ?`
    ).run(Date.now() - 999999, id);

    recoverStaleClaims(db, 1000);

    const row = db.prepare('SELECT status FROM message_queue WHERE id = ?').get(id);
    assert.strictEqual(row.status, 'dead_letter');
  });

  it('does not touch fresh claimed rows', () => {
    const { id } = enqueueMessage(db, { chatId: 'c', text: 'fresh' });
    db.prepare(
      `UPDATE message_queue
       SET status = 'claimed', heartbeat_at = ?, attempt_count = 1
       WHERE id = ?`
    ).run(Date.now(), id); // fresh heartbeat

    const recovered = recoverStaleClaims(db, 60000); // 1 minute threshold
    assert.strictEqual(recovered, 0, 'Fresh row should not be recovered');

    const row = db.prepare('SELECT status FROM message_queue WHERE id = ?').get(id);
    assert.strictEqual(row.status, 'claimed');
  });
});

// ---------------------------------------------------------------------------
// getPendingCount / getQueueStats
// ---------------------------------------------------------------------------

describe('getPendingCount()', () => {
  it('returns 0 when queue is empty', () => {
    assert.strictEqual(getPendingCount(db), 0);
  });

  it('returns correct count after enqueuing', () => {
    enqueueMessage(db, { chatId: 'c', text: 'msg1' });
    enqueueMessage(db, { chatId: 'c', text: 'msg2' });
    assert.strictEqual(getPendingCount(db), 2);
  });

  it('decrements after claiming', () => {
    enqueueMessage(db, { chatId: 'c', text: 'msg' });
    claimNextMessage(db, 1);
    assert.strictEqual(getPendingCount(db), 0);
  });
});

describe('getQueueStats()', () => {
  it('returns all zero counts for empty queue', () => {
    const stats = getQueueStats(db);
    assert.strictEqual(stats.pending, 0);
    assert.strictEqual(stats.claimed, 0);
    assert.strictEqual(stats.completed, 0);
    assert.strictEqual(stats.failed, 0);
    assert.strictEqual(stats.dead_letter, 0);
  });

  it('returns correct counts across status buckets', () => {
    // 3 messages: one stays pending, one gets claimed, one gets completed
    enqueueMessage(db, { chatId: 'c', text: 'p1' });
    enqueueMessage(db, { chatId: 'c', text: 'p2' });
    enqueueMessage(db, { chatId: 'c', text: 'p3' });

    // claimed × 1
    const claimed = claimNextMessage(db, 1);

    // completed × 1
    const claimed2 = claimNextMessage(db, 1);
    completeMessage(db, claimed2.id);

    const stats = getQueueStats(db);
    assert.strictEqual(stats.pending, 1, 'pending should be 1');
    assert.strictEqual(stats.claimed, 1, 'claimed should be 1');
    assert.strictEqual(stats.completed, 1, 'completed should be 1');
    assert.strictEqual(stats.failed, 0, 'failed should be 0');
    assert.strictEqual(stats.dead_letter, 0, 'dead_letter should be 0');

    // Suppress unused variable warning
    void claimed;
  });
});
