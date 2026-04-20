/* Agent: developer | Task: #P02 | Session: 2026-04-19 */
'use strict';

/**
 * routing-warn-dedupe
 *
 * Deduplicates [ROUTING WARN] emissions within a TTL window and routes them
 * to a separate log file (default: .claude/context/runtime/routing-warn.log).
 * Replaces the prior behavior of spamming .claude/context/memory/issues.md.
 *
 * Features:
 *   - Content-hash keyed Map with TTL (default 60s)
 *   - Size-based log rotation at 1 MB, keep .1/.2/.3 (3 files)
 *   - Flush handler for SIGINT/SIGTERM/process.exit emits suppressed counts
 *   - Signal handlers registered ONCE via module-level guard
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB
const MAX_ROTATED = 3;

// In-memory dedupe state: hash -> { firstSeen, count, entry, logPath }
const seenWarnings = new Map();

// Module-level guard so we register signal handlers only once per process.
// Using a Symbol on globalThis so re-requires (via delete require.cache) in
// tests don't duplicate handlers.
const HANDLER_FLAG = Symbol.for('agent-studio.routing-warn-dedupe.handlers');

function hashEntry(entry) {
  return crypto.createHash('sha256').update(String(entry)).digest('hex');
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function rotateIfNeeded(logPath, maxBytes) {
  try {
    if (!fs.existsSync(logPath)) return;
    const stats = fs.statSync(logPath);
    if (stats.size <= maxBytes) return;

    // Rotate: .2 -> .3, .1 -> .2, current -> .1
    // Start from oldest so we don't clobber.
    for (let i = MAX_ROTATED - 1; i >= 1; i -= 1) {
      const src = `${logPath}.${i}`;
      const dst = `${logPath}.${i + 1}`;
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dst);
        } catch (_err) {
          // Best-effort rotation; don't break on rename error.
        }
      }
    }
    try {
      fs.renameSync(logPath, `${logPath}.1`);
    } catch (_err) {
      // If rename fails, truncate as a fallback so log doesn't grow unbounded.
      try {
        fs.writeFileSync(logPath, '', 'utf8');
      } catch (_err2) {
        // give up silently
      }
    }
  } catch (_err) {
    // Best-effort; log rotation must not crash the writer.
  }
}

function appendLine(logPath, line, maxBytes) {
  try {
    ensureDirFor(logPath);
    rotateIfNeeded(logPath, maxBytes);
    fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  } catch (_err) {
    // Best-effort logging — routing must never break due to log failures.
  }
}

/**
 * Emit a routing warn entry with dedupe.
 *
 * @param {string} entry - Human-readable warning text (no leading "[ROUTING WARN]").
 * @param {Object} [opts]
 * @param {string} [opts.logPath] - Target log path.
 * @param {number} [opts.ttlMs] - Dedupe window in ms. Default 60s.
 * @param {number} [opts.maxBytes] - Rotation threshold. Default 1 MB.
 */
function emitRoutingWarn(entry, opts = {}) {
  const logPath = opts.logPath;
  if (!logPath || typeof logPath !== 'string') {
    return; // no-op without a target
  }
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : DEFAULT_TTL_MS;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : DEFAULT_MAX_BYTES;

  const key = `${logPath}::${hashEntry(entry)}`;
  const now = Date.now();
  const existing = seenWarnings.get(key);

  if (existing && now - existing.firstSeen < ttlMs) {
    existing.count += 1;
    return;
  }

  // Either first occurrence or TTL expired — flush any stale entry for this
  // key (emit a summary) before treating this as a new first-occurrence.
  if (existing && existing.count > 1) {
    appendLine(
      logPath,
      `[${new Date().toISOString()}] [ROUTING WARN x${existing.count}] (suppressed ${
        existing.count - 1
      }) ${existing.entry}`,
      maxBytes
    );
  }

  const line = `[${new Date(now).toISOString()}] [ROUTING WARN] ${entry}`;
  appendLine(logPath, line, maxBytes);
  seenWarnings.set(key, { firstSeen: now, count: 1, entry, logPath });

  ensureSignalHandlers();
}

/**
 * Emit summaries for all pending suppressed entries. Intended for shutdown.
 * If a logPath is provided, only flush entries targeting that log.
 */
function flushPending(logPath) {
  const now = new Date().toISOString();
  for (const [key, state] of seenWarnings.entries()) {
    if (logPath && state.logPath !== logPath) continue;
    if (state.count > 1) {
      appendLine(
        state.logPath,
        `[${now}] [ROUTING WARN x${state.count}] (suppressed ${state.count - 1}) ${state.entry}`,
        DEFAULT_MAX_BYTES
      );
    }
    seenWarnings.delete(key);
  }
}

function ensureSignalHandlers() {
  if (globalThis[HANDLER_FLAG]) return;
  globalThis[HANDLER_FLAG] = true;

  const flushAll = () => {
    try {
      flushPending();
    } catch (_err) {
      // Best-effort; never throw on shutdown.
    }
  };

  try {
    process.on('exit', flushAll);
  } catch (_err) {
    // ignore
  }
  try {
    process.on('SIGINT', () => {
      flushAll();
      // Default SIGINT behavior is exit(130); preserve it.
      process.exit(130);
    });
  } catch (_err) {
    // ignore
  }
  try {
    process.on('SIGTERM', () => {
      flushAll();
      process.exit(143);
    });
  } catch (_err) {
    // ignore
  }
}

/**
 * Reset in-memory state. Test-only.
 */
function _resetForTests() {
  seenWarnings.clear();
  // Do NOT reset HANDLER_FLAG — signal handlers are process-global and
  // deregistering them in tests is unnecessary and racy.
}

module.exports = {
  emitRoutingWarn,
  flushPending,
  _resetForTests,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_BYTES,
  MAX_ROTATED,
};
