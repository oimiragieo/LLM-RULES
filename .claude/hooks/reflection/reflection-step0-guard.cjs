#!/usr/bin/env node
/**
 * Reflection Step 0 Guard
 * =======================
 *
 * Trigger: PreToolUse(TaskList)
 *
 * Warns or blocks when pending reflection spawn requests exist and the Router
 * attempts TaskList before performing Step 0.
 *
 * ENFORCEMENT MODES:
 * - warn: Allow TaskList but emit warning
 * - block (default): Block TaskList until pending reflections are handled
 * - off: Disabled
 *
 * Environment:
 * - REFLECTION_STEP0_ENFORCEMENT=block|warn|off
 * - REFLECTION_ENABLED=false to disable all reflection
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getEnforcementMode,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
let eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const STEP0_STATE_PATH = path.join(RUNTIME_DIR, 'reflection-step0-state.json');
const REFLECTION_LOG_PATH =
  process.env.REFLECTION_LOG_FILE_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'reflection-log.jsonl');

/**
 * Maximum pending reflections before auto-clearing oldest entries
 * Prevents deadlock when reflection queue grows unbounded
 */
const MAX_PENDING_REFLECTIONS = 5;
const STEP0_REPEAT_WINDOW_MS = Number(process.env.REFLECTION_STEP0_REPEAT_WINDOW_MS || 120000);
const STEP0_REPEAT_THRESHOLD = Number(process.env.REFLECTION_STEP0_REPEAT_THRESHOLD || 2);
const STEP0_LOOP_BREAKER_MODE = String(process.env.REFLECTION_STEP0_LOOP_BREAKER_MODE || 'warn')
  .trim()
  .toLowerCase();
const STEP0_EVENT_TIMEOUT_MS = Number(process.env.REFLECTION_STEP0_EVENT_TIMEOUT_MS || 250);
const REFLECTION_GHOST_SUPPRESS_HOURS = Number(process.env.REFLECTION_GHOST_SUPPRESS_HOURS || 24);
const _MAX_REFLECTION_AGE_HOURS = Number(process.env.MAX_REFLECTION_AGE_HOURS || 24);

/** Log to stderr only (stdout reserved for single formatResult line). */
function stderrLog(message, meta = {}) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: message === 'hook_failed' || message === 'hook_blocked' ? 'warn' : 'info',
      message,
      component: 'hook:reflection-step0-guard',
      tool: 'TaskList',
      ...meta,
    })
  );
}

/**
 * Read spawn request entries from a JSON file as raw objects.
 * Returns any object present in the JSON array without schema-level filtering,
 * so that hasPendingReflections() can accurately count entries regardless of
 * whether they carry the full subagent_type/prompt fields required for execution.
 * Full sanitization is deferred to the reflection-agent at processing time.
 */
function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (Array.isArray(parsed)) {
      return parsed.filter(e => e !== null && typeof e === 'object' && !Array.isArray(e));
    }
    // Legacy format: object with numeric string keys (e.g. {"0": {...}, "1": {...}})
    if (parsed && typeof parsed === 'object') {
      const numericKeys = Object.keys(parsed)
        .filter(key => /^\d+$/.test(key))
        .sort((a, b) => Number(a) - Number(b));
      if (numericKeys.length > 0) {
        return numericKeys
          .map(key => parsed[key])
          .filter(e => e !== null && typeof e === 'object' && !Array.isArray(e));
      }
    }
    return [];
  } catch (_err) {
    return [];
  }
}

function readProcessedIdsFromReflectionLog() {
  const processed = new Set();
  try {
    if (!fs.existsSync(REFLECTION_LOG_PATH)) return processed;
    const raw = fs.readFileSync(REFLECTION_LOG_PATH, 'utf8');
    if (!raw.trim()) return processed;
    for (const line of raw.split('\n')) {
      const entry = safeParseJSON(line, null);
      if (!entry || typeof entry !== 'object') continue;
      const ids = entry.processedReflectionIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === 'string' && id.trim()) {
          processed.add(id.trim());
        }
      }
    }
  } catch (_err) {
    // Best effort only.
  }
  return processed;
}

