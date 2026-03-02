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

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'loop-state.json'
);

const DEFAULT_STATE = {
  spawnDepth: 0,
  actionHistory: [],
  evolutionCount: 0,
  lastEvolutions: {},
};

function ensureDir() {
  const dir = path.dirname(LOOP_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readState() {
  try {
    if (fs.existsSync(LOOP_STATE_FILE)) {
      const raw = fs.readFileSync(LOOP_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_STATE, ...parsed };
      }
    }
  } catch (_err) {
    // Corrupt file — return default
  }
  return { ...DEFAULT_STATE };
}

function writeState(state) {
  try {
    ensureDir();
    const tmp = LOOP_STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, LOOP_STATE_FILE);
  } catch (_err) {
    // Best-effort — don't crash hooks
  }
}

function getState() {
  return readState();
}

function resetState() {
  writeState({ ...DEFAULT_STATE });
}

function recordSpawn(agentType) {
  const state = readState();
  state.spawnDepth = (state.spawnDepth || 0) + 1;

  const action = `spawn:${agentType || 'unknown'}`;
  if (!Array.isArray(state.actionHistory)) {
    state.actionHistory = [];
  }

  const existing = state.actionHistory.find(a => a.action === action);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    existing.lastAt = new Date().toISOString();
  } else {
    state.actionHistory.push({
      action,
      count: 1,
      lastAt: new Date().toISOString(),
    });
  }

  writeState(state);
}

function recordEvolution(evolutionType) {
  const state = readState();
  state.evolutionCount = (state.evolutionCount || 0) + 1;

  if (!state.lastEvolutions || typeof state.lastEvolutions !== 'object') {
    state.lastEvolutions = {};
  }
  state.lastEvolutions[evolutionType] = new Date().toISOString();

  writeState(state);
}

function decrementSpawnDepth() {
  const state = readState();
  state.spawnDepth = Math.max(0, (state.spawnDepth || 0) - 1);
  writeState(state);
}

module.exports = {
  LOOP_STATE_FILE,
  getState,
  resetState,
  recordSpawn,
  recordEvolution,
  decrementSpawnDepth,
};
