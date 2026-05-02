const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

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
    try {
      const data = safeParseJSON(fs.readFileSync(sessionPath, 'utf8'));
      if (data.sessionId) return data.sessionId;
    } catch (_e) {
      // fallback to generation if corrupt
    }
  }

  const sessionId = crypto.randomUUID();
  fs.writeFileSync(
    sessionPath,
    JSON.stringify({ sessionId, generatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );

  return sessionId;
}

module.exports = {
  getOrCreateSessionId,
};
