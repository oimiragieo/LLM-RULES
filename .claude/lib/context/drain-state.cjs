const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

function getDrainStatePath(runtimeDir) {
  return path.join(runtimeDir, 'drain-state.json');
}

function enterDrainMode({ sessionId, drainDeadlineMinutes = 5 }, runtimeDir = DEFAULT_RUNTIME_DIR) {
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const now = Date.now();
  const deadlineMs = now + drainDeadlineMinutes * 60 * 1000;

  const state = {
    sessionId,
    activatedAt: new Date(now).toISOString(),
    drainDeadline: new Date(deadlineMs).toISOString(),
  };

  fs.writeFileSync(getDrainStatePath(runtimeDir), JSON.stringify(state, null, 2), 'utf8');
}

function getDrainState(runtimeDir = DEFAULT_RUNTIME_DIR) {
  const p = getDrainStatePath(runtimeDir);
  if (!fs.existsSync(p)) return null;
  return safeParseJSON(fs.readFileSync(p, 'utf8'));
}

function isDraining(currentSessionId, runtimeDir = DEFAULT_RUNTIME_DIR) {
  const state = getDrainState(runtimeDir);
  if (!state) return false;

  if (state.sessionId !== currentSessionId) {
    return false;
  }

  if (state.drainDeadline) {
    const deadline = new Date(state.drainDeadline).getTime();
    if (Date.now() > deadline) {
      return false;
    }
  }

  return true;
}

function exitDrainMode(runtimeDir = DEFAULT_RUNTIME_DIR) {
  const p = getDrainStatePath(runtimeDir);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch (e) {
      console.warn(`[drain-state] failed to remove drain state: ${e.message}`);
    }
  }
}

module.exports = {
  enterDrainMode,
  isDraining,
  exitDrainMode,
  getDrainState,
};
