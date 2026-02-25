'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const loopStateManager = libRequire(path.join('self-healing', 'loop-state-manager.cjs'));
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));

const LOOP_STATE_FILE = loopStateManager.LOOP_STATE_FILE;
const TASKLIST_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tasklist-first-loop-state.json'
);
const PLANNER_FIRST_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'planner-first-loop-state.json'
);
const AGENT_GUARDRAILS_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'agent-guardrails-state.json'
);

const TASKLIST_LOOP_BREAKER_THRESHOLD = Number(
  process.env.TASKLIST_FIRST_LOOP_BREAKER_THRESHOLD || 3
);
const TASKLIST_LOOP_BREAKER_WINDOW_MS = Number(
  process.env.TASKLIST_FIRST_LOOP_BREAKER_WINDOW_MS || 120000
);

function getPlannerFirstLoopBreakerThreshold() {
  const value = Number(process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD || 3);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function getPlannerFirstLoopBreakerWindowMs() {
  const value = Number(process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS || 120000);
  return Number.isFinite(value) && value > 0 ? value : 120000;
}

function invalidateCachedState() {
  routerState.invalidateStateCache();
}

function getLoopState() {
  return loopStateManager.getState();
}

async function readTaskListLoopStateAsync(stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    const content = await fs.promises.readFile(stateFile, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.sessions &&
      typeof parsed.sessions === 'object'
    ) {
      return parsed;
    }
  } catch (_err) {
    // Return default below
  }
  return { sessions: {} };
}

async function writeTaskListLoopStateAsync(state, stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    const { atomicWriteJSONAsync } = libRequire(path.join('utils', 'atomic-write.cjs'));
    await atomicWriteJSONAsync(stateFile, state);
  } catch (_err) {
    // Best-effort
  }
}

async function registerTaskListFirstViolationAsync(
  sessionId = process.env.CLAUDE_SESSION_ID || 'unknown'
) {
  const now = Date.now();
  const state = await readTaskListLoopStateAsync();
  const prev = state.sessions[sessionId] || { count: 0, updatedAt: 0 };
  const withinWindow = now - Number(prev.updatedAt || 0) <= TASKLIST_LOOP_BREAKER_WINDOW_MS;
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    updatedAt: now,
  };
  state.sessions[sessionId] = next;
  await writeTaskListLoopStateAsync(state);
  return next.count;
}

async function clearTaskListFirstViolationAsync(
  sessionId = process.env.CLAUDE_SESSION_ID || 'unknown'
) {
  const state = await readTaskListLoopStateAsync();
  if (state.sessions[sessionId]) {
    delete state.sessions[sessionId];
    await writeTaskListLoopStateAsync(state);
  }
}

async function readPlannerFirstLoopStateAsync(stateFile = PLANNER_FIRST_LOOP_STATE_FILE) {
  try {
    const content = await fs.promises.readFile(stateFile, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.sessions &&
      typeof parsed.sessions === 'object'
    ) {
      return parsed;
    }
  } catch (_err) {
    // Return default below
  }
  return { sessions: {} };
}

async function writePlannerFirstLoopStateAsync(state, stateFile = PLANNER_FIRST_LOOP_STATE_FILE) {
  try {
    const { atomicWriteJSONAsync } = libRequire(path.join('utils', 'atomic-write.cjs'));
    await atomicWriteJSONAsync(stateFile, state);
  } catch (_err) {
    // Best-effort
  }
}

async function registerPlannerFirstViolationAsync(
  sessionId = process.env.CLAUDE_SESSION_ID || 'unknown'
) {
  const now = Date.now();
  const state = await readPlannerFirstLoopStateAsync();
  const prev = state.sessions[sessionId] || { count: 0, updatedAt: 0 };
  const withinWindow = now - Number(prev.updatedAt || 0) <= getPlannerFirstLoopBreakerWindowMs();
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    updatedAt: now,
  };
  state.sessions[sessionId] = next;
  await writePlannerFirstLoopStateAsync(state);
  return next.count;
}

async function clearPlannerFirstViolationAsync(
  sessionId = process.env.CLAUDE_SESSION_ID || 'unknown'
) {
  const state = await readPlannerFirstLoopStateAsync();
  if (state.sessions[sessionId]) {
    delete state.sessions[sessionId];
    await writePlannerFirstLoopStateAsync(state);
  }
}

function resolveStableSessionId(hookInput = null) {
  return (
    process.env.CLAUDE_SESSION_ID || hookInput?.session_id || hookInput?.sessionId || 'unknown'
  );
}

async function readAgentGuardrailsStateAsync(stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    const content = await fs.promises.readFile(stateFile, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.sessions &&
      typeof parsed.sessions === 'object'
    ) {
      return parsed;
    }
  } catch (_err) {
    // Return default below
  }
  return { sessions: {} };
}

async function writeAgentGuardrailsStateAsync(state, stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    const { atomicWriteJSONAsync } = libRequire(path.join('utils', 'atomic-write.cjs'));
    await atomicWriteJSONAsync(stateFile, state);
  } catch (_err) {
    // Best-effort.
  }
}

module.exports = {
  LOOP_STATE_FILE,
  TASKLIST_LOOP_BREAKER_THRESHOLD,
  AGENT_GUARDRAILS_STATE_FILE,
  getPlannerFirstLoopBreakerThreshold,
  invalidateCachedState,
  getLoopState,
  readTaskListLoopStateAsync,
  writeTaskListLoopStateAsync,
  registerTaskListFirstViolationAsync,
  clearTaskListFirstViolationAsync,
  readPlannerFirstLoopStateAsync,
  writePlannerFirstLoopStateAsync,
  registerPlannerFirstViolationAsync,
  clearPlannerFirstViolationAsync,
  resolveStableSessionId,
  readAgentGuardrailsStateAsync,
  writeAgentGuardrailsStateAsync,
};
