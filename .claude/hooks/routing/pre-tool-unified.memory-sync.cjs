'use strict';

const fs = require('fs');
const path = require('path');
const { libRequire } = require('./pre-tool-unified.shared.cjs');
const { PROJECT_ROOT } = libRequire(path.join('utils', 'project-root.cjs'));
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));

const MEMORY_SYNC_STATE_FILE =
  process.env.MEMORY_SYNC_STATE_FILE ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'memory-sync-state.json');

const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const LEARNINGS_FILE = path.join(MEMORY_DIR, 'learnings.md');
const GOTCHAS_FILE = path.join(MEMORY_DIR, 'gotchas.json');

function readMemorySyncState() {
  try {
    if (!fs.existsSync(MEMORY_SYNC_STATE_FILE)) return { sessions: {} };
    const raw = fs.readFileSync(MEMORY_SYNC_STATE_FILE, 'utf8');
    return safeParseJSON(raw, null, null, { sessions: {} });
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeMemorySyncState(state) {
  try {
    atomicWriteJSONSync(MEMORY_SYNC_STATE_FILE, state);
  } catch (_err) {
    // Best effort
  }
}

function getLatestMemoryMtime() {
  let highest = 0;
  for (const file of [LEARNINGS_FILE, GOTCHAS_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.mtimeMs > highest) {
          highest = stats.mtimeMs;
        }
      }
    } catch (_e) {
      // ignore
    }
  }
  return highest;
}

function checkDynamicMemorySync(hookInput) {
  const sessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  if (sessionId === 'unknown') {
    return { hasUpdate: false };
  }

  const latestMtime = getLatestMemoryMtime();
  if (latestMtime === 0) return { hasUpdate: false };

  const state = readMemorySyncState();
  const sessionState = state.sessions[sessionId] || {
    lastNotifiedMtime: null,
    firstSeenMtime: latestMtime,
  };

  let hasUpdate = false;

  // If this session has run before, check if memory was modified since our first seen or last notified
  if (sessionState.firstSeenMtime && sessionState.lastNotifiedMtime) {
    if (latestMtime > sessionState.lastNotifiedMtime) {
      hasUpdate = true;
    }
  } else if (sessionState.firstSeenMtime && !sessionState.lastNotifiedMtime) {
    if (latestMtime > sessionState.firstSeenMtime) {
      hasUpdate = true;
    }
  }

  if (hasUpdate) {
    sessionState.lastNotifiedMtime = latestMtime;
    state.sessions[sessionId] = sessionState;

    // Prune state bounding to 200 sessions
    const keys = Object.keys(state.sessions);
    if (keys.length > 200) {
      keys
        .sort(
          (a, b) =>
            Number(state.sessions[b].lastNotifiedMtime || 0) -
            Number(state.sessions[a].lastNotifiedMtime || 0)
        )
        .slice(200)
        .forEach(k => delete state.sessions[k]);
    }

    writeMemorySyncState(state);

    return {
      hasUpdate: true,
      warning:
        'System global memory was updated dynamically by another agent since your session started. If you are stuck or encountering errors, run the `memory-search` skill: `node .claude/lib/memory/memory-search.cjs "<query>"` to fetch latest contexts.',
    };
  }

  // Update firstseen/lastNotified tracking silently
  state.sessions[sessionId] = sessionState;
  writeMemorySyncState(state);
  return { hasUpdate: false };
}

module.exports = {
  checkDynamicMemorySync,
  readMemorySyncState,
  getLatestMemoryMtime,
};