function pruneAlreadyProcessedRequests(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    return { requests: [], prunedCount: 0 };
  }
  const processedIds = readProcessedIdsFromReflectionLog();
  if (processedIds.size === 0) {
    return { requests, prunedCount: 0 };
  }
  const filtered = requests.filter(req => {
    const id = req?.id != null ? String(req.id).trim() : '';
    return !id || !processedIds.has(id);
  });
  return {
    requests: filtered,
    prunedCount: requests.length - filtered.length,
  };
}

function readGhostTaskIdsFromReflectionLog() {
  const ghosts = new Set();
  try {
    if (!fs.existsSync(REFLECTION_LOG_PATH)) return ghosts;
    const raw = fs.readFileSync(REFLECTION_LOG_PATH, 'utf8');
    if (!raw.trim()) return ghosts;
    const cutoffMs = Date.now() - REFLECTION_GHOST_SUPPRESS_HOURS * 60 * 60 * 1000;
    for (const line of raw.split('\n')) {
      const entry = safeParseJSON(line, null);
      if (!entry || typeof entry !== 'object') continue;
      const taskId = entry.taskId != null ? String(entry.taskId).trim() : '';
      if (!taskId) continue;
      const reason = String(entry.reason || '').toLowerCase();
      const ts = Date.parse(entry.timestamp || '');
      const isRecent = Number.isFinite(ts) ? ts >= cutoffMs : true;
      if (isRecent && reason.includes('task') && reason.includes('not found')) {
        ghosts.add(taskId);
      }
    }
  } catch (_err) {
    // Best effort only.
  }
  return ghosts;
}

function pruneGhostSpawnRequests(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    return { requests: [], prunedCount: 0 };
  }
  const ghostTaskIds = readGhostTaskIdsFromReflectionLog();
  if (ghostTaskIds.size === 0) {
    return { requests, prunedCount: 0 };
  }
  const filtered = requests.filter(req => {
    const taskId = req?.source?.taskId != null ? String(req.source.taskId).trim() : '';
    return !taskId || !ghostTaskIds.has(taskId);
  });
  return {
    requests: filtered,
    prunedCount: requests.length - filtered.length,
  };
}

function clearReminderIfStale() {
  try {
    if (fs.existsSync(REMINDER_PATH)) {
      fs.unlinkSync(REMINDER_PATH);
      return true;
    }
  } catch (_err) {
    // Best-effort
  }
  return false;
}

/**
 * Auto-clear oldest pending reflections if count exceeds MAX_PENDING_REFLECTIONS
 * Prevents deadlock by capping queue size
 * @param {Array} requests - Current spawn requests
 * @returns {Array} Trimmed spawn requests (max 5 most recent)
 */
function trimOldReflections(requests) {
  if (!Array.isArray(requests) || requests.length <= MAX_PENDING_REFLECTIONS) {
    return requests;
  }

  // Keep only the 5 most recent (sorted by timestamp descending)
  const sorted = requests
    .filter(r => r && (r?.source?.timestamp || r?.timestamp))
    .sort(
      (a, b) =>
        new Date(b?.source?.timestamp || b?.timestamp) -
        new Date(a?.source?.timestamp || a?.timestamp)
    );

  const trimmed = sorted.slice(0, MAX_PENDING_REFLECTIONS);
  const discarded = sorted.length - trimmed.length;

  stderrLog('auto_trim_old_reflections', {
    total: requests.length,
    kept: trimmed.length,
    discarded,
  });

  return trimmed;
}

/**
 * Check if pending reflection requests exist
 * Primary check: spawn-request.json array length > 0
 * Secondary check: reminder.txt file exists
 * @returns {boolean} True if reflections are pending
 */
function hasPendingReflections() {
  // Source of truth is spawn-request.json.
  // Reminder file is informational only and may be stale.
  const requests = readSpawnRequests(SPAWN_REQUEST_PATH);
  return Array.isArray(requests) && requests.length > 0;
}

