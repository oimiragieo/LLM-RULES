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
let eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { readSpawnRequestsFile } = require('../../lib/reflection/spawn-request-contract.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const STEP0_STATE_PATH = path.join(RUNTIME_DIR, 'reflection-step0-state.json');

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

function readSpawnRequests(filePath) {
  return readSpawnRequestsFile(filePath);
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
    .filter(r => r && r.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(STEP0_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
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
      process.exit(2);
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
  clearReminderIfStale,
  resolveEffectiveEnforcementMode,
  emitEventWithTimeout,
  __setEventBus: mock => {
    eventBus = mock;
  },
};
