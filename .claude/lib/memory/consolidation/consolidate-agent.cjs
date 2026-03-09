#!/usr/bin/env node
'use strict';

/**
 * Consolidate Agent
 * =================
 * LLM-driven memory consolidation (stub — real LLM wired in P5).
 *
 * Reads unconsolidated entries from file_memory and episodic_memory,
 * generates a cross-cutting insight, and marks source entries as consolidated.
 *
 * Usage:
 *   const { consolidate } = require('.claude/lib/memory/consolidation/consolidate-agent.cjs');
 *   const result = await consolidate(db);
 *   // => { processed: N, insightId: 'uuid' | null }
 */

const crypto = require('crypto');

const MAX_ENTRIES = 50;

/**
 * Ensure a column exists on a table. Uses try/catch because SQLite does not
 * support "ADD COLUMN IF NOT EXISTS" syntax.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 * @param {string} columnDef - e.g. "INTEGER"
 */
function ensureColumn(db, table, column, columnDef) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDef}`).run();
  } catch (_) {
    // Column already exists — ignore
  }
}

/**
 * LLM-driven memory consolidation.
 * Stub: generates insight text as "consolidated: <id1>,<id2>,..."
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{ processed: number, insightId: string | null }>}
 */
async function consolidate(db) {
  // 1. Ensure consolidated_at column exists on both tables
  ensureColumn(db, 'file_memory', 'consolidated_at', 'INTEGER');
  ensureColumn(db, 'episodic_memory', 'consolidated_at', 'INTEGER');

  // 2. Fetch up to MAX_ENTRIES unconsolidated file_memory entries
  const fileMemoryRows = db
    .prepare(
      `SELECT id FROM file_memory
       WHERE consolidated_at IS NULL
       LIMIT ?`
    )
    .all(MAX_ENTRIES);

  // 3. Fetch up to MAX_ENTRIES unconsolidated episodic_memory entries
  const episodicRows = db
    .prepare(
      `SELECT id FROM episodic_memory
       WHERE consolidated_at IS NULL
       LIMIT ?`
    )
    .all(MAX_ENTRIES);

  // 4. If none → return early
  const totalEntries = fileMemoryRows.length + episodicRows.length;
  if (totalEntries === 0) {
    return { processed: 0, insightId: null };
  }

  const fmIds = fileMemoryRows.map(r => r.id);
  const emIds = episodicRows.map(r => r.id);
  const allIds = [...fmIds, ...emIds];

  // 5. Stub LLM call: generate insight text
  const insightText = 'consolidated: ' + allIds.join(',');

  // 6. Insert new episodic_memory insight row
  const insightId = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO episodic_memory
       (id, session_id, content, importance_score, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(insightId, 'consolidation', insightText, 0.7, now);

  // 7. Mark source file_memory entries as consolidated
  if (fmIds.length > 0) {
    const fmPlaceholders = fmIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE file_memory
       SET consolidated_at = ?
       WHERE id IN (${fmPlaceholders})`
    ).run(now, ...fmIds);
  }

  // 7b. Mark source episodic_memory entries as consolidated
  if (emIds.length > 0) {
    const emPlaceholders = emIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE episodic_memory
       SET consolidated_at = ?
       WHERE id IN (${emPlaceholders})`
    ).run(now, ...emIds);
  }

  // 8. Return result
  return { processed: totalEntries, insightId };
}

module.exports = { consolidate };
