'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const RUNTIME_HEALTH_LOG_PATH = path.join(METRICS_DIR, 'runtime-health-metrics.jsonl');
const MAX_LINES = Number(process.env.RUNTIME_HEALTH_MAX_LINES || 10000);

function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function trimIfNeeded() {
  if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) return;
  try {
    if (!fs.existsSync(RUNTIME_HEALTH_LOG_PATH)) return;
    const lines = fs.readFileSync(RUNTIME_HEALTH_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    fs.writeFileSync(
      RUNTIME_HEALTH_LOG_PATH,
      lines.slice(lines.length - MAX_LINES).join('\n') + '\n',
      'utf8'
    );
  } catch (_err) {
    // best-effort
  }
}

function logRuntimeHealth({ component, status = 'ok', durationMs, sessionId, extra = {} }) {
  try {
    ensureDir();
    const mem = process.memoryUsage();
    const row = {
      event: 'runtime_health',
      component: component || 'unknown',
      status,
      timestamp: new Date().toISOString(),
      session_id: sessionId || null,
      duration_ms: Number.isFinite(durationMs) ? Number(durationMs.toFixed(3)) : null,
      rss_mb: Number((mem.rss / 1024 / 1024).toFixed(2)),
      heap_used_mb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heap_total_mb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
      external_mb: Number((mem.external / 1024 / 1024).toFixed(2)),
      ...extra,
    };
    fs.appendFileSync(RUNTIME_HEALTH_LOG_PATH, `${JSON.stringify(row)}\n`, 'utf8');
    trimIfNeeded();
  } catch (_err) {
    // best-effort
  }
}

module.exports = {
  logRuntimeHealth,
  RUNTIME_HEALTH_LOG_PATH,
};
