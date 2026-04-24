'use strict';

/**
 * D1: File-Based Agent-ID Handshake (PID-Keyed JSON)
 * ====================================================
 * Replaces `CLAUDE_AGENT_ID` env var with a PID-keyed JSON file written to:
 *   .claude/context/runtime/agent-context/{pid}.json
 *
 * This solves the env-var propagation failure across Bash subprocess hooks
 * and git worktree agent boundaries (verified at 25+ callsites).
 *
 * API:
 *   writeAgentContext(pid, payload)        — write context for a PID
 *   readAgentContext(pid)                  — read context; null if missing/expired
 *   clearAgentContext(pid)                 — delete context for a PID
 *   cleanupStaleContexts(ttlMinutes=60)    — remove expired entries
 *
 * Spec: .claude/context/plans/specs/d1-agent-id-handshake.md
 * Task: #12 (Green impl)
 * Decision: D1 from v4.0.0 architectural decisions
 */

const fs = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default TTL in milliseconds (60 minutes). */
const TTL_MS = 60 * 60 * 1000;

/** Directory where agent context files are stored. */
const AGENT_CONTEXT_DIR = path.join(__dirname, '../../context/runtime/agent-context');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the absolute path for a PID context file.
 *
 * @param {number} pid
 * @returns {string}
 */
function getContextPath(pid) {
  return path.join(AGENT_CONTEXT_DIR, `${pid}.json`);
}

/**
 * Returns the temporary path used during atomic writes.
 *
 * @param {number} pid
 * @returns {string}
 */
function getTmpPath(pid) {
  return path.join(AGENT_CONTEXT_DIR, `${pid}.tmp.json`);
}

/**
 * Ensures the agent-context directory exists.
 */
function ensureDir() {
  if (!fs.existsSync(AGENT_CONTEXT_DIR)) {
    fs.mkdirSync(AGENT_CONTEXT_DIR, { recursive: true });
  }
}

// ── Inline schema for safe-json (open-schema passthrough) ────────────────────

/**
 * Inline defaults for agent context payloads.
 * Keeps safe-json in passthrough mode while still stripping dangerous keys.
 */
const AGENT_CONTEXT_DEFAULTS = {
  agentId: null,
  parentPid: null,
  spawnedAt: null,
  expiresAt: null,
  metadata: {},
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Writes an agent context file for the given PID using atomic rename.
 *
 * The payload is written to a `.tmp.json` file first, then renamed to the
 * final `.json` path. This prevents partial reads under concurrent access.
 *
 * @param {number} pid - Process ID to associate with this context.
 * @param {Object} payload - Context payload (see spec for schema).
 * @param {string} payload.agentId
 * @param {number|null} payload.parentPid
 * @param {string} payload.spawnedAt - ISO timestamp
 * @param {string} payload.expiresAt - ISO timestamp
 * @param {Object} payload.metadata
 */
function writeAgentContext(pid, payload) {
  ensureDir();

  const finalPath = getContextPath(pid);
  const tmpPath = getTmpPath(pid);
  const content = JSON.stringify(payload, null, 2);

  // Write to tmp first, then rename (atomic on POSIX; falls back on Windows).
  fs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    fs.renameSync(tmpPath, finalPath);
  } catch (_renameErr) {
    // On Windows, renameSync to an existing path can fail with EPERM.
    // Fall back to a copy+delete so we still preserve last-write-wins semantics.
    try {
      fs.copyFileSync(tmpPath, finalPath);
      fs.unlinkSync(tmpPath);
    } catch (_copyErr) {
      // Last resort: direct overwrite via writeFileSync
      fs.writeFileSync(finalPath, content, 'utf-8');
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

/**
 * Reads the agent context for a given PID.
 *
 * Returns `null` if:
 * - The file does not exist
 * - The file is corrupt/unparseable
 * - The entry has expired (`Date.now() > expiresAt`)
 *
 * Never throws.
 *
 * @param {number} pid - Process ID whose context to read.
 * @returns {Object|null} Parsed payload, or null.
 */
function readAgentContext(pid) {
  const filePath = getContextPath(pid);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return null;
  }

  if (!content || content.trim() === '') {
    return null;
  }

  let parsed;
  try {
    // Use direct JSON.parse for a plain-object result; strip dangerous keys manually.
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    // Strip prototype-pollution keys and copy known fields to a plain object.
    parsed = {};
    for (const key of Object.keys(AGENT_CONTEXT_DEFAULTS)) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        parsed[key] = raw[key];
      } else {
        parsed[key] = AGENT_CONTEXT_DEFAULTS[key];
      }
    }
  } catch (_parseErr) {
    return null;
  }

  // Check expiry
  if (!parsed.expiresAt) {
    return null;
  }

  const expiresAt = new Date(parsed.expiresAt).getTime();
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return null;
  }

  return parsed;
}

