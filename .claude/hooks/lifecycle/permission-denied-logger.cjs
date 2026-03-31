#!/usr/bin/env node
/**
 * Permission Denied Logger Hook (PermissionDenied)
 * =================================================
 * Advisory-only hook that fires when Claude Code denies a tool permission.
 *
 * Appends a structured JSON entry (tool, reason, timestamp, session_id)
 * to .claude/context/runtime/denial-log.json for downstream routing
 * feedback analysis.
 *
 * Behaviour:
 *   - Creates the runtime directory and log file if they are missing.
 *   - Bounded at 500 entries (configurable via DENIAL_LOG_MAX_ENTRIES env var).
 *   - Trims oldest entries on overflow (FIFO eviction).
 *   - Resets to [] if the log file is corrupted (non-JSON, non-array).
 *   - ALWAYS exits 0 — never blocks execution (fail-open).
 *
 * Security compliance:
 *   SE-01: 'use strict' at top
 *   SE-02: safeParseJSON not used for complex schema — standard JSON.parse with
 *          explicit array-type check and catch-all reset satisfies safe-parse
 *          intent for this append-only log (no prototype-sensitive schema)
 *   SE-03: Always exits 0 (fail-open advisory hook)
 *   SE-04: project-root.cjs used for path resolution (never process.cwd())
 *
 * Registration: settings.json PermissionDenied matcher ""
 * Fulfills: VAL-NE-003, VAL-NE-004
 *
 * @module permission-denied-logger
 */

'use strict';

const path = require('path');
const fs = require('fs');

const { PROJECT_ROOT } = require(
  path.join(__dirname, '..', '..', 'lib', 'utils', 'project-root.cjs')
);

const { parseHookInputAsync, formatResult } = require(
  path.join(__dirname, '..', '..', 'lib', 'utils', 'hook-input.cjs')
);

const HOOK_NAME = 'permission-denied-logger';

/** Default maximum number of denial log entries. */
const DEFAULT_MAX_ENTRIES = 500;

/** Canonical runtime directory (created if absent). */
const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

/** Canonical log file path. */
const DEFAULT_LOG_FILE = path.join(DEFAULT_RUNTIME_DIR, 'denial-log.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the configured maximum number of entries.
 * Reads DENIAL_LOG_MAX_ENTRIES from the environment; falls back to 500.
 *
 * @returns {number}
 */
function getMaxEntries() {
  const fromEnv = parseInt(process.env.DENIAL_LOG_MAX_ENTRIES, 10);
  if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_MAX_ENTRIES;
}

/**
 * Read the denial log from disk.
 * Returns [] when the file is missing, empty, or corrupted (fail-open).
 *
 * @param {string} [logFile] - Path to the log file (defaults to DEFAULT_LOG_FILE)
 * @returns {Array<Object>}
 */
function readLog(logFile) {
  const filePath = logFile || DEFAULT_LOG_FILE;
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return [];
    const parsed = JSON.parse(content);
    // Must be an array — any other value is treated as corruption.
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_e) {
    // File corruption: reset to empty array.
    return [];
  }
}

/**
 * Write entries to the denial log, creating parent directories as needed.
 *
 * @param {Array<Object>} entries - Log entries to persist
 * @param {string} [logFile] - Path to the log file (defaults to DEFAULT_LOG_FILE)
 */
function writeLog(entries, logFile) {
  const filePath = logFile || DEFAULT_LOG_FILE;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

/**
 * Build a structured denial log entry from PermissionDenied hook input.
 *
 * Claude Code PermissionDenied input shape (best-effort extraction):
 *   { tool_name, session_id, reason?, message?, description? }
 *
 * @param {Object|null} hookInput - Parsed hook input
 * @returns {{ tool: string, reason: string, timestamp: string, session_id: string }}
 */
function buildEntry(hookInput) {
  const tool = String(
    (hookInput && (hookInput.tool_name || hookInput.tool)) || 'unknown'
  );

  const reason = String(
    (hookInput &&
      (hookInput.reason ||
        hookInput.message ||
        hookInput.description ||
        hookInput.permissionDecisionReason)) ||
      'unknown'
  );

  const session_id = String((hookInput && hookInput.session_id) || '');

  return {
    tool,
    reason,
    timestamp: new Date().toISOString(),
    session_id,
  };
}

/**
 * Append a denial entry to the log file.
 * Trims the oldest entries when the bounded limit is exceeded.
 *
 * Exported for unit testing — call this with explicit paths to avoid
 * touching the real denial-log.json during tests.
 *
 * @param {Object|null} hookInput - Parsed hook input
 * @param {string} [logFile] - Override log file path (for tests)
 * @param {number} [maxEntries] - Override max entries (for tests)
 * @returns {{ entry: Object, entries: Array<Object> }}
 */
function appendEntry(hookInput, logFile, maxEntries) {
  const resolvedLogFile = logFile || DEFAULT_LOG_FILE;
  const resolvedMax = maxEntries !== undefined ? maxEntries : getMaxEntries();

  const entry = buildEntry(hookInput);
  let entries = readLog(resolvedLogFile);

  entries.push(entry);

  // FIFO eviction: trim oldest when over the limit.
  if (entries.length > resolvedMax) {
    entries = entries.slice(entries.length - resolvedMax);
  }

  writeLog(entries, resolvedLogFile);

  return { entry, entries };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Hook entrypoint — reads stdin, appends to denial log, exits 0.
 * Always exits 0 regardless of errors (fail-open advisory hook).
 */
async function main() {
  try {
    const hookInput = await parseHookInputAsync();

    appendEntry(hookInput, DEFAULT_LOG_FILE);

    // PermissionDenied hooks: output allow decision (we never block).
    console.log(formatResult('allow', ''));
    process.exit(0);
  } catch (err) {
    // SE-03: Advisory hooks are fail-open — log error to stderr and exit 0.
    process.stderr.write(`[${HOOK_NAME}] Error (ignored, fail-open): ${err.message}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildEntry,
  readLog,
  writeLog,
  appendEntry,
  getMaxEntries,
  HOOK_NAME,
  DEFAULT_LOG_FILE,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_MAX_ENTRIES,
};
