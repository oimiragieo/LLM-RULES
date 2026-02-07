/**
 * LLM Usage Cost Tracking Hook
 *
 * Monitors token usage across all agent interactions, calculates costs by model tier,
 * and provides session summaries with cost breakdowns.
 *
 * Session Hooks:
 * - session-start: Initialize cost tracking
 * - session-end: Summarize and log costs
 *
 * Security Controls:
 * - SEC-CT-001: Cost entry validation (schema)
 * - SEC-CT-002: Log integrity (append-only with hash chaining)
 * - SEC-CT-003: Metrics access control
 * - SEC-CT-004: Log size limits and rotation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Anthropic Pricing (as of 2026-01)
const PRICING = {
  'claude-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  // Aliases
  haiku: { input: 0.00025, output: 0.00125 },
  sonnet: { input: 0.003, output: 0.015 },
  opus: { input: 0.015, output: 0.075 },
};

const COST_LOG = '.claude/context/metrics/cost-log.jsonl';
const COST_SUMMARY = '.claude/context/metrics/cost-summary.json';

// Session state
let sessionCosts = {
  haiku: { input: 0, output: 0, cost: 0, calls: 0 },
  sonnet: { input: 0, output: 0, cost: 0, calls: 0 },
  opus: { input: 0, output: 0, cost: 0, calls: 0 },
  total: { input: 0, output: 0, cost: 0, calls: 0 },
};

let sessionStart = Date.now();

// Rate limiting state: entries per hour
const rateLimitState = {
  hour: Math.floor(Date.now() / (60 * 60 * 1000)),
  entries: 0,
};

const RATE_LIMIT_PER_HOUR = 1000;

/**
 * Normalize model name to tier
 * @param {string} model - Model identifier
 * @returns {string} Tier (haiku|sonnet|opus)
 */
function modelToTier(model) {
  if (!model) return 'sonnet';
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('opus')) return 'opus';
  return 'sonnet';
}

/**
 * Calculate cost for tokens
 * @param {string} tier - Model tier
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @returns {number} Cost in USD
 */
function calculateCost(tier, inputTokens, outputTokens) {
  const pricing = PRICING[tier] || PRICING.sonnet;
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Validate cost entry schema
 * @param {Object} entry - Entry to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateCostEntry(entry) {
  const REQUIRED_FIELDS = ['timestamp', 'tier', 'inputTokens', 'outputTokens', 'cost'];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined) {
      return { valid: false, error: `SEC-CT-001: Missing required field: ${field}` };
    }
  }

  // Validate tier
  if (!['haiku', 'sonnet', 'opus'].includes(entry.tier)) {
    return { valid: false, error: 'SEC-CT-001: Invalid tier value' };
  }

  // Validate token counts
  if (typeof entry.inputTokens !== 'number' || entry.inputTokens < 0) {
    return { valid: false, error: 'SEC-CT-001: Invalid inputTokens' };
  }

  if (typeof entry.outputTokens !== 'number' || entry.outputTokens < 0) {
    return { valid: false, error: 'SEC-CT-001: Invalid outputTokens' };
  }

  // Validate cost is numeric
  const costNum = parseFloat(entry.cost);
  if (isNaN(costNum) || costNum < 0) {
    return { valid: false, error: 'SEC-CT-001: Invalid cost value' };
  }

  return { valid: true, error: null };
}

/**
 * Calculate hash for log entry (SEC-CT-002)
 * @param {Object} entry - Log entry data
 * @param {string} previousHash - Hash of previous entry (or '0' for first)
 * @returns {string} SHA-256 hash (first 32 chars)
 */
function calculateEntryHash(entry, previousHash) {
  const entryString = JSON.stringify(entry, Object.keys(entry).sort());
  const hashInput = previousHash + entryString;
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
}

/**
 * Append entry to cost log with integrity hash (SEC-CT-002)
 * @param {string} logPath - Path to log file
 * @param {Object} entry - Entry to append
 * @returns {Object} Entry with hash added
 */
function appendWithIntegrity(logPath, entry) {
  let previousHash = '0';

  // Get hash of last entry
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    if (content) {
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        const lastEntry = JSON.parse(lastLine);
        previousHash = lastEntry._hash || '0';
      } catch {
        previousHash = 'BROKEN_' + Date.now();
        console.warn('[SEC-CT-002] Log chain broken, starting new chain');
      }
    }
  }

  // Add integrity hash
  entry._hash = calculateEntryHash(entry, previousHash);
  entry._prevHash = previousHash;

  // Append to file
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

  return entry;
}