function readStep0State() {
  if (!fs.existsSync(STEP0_STATE_PATH)) return {};
  const content = fs.readFileSync(STEP0_STATE_PATH, 'utf8');
  const parsed = safeParseJSON(content, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeStep0State(state) {
  try {
    atomicWriteJSONSync(STEP0_STATE_PATH, state);
  } catch (_err) {
    // Best-effort
  }
}

function registerStep0Block(pendingCount) {
  const state = readStep0State();
  const now = Date.now();
  const key = `${process.env.CLAUDE_SESSION_ID || 'unknown'}:${pendingCount}`;
  const current = state[key] || { count: 0, lastAt: 0 };
  const withinWindow = now - Number(current.lastAt || 0) <= STEP0_REPEAT_WINDOW_MS;
  const count = withinWindow ? Number(current.count || 0) + 1 : 1;
  state[key] = { count, lastAt: now };
  writeStep0State(state);
  return count;
}

function resolveEffectiveEnforcementMode(mode, repeatCount) {
  if (mode !== 'block') return mode;
  if (STEP0_LOOP_BREAKER_MODE === 'off') return mode;
  if (STEP0_LOOP_BREAKER_MODE === 'block') return mode;
  if (repeatCount < STEP0_REPEAT_THRESHOLD) return mode;
  return 'warn';
}

async function emitEventWithTimeout(eventType, payload) {
  if (!eventBus || typeof eventBus.emit !== 'function') {
    return { emitted: false, reason: 'event_bus_unavailable' };
  }
  try {
    await Promise.race([
      eventBus.emit(eventType, payload),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`event_emit_timeout:${eventType}`)),
          STEP0_EVENT_TIMEOUT_MS
        );
      }),
    ]);
    return { emitted: true };
  } catch (err) {
    stderrLog('event_emit_failed', {
      eventType,
      error: err?.message || String(err),
    });
    return { emitted: false, reason: err?.message || String(err) };
  }
}

