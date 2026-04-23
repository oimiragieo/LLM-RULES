#!/usr/bin/env node
// Agent: nodejs-pro | Task: #5 | Session: 2026-04-23
/**
 * MMP CLI — Mesh Memory Protocol lineage commands
 * ================================================
 * Wraps the CAT7 lineage API to expose lineage/descendants queries
 * from the command line.
 *
 * Usage:
 *   node mmp.cjs lineage <record-id> [--format=json|tree] [--json]
 *   node mmp.cjs descendants <record-id> [--format=json|tree] [--json]
 *
 * Exit codes:
 *   0  success
 *   1  record not found
 *   2  usage error (missing/unknown subcommand or missing record-id)
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ── Project root resolution ──────────────────────────────────────────────────

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// ── Lazy-load lib modules (deferred for testability) ────────────────────────

function loadLineageLib() {
  return require(path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'cat7-lineage.cjs'));
}

// ── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Parse process.argv style args array.
 *
 * @param {string[]} argv  — full process.argv (first two entries are node + script)
 * @returns {{ subcommand: string|null, recordId: string|null, format: 'json'|'tree' }}
 */
function parseArgs(argv) {
  const args = argv.slice(2); // drop node + script path

  let format = 'json';
  let subcommand = null;
  let recordId = null;
  const positional = [];

  for (const arg of args) {
    if (arg === '--json') {
      format = 'json';
    } else if (arg.startsWith('--format=')) {
      const val = arg.slice('--format='.length);
      if (val === 'tree' || val === 'json') {
        format = val;
      }
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length >= 1) subcommand = positional[0];
  if (positional.length >= 2) recordId = positional[1];

  return { subcommand, recordId, format };
}

// ── Output formatters ─────────────────────────────────────────────────────────

/**
 * Render records as an indented ASCII tree.
 * Each level is indented by 2 spaces. The first record is the root (deepest
 * ancestor at the end for lineage, or the source node for descendants).
 *
 * @param {object[]} records
 * @param {'lineage'|'descendants'} mode
 * @returns {string}
 */
function renderTree(records, mode) {
  if (records.length === 0) return '(empty)';

  const lines = [];
  if (mode === 'lineage') {
    // records[0] is start, records[last] is earliest ancestor
    records.forEach((rec, i) => {
      const indent = '  '.repeat(i);
      lines.push(`${indent}${rec.id}  [${rec.concept || ''}]`);
    });
  } else {
    // descendants — flat list with leading dash
    records.forEach(rec => {
      lines.push(`  - ${rec.id}  [${rec.concept || ''}]`);
    });
  }
  return lines.join('\n');
}

// ── Base directory resolution ─────────────────────────────────────────────────

function resolveBaseDir() {
  if (process.env.MMP_BASE_DIR) return process.env.MMP_BASE_DIR;
  return path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

function cmdLineage(recordId, format) {
  const baseDir = resolveBaseDir();
  const { traceLineage } = loadLineageLib();

  let chain;
  try {
    chain = traceLineage(recordId, baseDir);
  } catch (err) {
    process.stderr.write(`mmp lineage: error: ${err.message}\n`);
    process.exit(1);
  }

  if (chain.length === 0) {
    process.stderr.write(`mmp lineage: record '${recordId}' not found\n`);
    process.exit(1);
  }

  if (format === 'tree') {
    process.stdout.write(renderTree(chain, 'lineage') + '\n');
  } else {
    process.stdout.write(JSON.stringify(chain, null, 2) + '\n');
  }
}

function cmdDescendants(recordId, format) {
  const baseDir = resolveBaseDir();
  const { findDescendants } = loadLineageLib();

  let descendants;
  try {
    descendants = findDescendants(recordId, baseDir);
  } catch (err) {
    process.stderr.write(`mmp descendants: error: ${err.message}\n`);
    process.exit(1);
  }

  // findDescendants returns [] for both "found with 0 descendants" and "not found".
  // We check if the source record exists to distinguish not-found from empty.
  // If descendants is empty AND we cannot locate the source record in any tier,
  // exit 1 so callers can distinguish "no descendants" from "record not found".
  if (descendants.length === 0) {
    // Verify the source record exists
    const tierDirs = ['stm', 'mtm', 'ltm'];
    const found = tierDirs.some(tier =>
      fs.existsSync(path.join(baseDir, tier, `${recordId}.json`))
    );
    if (!found) {
      process.stderr.write(`mmp descendants: record '${recordId}' not found\n`);
      process.exit(1);
    }
  }

  if (format === 'tree') {
    process.stdout.write(renderTree(descendants, 'descendants') + '\n');
  } else {
    process.stdout.write(JSON.stringify(descendants, null, 2) + '\n');
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

function main(argv) {
  const { subcommand, recordId, format } = parseArgs(argv);

  if (!subcommand) {
    process.stderr.write(
      'Usage: mmp.cjs <subcommand> <record-id> [--format=json|tree] [--json]\n' +
        'Subcommands: lineage, descendants\n'
    );
    process.exit(2);
  }

  if (subcommand !== 'lineage' && subcommand !== 'descendants') {
    process.stderr.write(`mmp: unknown subcommand '${subcommand}'. Use lineage or descendants.\n`);
    process.exit(2);
  }

  if (!recordId || recordId.trim() === '') {
    process.stderr.write(`mmp ${subcommand}: missing <record-id> argument\n`);
    process.exit(2);
  }

  if (subcommand === 'lineage') {
    cmdLineage(recordId, format);
  } else {
    cmdDescendants(recordId, format);
  }
}

// Only run when executed directly (not when require()'d in tests)
if (require.main === module) {
  main(process.argv);
}

module.exports = { parseArgs, renderTree };