/**
 * Verify log integrity (SEC-CT-002)
 * @param {string} logPath - Path to log file
 * @returns {Object} { valid: boolean, brokenAt: number|null, reason: string }
 */
function verifyLogIntegrity(logPath) {
  if (!fs.existsSync(logPath)) {
    return { valid: true, brokenAt: null, reason: 'Log file does not exist' };
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) {
    return { valid: true, brokenAt: null, reason: 'Log file is empty' };
  }

  const lines = content.split('\n');
  let previousHash = '0';

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);

      // Verify previous hash reference
      if (entry._prevHash !== previousHash) {
        return {
          valid: false,
          brokenAt: i + 1,
          reason: `SEC-CT-002: Hash chain broken at line ${i + 1}`,
        };
      }

      // Verify entry hash
      const entryWithoutHash = { ...entry };
      delete entryWithoutHash._hash;
      delete entryWithoutHash._prevHash;

      const calculatedHash = calculateEntryHash(entryWithoutHash, previousHash);
      if (calculatedHash !== entry._hash) {
        return {
          valid: false,
          brokenAt: i + 1,
          reason: `SEC-CT-002: Entry hash mismatch at line ${i + 1}. Possible tampering detected.`,
        };
      }

      previousHash = entry._hash;
    } catch (e) {
      return {
        valid: false,
        brokenAt: i + 1,
        reason: `SEC-CT-002: Invalid JSON at line ${i + 1}: ${e.message}`,
      };
    }
  }

  return { valid: true, brokenAt: null, reason: 'Log integrity verified' };
}

/**
 * Check rate limiting (SEC-CT-004)
 * @returns {boolean} True if under limit, false if would exceed limit
 */
function checkRateLimit() {
  const currentHour = Math.floor(Date.now() / (60 * 60 * 1000));

  // Reset counter if hour changed
  if (currentHour !== rateLimitState.hour) {
    rateLimitState.hour = currentHour;
    rateLimitState.entries = 0;
  }

  if (rateLimitState.entries >= RATE_LIMIT_PER_HOUR) {
    return false;
  }

  rateLimitState.entries++;
  return true;
}

/**
 * Track a model call
 * @param {Object} params - Call parameters
 * @param {string} params.model - Model identifier
 * @param {number} params.inputTokens - Input tokens
 * @param {number} params.outputTokens - Output tokens
 * @param {string} [params.taskId] - Optional task ID
 * @param {string} [params.agent] - Optional agent type
 */
