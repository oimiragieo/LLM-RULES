/**
 * consolidation-lock.cjs — Mtime-as-Timestamp Consolidation Lock
 * ===============================================================
 *
 * Implements Claude Code's mtime-as-timestamp lock pattern for memory
 * consolidation. The lock file (`.consolidate-lock`) serves dual purpose:
 *   - File body: current holder's PID (string)
 *   - File mtime: last successful consolidation timestamp
 *
 * API:
 *   readLastConsolidatedAt(memoryDir)          → mtimeMs or 0
 *   tryAcquireConsolidationLock(memoryDir)     → priorMtime or null
 *   rollbackConsolidationLock(memoryDir, mtime) → void
 *   shouldConsolidate(memoryDir, options)      → { should, reason, ... }
 *
 * Design principles:
 *   - Stale threshold: 60 minutes (dead PID or old mtime → reclaim)
 *   - Time gate: 24+ hours since last consolidation
 *   - Session gate: 5+ MTM files with mtime > lastConsolidatedAt
 *   - Scan throttle: module-level state, re-scan at most every 10 minutes
 *   - Corrupted lock content (non-numeric PID) treated as reclaimable
 *
 * Created: Phase 8 — mtime-lock-session-trigger milestone
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MEMORY_DIR } = require('./memory-paths.cjs');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Lock file name within the memory directory */
const LOCK_FILENAME = '.consolidate-lock';

/** Stale threshold: 60 minutes in ms */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Time gate: 24 hours in ms */
const TIME_GATE_MS = 24 * 60 * 60 * 1000;

/** Scan throttle: 10 minutes in ms */
const SCAN_THROTTLE_MS = 10 * 60 * 1000;

/** Session gate: minimum MTM files required since last consolidation */
const SESSION_GATE = 5;

// ── Module-level state ────────────────────────────────────────────────────────

/**
 * Timestamp of the last session scan (module-level, persists across calls
 * within the same process). Reset when the module is reloaded.
 */
let _lastScanTime = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the absolute path to the consolidation lock file.
 *
 * @param {string} [memoryDir] - Override base memory directory (for testing)
 * @returns {string}
 */
function getLockPath(memoryDir) {
  return path.join(memoryDir || MEMORY_DIR, LOCK_FILENAME);
}

/**
 * Check whether a process with the given PID is currently running.
 * Uses `process.kill(pid, 0)` which is cross-platform in Node.js:
 *   - Throws ESRCH if the process doesn't exist
 *   - Throws EPERM if the process exists but we can't signal it (still alive)
 *   - Returns without throwing if we can signal it (alive)
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: process exists but no permission to signal → still alive
    if (e.code === 'EPERM') return true;
    // ESRCH (or other): process does not exist
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the mtimeMs of the `.consolidate-lock` file, which represents
 * the timestamp of the last successful consolidation. Returns 0 if the
 * file does not exist (never consolidated).
 *
 * @param {string} [memoryDir] - Override base memory directory (for testing)
 * @returns {number} mtimeMs or 0
 */
function readLastConsolidatedAt(memoryDir) {
  const lockPath = getLockPath(memoryDir);
  try {
    const stat = fs.statSync(lockPath);
    return stat.mtimeMs;
  } catch (_e) {
    return 0;
  }
}

/**
 * Attempt to acquire the consolidation lock.
 *
 * Algorithm:
 *   1. Stat existing lock file to get prior mtime.
 *   2. If file exists: read PID. If the PID belongs to a live process AND
 *      the lock mtime is within the 60-minute stale threshold → blocked
 *      (return null). Otherwise reclaim (dead PID or stale lock).
 *   3. Write process.pid to lock file (OS sets mtime = now automatically).
 *   4. Re-read to detect races — if content doesn't match our PID → null.
 *   5. Return prior mtime so callers can rollback on failure.
 *
 * @param {string} [memoryDir] - Override base memory directory (for testing)
 * @returns {number|null} Prior mtime (for rollback) or null if blocked/failed
 */