/**
 * Deletes the agent context file for a given PID.
 * No-ops silently if the file does not exist.
 *
 * @param {number} pid - Process ID whose context to clear.
 */
function clearAgentContext(pid) {
  const filePath = getContextPath(pid);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_err) {
    // Ignore — best-effort deletion
  }
}

/**
 * Removes expired agent context files from the directory.
 *
 * Scans all `*.json` files (excludes `*.tmp.json`). Deletes any file where
 * `Date.now() > expiresAt`, or any file that cannot be parsed (corrupt).
 *
 * Should be called at agent startup to prevent directory growth.
 *
 * @param {number} [ttlMinutes=60] - Unused parameter kept for API compatibility;
 *   expiry is determined by the `expiresAt` field in each file.
 * @returns {{ removed: number, kept: number }} Cleanup statistics.
 */
function cleanupStaleContexts(_ttlMinutes) {
  let removed = 0;
  let kept = 0;

  if (!fs.existsSync(AGENT_CONTEXT_DIR)) {
    return { removed, kept };
  }

  let entries;
  try {
    entries = fs.readdirSync(AGENT_CONTEXT_DIR);
  } catch (_err) {
    return { removed, kept };
  }

  const now = Date.now();

  for (const entry of entries) {
    // Only process final JSON files (not .tmp.json)
    if (!entry.endsWith('.json') || entry.endsWith('.tmp.json')) {
      continue;
    }

    const filePath = path.join(AGENT_CONTEXT_DIR, entry);
    let shouldRemove = false;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content || content.trim() === '') {
        shouldRemove = true;
      } else {
        const raw = JSON.parse(content);
        const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        if (!parsed.expiresAt) {
          shouldRemove = true;
        } else {
          const expiresAt = new Date(parsed.expiresAt).getTime();
          if (isNaN(expiresAt) || now > expiresAt) {
            shouldRemove = true;
          }
        }
      }
    } catch (_err) {
      shouldRemove = true;
    }

    if (shouldRemove) {
      try {
        fs.unlinkSync(filePath);
        removed += 1;
      } catch (_err) {
        // Ignore deletion errors
      }
    } else {
      kept += 1;
    }
  }

  return { removed, kept };
}

// ── Deprecation warning for env var ──────────────────────────────────────────

// Emit deprecation warning if the old env var is still in use.
// Migration of hook callsites is Phase 4 / D10.
if (process.env.CLAUDE_AGENT_ID) {
  process.stderr.write(
    '[WARN] agent-id-handshake: CLAUDE_AGENT_ID env var is deprecated. ' +
      'Use writeAgentContext() + readAgentContext() instead. ' +
      'Will be removed in v4.0.0 final.\n'
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  writeAgentContext,
  readAgentContext,
  clearAgentContext,
  cleanupStaleContexts,
  // Exported for tests and introspection
  getContextPath,
  AGENT_CONTEXT_DIR,
  TTL_MS,
};
