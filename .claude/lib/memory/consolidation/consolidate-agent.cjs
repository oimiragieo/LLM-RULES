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
 * The entire read → mark → insert sequence runs inside a single
 * IMMEDIATE transaction to prevent concurrent consolidators from
 * double-processing the same rows.
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
 * All read + mark + insert steps run inside an IMMEDIATE transaction
 * so concurrent consolidators cannot double-process the same rows.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{ processed: number, insightId: string | null }>}
 */
async function consolidate(db) {
  // 1. Ensure consolidated_at column exists on both tables (outside transaction —
  //    DDL and DML cannot mix in the same SQLite transaction reliably).
  ensureColumn(db, 'file_memory', 'consolidated_at', 'INTEGER');
  ensureColumn(db, 'episodic_memory', 'consolidated_at', 'INTEGER');

  // 2. Run the read → insert → mark sequence atomically.
  //    IMMEDIATE acquires a reserved lock at BEGIN time, preventing other
  //    writers from starting until this transaction commits.
  const result = db
    .transaction(() => {
      // Fetch up to MAX_ENTRIES unconsolidated file_memory entries
      const fileMemoryRows = db
        .prepare(
          `SELECT id FROM file_memory
           WHERE consolidated_at IS NULL
           LIMIT ?`
        )
        .all(MAX_ENTRIES);

      // Fetch up to MAX_ENTRIES unconsolidated episodic_memory entries
      const episodicRows = db
        .prepare(
          `SELECT id FROM episodic_memory
           WHERE consolidated_at IS NULL
           LIMIT ?`
        )
        .all(MAX_ENTRIES);

      // If none → return early (no work to do inside this transaction)
      const totalEntries = fileMemoryRows.length + episodicRows.length;
      if (totalEntries === 0) {
        return { processed: 0, insightId: null };
      }

      const fmIds = fileMemoryRows.map(r => r.id);
      const emIds = episodicRows.map(r => r.id);
      const allIds = [...fmIds, ...emIds];

      // Stub LLM call: generate insight text
      const insightText = 'consolidated: ' + allIds.join(',');

      // Insert new episodic_memory insight row
      const insightId = crypto.randomUUID();
      const now = Date.now();

      db.prepare(
        `INSERT INTO episodic_memory
           (id, session_id, content, importance_score, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(insightId, 'consolidation', insightText, 0.7, now);

      // Mark source file_memory entries as consolidated
      if (fmIds.length > 0) {
        const fmPlaceholders = fmIds.map(() => '?').join(',');
        db.prepare(
          `UPDATE file_memory
           SET consolidated_at = ?
           WHERE id IN (${fmPlaceholders})`
        ).run(now, ...fmIds);
      }

      // Mark source episodic_memory entries as consolidated
      if (emIds.length > 0) {
        const emPlaceholders = emIds.map(() => '?').join(',');
        db.prepare(
          `UPDATE episodic_memory
           SET consolidated_at = ?
           WHERE id IN (${emPlaceholders})`
        ).run(now, ...emIds);
      }

      return { processed: totalEntries, insightId };
    })
    .immediate();

  return result;
}

module.exports = { consolidate };
