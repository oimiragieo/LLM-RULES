#!/usr/bin/env node
/**
 * Loop State Manager
 * ==================
 *
 * Shared, minimal state manager for loop prevention.
 *
 * State file: .claude/context/self-healing/loop-state.json
 *
 * This module intentionally focuses on safe reads/writes and counter updates.
 * Enforcement logic lives in routing hooks (e.g. pre-task-unified.cjs).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON, SCHEMAS } = require('../utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

// Resolve project root deterministically from this file location:
// <project>/.claude/lib/self-healing/loop-state-manager.cjs -> <project>
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'loop-state.json'
);

// Locking (mirrors .claude/hooks/self-healing/loop-prevention.cjs safety guarantees)
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
      // Fall back to busy-wait
    }
  }
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait - only used when Atomics.wait unavailable
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

      // Process still alive; restore lock if possible
      try {
        fs.renameSync(claimingFile, lockFile);
      } catch (_restoreErr) {
        try {
          fs.unlinkSync(claimingFile);
        } catch {
          // best effort cleanup
        }
      }
      return false;
    } catch (_readErr) {
      try {
        fs.unlinkSync(claimingFile);
      } catch {
        // best effort cleanup
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
        if (tryClaimStaleLock(lockFile)) {
          continue;
        }
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

function getDefaultState() {
  const now = new Date().toISOString();
  const defaults = SCHEMAS['loop-state']?.defaults || {};
  return {
    ...defaults,
    sessionId: process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
}

function ensureStateDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getState(stateFile = LOOP_STATE_FILE) {
  const defaults = getDefaultState();
  const currentSessionId = process.env.CLAUDE_SESSION_ID || null;

  try {
    if (!fs.existsSync(stateFile)) {
      return defaults;
    }
    const content = fs.readFileSync(stateFile, 'utf8');
    const parsed = safeParseJSON(content, 'loop-state');
    const state = { ...defaults, ...parsed };

    // Session boundary guard: loop-prevention counters are session-scoped.
    // If a stale state file from a previous session is present, start fresh
    // to avoid false-positive loop blocks on legitimate new task waves.
    if (currentSessionId && state.sessionId && state.sessionId !== currentSessionId) {
      return {
        ...defaults,
        sessionId: currentSessionId,
      };
    }

    if (!state.createdAt) state.createdAt = defaults.createdAt;
    if (!state.updatedAt) state.updatedAt = defaults.updatedAt;
    return state;
  } catch (_e) {
    return defaults;
  }
}

function saveState(state, stateFile = LOOP_STATE_FILE) {
  const lockAcquired = acquireLock(stateFile);
  try {
    ensureStateDir(stateFile);
    const updated = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJSONSync(stateFile, updated);
  } finally {
    if (lockAcquired) {
      releaseLock(stateFile);
    }
  }
}

function resetState(stateFile = LOOP_STATE_FILE) {
  const state = getDefaultState();
  saveState(state, stateFile);
  return state;
}

function recordAction(action, stateFile = LOOP_STATE_FILE) {
  if (!action || typeof action !== 'string') return;

  const state = getState(stateFile);
  const history = Array.isArray(state.actionHistory) ? state.actionHistory : [];

  const existing = history.find(h => h && typeof h === 'object' && h.action === action);
  if (existing) {
    existing.count = typeof existing.count === 'number' ? existing.count + 1 : 1;
    existing.lastAt = new Date().toISOString();
  } else {
    history.push({ action, count: 1, lastAt: new Date().toISOString() });
  }

  state.actionHistory = history.slice(-50);
  saveState(state, stateFile);
}

function recordSpawn(agentType, stateFile = LOOP_STATE_FILE) {
  const state = getState(stateFile);
  state.spawnDepth = typeof state.spawnDepth === 'number' ? state.spawnDepth + 1 : 1;
  saveState(state, stateFile);

  if (agentType) {
    recordAction(`spawn:${agentType}`, stateFile);
  }
}

function decrementSpawnDepth(stateFile = LOOP_STATE_FILE) {
  const state = getState(stateFile);
  const current = typeof state.spawnDepth === 'number' ? state.spawnDepth : 0;
  state.spawnDepth = Math.max(0, current - 1);
  saveState(state, stateFile);
}

function recordEvolution(type, stateFile = LOOP_STATE_FILE) {
  if (!type || typeof type !== 'string') return;

  const state = getState(stateFile);
  state.evolutionCount = typeof state.evolutionCount === 'number' ? state.evolutionCount + 1 : 1;
  state.lastEvolutions =
    state.lastEvolutions && typeof state.lastEvolutions === 'object' ? state.lastEvolutions : {};
  state.lastEvolutions[type] = new Date().toISOString();
  saveState(state, stateFile);
  recordAction(`evolution:${type}`, stateFile);
}

module.exports = {
  LOOP_STATE_FILE,
  getState,
  saveState,
  resetState,
  recordAction,
  recordSpawn,
  decrementSpawnDepth,
  recordEvolution,
};
