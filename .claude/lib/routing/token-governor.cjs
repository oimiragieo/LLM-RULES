'use strict';

/**
 * token-governor — per-agent token attribution + pre-spawn budget governor
 *
 * Reads trace JSONL files produced by trace-recorder.cjs (S2) and provides:
 *   tallyAgentTokens(agentId, sessionId) — sum of gen_ai.usage.total_tokens for an agent/session
 *   checkSpawnBudget(agentId, sessionId, opts) — pre-spawn budget check
 *
 * Schema coordination with S2 (trace-recorder.cjs):
 *   S2 emits: gen_ai.tool.name, gen_ai.tool.args_hash, gen_ai.tool.result_hash,
 *             duration_ms, agent_id, task_id, session_id
 *   S3 adds: gen_ai.usage.total_tokens (optional/additive — missing entries count 0)
 *   No S2 tests are broken: the new field is purely additive.
 *
 * Environment variables:
 *   TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET  — integer token budget per agent/session (default 100000)
 *   TOKEN_GOVERNOR_HARD                — if "on", deny spawns that exceed the budget (default off)
 *   TRACE_DIR_OVERRIDE                 — override trace directory (used by tests)
 *
 * @module token-governor
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Project root resolution (mirrors trace-recorder.cjs pattern)
// ---------------------------------------------------------------------------

function findProjectRoot(startDir) {
  let dir = startDir || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Default token budget per agent per session.
 * @returns {number}
 */
function getDefaultBudget() {
  const raw = process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 100000;
}

/**
 * Whether hard-block mode is active (denied spawns when budget exceeded).
 * @returns {boolean}
 */
function isHardMode() {
  return (process.env.TOKEN_GOVERNOR_HARD || '').toLowerCase() === 'on';
}

// ---------------------------------------------------------------------------
// Trace directory resolution
// ---------------------------------------------------------------------------

/**
 * Get the directory where trace JSONL files are stored.
 * Respects TRACE_DIR_OVERRIDE for test isolation.
 * @returns {string}
 */
function getTracesDir() {
  if (process.env.TRACE_DIR_OVERRIDE) {
    return process.env.TRACE_DIR_OVERRIDE;
  }
  return path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'traces');
}

/**
 * Get the full path to a session's trace JSONL file.
 * @param {string} sessionId
 * @returns {string}
 */
function getTracePath(sessionId) {
  return path.join(getTracesDir(), `${sessionId}.jsonl`);
}

// ---------------------------------------------------------------------------
// JSONL reading
// ---------------------------------------------------------------------------

/**
 * Read all trace records from a session's JSONL file.
 * Returns an empty array if the file does not exist or cannot be parsed.
 * @param {string} sessionId
 * @returns {object[]}
 */
function readTraceRecords(sessionId) {
  const filePath = getTracePath(sessionId);
  if (!fs.existsSync(filePath)) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return [];
  }

  const records = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = safeParseJSON(trimmed, 'token-governor-trace', undefined, null);
    if (parsed && typeof parsed === 'object') {
      records.push(parsed);
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tally total tokens for a specific agent within a session.
 *
 * Reads `gen_ai.usage.total_tokens` from each matching trace record.
 * Entries that lack this field contribute 0 (additive-only, never breaks S2 tests).
 *
 * @param {string} agentId   — value to match against the `agent_id` field
 * @param {string} sessionId — session identifier (maps to `<sessionId>.jsonl`)
 * @returns {number} Total tokens attributed to agentId in the session
 */
function tallyAgentTokens(agentId, sessionId) {
  if (!agentId || !sessionId) return 0;

  const records = readTraceRecords(sessionId);
  let total = 0;
  for (const record of records) {
    if (record.agent_id !== agentId) continue;
    const tokens = record['gen_ai.usage.total_tokens'];
    if (typeof tokens === 'number' && !isNaN(tokens)) {
      total += tokens;
    }
  }
  return total;
}

/**
 * Check whether a pre-spawn is within budget.
 *
 * Thresholds:
 *   < 90%                 → { allowed: true }
 *   90% ≤ used < 100%     → { allowed: true, warning: "approaching_budget" }
 *   ≥ 100%, HARD=on       → { allowed: false, warning: "exceeded" }
 *   ≥ 100%, HARD=off      → { allowed: true,  warning: "exceeded" }
 *
 * @param {string} agentId
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {number} [opts.budget]  — Override budget (default: TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET)
 * @returns {{ allowed: boolean, remaining: number, warning?: string }}
 */
function checkSpawnBudget(agentId, sessionId, opts = {}) {
  const budget = (opts && opts.budget) || getDefaultBudget();
  const used = tallyAgentTokens(agentId, sessionId);
  const remaining = Math.max(0, budget - used);
  const fraction = used / budget;

  if (fraction >= 1.0) {
    // Budget exceeded
    if (isHardMode()) {
      return { allowed: false, remaining: 0, warning: 'exceeded' };
    }
    return { allowed: true, remaining: 0, warning: 'exceeded' };
  }

  if (fraction >= 0.9) {
    // Approaching budget (90–99%)
    return { allowed: true, remaining, warning: 'approaching_budget' };
  }

  // Under threshold — clear
  return { allowed: true, remaining };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  tallyAgentTokens,
  checkSpawnBudget,
  getTracePath,
  getDefaultBudget,
  isHardMode,
};
