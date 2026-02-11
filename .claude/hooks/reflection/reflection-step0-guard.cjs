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
 * - warn (default): Allow TaskList but emit warning
 * - block: Block TaskList until pending reflections are handled
 * - off: Disabled
 *
 * Environment:
 * - REFLECTION_STEP0_ENFORCEMENT=warn|block|off
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
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

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
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
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
  try {
    if (!fs.existsSync(STEP0_STATE_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(STEP0_STATE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
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

async function main() {
  const startTime = Date.now();
  try {
    if (process.env.REFLECTION_ENABLED === 'false') {
      process.exit(0);
    }

    // Default to 'warn' to avoid deadlocks while still surfacing Step 0 guidance.
    const mode = getEnforcementMode('REFLECTION_STEP0_ENFORCEMENT', 'warn');
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

    if (!hasPendingReflections()) {
      // Clean stale reminder so we do not deadlock on "0 pending" conditions.
      clearReminderIfStale();
      stderrLog('hook_end', { status: 'no_pending' });
      process.exit(0);
    }

    // Task 1.2: Auto-trim old reflections if count > MAX_PENDING_REFLECTIONS
    let requests = readSpawnRequests(SPAWN_REQUEST_PATH);
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
          '(4) Delete reflection-reminder.txt if exists, ' +
          'THEN proceed to TaskList(). ' +
          'Set REFLECTION_STEP0_ENFORCEMENT=warn to allow with warning.';

    auditLog('reflection-step0-guard', {
      level: mode === 'block' ? 'error' : 'warn',
      message: 'Reflection Step 0 pending before TaskList.',
      enforcement: mode,
    });

    if (mode === 'block') {
      stderrLog('hook_blocked', { reason: 'reflection_step0_pending' });
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'TaskList',
          duration: Date.now() - startTime,
          reason: 'reflection_step0_pending',
        });
      } catch (_e) {
        // Best-effort
      }
      console.log(formatResult('block', message));
      process.exit(2);
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'TaskList',
        output: {
          status: 'warn',
          reason: 'reflection_step0_pending',
        },
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // Best-effort
    }
    stderrLog('hook_end', { status: 'warn', reason: 'reflection_step0_pending' });
    console.log(formatResult('warn', message));
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'reflection-step0-guard',
        error: err.message,
      });
    } catch (_e) {
      // Best-effort
    }
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
};
