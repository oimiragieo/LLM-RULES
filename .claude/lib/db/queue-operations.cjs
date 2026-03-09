#!/usr/bin/env node
'use strict';

/**
 * Queue Operations — Transactional message queue using better-sqlite3
 * ===================================================================
 *
 * All operations are synchronous (better-sqlite3 API).
 * JSON fields use JSON.stringify/JSON.parse with safeParseJSON for reads.
 *
 * Usage:
 *   const { enqueueMessage, claimNextMessage, heartbeat, completeMessage,
 *           failMessage, recoverStaleClaims, getPendingCount, getQueueStats
 *         } = require('.claude/lib/db/queue-operations.cjs');
 */

const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const EventEmitter = require('events');

const queueEvents = new EventEmitter();

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/**
 * Insert a new message with status 'pending'.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ chatId: string, userId?: string, text: string, attachments?: any[] }} msg
 * @returns {{ id: string }}
 */
function enqueueMessage(db, { chatId, userId, text, attachments }) {
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  const attachmentsJson = JSON.stringify(Array.isArray(attachments) ? attachments : []);

  db.prepare(
    `INSERT INTO message_queue
       (id, chat_id, user_id, text, attachments, timestamp, status, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)`
  ).run(id, chatId, userId || null, text, attachmentsJson, timestamp);

  queueEvents.emit('new-message', id);

  return { id };
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

/**
 * Atomically claim the next pending message (oldest first).
 * Sets status → 'claimed', records claimed_at, heartbeat_at, worker_pid,
 * and increments attempt_count.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [workerId] - Worker process PID (defaults to process.pid)
 * @returns {object|null} Claimed row or null if no pending messages
 */
function claimNextMessage(db, workerId) {
  const pid = workerId !== undefined ? workerId : process.pid;
  const now = Date.now();

  const claimTx = db.transaction(() => {
    // SELECT the oldest pending message
    const row = db
      .prepare(
        `SELECT id FROM message_queue
         WHERE status = 'pending'
         ORDER BY timestamp ASC
         LIMIT 1`
      )
      .get();

    if (!row) return null;

    // UPDATE atomically within the transaction
    const result = db
      .prepare(
        `UPDATE message_queue
         SET status = 'claimed',
             claimed_at = ?,
             heartbeat_at = ?,
             worker_pid = ?,
             attempt_count = attempt_count + 1
         WHERE id = ? AND status = 'pending'`
      )
      .run(now, now, pid, row.id);

    if (result.changes === 0) {
      // Another worker claimed it first — try again (return null; caller retries)
      return null;
    }

    return db.prepare('SELECT * FROM message_queue WHERE id = ?').get(row.id);
  });

  const claimed = claimTx();
  if (!claimed) return null;

  // Parse JSON fields safely
  return deserializeRow(claimed);
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

/**
 * Update heartbeat_at to prevent crash-recovery from requeuing an active worker.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} messageId
 * @returns {boolean} true if updated, false if row not found or not claimed
 */
function heartbeat(db, messageId) {
  const result = db
    .prepare(
      `UPDATE message_queue
       SET heartbeat_at = ?
       WHERE id = ? AND status = 'claimed'`
    )
    .run(Date.now(), messageId);

  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

/**
 * Mark a claimed message as completed.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} messageId
 * @param {any} [result] - Optional result payload (unused in schema, for future extension)
 * @returns {boolean}
 */
function completeMessage(db, messageId, result) {
  void result; // reserved for future result storage
  const res = db
    .prepare(
      `UPDATE message_queue
       SET status = 'completed', completed_at = ?
       WHERE id = ? AND status = 'claimed'`
    )
    .run(Date.now(), messageId);

  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Fail
// ---------------------------------------------------------------------------

/**
 * Mark a claimed message as failed or dead_letter.
 * - attempt_count < 3 → reset to 'pending' (retry)
 * - attempt_count >= 3 → set to 'dead_letter'
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} messageId
 * @param {string|Error} error - Error description
 * @returns {boolean}
 */
function failMessage(db, messageId, error) {
  const errorStr = error instanceof Error ? error.message : String(error || '');

  const row = db
    .prepare(`SELECT attempt_count FROM message_queue WHERE id = ? AND status = 'claimed'`)
    .get(messageId);

  if (!row) return false;

  const newStatus = row.attempt_count >= 3 ? 'dead_letter' : 'pending';

  const res = db
    .prepare(
      `UPDATE message_queue
       SET status = ?,
           last_error = ?,
           claimed_at = NULL,
           heartbeat_at = NULL,
           worker_pid = NULL
       WHERE id = ? AND status = 'claimed'`
    )
    .run(newStatus, errorStr, messageId);

  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Recover stale claims
// ---------------------------------------------------------------------------

/**
 * Find claimed rows where heartbeat has gone stale and reset them.
 * - attempt_count < 3 → reset to 'pending'
 * - attempt_count >= 3 → set to 'dead_letter'
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [staleThresholdMs=300000] - Staleness threshold in ms (default 5 min)
 * @returns {number} Number of rows recovered
 */
function recoverStaleClaims(db, staleThresholdMs) {
  const threshold = staleThresholdMs !== undefined ? staleThresholdMs : 5 * 60 * 1000;
  const cutoff = Date.now() - threshold;

  const recoverTx = db.transaction(() => {
    // Recover retryable stale claims
    const retryResult = db
      .prepare(
        `UPDATE message_queue
         SET status = 'pending',
             claimed_at = NULL,
             heartbeat_at = NULL,
             worker_pid = NULL,
             last_error = 'stale-claim-recovered'
         WHERE status = 'claimed'
           AND heartbeat_at < ?
           AND attempt_count < 3`
      )
      .run(cutoff);

    // Dead-letter exhausted stale claims
    const deadResult = db
      .prepare(
        `UPDATE message_queue
         SET status = 'dead_letter',
             claimed_at = NULL,
             heartbeat_at = NULL,
             worker_pid = NULL,
             last_error = 'stale-claim-max-attempts'
         WHERE status = 'claimed'
           AND heartbeat_at < ?
           AND attempt_count >= 3`
      )
      .run(cutoff);

    return retryResult.changes + deadResult.changes;
  });

  return recoverTx();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Count pending messages.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getPendingCount(db) {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM message_queue WHERE status = 'pending'`)
    .get();
  return row ? row.count : 0;
}

/**
 * Return count per status bucket.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ pending: number, claimed: number, completed: number, failed: number, dead_letter: number }}
 */
function getQueueStats(db) {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM message_queue
       GROUP BY status`
    )
    .all();

  const stats = { pending: 0, claimed: 0, completed: 0, failed: 0, dead_letter: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(stats, row.status)) {
      stats[row.status] = row.count;
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize JSON fields in a message_queue row.
 *
 * @param {object} row - Raw row from better-sqlite3
 * @returns {object}
 */
function deserializeRow(row) {
  if (!row) return row;
  const out = Object.assign({}, row);

  // attachments — JSON array
  if (typeof out.attachments === 'string') {
    const parsed = safeParseJSON(out.attachments, null);
    out.attachments = Array.isArray(parsed) ? parsed : [];
  }

  return out;
}

module.exports = {
  enqueueMessage,
  claimNextMessage,
  heartbeat,
  completeMessage,
  failMessage,
  recoverStaleClaims,
  getPendingCount,
  getQueueStats,
  queueEvents,
};
