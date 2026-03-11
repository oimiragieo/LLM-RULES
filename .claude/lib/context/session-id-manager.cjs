const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getOrCreateSessionId(
  runtimeDir = path.join(process.cwd(), '.claude/context/runtime'),
  options = {}
) {
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
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
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
