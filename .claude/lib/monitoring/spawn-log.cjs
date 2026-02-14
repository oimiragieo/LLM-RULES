'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { validateMetricRow } = require('./metrics-schema.cjs');

const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const SPAWN_LOG_PATH = path.join(METRICS_DIR, 'spawn-log.jsonl');
const SPAWN_ASSEMBLY_METRICS_PATH = path.join(METRICS_DIR, 'spawn-assembly-metrics.jsonl');
const TOKEN_BURN_METRICS_PATH = path.join(METRICS_DIR, 'token-burn-metrics.jsonl');
const MAX_LINES = Number(process.env.SPAWN_LOG_MAX_LINES || 5000);

function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function trimIfNeeded(filePath) {
  if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) return;
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    const trimmed = lines.slice(lines.length - MAX_LINES).join('\n') + '\n';
    fs.writeFileSync(filePath, trimmed, 'utf8');
  } catch (_err) {
    // best-effort
  }
}

function appendToFile(filePath, entry) {
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
    const line = JSON.stringify(row);
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
    trimIfNeeded(filePath);
  } catch (_err) {
    // best-effort
  }
}

function append(entry) {
  appendToFile(SPAWN_LOG_PATH, entry);
}

function estimateTokensFromChars(chars) {
  const safeChars = Number.isFinite(chars) && chars > 0 ? chars : 0;
  // Lightweight approximation for CI trend monitoring.
  return Math.ceil(safeChars / 4);
}

function logSpawnStart({ taskId, agentType, promptLength, sessionId }) {
  // Guard against null task_id to prevent traceability corruption
  if (!taskId || taskId === null) {
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error(
        '[spawn-log] Attempting to log spawn_start with null task_id. Skipping to prevent traceability corruption.'
      );
    }
    return;
  }

  append({
    event: 'spawn_start',
    task_id: taskId,
    agent_type: agentType || null,
    prompt_length: Number.isFinite(promptLength) ? promptLength : null,
    session_id: sessionId || null,
  });
}

function logSpawnEnd({ taskId, success, errorSnippet, sessionId }) {
  // Guard against null task_id to prevent traceability corruption
  if (!taskId || taskId === null) {
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error(
        '[spawn-log] Attempting to log spawn_end with null task_id. Skipping to prevent traceability corruption.'
      );
    }
    return;
  }

  append({
    event: 'spawn_end',
    task_id: taskId,
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

function logSpawnRagMetric({
  taskId,
  sessionId,
  ragEnabled,
  ragSectionAdded,
  ragMemoryQueryLen,
}) {
  append({
    event: 'spawn_rag',
    task_id: taskId || null,
    session_id: sessionId || null,
    rag_enabled: Boolean(ragEnabled),
    rag_section_added: Boolean(ragSectionAdded),
    rag_memory_query_len: Number.isFinite(ragMemoryQueryLen) ? ragMemoryQueryLen : 0,
  });
}

function logSpawnAssemblyMetric({
  taskId,
  agentType,
  sessionId,
  totalMs,
  phases = {},
  inputChars,
  outputChars,
  compactnessScore,
  ragEnabled = null,
  ragSectionAdded = null,
  ragMemoryQueryLen = null,
}) {
  appendToFile(SPAWN_ASSEMBLY_METRICS_PATH, {
    event: 'spawn_assembly',
    task_id: taskId || null,
    agent_type: agentType || null,
    session_id: sessionId || null,
    total_ms: Number.isFinite(totalMs) ? Number(totalMs.toFixed(3)) : null,
    phases,
    input_chars: Number.isFinite(inputChars) ? inputChars : null,
    output_chars: Number.isFinite(outputChars) ? outputChars : null,
    compactness_score: Number.isFinite(compactnessScore) ? compactnessScore : null,
    rag_enabled: typeof ragEnabled === 'boolean' ? ragEnabled : null,
    rag_section_added: typeof ragSectionAdded === 'boolean' ? ragSectionAdded : null,
    rag_memory_query_len: Number.isFinite(ragMemoryQueryLen) ? ragMemoryQueryLen : null,
  });
}

function logTokenBurnMetric({
  taskId,
  agentType,
  sessionId,
  source = 'spawn_prompt_assembly',
  inputChars,
  outputChars,
  elapsedMs,
}) {
  const inChars = Number.isFinite(inputChars) ? inputChars : 0;
  const outChars = Number.isFinite(outputChars) ? outputChars : 0;
  const inputTokensEst = estimateTokensFromChars(inChars);
  const outputTokensEst = estimateTokensFromChars(outChars);
  const deltaTokensEst = outputTokensEst - inputTokensEst;
  const elapsedSeconds = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 1000 : 0;
  const burnRateTokensPerSecond =
    elapsedSeconds > 0 ? Number((outputTokensEst / elapsedSeconds).toFixed(3)) : null;

  appendToFile(TOKEN_BURN_METRICS_PATH, {
    event: 'token_burn',
    source,
    task_id: taskId || null,
    agent_type: agentType || null,
    session_id: sessionId || null,
    input_chars: inChars,
    output_chars: outChars,
    input_tokens_est: inputTokensEst,
    output_tokens_est: outputTokensEst,
    delta_tokens_est: deltaTokensEst,
    elapsed_ms: Number.isFinite(elapsedMs) ? Number(elapsedMs.toFixed(3)) : null,
    burn_rate_tokens_per_second: burnRateTokensPerSecond,
  });
}

module.exports = {
  logSpawnStart,
  logSpawnEnd,
  logMemoryFailure,
  logSpawnRagMetric,
  logSpawnAssemblyMetric,
  logTokenBurnMetric,
  estimateTokensFromChars,
};
