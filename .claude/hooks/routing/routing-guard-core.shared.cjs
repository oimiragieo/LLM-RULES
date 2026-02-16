'use strict';

const fs = require('fs');
const path = require('path');
const routerState = require('../../lib/routing/router-state.cjs');

// Memory Monitor integration (lazy-loaded to avoid circular dependencies)
let MemoryMonitor = null;
let memoryMonitor = null;

function getMemoryMonitor() {
  if (memoryMonitor === null && MemoryMonitor === null) {
    try {
      MemoryMonitor = require('../../lib/utils/memory-monitor.cjs');
      memoryMonitor = MemoryMonitor.getGlobalMonitor();
    } catch (_err) {
      MemoryMonitor = false;
      memoryMonitor = false;
    }
  }
  return memoryMonitor || null;
}

// Violation Tracker integration (lazy-loaded)
let violationTracker = null;
function getViolationTracker() {
  if (violationTracker) return violationTracker;
  try {
    violationTracker = require('../../lib/monitoring/violation-tracker.cjs');
  } catch (_e) {
    violationTracker = null;
  }
  return violationTracker;
}

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const ROUTING_RUNTIME_DIR = path.join(__dirname, '..', '..', 'context', 'runtime');
const BLOCK_DEDUPE_STATE_PATH = path.join(ROUTING_RUNTIME_DIR, 'routing-block-dedupe.json');
const BLOCK_DEDUPE_THRESHOLD = Number(process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD || 2);
const BLOCK_DEDUPE_WINDOW_MS = Number(process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS || 90000);
let _blockDedupeStateCache = null;

function loadBlockDedupeStateFromDisk() {
  try {
    if (!fs.existsSync(BLOCK_DEDUPE_STATE_PATH)) return {};
    const raw = fs.readFileSync(BLOCK_DEDUPE_STATE_PATH, 'utf8');
    const { success, data } = safeParseJSON(raw, 'routing-block-dedupe');
    return success && data && typeof data === 'object' ? data : {};
  } catch (_err) {
    return {};
  }
}

function getBlockDedupeState() {
  if (_blockDedupeStateCache === null) {
    _blockDedupeStateCache = loadBlockDedupeStateFromDisk();
  }
  return { ..._blockDedupeStateCache };
}

