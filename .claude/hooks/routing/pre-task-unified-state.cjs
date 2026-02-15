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

function readTaskListLoopState(stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeTaskListLoopState(state, stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (_err) {
    // Best-effort
  }
}

function registerTaskListFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const now = Date.now();
  const state = readTaskListLoopState();
  const prev = state.sessions[sessionId] || { count: 0, updatedAt: 0 };
  const withinWindow = now - Number(prev.updatedAt || 0) <= TASKLIST_LOOP_BREAKER_WINDOW_MS;
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    updatedAt: now,
  };
  state.sessions[sessionId] = next;
  writeTaskListLoopState(state);
  return next.count;
}

function clearTaskListFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const state = readTaskListLoopState();
  if (state.sessions[sessionId]) {
    delete state.sessions[sessionId];
    writeTaskListLoopState(state);
  }
}

function readPlannerFirstLoopState(stateFile = PLANNER_FIRST_LOOP_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writePlannerFirstLoopState(state, stateFile = PLANNER_FIRST_LOOP_STATE_FILE) {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (_err) {
    // Best-effort
  }
}

function registerPlannerFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const now = Date.now();
  const state = readPlannerFirstLoopState();
  const prev = state.sessions[sessionId] || { count: 0, updatedAt: 0 };
  const withinWindow = now - Number(prev.updatedAt || 0) <= getPlannerFirstLoopBreakerWindowMs();
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    updatedAt: now,
  };
  state.sessions[sessionId] = next;
  writePlannerFirstLoopState(state);
  return next.count;
}

function clearPlannerFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const state = readPlannerFirstLoopState();
  if (state.sessions[sessionId]) {
    delete state.sessions[sessionId];
    writePlannerFirstLoopState(state);
  }
}

function resolveStableSessionId(hookInput = null) {
  return (
    process.env.CLAUDE_SESSION_ID || hookInput?.session_id || hookInput?.sessionId || 'unknown'
  );
}

function readAgentGuardrailsState(stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeAgentGuardrailsState(state, stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
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
  readTaskListLoopState,
  writeTaskListLoopState,
  registerTaskListFirstViolation,
  clearTaskListFirstViolation,
  readPlannerFirstLoopState,
  writePlannerFirstLoopState,
  registerPlannerFirstViolation,
  clearPlannerFirstViolation,
  resolveStableSessionId,
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
};