async function main() {
  const startTime = Date.now();
  try {
    if (process.env.REFLECTION_ENABLED === 'false') {
      process.exit(0);
    }

    const mode = getEnforcementMode('REFLECTION_STEP0_ENFORCEMENT', 'block');
    if (mode === 'off') {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    if (toolName !== 'TaskList') {
      process.exit(0);
    }

    stderrLog('hook_start');

    // Use a stable snapshot and refresh once before blocking to avoid TOCTOU false blocks.
    let requests = readSpawnRequests(SPAWN_REQUEST_PATH);
    const pruned = pruneGhostSpawnRequests(requests);
    requests = pruned.requests;
    if (pruned.prunedCount > 0) {
      atomicWriteJSONSync(SPAWN_REQUEST_PATH, requests);
      stderrLog('pruned_ghost_spawn_requests', { pruned: pruned.prunedCount });
    }

    // Filter out IDs already recorded as processed in reflection-log.jsonl.
    // This handles the race where cleanup ran in a previous session but the
    // spawn-request.json was not fully cleared before the next session started.
    const prunedProcessed = pruneAlreadyProcessedRequests(requests);
    requests = prunedProcessed.requests;
    if (prunedProcessed.prunedCount > 0) {
      atomicWriteJSONSync(SPAWN_REQUEST_PATH, requests);
      stderrLog('pruned_already_processed_requests', { pruned: prunedProcessed.prunedCount });
    }

    // Filter out stale requests older than _MAX_REFLECTION_AGE_HOURS.
    // Prevents stale entries from accumulating across sessions and blocking
    // TaskList indefinitely.
    const maxAgeMs = _MAX_REFLECTION_AGE_HOURS * 60 * 60 * 1000;
    const cutoffMs = Date.now() - maxAgeMs;
    const freshRequests = requests.filter(req => {
      const ts = req?.source?.timestamp || req?.timestamp;
      if (!ts) return true; // No timestamp: keep (cannot determine age)
      const parsed = Date.parse(ts);
      if (!Number.isFinite(parsed)) return true; // Unparseable: keep
      return parsed >= cutoffMs;
    });
    const staleCount = requests.length - freshRequests.length;
    if (staleCount > 0) {
      try {
        fs.writeFileSync(SPAWN_REQUEST_PATH, JSON.stringify(freshRequests, null, 2), 'utf8');
        stderrLog('pruned_stale_reflections', {
          staleCount,
          maxAgeHours: _MAX_REFLECTION_AGE_HOURS,
        });
      } catch (err) {
        stderrLog('stale_prune_write_failed', { error: err.message });
      }
      requests = freshRequests;
    }

    if (!Array.isArray(requests) || requests.length === 0) {
      // Clean stale reminder so we do not deadlock on "0 pending" conditions.
      clearReminderIfStale();
      stderrLog('hook_end', { status: 'no_pending' });
      process.exit(0);
    }

    // Task 1.2: Auto-trim old reflections if count > MAX_PENDING_REFLECTIONS
    if (requests.length > MAX_PENDING_REFLECTIONS) {
      const trimmed = trimOldReflections(requests);
      try {
        fs.writeFileSync(SPAWN_REQUEST_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
        stderrLog('trimmed_old_reflections', {
          before: requests.length,
          after: trimmed.length,
        });
        requests = trimmed;
      } catch (err) {
        stderrLog('trim_failed', { error: err.message });
      }
    }

    // Refresh once right before enforcement; another process may have cleared queue.
    requests = readSpawnRequests(SPAWN_REQUEST_PATH);
    if (!Array.isArray(requests) || requests.length === 0) {
      clearReminderIfStale();
      stderrLog('hook_end', { status: 'no_pending_after_refresh' });
      process.exit(0);
    }

    // Count pending requests for detailed message
    const pendingCount = requests.length;
    const repeatCount = registerStep0Block(pendingCount);

    const message =
      repeatCount >= STEP0_REPEAT_THRESHOLD
        ? `[REFLECTION STEP0] ${pendingCount} pending reflection request(s). Repeated block (${repeatCount}x). ` +
          'Do not retry TaskList yet. Process first batch in reflection-spawn-request.json, then call TaskList().'
        : `${pendingCount} pending reflection request(s) in reflection-spawn-request.json. ` +
          'STEP 0 REQUIRED: (1) Read reflection-spawn-request.json, ' +
          '(2) Spawn reflection-agent for each request (or first batch), ' +
          '(3) Clear/trim spawn-request.json, ' +
          '(4) Clear reflection-reminder.txt if exists, ' +
          'THEN proceed to TaskList(). ' +
          'Set REFLECTION_STEP0_ENFORCEMENT=warn to allow with warning.';

    auditLog('reflection-step0-guard', {
      level: mode === 'block' ? 'error' : 'warn',
      message: 'Reflection Step 0 pending before TaskList.',
      enforcement: mode,
    });

    const effectiveMode = resolveEffectiveEnforcementMode(mode, repeatCount);

    if (effectiveMode === 'block') {
      stderrLog('hook_blocked', { reason: 'reflection_step0_pending' });
      await emitEventWithTimeout(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName: 'TaskList',
        duration: Date.now() - startTime,
        reason: 'reflection_step0_pending',
      });
      console.log(formatResult('block', message));
      process.exit(0);
    }

    await emitEventWithTimeout(EventTypes.TOOL_COMPLETED, {
      type: EventTypes.TOOL_COMPLETED,
      timestamp: new Date().toISOString(),
      toolName: 'TaskList',
      output: {
        status: 'warn',
        reason: 'reflection_step0_pending',
        loopBreakerEngaged: mode === 'block' && effectiveMode === 'warn',
      },
      duration: Date.now() - startTime,
    });
    stderrLog('hook_end', {
      status: 'warn',
      reason: 'reflection_step0_pending',
      loopBreakerEngaged: mode === 'block' && effectiveMode === 'warn',
    });
    console.log(formatResult('warn', message));
    process.exit(0);
  } catch (err) {
    await emitEventWithTimeout(EventTypes.TOOL_FAILED, {
      type: EventTypes.TOOL_FAILED,
      timestamp: new Date().toISOString(),
      toolName: 'reflection-step0-guard',
      error: err.message,
    });
    stderrLog('hook_failed', { error: err?.message });
    if (process.env.DEBUG_HOOKS) {
      console.error('[reflection-step0-guard] Error:', err.message);
    }
    // Fail open: do not block TaskList if the guard itself fails.
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  hasPendingReflections,
  readSpawnRequests,
  readGhostTaskIdsFromReflectionLog,
  pruneGhostSpawnRequests,
  clearReminderIfStale,
  resolveEffectiveEnforcementMode,
  emitEventWithTimeout,
  __setEventBus: mock => {
    eventBus = mock;
  },
};