function setBlockDedupeState(state) {
  _blockDedupeStateCache = state && typeof state === 'object' ? { ...state } : {};
  try {
    fs.mkdirSync(ROUTING_RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(
      BLOCK_DEDUPE_STATE_PATH,
      JSON.stringify(_blockDedupeStateCache, null, 2),
      'utf8'
    );
  } catch (_err) {
    // Best-effort: dedupe is optimization only.
  }
}

function resetBlockDedupeState() {
  _blockDedupeStateCache = {};
  try {
    if (fs.existsSync(BLOCK_DEDUPE_STATE_PATH)) {
      fs.unlinkSync(BLOCK_DEDUPE_STATE_PATH);
    }
  } catch (_err) {
    // Best-effort reset for tests.
  }
}

function resolveDedupeSessionId(hookInputOrSession = null) {
  const envSessionId = process.env.CLAUDE_SESSION_ID || null;
  if (envSessionId) return envSessionId;
  if (hookInputOrSession && typeof hookInputOrSession === 'object') {
    return hookInputOrSession.session_id || hookInputOrSession.sessionId || null;
  }
  if (typeof hookInputOrSession === 'string' && hookInputOrSession.trim().length > 0) {
    return hookInputOrSession.trim();
  }
  return null;
}

function registerBlockAttempt(checkName, toolName, hookInputOrSession = null) {
  const now = Date.now();
  const sessionId = resolveDedupeSessionId(hookInputOrSession);
  if (!sessionId) {
    return { count: 1, dedupe: false };
  }
  const key = `${sessionId}:${checkName}:${toolName}`;
  const state = getBlockDedupeState();
  const entry = state[key] || { count: 0, lastAt: 0 };
  const withinWindow = now - Number(entry.lastAt || 0) <= BLOCK_DEDUPE_WINDOW_MS;
  const count = withinWindow ? Number(entry.count || 0) + 1 : 1;
  state[key] = { count, lastAt: now };
  setBlockDedupeState(state);
  return { count, dedupe: count >= BLOCK_DEDUPE_THRESHOLD };
}

function compactFallbackMessage(title, toolName, count, fallback) {
  return (
    `[${title}] Repeated block (${count}x) for ${toolName}. ` +
    `Do not retry the same tool call. Spawn an agent via Task() tool. Fallback: ${fallback}`
  );
}

function buildRouterSelfCheckMessage(toolName, dedupe) {
  if (dedupe?.dedupe) {
    return compactFallbackMessage(
      'ROUTER-FIRST PROTOCOL VIOLATION | ROUTER SELF-CHECK VIOLATION',
      toolName,
      dedupe.count,
      'Spawn an appropriate specialist via Task().'
    );
  }

  return `[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER SELF-CHECK VIOLATION] ${toolName} is blacklisted in router mode. Spawn an agent via Task().`;
}

function shouldAutoReroute(enforcement, dedupeCount, threshold, enabledValue) {
  if (enforcement !== 'block') return false;
  if (String(enabledValue || '').toLowerCase() === 'off') return false;
  const parsedThreshold = Number(threshold);
  const effectiveThreshold =
    Number.isFinite(parsedThreshold) && parsedThreshold > 1 ? parsedThreshold : 3;
  return Number(dedupeCount || 0) >= effectiveThreshold;
}

function getTaskListAutoRerouteConfig() {
  return {
    enabledValue: String(process.env.TASKLIST_FIRST_AUTOREROUTE || 'true').toLowerCase(),
    threshold: Number(process.env.TASKLIST_FIRST_AUTOREROUTE_THRESHOLD || 3),
  };
}

function getIntentAutoRerouteConfig() {
  return {
    enabledValue: String(process.env.INTENT_AGENT_AUTOREROUTE || 'true').toLowerCase(),
    threshold: Number(process.env.INTENT_AGENT_AUTOREROUTE_THRESHOLD || 3),
  };
}

function shouldDelegateTaskChecksToPreTaskUnified(toolName) {
  if (toolName !== 'Task') return false;
  const mode = String(process.env.ROUTING_GUARD_TASK_CHECKS || 'delegate')
    .trim()
    .toLowerCase();
  return mode !== 'force';
}

function extractDedupeCount(message) {
  if (!message || typeof message !== 'string') return null;
  const match = message.match(/\((\d+)x\)/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

let _cachedRouterState = null;
let _stateCacheEnabled = false;

function applyStaleDetection(state) {
  if (!state || typeof state !== 'object') {
    return state;
  }

  const thresholdMs = parseInt(process.env.STATE_STALE_THRESHOLD_MS || '600000', 10);
  if (isNaN(thresholdMs) || thresholdMs <= 0) {
    return state;
  }
  const currentSessionId = process.env.CLAUDE_SESSION_ID || null;
  const stateSessionId = state.sessionId || null;
  const hasSessionMismatch =
    currentSessionId && stateSessionId && String(currentSessionId) !== String(stateSessionId);

  if (!state.lastReset) {
    if (state.mode === 'agent' || state.taskSpawned === true) {
      return state;
    }
    if (hasSessionMismatch) {
      return { ...state, mode: 'router', taskSpawned: false, sessionId: currentSessionId };
    }
    return state;
  }

  const resetTime = new Date(state.lastReset).getTime();
  if (isNaN(resetTime)) {
    if (state.mode === 'agent' || state.taskSpawned === true) {
      return state;
    }
    if (hasSessionMismatch) {
      return { ...state, mode: 'router', taskSpawned: false, sessionId: currentSessionId };
    }
    return state;
  }

  const ageMs = Date.now() - resetTime;
  if (ageMs > thresholdMs) {
    if (hasSessionMismatch) {
      return { ...state, mode: 'router', taskSpawned: false, sessionId: currentSessionId };
    }
    return state;
  }

  return state;
}

function getCachedRouterState() {
  if (!_stateCacheEnabled) {
    const rawState = routerState.getState();
    return applyStaleDetection(rawState);
  }
  if (_cachedRouterState === null) {
    const rawState = routerState.getState();
    _cachedRouterState = applyStaleDetection(rawState);
  }
  return _cachedRouterState;
}

function invalidateCachedState() {
  _cachedRouterState = null;
  routerState.invalidateStateCache();
}

function setStateCacheEnabled(enabled) {
  const previous = _stateCacheEnabled;
  _stateCacheEnabled = Boolean(enabled);
  if (!enabled) {
    _cachedRouterState = null;
  }
  return previous;
}

function clearInvocationCache() {
  _cachedRouterState = null;
}

function isRouterInvocation(hookInput = {}) {
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId && agentId !== 'router') {
    return false;
  }

  const allowedTools = Array.isArray(hookInput.allowed_tools) ? hookInput.allowed_tools : null;
  if (allowedTools && allowedTools.length > 0 && !allowedTools.includes('Task')) {
    return false;
  }

  return true;
}

module.exports = {
  getMemoryMonitor,
  getViolationTracker,
  registerBlockAttempt,
  compactFallbackMessage,
  buildRouterSelfCheckMessage,
  shouldAutoReroute,
  getTaskListAutoRerouteConfig,
  getIntentAutoRerouteConfig,
  shouldDelegateTaskChecksToPreTaskUnified,
  extractDedupeCount,
  applyStaleDetection,
  getCachedRouterState,
  invalidateCachedState,
  setStateCacheEnabled,
  clearInvocationCache,
  isRouterInvocation,
  resetBlockDedupeState,
};
