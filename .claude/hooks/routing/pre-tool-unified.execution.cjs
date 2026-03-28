'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ROOT,
  atomicWriteJSONSync,
  safeParseJSON,
  appendJsonl,
} = require('./pre-tool-unified.shared.cjs');

const STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'execution-limits.json'
);
const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const EVENTS_FILE = path.join(METRICS_DIR, 'execution-limit-events.jsonl');
const EXECUTION_LIMIT_EVENTS_MAX_LINES = Number(
  process.env.EXECUTION_LIMIT_EVENTS_MAX_LINES || 2000
);

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
      const lockData = safeParseJSON(fs.readFileSync(claimingFile, 'utf8'));
      if (lockData && lockData.pid && !isProcessAlive(lockData.pid)) {
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
    appendJsonl(EVENTS_FILE, event, { maxLines: EXECUTION_LIMIT_EVENTS_MAX_LINES });
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

// spawnSync imported locally in getDynamicTokenCeiling branches
let cachedTokenCeiling = null;
function getDynamicTokenCeiling() {
  if (cachedTokenCeiling !== null) return cachedTokenCeiling;

  // Default cushion for 200k API constraint (Applies to all models on standard API tiers)
  let ceiling = 180000;

  // Only unlock 1M context for Opus IF the user's Anthropic API limits allow it
  const isExtraUsageEnabled = process.env.EXTRA_USAGE_ENABLED === 'true';

  if (isExtraUsageEnabled) {
    if (process.cwd() === PROJECT_ROOT) {
      // Router session uses Opus (1M limit) -> 950k cushion
      ceiling = 950000;
    } else {
      // Detect subagent model via parent process command-line
      try {
        if (process.platform === 'win32') {
          const ppid = String(Number(process.ppid) || 0);
          const { spawnSync: spawnSyncWin } = require('child_process');
          const psResult = spawnSyncWin(
            'powershell',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              'Get-CimInstance Win32_Process -Filter "ProcessId=\'' +
                ppid +
                '\'" | Select-Object -ExpandProperty CommandLine',
            ],
            { encoding: 'utf8', timeout: 2000 }
          );
          const out = (psResult.stdout || '').trim();
          if (out.includes('claude-opus')) {
            ceiling = 950000;
          }
        } else {
          const ppidUnix = String(Number(process.ppid) || 0);
          const { spawnSync: spawnSyncUnix } = require('child_process');
          const psUnix = spawnSyncUnix('ps', ['-o', 'args=', '-p', ppidUnix], {
            encoding: 'utf8',
            timeout: 2000,
          });
          const out = (psUnix.stdout || '').trim();
          if (out.includes('claude-opus')) {
            ceiling = 950000;
          }
        }
      } catch (_e) {
        // fallback silently to 180k
      }
    }
  }

  cachedTokenCeiling = ceiling;
  return ceiling;
}

function checkExecutionLimit(hookInput, toolName, toolInput) {
  try {
    const sessionId = getSessionId(hookInput);

    // --- Phase 4b: Dynamic Token Limit Check to prevent API 429s ---
    try {
      const budgetTracker = require('../../lib/utils/token-budget-tracker.cjs');
      const tokenStatus = budgetTracker.checkBudgetStatus(sessionId);

      const TOKEN_CEILING = getDynamicTokenCeiling();
      if (tokenStatus && tokenStatus.used > TOKEN_CEILING) {
        if (toolName !== 'TaskOutput' && toolName !== 'TaskUpdate' && toolName !== 'TaskList') {
          return {
            checked: true,
            action: 'block',
            message: `[SYSTEM URGENT] Context pressure > ${Math.floor(TOKEN_CEILING / 1000)}k tokens (${tokenStatus.used} used). You MUST call TaskOutput() immediately to yield control or you will crash. Do not execute any more tools.`,
          };
        }
      }
    } catch (_err) {
      // Best effort check
    }

    const state = readState();

    if (toolName === 'Task' && toolInput && toolInput.execution_limits) {
      ensureSessionConfigured(state, sessionId, toolInput.execution_limits);
      writeState(state);
      return { checked: true, action: 'allow' };
    }

    const session = state.sessions[sessionId];
    if (!session || !session.limits) {
      return { checked: false };
    }

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
      return { checked: true, action: 'allow' };
    }

    if (timeoutAction === 'warn') {
      return { checked: true, action: 'allow' };
    }

    const message = `[EXECUTION LIMIT] ${exceeded.limitType} exceeded (${exceeded.current}/${exceeded.max}). Action: ${timeoutAction}.\n\nIf this is expected, increase Task({ task_id: 'task-1', execution_limits: { ... } }) for this session.`;

    return { checked: true, action: 'block', message };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:execution-limit] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

const ALWAYS_ALLOWED = ['Read', 'TaskList', 'TaskGet', 'AskUserQuestion'];

function checkToolScope(hookInput, toolName) {
  const mode = process.env.TOOL_SCOPE_VALIDATOR || 'warn';
  if (mode === 'off') {
    return { checked: false, reason: 'disabled' };
  }

  try {
    if (!toolName) {
      return { checked: false, reason: 'no_tool_name' };
    }

    const agentAllowedTools = hookInput.allowed_tools || [];
    if (agentAllowedTools.length === 0) {
      return { checked: false, reason: 'no_restrictions' };
    }

    if (!agentAllowedTools.includes(toolName) && !ALWAYS_ALLOWED.includes(toolName)) {
      const message = `Tool ${toolName} not in allowed_tools: [${agentAllowedTools.join(', ')}]`;

      if (mode === 'block') {
        return { checked: true, action: 'block', message };
      }
      console.warn(`[WARN] ${message}`);
      return { checked: true, action: 'allow' };
    }

    return { checked: true, action: 'allow' };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:tool-scope] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

module.exports = {
  checkExecutionLimit,
  checkToolScope,
  ensureDir,
};
