#!/usr/bin/env node
'use strict';

/**
 * Retention Enforcer
 * ==================
 * Purges expired file_memory rows based on their expires_at timestamp.
 *
 * Usage:
 *   const { enforceRetention } = require('.claude/lib/memory/consolidation/retention-enforcer.cjs');
 *   const result = enforceRetention(db);
 *   // => { purgedFileMemory: N }
 */

/**
 * Delete file_memory rows where expires_at is set and has passed.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ purgedFileMemory: number }}
 */
function enforceRetention(db) {
  const now = Date.now();
  const result = db
    .prepare('DELETE FROM file_memory WHERE expires_at IS NOT NULL AND expires_at < ?')
    .run(now);
  return { purgedFileMemory: result.changes };
}

module.exports = { enforceRetention };
