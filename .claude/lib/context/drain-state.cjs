const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function getDrainStatePath(runtimeDir) {
  return path.join(runtimeDir, 'drain-state.json');
}

function enterDrainMode(
  { sessionId, drainDeadlineMinutes = 5 },
  runtimeDir = path.join(process.cwd(), '.claude/context/runtime')
) {
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

function getDrainState(runtimeDir = path.join(process.cwd(), '.claude/context/runtime')) {
  const p = getDrainStatePath(runtimeDir);
  if (!fs.existsSync(p)) return null;
  return safeParseJSON(fs.readFileSync(p, 'utf8'));
}

function isDraining(
  currentSessionId,
  runtimeDir = path.join(process.cwd(), '.claude/context/runtime')
) {
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

function exitDrainMode(runtimeDir = path.join(process.cwd(), '.claude/context/runtime')) {
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
