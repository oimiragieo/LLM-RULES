'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { validateMetricRow } = require('./metrics-schema.cjs');

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const ROUTER_CHURN_LOG_PATH = path.join(METRICS_DIR, 'router-churn-metrics.jsonl');
const MAX_LINES = Number(process.env.ROUTER_CHURN_MAX_LINES || 10000);

function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function trimIfNeeded() {
  if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) return;
  try {
    if (!fs.existsSync(ROUTER_CHURN_LOG_PATH)) return;
    const lines = fs.readFileSync(ROUTER_CHURN_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    fs.writeFileSync(
      ROUTER_CHURN_LOG_PATH,
      lines.slice(lines.length - MAX_LINES).join('\n') + '\n',
      'utf8'
    );
  } catch (_err) {
    // best-effort
  }
}

function append(entry) {
  try {
    ensureDir();
    const row = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    const validation = validateMetricRow(row);
    if (!validation.valid) {
      return;
    }
    fs.appendFileSync(ROUTER_CHURN_LOG_PATH, `${JSON.stringify(row)}\n`, 'utf8');
    trimIfNeeded();
  } catch (_err) {
    // best-effort
  }
}

function logRouterChurnEvent({
  sessionId,
  toolName,
  checkName,
  result,
  durationMs,
  dedupeCount,
  messageLength,
}) {
  append({
    event: 'router_guard_decision',
    session_id: sessionId || null,
    tool: toolName || null,
    check: checkName || null,
    result: result || 'allow',
    duration_ms: Number.isFinite(durationMs) ? Number(durationMs.toFixed(3)) : null,
    dedupe_count: Number.isFinite(dedupeCount) ? dedupeCount : null,
    message_length: Number.isFinite(messageLength) ? messageLength : null,
  });
}

function logRouterCostRiskEvent({ sessionId, score, level, factors = {}, notes = null }) {
  append({
    event: 'router_cost_risk',
    session_id: sessionId || null,
    score: Number.isFinite(score) ? Number(score.toFixed(2)) : 0,
    level: level || 'low',
    factors: typeof factors === 'object' && factors ? factors : {},
    notes: notes || null,
  });
}

function logRouterSloAlert({
  sessionId,
  severity = 'warning',
  sloName = 'token_utilization',
  value = 0,
  threshold = 0,
  downgraded = false,
  breachCount = 0,
}) {
  append({
    event: 'router_slo_alert',
    session_id: sessionId || null,
    severity,
    slo_name: sloName,
    value: Number.isFinite(value) ? Number(value.toFixed(4)) : 0,
    threshold: Number.isFinite(threshold) ? Number(threshold.toFixed(4)) : 0,
    downgraded: Boolean(downgraded),
    breach_count: Number.isFinite(breachCount) ? breachCount : 0,
  });
}

module.exports = {
  logRouterChurnEvent,
  logRouterCostRiskEvent,
  logRouterSloAlert,
  ROUTER_CHURN_LOG_PATH,
};
