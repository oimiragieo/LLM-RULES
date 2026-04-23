#!/usr/bin/env node
/**
 * CAT7 Lineage Query API — Slice S2
 * ===================================
 * Agent-to-agent lineage chain query for CAT7 memory records.
 *
 * Exports:
 *   recordLineage(recordId, predecessorId, baseDir)
 *     — Append predecessorId to the lineage array of the named record.
 *       The record is located by scanning all tier subdirectories (stm/mtm/ltm).
 *       Mutates the .json file on disk. Throws if recordId is not found.
 *
 *   traceLineage(recordId, baseDir)
 *     — Walk the predecessor chain starting from recordId.
 *       Returns an array of record objects ordered from the start record back
 *       to the earliest ancestor (i.e. [start, parent, grandparent, ...]).
 *       Detects circular references and throws with message including "circular".
 *       On missing predecessor: emits a warning to stderr and returns the
 *       partial chain collected so far (does NOT throw).
 *
 *   findDescendants(recordId, baseDir)
 *     — Scan all tier directories under baseDir for CAT7 records whose
 *       lineage array includes recordId.  Returns an array of record objects.
 *       Results are cached within a single call (no cross-call caching).
 *
 * Design notes:
 *   • Extends cat7-writer.cjs by COMPOSITION — this module requires the writer
 *     and calls writeRecord/readRecord but does NOT modify writer source.
 *   • Linear chain only (DR-3 decision in S1 — DAG deferred to v3.3.0).
 *   • Tier discovery: stm/ mtm/ ltm/ under baseDir.
 *   • Pure where possible; filesystem reads are cached within a single
 *     traceLineage / findDescendants call.
 *   • SE-01 Windows path normalisation applied throughout.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Tier constants ─────────────────────────────────────────────────────────

const TIERS = ['stm', 'mtm', 'ltm'];

// ── Writer dependency (composition, not modification) ─────────────────────

const WRITER_PATH = path.join(__dirname, 'cat7-writer.cjs');

function loadWriter() {
  return require(WRITER_PATH);
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Locate the .json file path for a given recordId by scanning all tier dirs.
 * Returns null if not found.
 *
 * @param {string} recordId
 * @param {string} baseDir
 * @returns {string|null}
 */
function findRecordPath(recordId, baseDir) {
  for (const tier of TIERS) {
    const candidate = path.join(baseDir, tier, `${recordId}.json`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Read all CAT7 records from all tier directories under baseDir.
 * Returns a Map keyed by record id → record object.
 * Skips files that fail to parse (warns on stderr).
 *
 * @param {string} baseDir
 * @returns {Map<string, object>}
 */
function readAllRecords(baseDir) {
  const { readRecord } = loadWriter();
  const result = new Map();
  for (const tier of TIERS) {
    const tierDir = path.join(baseDir, tier);
    if (!fs.existsSync(tierDir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(tierDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(tierDir, entry);
      try {
        const record = readRecord(filePath);
        if (record && record.id) {
          result.set(record.id, record);
        }
      } catch (err) {
        process.stderr.write(
          `[cat7-lineage] Warning: could not read ${filePath}: ${err.message}\n`
        );
      }
    }
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Append predecessorId to the lineage array of the record identified by
 * recordId.  The record is found by scanning all tier subdirectories.
 * Writes the updated record back to the same file.
 *
 * @param {string} recordId       — ID of the record to update
 * @param {string} predecessorId  — ID of the predecessor to add
 * @param {string} baseDir        — Base directory containing tier subdirs
 * @returns {void}
 * @throws {Error} if recordId is not found in any tier
 */
function recordLineage(recordId, predecessorId, baseDir) {
  const filePath = findRecordPath(recordId, baseDir);
  if (!filePath) {
    throw new Error(
      `[cat7-lineage] recordLineage: record '${recordId}' not found under '${baseDir}'`
    );
  }

  const { readRecord } = loadWriter();
  const record = readRecord(filePath);

  if (!Array.isArray(record.lineage)) {
    record.lineage = [];
  }

  // Append only if not already present (idempotent)
  if (!record.lineage.includes(predecessorId)) {
    record.lineage.push(predecessorId);
  }

  // Write back in-place (same tier, same path)
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

/**
 * Walk the predecessor chain starting from recordId, reading the lineage
 * field of each record to find its parent.
 *
 * Because lineage is a LINEAR CHAIN in v3.2.0, each record has at most one
 * active predecessor (the first element of the lineage array).  Multiple
 * entries are stored but only lineage[0] is followed during traversal.
 *
 * Returns an array of record objects: [start, parent, grandparent, ...].
 *
 * - Circular reference: throws Error with "circular" in the message.
 * - Missing predecessor: writes a warning to stderr and returns the partial
 *   chain collected so far (does NOT throw).
 *
 * @param {string} recordId  — ID of the record to start tracing from
 * @param {string} baseDir   — Base directory containing tier subdirs
 * @returns {object[]}
 */
function traceLineage(recordId, baseDir) {
  const { readRecord } = loadWriter();

  /** @type {object[]} */
  const chain = [];
  /** @type {Set<string>} */
  const visited = new Set();

  let currentId = recordId;

  while (currentId) {
    // Circular detection
    if (visited.has(currentId)) {
      throw new Error(
        `[cat7-lineage] traceLineage: circular lineage detected at '${currentId}' ` +
          `(chain so far: ${[...visited].join(' → ')})`
      );
    }
    visited.add(currentId);

    // Locate the record (cross-tier)
    const filePath = findRecordPath(currentId, baseDir);
    if (!filePath) {
      process.stderr.write(
        `[cat7-lineage] Warning: traceLineage: predecessor '${currentId}' not found — ` +
          `returning partial chain\n`
      );
      break;
    }

    let record;
    try {
      record = readRecord(filePath);
    } catch (err) {
      process.stderr.write(
        `[cat7-lineage] Warning: traceLineage: could not read '${currentId}': ` +
          `${err.message} — returning partial chain\n`
      );
      break;
    }

    chain.push(record);

    // Follow the first predecessor in the linear chain
    const lineage = Array.isArray(record.lineage) ? record.lineage : [];
    currentId = lineage.length > 0 ? lineage[0] : null;
  }

  return chain;
}

/**
 * Scan all tier directories under baseDir for CAT7 records whose lineage
 * array contains recordId.
 *
 * Filesystem reads are performed once and cached within this call.
 *
 * @param {string} recordId  — ID whose descendants to find
 * @param {string} baseDir   — Base directory containing tier subdirs
 * @returns {object[]}
 */
function findDescendants(recordId, baseDir) {
  const allRecords = readAllRecords(baseDir);
  const descendants = [];

  for (const [, record] of allRecords) {
    if (record.id === recordId) continue; // skip the record itself
    const lineage = Array.isArray(record.lineage) ? record.lineage : [];
    if (lineage.includes(recordId)) {
      descendants.push(record);
    }
  }

  return descendants;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  recordLineage,
  traceLineage,
  findDescendants,
};
