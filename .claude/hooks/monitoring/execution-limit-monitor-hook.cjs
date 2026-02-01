#!/usr/bin/env node
/**
 * Execution Limit Monitor Hook (Hook Wrapper)
 * ==========================================
 *
 * Provides cross-process execution limit tracking using a persistent state file.
 *
 * Notes:
 * - The existing `execution-limit-monitor.cjs` module is in-memory (per Node process).
 * - Claude Code hooks run in separate Node processes, so we persist state to disk.
 *
 * Event: PreToolUse
 * Matcher: (wired via .claude/settings.json)
 *
 * Behavior:
 * - If a `Task` spawn includes `tool_input.execution_limits`, store those limits for the session.
 * - For any tool call in a session with stored limits, increment `turns` and check:
 *   - max_turns
 *   - max_duration_ms
 *   - max_cost_usd is recorded but not enforced (no reliable per-call cost in hook input)
 * - On exceed:
 *   - timeout_action=warn -> allow and log event
 *   - timeout_action=terminate|pause -> block (exit code 2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');

// <project>/.claude/hooks/monitoring/execution-limit-monitor-hook.cjs -> <project>
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'execution-limits.json'
);
const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const EVENTS_FILE = path.join(METRICS_DIR, 'execution-limit-events.jsonl');

const LOCK_SUFFIX = '.lock';
const MAX_LOCK_WAIT_MS = 2000;
const LOCK_RETRY_MS = 50;

function syncSleep(ms) {
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
    try {
      const sharedBuffer = new SharedArrayBuffer(4);
      const int32 = new Int32Array(sharedBuffer);
      Atomics.wait(int32, 0, 0, ms);
      return;
    } catch (_e) {
      // fall back
    }
  }
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy wait
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function tryClaimStaleLock(lockFile) {
  const claimingFile = `${lockFile}.claiming.${process.pid}.${Date.now()}`;

  try {
    fs.renameSync(lockFile, claimingFile);
    try {
      const lockData = JSON.parse(fs.readFileSync(claimingFile, 'utf8'));
      if (lockData.pid && !isProcessAlive(lockData.pid)) {
        fs.unlinkSync(claimingFile);
        return true;
      }

      try {
        fs.renameSync(claimingFile, lockFile);
      } catch (_restoreErr) {
        try {
          fs.unlinkSync(claimingFile);
        } catch {
          // best effort
        }
      }
      return false;
    } catch (_readErr) {
      try {
        fs.unlinkSync(claimingFile);
      } catch {
        // best effort
      }
      return true;
    }
  } catch (_renameErr) {
    return false;
  }
}

function acquireLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, time: Date.now() }), {
        flag: 'wx',
      });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        if (tryClaimStaleLock(lockFile)) continue;
        syncSleep(LOCK_RETRY_MS);
        continue;
      }
      return false;
    }
  }
  return false;
}

function releaseLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // ignore
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readState() {
  const defaults = { updatedAt: new Date().toISOString(), sessions: {} };
  try {
    if (!fs.existsSync(STATE_FILE)) return defaults;
    const content = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const sessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    return { ...defaults, ...parsed, sessions };
  } catch {
    return defaults;
  }
}

function writeState(state) {
  const lockAcquired = acquireLock(STATE_FILE);
  try {
    ensureDir(path.dirname(STATE_FILE));
    atomicWriteJSONSync(STATE_FILE, { ...state, updatedAt: new Date().toISOString() });
  } finally {
    if (lockAcquired) releaseLock(STATE_FILE);
  }
}

function appendEvent(event) {
  try {
    ensureDir(METRICS_DIR);
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch {
    // best effort
  }
}

function normalizeLimits(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const maxTurns =
    typeof raw.max_turns === 'number' && Number.isFinite(raw.max_turns) && raw.max_turns > 0
      ? Math.floor(raw.max_turns)
      : null;
  const maxDurationMs =
    typeof raw.max_duration_ms === 'number' &&
    Number.isFinite(raw.max_duration_ms) &&
    raw.max_duration_ms > 0
      ? Math.floor(raw.max_duration_ms)
      : null;
  const maxCostUsd =
    typeof raw.max_cost_usd === 'number' &&
    Number.isFinite(raw.max_cost_usd) &&
    raw.max_cost_usd > 0
      ? raw.max_cost_usd
      : null;

  const timeoutAction =
    raw.timeout_action === 'warn' ||
    raw.timeout_action === 'pause' ||
    raw.timeout_action === 'terminate'
      ? raw.timeout_action
      : 'terminate';

  return {
    max_turns: maxTurns ?? Infinity,
    max_duration_ms: maxDurationMs ?? Infinity,
    max_cost_usd: maxCostUsd ?? Infinity,
    timeout_action: timeoutAction,
  };
}

function getSessionId(hookInput) {
  const sid = hookInput && typeof hookInput.session_id === 'string' ? hookInput.session_id : null;
  return sid || process.env.CLAUDE_SESSION_ID || 'unknown-session';
}

function ensureSessionConfigured(state, sessionId, maybeLimits) {
  const existing = state.sessions[sessionId];

  if (maybeLimits) {
    const normalized = normalizeLimits(maybeLimits);
    if (!normalized) return;

    const nowIso = new Date().toISOString();
    state.sessions[sessionId] = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      configuredAt: existing?.configuredAt || nowIso,
      startedAt: existing?.startedAt || nowIso,
      lastSeenAt: nowIso,
      turns: typeof existing?.turns === 'number' ? existing.turns : 0,
      costUsd: typeof existing?.costUsd === 'number' ? existing.costUsd : 0,
      limits: normalized,
      warningsEmitted: existing?.warningsEmitted || {},
      exceeded: existing?.exceeded || {},
    };

    appendEvent({
      timestamp: nowIso,
      type: 'EXECUTION_LIMITS_CONFIGURED',
      sessionId,
      limits: normalized,
    });
    return;
  }

  // Ensure minimal structure exists
  if (!existing) {
    const nowIso = new Date().toISOString();
    state.sessions[sessionId] = {
      configuredAt: null,
      startedAt: nowIso,
      lastSeenAt: nowIso,
      turns: 0,
      costUsd: 0,
      limits: null,
      warningsEmitted: {},
      exceeded: {},
    };
  }
}

function main() {
  try {
    const hookInput = parseHookInputSync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput) || {};
    const sessionId = getSessionId(hookInput);

    const state = readState();

    // If this is a Task spawn and it provides execution_limits, store them.
    if (toolName === 'Task' && toolInput && toolInput.execution_limits) {
      ensureSessionConfigured(state, sessionId, toolInput.execution_limits);
      writeState(state);
      process.exit(0);
    }

    const session = state.sessions[sessionId];
    if (!session || !session.limits) {
      process.exit(0);
    }

    // Update per-call accounting
    const now = Date.now();
    const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : now;
    const elapsedMs = now - startedAtMs;
    session.turns = typeof session.turns === 'number' ? session.turns + 1 : 1;
    session.lastSeenAt = new Date().toISOString();
    session.warningsEmitted = session.warningsEmitted || {};
    session.exceeded = session.exceeded || {};

    const {
      max_turns: maxTurns,
      max_duration_ms: maxDurationMs,
      timeout_action: timeoutAction,
    } = session.limits;

    // Warn at 80%
    if (maxTurns !== Infinity) {
      const pct = (session.turns / maxTurns) * 100;
      if (pct >= 80 && !session.warningsEmitted.max_turns) {
        session.warningsEmitted.max_turns = new Date().toISOString();
        appendEvent({
          timestamp: new Date().toISOString(),
          type: 'AGENT_LIMIT_WARNING',
          sessionId,
          limitType: 'max_turns',
          current: session.turns,
          max: maxTurns,
          percentage: pct.toFixed(1),
        });
      }
    }

    if (maxDurationMs !== Infinity) {
      const pct = (elapsedMs / maxDurationMs) * 100;
      if (pct >= 80 && !session.warningsEmitted.max_duration_ms) {
        session.warningsEmitted.max_duration_ms = new Date().toISOString();
        appendEvent({
          timestamp: new Date().toISOString(),
          type: 'AGENT_LIMIT_WARNING',
          sessionId,
          limitType: 'max_duration_ms',
          current: elapsedMs,
          max: maxDurationMs,
          percentage: pct.toFixed(1),
        });
      }
    }

    // Exceeded checks
    let exceeded = null;
    if (maxTurns !== Infinity && session.turns >= maxTurns) {
      exceeded = { limitType: 'max_turns', current: session.turns, max: maxTurns };
    } else if (maxDurationMs !== Infinity && elapsedMs >= maxDurationMs) {
      exceeded = { limitType: 'max_duration_ms', current: elapsedMs, max: maxDurationMs };
    }

    if (exceeded && !session.exceeded[exceeded.limitType]) {
      session.exceeded[exceeded.limitType] = new Date().toISOString();
      appendEvent({
        timestamp: new Date().toISOString(),
        type: 'AGENT_LIMIT_EXCEEDED',
        sessionId,
        action: timeoutAction,
        ...exceeded,
      });
    }

    state.sessions[sessionId] = session;
    writeState(state);

    if (!exceeded) {
      process.exit(0);
    }

    if (timeoutAction === 'warn') {
      process.exit(0);
    }

    const message = `[EXECUTION LIMIT] ${exceeded.limitType} exceeded (${exceeded.current}/${exceeded.max}). Action: ${timeoutAction}.

If this is expected, increase Task({ execution_limits: { ... } }) for this session.`;
    process.stdout.write(formatResult('block', message));
    process.exit(2);
  } catch (_e) {
    // Fail open: monitoring must not break tool usage
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
