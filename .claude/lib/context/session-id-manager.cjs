const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

function sleepSync(ms) {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function readPersistedSessionId(sessionPath, options = {}) {
  const { attempts = 1, delayMs = 0 } = options;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const data = safeParseJSON(fs.readFileSync(sessionPath, 'utf8'));
      if (data.sessionId) return data.sessionId;
    } catch (_e) {
      // Retry below; concurrent writers may have created the file before finishing.
    }
    if (attempt < attempts - 1) {
      sleepSync(delayMs);
    }
  }
  return null;
}

function getOrCreateSessionId(runtimeDir = DEFAULT_RUNTIME_DIR, options = {}) {
  const { force = false } = options;

  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const sessionPath = path.join(runtimeDir, 'session-id.json');

  if (!force && fs.existsSync(sessionPath)) {
    const existingSessionId = readPersistedSessionId(sessionPath);
    if (existingSessionId) return existingSessionId;
  }

  const sessionId = crypto.randomUUID();
  const payload = JSON.stringify({ sessionId, generatedAt: new Date().toISOString() }, null, 2);

  if (force) {
    fs.writeFileSync(sessionPath, payload, 'utf8');
    return sessionId;
  }

  try {
    // Exclusive create ('wx'): the first concurrent writer wins. Without this,
    // two callers that both passed the existsSync check above would generate
    // divergent UUIDs and last-write-wins, splitting the session identity.
    fs.writeFileSync(sessionPath, payload, { encoding: 'utf8', flag: 'wx' });
    return sessionId;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      // Another caller committed first — return the persisted id.
      const existingSessionId = readPersistedSessionId(sessionPath, { attempts: 5, delayMs: 20 });
      if (existingSessionId) return existingSessionId;
      throw new Error('session-id.json exists but no valid sessionId could be read');
    }
    throw e;
  }
}

module.exports = {
  getOrCreateSessionId,
  _private: {
    readPersistedSessionId,
  },
};
