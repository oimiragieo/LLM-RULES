#!/usr/bin/env node
// Agent: developer | Task: #10 | Session: 2026-03-10
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const SESSION_ID_FILENAME = 'session-id.json';

function getDefaultRuntimeDir() {
  return path.join(__dirname, '../../context/runtime');
}

/**
 * Get or create a persistent session ID for the current session.
 * Priority: process.env.CLAUDE_SESSION_ID > persisted session-id.json > generate new
 * @param {string} [runtimeDir]
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] - Force generation of new ID even if one exists
 * @returns {string}
 */
function getOrCreateSessionId(runtimeDir, { force = false } = {}) {
  // Env variable takes highest priority
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }

  const dir = runtimeDir || getDefaultRuntimeDir();
  const sessionPath = path.join(dir, SESSION_ID_FILENAME);

  if (!force && fs.existsSync(sessionPath)) {
    let raw;
    try { raw = fs.readFileSync(sessionPath, 'utf8'); } catch { /* fall through */ }
    if (raw) {
      const data = safeParseJSON(raw);
      if (data && data.sessionId) {
        return data.sessionId;
      }
    }
  }

  // Generate new ID
  const sessionId = crypto.randomUUID();
  fs.mkdirSync(dir, { recursive: true });
  const record = { sessionId, createdAt: new Date().toISOString() };
  const tmp = sessionPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(tmp, sessionPath);
  return sessionId;
}

module.exports = { getOrCreateSessionId, SESSION_ID_FILENAME };
