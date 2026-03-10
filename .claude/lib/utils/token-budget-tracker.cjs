/**
 * Token Budget Tracker - Phase 2: Tracking framework
 *
 * Purpose: Track token usage across agents without enforcing hard limits.
 * This is the foundation for Phase 3 auto-compression features.
 *
 * Usage:
 *   const { estimateTokens, trackAgentUsage, checkBudgetStatus, logTokenEvent } = require('./token-budget-tracker.cjs');
 *
 * Memory: Stores token usage in-memory map + JSONL log file
 */

const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('./project-root.cjs');
const { safeParseJSON } = require('./safe-json.cjs');
const TOKEN_LOG_PATH = path.join(PROJECT_ROOT, '.claude/context/token-usage.jsonl');
const CHAR_TO_TOKEN_RATIO = 0.75; // 1 char ≈ 0.75 tokens (estimate)
const DEFAULT_BUDGET = 200000; // Per model (haiku/sonnet/opus all same for simplicity)

// Persistent storage path
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude/context/runtime');
const BUDGET_STATE_PATH = path.join(RUNTIME_DIR, 'budget-tracker.json');

// Helper to load state
function loadState() {
  try {
    if (fs.existsSync(BUDGET_STATE_PATH)) {
      const state = safeParseJSON(fs.readFileSync(BUDGET_STATE_PATH, 'utf8'));
      return state || {};
    }
  } catch (_err) {
    // Ignore load errors, return empty
  }
  return {};
}

// Helper to save state atomically
function saveState(state) {
  try {
    if (!fs.existsSync(RUNTIME_DIR)) {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    }
    const tmp = BUDGET_STATE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, BUDGET_STATE_PATH);
  } catch (_err) {
    // Best effort saving
  }
}

/**
 * Estimate tokens from content length
 *
 * @param {string} content - Content to estimate tokens for
 * @returns {{ tokens: number, chars: number, estimate: string }}
 */
function estimateTokens(content) {
  const chars = content.length;
  const tokens = Math.floor(chars * CHAR_TO_TOKEN_RATIO);

  return {
    tokens,
    chars,
    estimate: `~${tokens} tokens (${chars} chars × ${CHAR_TO_TOKEN_RATIO})`,
  };
}

/**
 * Track token usage for an agent
 *
 * @param {string} agentId - Agent identifier
 * @param {{ inputTokens: number, outputTokens: number, toolResults: string }} usage - Token usage data
 * @returns {{ agentId: string, totalTokens: number, budget: number, budgetRemaining: number, percentUsed: number, status: string }}
 */
function trackAgentUsage(agentId, usage) {
  const { inputTokens = 0, outputTokens = 0, toolResults = '' } = usage;

  // Estimate tool result tokens
  const toolTokensEstimate = estimateTokens(toolResults).tokens;

  // Calculate total tokens for this usage
  const usageTokens = inputTokens + outputTokens + toolTokensEstimate;

  const state = loadState();

  // Get or initialize agent usage
  if (!state[agentId]) {
    state[agentId] = {
      totalTokens: 0,
      budget: DEFAULT_BUDGET,
    };
  }

  const agentData = state[agentId];

  // Update cumulative total
  agentData.totalTokens += usageTokens;

  // Calculate budget stats
  const budgetRemaining = agentData.budget - agentData.totalTokens;
  const percentUsed = (agentData.totalTokens / agentData.budget) * 100;

  // Determine status (tracking only - no blocking)
  let status = 'OK';
  if (percentUsed >= 90) {
    status = 'CRITICAL';
  } else if (percentUsed >= 80) {
    status = 'WARNING';
  }

  // Save changes
  saveState(state);

  return {
    agentId,
    totalTokens: agentData.totalTokens,
    budget: agentData.budget,
    budgetRemaining,
    percentUsed,
    status,
  };
}

/**
 * Check budget status for an agent
 *
 * @param {string} agentId - Agent identifier
 * @returns {{ used: number, budget: number, remaining: number, percentUsed: number, status: string }}
 */
function checkBudgetStatus(agentId) {
  const state = loadState();
  if (!state[agentId]) {
    return {
      used: 0,
      budget: DEFAULT_BUDGET,
      remaining: DEFAULT_BUDGET,
      percentUsed: 0,
      status: 'OK',
    };
  }

  const agentData = state[agentId];
  const remaining = agentData.budget - agentData.totalTokens;
  const percentUsed = (agentData.totalTokens / agentData.budget) * 100;

  let status = 'OK';
  if (percentUsed >= 90) {
    status = 'CRITICAL';
  } else if (percentUsed >= 80) {
    status = 'WARNING';
  }

  return {
    used: agentData.totalTokens,
    budget: agentData.budget,
    remaining,
    percentUsed,
    status,
  };
}

/**
 * Log a token usage event to JSONL file
 *
 * @param {string} eventType - Event type (spawn, tool_result, prompt, compression, completion)
 * @param {{ agentId: string, tokens: number, reason: string }} data - Event data
 */
function logTokenEvent(eventType, data) {
  const { agentId, tokens, reason } = data;

  const event = {
    timestamp: new Date().toISOString(),
    eventType,
    agentId,
    tokens,
    reason,
  };

  // Ensure directory exists
  const logDir = path.dirname(TOKEN_LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Append to JSONL file (one JSON object per line)
  fs.appendFileSync(TOKEN_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
}

module.exports = {
  estimateTokens,
  trackAgentUsage,
  checkBudgetStatus,
  logTokenEvent,
};