function tryAcquireConsolidationLock(memoryDir) {
  const lockPath = getLockPath(memoryDir);
  let priorMtime = 0;

  // ── Step 1 & 2: Check existing lock ────────────────────────────────────────
  try {
    const stat = fs.statSync(lockPath);
    priorMtime = stat.mtimeMs;

    // Try to read holder PID
    let content = '';
    try {
      content = fs.readFileSync(lockPath, 'utf8').trim();
    } catch (_readErr) {
      // Unreadable → treat as corrupted → reclaimable
    }

    const holderPid = parseInt(content, 10);
    // A valid PID is a positive integer whose decimal form equals the content
    const isPidValid =
      Number.isInteger(holderPid) && holderPid > 0 && String(holderPid) === content;

    if (isPidValid) {
      const isStale = Date.now() - stat.mtimeMs > STALE_THRESHOLD_MS;
      if (!isStale && isProcessAlive(holderPid)) {
        // Lock is held by a live process within the stale window → blocked
        return null;
      }
      // Dead PID or stale lock → fall through to reclaim
    }
    // Corrupted content → fall through to reclaim
  } catch (_statErr) {
    // ENOENT (file doesn't exist) or other stat error → priorMtime stays 0
  }

  // ── Step 3: Ensure directory exists and write our PID ─────────────────────
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch (_mkdirErr) {
    return null;
  }

  try {
    fs.writeFileSync(lockPath, String(process.pid), 'utf8');
  } catch (_writeErr) {
    return null;
  }

  // ── Step 4: Verify by re-reading (race detection) ─────────────────────────
  try {
    const written = fs.readFileSync(lockPath, 'utf8').trim();
    if (written !== String(process.pid)) {
      return null; // Another process won the race
    }
  } catch (_readErr) {
    return null;
  }

  // ── Step 5: Return prior mtime for rollback ───────────────────────────────
  return priorMtime;
}

/**
 * Roll back the consolidation lock to its pre-acquire state.
 *
 * - If priorMtime is 0 (lock didn't exist before): delete the file.
 * - Otherwise: use fs.utimesSync to rewind mtime to the prior value.
 *
 * This allows `readLastConsolidatedAt` to return the pre-run timestamp,
 * so the next `shouldConsolidate` check will trigger consolidation again.
 *
 * @param {string} [memoryDir]  - Override base memory directory (for testing)
 * @param {number}  priorMtime  - Value returned by tryAcquireConsolidationLock
 */
function rollbackConsolidationLock(memoryDir, priorMtime) {
  const lockPath = getLockPath(memoryDir);
  if (priorMtime === 0) {
    // Lock didn't exist before — remove it
    try {
      fs.unlinkSync(lockPath);
    } catch (_e) {
      // Ignore: file may have already been removed
    }
  } else {
    // Rewind mtime to the pre-acquire value
    try {
      const priorDate = new Date(priorMtime);
      fs.utimesSync(lockPath, priorDate, priorDate);
    } catch (_e) {
      // Best-effort: if utimesSync fails, leave the file as-is
    }
  }
}

/**
 * Determine whether a consolidation run should be triggered now.
 *
 * Gates (evaluated in order):
 *   1. Time gate     — 24+ hours since last consolidation (lock mtime)
 *   2. Scan throttle — do not re-scan sessions more than once per 10 minutes
 *   3. Session gate  — 5+ MTM files with mtime > lastConsolidatedAt
 *
 * @param {string} [memoryDir] - Override base memory directory (for testing)
 * @param {object} [_options]  - Reserved for future use
 * @returns {{ should: boolean, reason: string, sessionCount?: number, hoursSince?: number }}
 */
function shouldConsolidate(memoryDir, _options) {
  const dir = memoryDir || MEMORY_DIR;
  const now = Date.now();

  // ── Gate 1: Time gate ─────────────────────────────────────────────────────
  const lastConsolidatedAt = readLastConsolidatedAt(dir);
  const hoursSince =
    lastConsolidatedAt === 0 ? Infinity : (now - lastConsolidatedAt) / (60 * 60 * 1000);

  if (lastConsolidatedAt !== 0 && now - lastConsolidatedAt < TIME_GATE_MS) {
    return { should: false, reason: 'time-gate', hoursSince };
  }

  // ── Gate 2: Scan throttle ─────────────────────────────────────────────────
  if (now - _lastScanTime < SCAN_THROTTLE_MS) {
    return { should: false, reason: 'scan-throttle' };
  }

  // Record that we are starting a session scan
  _lastScanTime = now;

  // ── Gate 3: Session gate ──────────────────────────────────────────────────
  let sessionCount = 0;
  const mtmPath = path.join(dir, 'mtm');
  try {
    const entries = fs.readdirSync(mtmPath);
    for (const entry of entries) {
      // Skip hidden files (e.g. .gitkeep)
      if (entry.startsWith('.')) continue;
      const entryPath = path.join(mtmPath, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs > lastConsolidatedAt) {
          sessionCount++;
        }
      } catch (_e) {
        // Skip unreadable entries
      }
    }
  } catch (_e) {
    // MTM directory missing or unreadable → sessionCount stays 0
    sessionCount = 0;
  }

  if (sessionCount < SESSION_GATE) {
    return { should: false, reason: 'session-gate', sessionCount, hoursSince };
  }

  return { should: true, reason: 'all-gates-passed', sessionCount, hoursSince };
}

module.exports = {
  readLastConsolidatedAt,
  tryAcquireConsolidationLock,
  rollbackConsolidationLock,
  shouldConsolidate,
};