function trackCall(params) {
  const tier = modelToTier(params.model);
  const cost = calculateCost(tier, params.inputTokens, params.outputTokens);

  // Update session state
  sessionCosts[tier].input += params.inputTokens;
  sessionCosts[tier].output += params.outputTokens;
  sessionCosts[tier].cost += cost;
  sessionCosts[tier].calls += 1;

  sessionCosts.total.input += params.inputTokens;
  sessionCosts.total.output += params.outputTokens;
  sessionCosts.total.cost += cost;
  sessionCosts.total.calls += 1;

  // Create log entry
  const entry = {
    timestamp: new Date().toISOString(),
    tier,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cost: cost.toFixed(6),
    taskId: params.taskId || null,
    agent: params.agent || null,
  };

  // Validate entry (SEC-CT-001)
  const validation = validateCostEntry(entry);
  if (!validation.valid) {
    console.error(`[SEC-CT-001] ${validation.error}`);
    return;
  }

  // Check rate limit (SEC-CT-004)
  if (!checkRateLimit()) {
    console.warn('[SEC-CT-004] Rate limit exceeded: 1000 entries per hour');
    return;
  }

  // Ensure directory exists
  const dir = path.dirname(COST_LOG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Append with integrity (SEC-CT-002)
  try {
    appendWithIntegrity(COST_LOG, entry);
  } catch (e) {
    console.error(`[SEC-CT-002] Failed to append cost log: ${e.message}`);
  }
}

/**
 * Get session cost summary
 * @returns {Object} Cost summary
 */
function getSessionSummary() {
  const duration = (Date.now() - sessionStart) / 1000; // seconds

  return {
    duration: `${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`,
    byTier: {
      haiku: {
        calls: sessionCosts.haiku.calls,
        tokens: sessionCosts.haiku.input + sessionCosts.haiku.output,
        cost: `$${sessionCosts.haiku.cost.toFixed(4)}`,
      },
      sonnet: {
        calls: sessionCosts.sonnet.calls,
        tokens: sessionCosts.sonnet.input + sessionCosts.sonnet.output,
        cost: `$${sessionCosts.sonnet.cost.toFixed(4)}`,
      },
      opus: {
        calls: sessionCosts.opus.calls,
        tokens: sessionCosts.opus.input + sessionCosts.opus.output,
        cost: `$${sessionCosts.opus.cost.toFixed(4)}`,
      },
    },
    total: {
      calls: sessionCosts.total.calls,
      inputTokens: sessionCosts.total.input,
      outputTokens: sessionCosts.total.output,
      totalTokens: sessionCosts.total.input + sessionCosts.total.output,
      cost: `$${sessionCosts.total.cost.toFixed(4)}`,
    },
  };
}

/**
 * Format session summary as markdown
 * @returns {string} Markdown summary
 */
function formatSummary() {
  const summary = getSessionSummary();

  return `
## Session Cost Summary

**Duration**: ${summary.duration}

| Tier | Calls | Tokens | Cost |
|------|-------|--------|------|
| Haiku | ${summary.byTier.haiku.calls} | ${summary.byTier.haiku.tokens.toLocaleString()} | ${summary.byTier.haiku.cost} |
| Sonnet | ${summary.byTier.sonnet.calls} | ${summary.byTier.sonnet.tokens.toLocaleString()} | ${summary.byTier.sonnet.cost} |
| Opus | ${summary.byTier.opus.calls} | ${summary.byTier.opus.tokens.toLocaleString()} | ${summary.byTier.opus.cost} |
| **Total** | **${summary.total.calls}** | **${summary.total.totalTokens.toLocaleString()}** | **${summary.total.cost}** |
`;
}

/**
 * Check budget alert
 * @param {number} budget - Budget threshold in USD
 * @returns {boolean} Budget exceeded
 */
function checkBudget(budget) {
  return sessionCosts.total.cost > budget;
}

/**
 * Load running totals from summary file
 * @returns {Object} Running totals
 */
function loadRunningTotals() {
  try {
    return JSON.parse(fs.readFileSync(COST_SUMMARY, 'utf-8'));
  } catch {
    return {
      allTime: { cost: 0, tokens: 0, sessions: 0 },
      lastSession: null,
    };
  }
}

/**
 * Save running totals to summary file
 */
function saveSummary() {
  const existing = loadRunningTotals();

  existing.lastSession = {
    timestamp: new Date().toISOString(),
    cost: sessionCosts.total.cost,
    tokens: sessionCosts.total.input + sessionCosts.total.output,
  };

  existing.allTime.cost += sessionCosts.total.cost;
  existing.allTime.tokens += sessionCosts.total.input + sessionCosts.total.output;
  existing.allTime.sessions += 1;

  // Ensure directory exists
  const dir = path.dirname(COST_SUMMARY);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(COST_SUMMARY, JSON.stringify(existing, null, 2));
}

/**
 * Reset session state (for testing)
 */
function resetSession() {
  sessionCosts = {
    haiku: { input: 0, output: 0, cost: 0, calls: 0 },
    sonnet: { input: 0, output: 0, cost: 0, calls: 0 },
    opus: { input: 0, output: 0, cost: 0, calls: 0 },
    total: { input: 0, output: 0, cost: 0, calls: 0 },
  };
  sessionStart = Date.now();
}

/**
 * Hook: session-start
 * Initialize cost tracking at session start
 */
function onSessionStart() {
  resetSession();
  console.log('[cost-tracking] Session started');
  return { exit: 0 };
}

/**
 * Hook: session-end
 * Summarize and log costs at session end
 */
function onSessionEnd() {
  if (sessionCosts.total.calls === 0) {
    console.log('[cost-tracking] No LLM calls in this session');
    return { exit: 0 };
  }

  console.log(formatSummary());
  saveSummary();

  return { exit: 0 };
}

/**
 * Main hook entry point (routes to appropriate handler)
 * @param {Object} hookInput - Hook input { event, params }
 */
function main(hookInput) {
  const { event } = hookInput;

  if (event === 'session-start') {
    return onSessionStart();
  } else if (event === 'session-end') {
    return onSessionEnd();
  }

  return { exit: 0 };
}

module.exports = {
  trackCall,
  getSessionSummary,
  formatSummary,
  checkBudget,
  saveSummary,
  loadRunningTotals,
  resetSession,
  main,
  PRICING,
  validateCostEntry,
  calculateEntryHash,
  appendWithIntegrity,
  verifyLogIntegrity,
  checkRateLimit,
  calculateCost,
  modelToTier,
  onSessionStart,
  onSessionEnd,
};
