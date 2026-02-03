'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const SPAWN_LOG_PATH = path.join(METRICS_DIR, 'spawn-log.jsonl');
const MAX_LINES = Number(process.env.SPAWN_LOG_MAX_LINES || 5000);

function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function trimIfNeeded() {
  if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) return;
  try {
    if (!fs.existsSync(SPAWN_LOG_PATH)) return;
    const content = fs.readFileSync(SPAWN_LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    const trimmed = lines.slice(lines.length - MAX_LINES).join('\n') + '\n';
    fs.writeFileSync(SPAWN_LOG_PATH, trimmed, 'utf8');
  } catch (_err) {
    // best-effort
  }
}

function append(entry) {
  try {
    ensureDir();
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
    fs.appendFileSync(SPAWN_LOG_PATH, `${line}\n`, 'utf8');
    trimIfNeeded();
  } catch (_err) {
    // best-effort
  }
}

function logSpawnStart({ taskId, agentType, promptLength, sessionId }) {
  append({
    event: 'spawn_start',
    task_id: taskId || null,
    agent_type: agentType || null,
    prompt_length: Number.isFinite(promptLength) ? promptLength : null,
    session_id: sessionId || null,
  });
}

function logSpawnEnd({ taskId, success, errorSnippet, sessionId }) {
  append({
    event: 'spawn_end',
    task_id: taskId || null,
    success: Boolean(success),
    error: errorSnippet || null,
    session_id: sessionId || null,
  });
}

function logMemoryFailure({ taskId, error, sessionId }) {
  append({
    event: 'memory_load_failed',
    task_id: taskId || null,
    error: error || null,
    session_id: sessionId || null,
  });
}

module.exports = { logSpawnStart, logSpawnEnd, logMemoryFailure };
