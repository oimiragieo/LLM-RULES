#!/usr/bin/env node
/**
 * Loop State Manager — Self-Healing Module
 *
 * Tracks spawn depth, action patterns, and evolution budgets
 * to prevent infinite agent spawn loops.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const _LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'loop-state.json'
);
const LOOP_STATE_FILE = _LOOP_STATE_FILE;
const STALE_SPAWN_MS = 10 * 60 * 1000;
const ACTION_WINDOW_MS = 30 * 60 * 1000;
const MAX_ACTION_HISTORY = 50;

function getSessionId() {
  return process.env.CLAUDE_SESSION_ID || 'session-unknown';
}

function createDefaultState(nowIso = new Date().toISOString()) {
  return {
    sessionId: getSessionId(),
    spawnDepth: 0,
    actionHistory: [],
    evolutionCount: 0,
    lastEvolutions: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeActionHistory(history) {
  if (!Array.isArray(history)) return [];
  const now = Date.now();
  return history.filter(entry => {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.action || typeof entry.action !== 'string') return false;
    const ts = Date.parse(entry.lastAt || '');
    if (!Number.isFinite(ts)) return false;
    return now - ts <= ACTION_WINDOW_MS;
  });
}

function getState(stateFile = _LOOP_STATE_FILE) {
  const nowIso = new Date().toISOString();
  const defaults = createDefaultState(nowIso);

  if (!fs.existsSync(stateFile)) return defaults;

  const raw = fs.readFileSync(stateFile, 'utf8');
  const parsed = safeParseJSON(raw, null);
  if (!parsed || typeof parsed !== 'object') return defaults;

  const state = {
    ...defaults,
    ...parsed,
  };
  state.actionHistory = sanitizeActionHistory(state.actionHistory);

  const currentSessionId = getSessionId();
  if (currentSessionId !== 'session-unknown' && state.sessionId !== currentSessionId) {
    return defaults;
  }

  const updatedAtMs = Date.parse(state.updatedAt || '');
  if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > STALE_SPAWN_MS) {
    state.spawnDepth = 0;
  }

  return state;
}

function saveState(state, stateFile = _LOOP_STATE_FILE) {
  try {
    ensureDir(stateFile);
    const nowIso = new Date().toISOString();
    const out = {
      ...createDefaultState(nowIso),
      ...(state || {}),
      sessionId: state?.sessionId || getSessionId(),
      actionHistory: sanitizeActionHistory(state?.actionHistory),
      createdAt: state?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    const tmp = `${stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
    fs.renameSync(tmp, stateFile);
  } catch (_err) {
    // Best effort
  }
}

function resetState(stateFile = _LOOP_STATE_FILE) {
  const state = createDefaultState();
  saveState(state, stateFile);
  return getState(stateFile);
}

function recordAction(action, stateFile = _LOOP_STATE_FILE) {
  if (!action) return;
  const state = getState(stateFile);
  const nowIso = new Date().toISOString();
  const existing = state.actionHistory.find(entry => entry.action === action);
  if (existing) {
    existing.count = Number(existing.count || 0) + 1;
    existing.lastAt = nowIso;
  } else {
    state.actionHistory.push({ action, count: 1, lastAt: nowIso });
  }
  state.actionHistory = state.actionHistory
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
    .slice(0, MAX_ACTION_HISTORY);
  saveState(state, stateFile);
}

function recordSpawn(agentType, stateFile = _LOOP_STATE_FILE) {
  const state = getState(stateFile);
  state.spawnDepth = Number(state.spawnDepth || 0) + 1;
  saveState(state, stateFile);
  recordAction(`spawn:${agentType || 'unknown'}`, stateFile);
}

function decrementSpawnDepth(stateFile = _LOOP_STATE_FILE) {
  const state = getState(stateFile);
  state.spawnDepth = Math.max(0, Number(state.spawnDepth || 0) - 1);
  saveState(state, stateFile);
}

function recordEvolution(evolutionType, stateFile = _LOOP_STATE_FILE) {
  if (!evolutionType) return;
  const state = getState(stateFile);
  state.evolutionCount = Number(state.evolutionCount || 0) + 1;
  state.lastEvolutions =
    state.lastEvolutions && typeof state.lastEvolutions === 'object' ? state.lastEvolutions : {};
  state.lastEvolutions[evolutionType] = new Date().toISOString();
  saveState(state, stateFile);
  recordAction(`evolution:${evolutionType}`, stateFile);
}

module.exports = {
  _LOOP_STATE_FILE,
  LOOP_STATE_FILE,
  getState,
  saveState,
  resetState,
  recordAction,
  recordSpawn,
  decrementSpawnDepth,
  recordEvolution,
};
