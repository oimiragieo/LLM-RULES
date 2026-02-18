#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LEDGER_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'task-claim-ledger.json'
);

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'canceled', 'deleted']);

// Lock configuration for proper-lockfile
const LOCK_OPTIONS = {
  stale: 5000,
  retries: {
    retries: 5,
    factor: 2,
    minTimeout: 25,
    maxTimeout: 500,
  },
};

function ensureRuntimeDir() {
  const dir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * BUG 1 FIX (RMW race): Acquire a file-level lock that spans the entire
 * read-modify-write cycle. The previous code only locked during the write
 * (inside atomicWriteJSONSync), leaving the READ outside the lock window.
 * Two concurrent processes could both read the old state and the last
 * writer would silently overwrite the first writer's changes.
 *
 * This function holds the lock across the full callback (read + modify + write),
 * preventing any interleaved reads from other processes during the mutation.
 *
 * @param {Function} fn - Callback receiving the ledger; must return the
 *   (possibly modified) ledger to persist, or undefined/null to skip write.
 * @returns {*} The return value of fn.
 */
function withLedgerLock(fn) {
  ensureRuntimeDir();

  // Lock target: use the file itself if it exists, else the directory.
  // proper-lockfile requires the lock target to exist, so we create the
  // ledger file (empty object) if it doesn't yet exist before locking.
  if (!fs.existsSync(LEDGER_FILE)) {
    try {
      // Only write a stub if the file genuinely doesn't exist; this is
      // a one-time bootstrap write, not a state mutation.
      fs.writeFileSync(LEDGER_FILE, JSON.stringify({ claims: {}, updatedAt: null }) + '\n', {
        flag: 'wx', // Exclusive create; safe if another process races us here
      });
    } catch (_err) {
      // EEXIST: another process created it between our existsSync and writeFileSync.
      // That is fine — we proceed with the lock below.
    }
  }

  let releaseLock;
  try {
    // Acquire exclusive lock spanning the entire read-modify-write cycle.
    releaseLock = lockfile.lockSync(LEDGER_FILE, LOCK_OPTIONS);
  } catch (lockErr) {
    // Lock acquisition failed (e.g., stale lock that couldn't be acquired).
    // Log and fall through to unlocked execution as a degraded-mode fallback,
    // consistent with the "hooks must not crash the pipeline" rule.
    if (process.env.DEBUG_TASK_CLAIM_LEDGER) {
      process.stderr.write(`[task-claim-ledger] Lock acquisition failed: ${lockErr.message}\n`);
    }
    releaseLock = null;
  }

  try {
    const ledger = readLedgerDirect();
    const result = fn(ledger);
    if (result && typeof result === 'object' && typeof result.claims === 'object') {
      writeLedgerDirect(result);
    }
    return result;
  } finally {
    if (typeof releaseLock === 'function') {
      try {
        releaseLock();
      } catch (_unlockErr) {
        // Best-effort unlock.
      }
    }
  }
}

function normalizePathToken(value) {
  if (value == null) return '';
  let token = String(value).trim();
  if (!token) return '';
  token = token.replace(/\\/g, '/');
  token = token.replace(/\/+/g, '/');
  token = token.replace(/^\.\//, '');
  token = token.replace(/\/$/, '');
  return process.platform === 'win32' ? token.toLowerCase() : token;
}

function normalizePathList(values) {
  if (!Array.isArray(values)) return [];
  const out = new Set();
  for (const value of values) {
    const normalized = normalizePathToken(value);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

function hasPathOverlap(a, b) {
  for (const left of a) {
    for (const right of b) {
      if (left === right) return true;
      if (left.startsWith(`${right}/`)) return true;
      if (right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

function defaultLedger() {
  return {
    claims: {},
    updatedAt: null,
  };
}

/**
 * BUG 2 FIX (pure read): Internal read function that is ALWAYS a pure read
 * with no side-effects. Used internally where the caller holds the lock or
 * where a snapshot is sufficient (no pruning needed).
 *
 * Previously, readLedger was called by getActiveClaims which then called
 * pruneExpiredClaims which called writeLedger — making the "read" path
 * mutate state as a side-effect.
 */
function readLedgerDirect() {
  try {
    if (!fs.existsSync(LEDGER_FILE)) return defaultLedger();
    const parsed = safeParseJSON(fs.readFileSync(LEDGER_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.claims !== 'object') {
      return defaultLedger();
    }
    return {
      claims: parsed.claims || {},
      updatedAt: parsed.updatedAt || null,
    };
  } catch (_err) {
    return defaultLedger();
  }
}

/**
 * Public read function — pure, no side-effects.
 * Exported for consumers that need a snapshot of the ledger state.
 */
function readLedger() {
  return readLedgerDirect();
}

/**
 * Internal write function (does NOT acquire a lock — caller must hold the
 * lock via withLedgerLock or must call writeLedger from within a mutation).
 */
function writeLedgerDirect(ledger) {
  ensureRuntimeDir();
  const payload = {
    claims: ledger.claims || {},
    updatedAt: new Date().toISOString(),
  };
  // atomicWriteJSONSync uses temp-then-rename and its own lockfile internally.
  // We pass skipLock: true because the outer withLedgerLock already holds the
  // exclusive lock for the entire RMW cycle (Bug 1 fix). Acquiring a second
  // nested lock would cause a deadlock with proper-lockfile.
  atomicWriteJSONSync(LEDGER_FILE, payload, { skipLock: true });
}

/**
 * Public write function — acquires lock for the write.
 * Use for standalone writes that do not go through withLedgerLock.
 */
function writeLedger(ledger) {
  ensureRuntimeDir();
  const payload = {
    claims: ledger.claims || {},
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJSONSync(LEDGER_FILE, payload);
}

function isClaimExpired(claim) {
  const ttlMs = Number(process.env.TASK_CLAIM_TTL_MS || 2 * 60 * 60 * 1000);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const ts = Date.parse(claim?.updatedAt || claim?.createdAt || '');
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Date.now() - ts > ttlMs;
}

/**
 * BUG 2 FIX (pure read in pruneExpiredClaims):
 * Prune expired claims from an IN-MEMORY ledger object.
 * This function does NOT write to disk; the caller is responsible
 * for persisting the result.
 *
 * @returns {boolean} true if any claims were pruned
 */
function pruneExpiredClaimsInMemory(ledger) {
  const claims = ledger.claims || {};
  let changed = false;
  for (const [taskId, claim] of Object.entries(claims)) {
    if (isClaimExpired(claim)) {
      delete claims[taskId];
      changed = true;
    }
  }
  return changed;
}

/**
 * BUG 2 FIX (read side-effect):
 * Previously: getActiveClaims() -> pruneExpiredClaims() -> writeLedger()
 * This turned a "read" operation into a write operation as a hidden side-effect.
 *
 * Fixed: getActiveClaims() now uses withLedgerLock to atomically prune AND
 * write (only if something changed), keeping the write under the lock. The
 * filtering is a pure in-memory step — no writes happen outside the lock.
 *
 * For callers that only need a snapshot (e.g., findOwnershipConflicts),
 * use getActiveClaimsSnapshot() which is always a pure read.
 */
function getActiveClaims() {
  // Use a lock so that pruning (if needed) is atomic with the write.
  // withLedgerLock calls the callback with the current ledger state.
  // We prune in-memory and return the result; withLedgerLock persists it
  // only if the callback returns an object with a claims property.
  let activeClaims = [];

  withLedgerLock(ledger => {
    const changed = pruneExpiredClaimsInMemory(ledger);
    activeClaims = Object.values(ledger.claims || {}).filter(
      claim => claim && claim.active !== false
    );
    // Only persist if we actually pruned something (avoids spurious writes).
    return changed ? ledger : null;
  });

  return activeClaims;
}

/**
 * Pure read: returns active claims as a snapshot, never writes to disk.
 * Use this inside withLedgerLock callbacks to avoid double-locking.
 */
function getActiveClaimsSnapshot(ledger) {
  return Object.values(ledger.claims || {}).filter(claim => claim && claim.active !== false);
}

function parsePromptList(prompt, key) {
  if (!prompt || typeof prompt !== 'string') return [];
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'im');
  const match = prompt.match(re);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[,;]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function extractClaimMetadataFromTaskInput(toolInput = {}) {
  const prompt = String(toolInput.prompt || '');
  const ownedFromInput = Array.isArray(toolInput.owned_paths)
    ? toolInput.owned_paths
    : Array.isArray(toolInput.ownedPaths)
      ? toolInput.ownedPaths
      : [];
  const allowedFiles = Array.isArray(toolInput.allowed_files)
    ? toolInput.allowed_files
    : Array.isArray(toolInput.allowedFiles)
      ? toolInput.allowedFiles
      : [];
  const allowedFromPrompt = parsePromptList(prompt, 'ALLOWED_FILES');
  const ownedFromPrompt = parsePromptList(prompt, 'OWNED_PATHS');
  const dependencies = (Array.isArray(toolInput.depends_on) ? toolInput.depends_on : []).concat(
    parsePromptList(prompt, 'DEPENDS_ON')
  );
  const dependencyType =
    toolInput.dependency_type ||
    toolInput.dependencyType ||
    parsePromptList(prompt, 'DEPENDENCY_TYPE')[0] ||
    'blocks';

  return {
    ownedPaths: normalizePathList([
      ...ownedFromInput,
      ...allowedFiles,
      ...allowedFromPrompt,
      ...ownedFromPrompt,
    ]),
    dependsOn: Array.from(new Set(dependencies.map(v => String(v || '').trim()).filter(Boolean))),
    dependencyType: String(dependencyType || 'blocks')
      .trim()
      .toLowerCase(),
  };
}

/**
 * Find ownership conflicts for a candidate claim.
 *
 * BUG 2 FIX: No longer calls getActiveClaims() (which had a write side-effect).
 * Now uses readLedgerDirect() which is a guaranteed pure read.
 *
 * NOTE: This function is a point-in-time snapshot. For atomic check-and-claim,
 * use claimWithConflictCheck() which holds a lock across both operations.
 */
function findOwnershipConflicts({ taskId, ownedPaths }) {
  const candidate = normalizePathList(ownedPaths);
  if (candidate.length === 0) return [];

  // Pure read — no side-effects.
  const ledger = readLedgerDirect();
  const activeClaims = getActiveClaimsSnapshot(ledger);

  const conflicts = [];
  for (const claim of activeClaims) {
    if (!claim || !claim.taskId) continue;
    if (taskId && claim.taskId === taskId) continue;
    const claimPaths = normalizePathList(claim.ownedPaths);
    if (claimPaths.length === 0) continue;
    if (hasPathOverlap(candidate, claimPaths)) {
      conflicts.push(claim);
    }
  }
  return conflicts;
}

/**
 * BUG 1 FIX (RMW race): upsertClaim now holds the lock for the entire
 * read-modify-write cycle via withLedgerLock, preventing lost updates
 * when two processes concurrently upsert different claims.
 */
function upsertClaim(claim) {
  if (!claim || !claim.taskId) return;
  withLedgerLock(ledger => {
    ledger.claims[claim.taskId] = {
      taskId: String(claim.taskId),
      sessionId: claim.sessionId || null,
      agentType: claim.agentType || null,
      ownedPaths: normalizePathList(claim.ownedPaths),
      dependsOn: Array.isArray(claim.dependsOn) ? claim.dependsOn : [],
      dependencyType: String(claim.dependencyType || 'blocks').toLowerCase(),
      active: claim.active !== false,
      createdAt: claim.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return ledger;
  });
}

/**
 * BUG 1 FIX (RMW race): releaseClaim now holds the lock for the entire
 * read-modify-write cycle via withLedgerLock.
 */
function releaseClaim(taskId, status = null) {
  if (!taskId) return;
  withLedgerLock(ledger => {
    const key = String(taskId);
    const existing = ledger.claims[key];
    if (!existing) return null; // No change needed
    if (!status || TERMINAL_STATUSES.has(String(status).toLowerCase())) {
      delete ledger.claims[key];
    } else {
      existing.updatedAt = new Date().toISOString();
      existing.active = true;
      ledger.claims[key] = existing;
    }
    return ledger;
  });
}

/**
 * BUG 3 FIX (TOCTOU on claim check): Atomic compare-and-swap style claim.
 *
 * The original code had a two-step pattern:
 *   1. findOwnershipConflicts() — reads ledger
 *   2. upsertClaim() — reads and writes ledger
 *
 * Between steps 1 and 2, another process could have claimed the same paths.
 * The second claimer would not detect the conflict.
 *
 * This function performs both steps under a SINGLE lock, making the
 * check-and-claim atomic.
 *
 * @param {Object} claim - Claim to register (taskId, ownedPaths, etc.)
 * @returns {{ ok: boolean, conflicts?: Array }} Result object:
 *   - ok: true if claim was successfully registered
 *   - conflicts: array of conflicting claims (when ok is false)
 */
function claimWithConflictCheck(claim) {
  if (!claim || !claim.taskId) {
    return { ok: false, conflicts: [], error: 'missing taskId' };
  }

  const candidate = normalizePathList(claim.ownedPaths);
  let result = { ok: false, conflicts: [] };

  withLedgerLock(ledger => {
    // Step 1 (inside lock): check for conflicts using current ledger snapshot.
    const activeClaims = getActiveClaimsSnapshot(ledger);
    const conflicts = [];

    if (candidate.length > 0) {
      for (const existing of activeClaims) {
        if (!existing || !existing.taskId) continue;
        if (existing.taskId === String(claim.taskId)) continue;
        const existingPaths = normalizePathList(existing.ownedPaths);
        if (existingPaths.length === 0) continue;
        if (hasPathOverlap(candidate, existingPaths)) {
          conflicts.push(existing);
        }
      }
    }

    if (conflicts.length > 0) {
      // Conflict detected — do NOT insert. Return null to skip write.
      result = { ok: false, conflicts };
      return null;
    }

    // Step 2 (inside same lock): no conflict — insert the claim.
    ledger.claims[claim.taskId] = {
      taskId: String(claim.taskId),
      sessionId: claim.sessionId || null,
      agentType: claim.agentType || null,
      ownedPaths: candidate,
      dependsOn: Array.isArray(claim.dependsOn) ? claim.dependsOn : [],
      dependencyType: String(claim.dependencyType || 'blocks').toLowerCase(),
      active: claim.active !== false,
      createdAt: claim.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    result = { ok: true, conflicts: [] };
    return ledger;
  });

  return result;
}

function clearLedger() {
  if (fs.existsSync(LEDGER_FILE)) {
    fs.unlinkSync(LEDGER_FILE);
  }
}

module.exports = {
  LEDGER_FILE,
  TERMINAL_STATUSES,
  normalizePathToken,
  normalizePathList,
  hasPathOverlap,
  readLedger,
  writeLedger,
  getActiveClaims,
  extractClaimMetadataFromTaskInput,
  findOwnershipConflicts,
  upsertClaim,
  releaseClaim,
  claimWithConflictCheck,
  clearLedger,
};
