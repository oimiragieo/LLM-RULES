#!/usr/bin/env node
/**
 * Unified UserPromptSubmit Hook
 *
 * Consolidates 5 UserPromptSubmit hooks into a single file for reduced I/O and process spawning:
 * 1. router-mode-reset.cjs - Resets router state on new prompts
 * 2. router-enforcer.cjs - Advisory prompt analysis (shared routing-table.cjs)
 * 3. memory-reminder.cjs - Reminds agents to read memory files
 * 4. evolution-trigger-detector.cjs - Detects evolution trigger patterns (merged)
 * 5. memory-health-check.cjs - Checks memory system health (merged)
 *
 * Performance: Reduces 5 processes to 1, shares state reads across checks.
 *
 * Exit codes:
 * - 0: Always (all checks are advisory, never block)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Resolve paths for reliable module loading
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

// Helper for lib requires
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

// Import shared utilities
const { PROJECT_ROOT: _PROJECT_ROOT } = libRequire(path.join('utils', 'project-root.cjs'));
const { parseHookInputAsync } = libRequire(path.join('utils', 'hook-input.cjs'));
const { loadConfig } = libRequire(path.join('utils', 'config-loader.cjs'));
const { appendJsonl } = libRequire(path.join('utils', 'jsonl-utils.cjs'));
const { createLogger } = libRequire(path.join('utils', 'logger.cjs'));
const { ROUTING_TABLE, getPreferredAgent } = libRequire(path.join('routing', 'routing-table.cjs'));
const { classifyIntent } = libRequire(path.join('routing', 'intent-classifier.cjs'));
const { getAgentForCapability } = libRequire(path.join('routing', 'agent-registry-resolver.cjs'));
const semanticRouter = libRequire(path.join('routing', 'semantic-router.cjs'));
const { estimateTokens } = libRequire(path.join('utils', 'token-budget-tracker.cjs'));
const { checkCompressionNeeded, triggerCompression } = libRequire(
  path.join('utils', 'compression-trigger.cjs')
);

const logger = createLogger('user-prompt-unified');
let findingsRegistry = null;
try {
  findingsRegistry = libRequire(path.join('memory', 'findings-registry.cjs'));
} catch (_e) {
  findingsRegistry = null;
}
let memoryTiers = null;
try {
  memoryTiers = libRequire(path.join('memory', 'memory-tiers.cjs'));
} catch (_e) {
  memoryTiers = null;
}
if (!memoryTiers) {
  logger.warn('memory-tiers not loaded; STM write skipped.');
}
const { getCachedState, invalidateCache } = libRequire(path.join('utils', 'state-cache.cjs'));
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));
const { logRouterCostRiskEvent, logRouterSloAlert } = libRequire(
  path.join('monitoring', 'router-churn-log.cjs')
);

// Import router state module
const routerState = libRequire(path.join('routing', 'router-state.cjs'));

// =============================================================================
// Constants
// =============================================================================

const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const _MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const AUTO_COMPRESSION_STATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'auto-compression.json'
);
const TOKEN_SLO_STATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'token-slo-state.json'
);
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const USER_PROMPT_RESULTS_PATH = path.join(RUNTIME_DIR, 'user-prompt-results.jsonl');
const USER_PROMPT_RESULTS_LOG_ENABLED = process.env.USER_PROMPT_RESULTS_LOG !== 'off';
const USER_PROMPT_RESULTS_MAX_LINES = Number(process.env.USER_PROMPT_RESULTS_MAX_LINES || 2000);
const FINDINGS_PROMPT_SNAPSHOT_STATE_FILE = path.join(
  RUNTIME_DIR,
  'findings-trend-prompt-snapshot-state.json'
);
// Agent cache (shared across calls within same process)
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 300000; // 5 minutes

// Correction detection patterns
const CORRECTION_PATTERNS = [
  /^(no|nope|wrong|incorrect|that's not)/i,
  /\b(undo|revert|roll\s*back|go back|put it back)\b/i,
  /\b(that's not what i|i (didn't|did not) (want|ask|mean))\b/i,
  /\b(start over|try again|do it differently)\b/i,
];

function isTaskNotificationPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return (
    prompt.includes('<task-notification>') &&
    prompt.includes('</task-notification>') &&
    prompt.includes('<task-id>')
  );
}

function debugLog(source, message, err) {
  if (!process.env.DEBUG_HOOKS) return;
  const details = err ? ` ${err.message || err}` : '';
  console.warn(`[${source}] ${message}${details}`);
}

function buildHiddenSpawnSyncOptions(base = {}) {
  return {
    ...base,
    windowsHide: true,
  };
}

function getFindingsSnapshotIntervalMs() {
  const intervalRaw = Number(process.env.FINDINGS_TREND_SNAPSHOT_INTERVAL_MS);
  return Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 15 * 60 * 1000;
}

function shouldRecordPromptFindingsSnapshot(
  nowMs = Date.now(),
  stateFilePath = FINDINGS_PROMPT_SNAPSHOT_STATE_FILE
) {
  const intervalMs = getFindingsSnapshotIntervalMs();

  try {
    if (!fs.existsSync(stateFilePath)) return true;
    const payload = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    const lastRecordedMs = Number(payload?.lastRecordedMs || 0);
    if (!Number.isFinite(lastRecordedMs)) return true;
    return nowMs - lastRecordedMs >= intervalMs;
  } catch (_err) {
    return true;
  }
}

function recordPromptFindingsTrendSnapshot(
  projectRoot = PROJECT_ROOT,
  stateFilePath = FINDINGS_PROMPT_SNAPSHOT_STATE_FILE
) {
  if (!findingsRegistry || typeof findingsRegistry.recordFindingsTrendSnapshot !== 'function') {
    return { recorded: false, reason: 'registry_unavailable' };
  }

  const nowMs = Date.now();
  if (!shouldRecordPromptFindingsSnapshot(nowMs, stateFilePath)) {
    return { recorded: false, reason: 'cooldown' };
  }

  try {
    findingsRegistry.recordFindingsTrendSnapshot(projectRoot, 'user-prompt-unified');
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    atomicWriteJSONSync(stateFilePath, {
      lastRecordedMs: nowMs,
      lastRecordedAt: new Date(nowMs).toISOString(),
    });
    return { recorded: true };
  } catch (err) {
    return { recorded: false, error: err?.message || String(err) };
  }
}

// =============================================================================
// Check 1: Router Mode Reset (from router-mode-reset.cjs)
// =============================================================================

/**
 * Reset router state on new user prompt.
 * Skips ONLY for slash commands.
 *
 * ROUTING-002 FIX: Every new user prompt MUST reset to router mode.
 * The previous "active agent context" check (30-minute window) allowed
 * Router to use blacklisted tools (Glob, Grep, etc.) on subsequent prompts
 * because state.taskSpawned remained true from previous agent work.
 *
 * ROUTING-003 FIX: Detect session boundaries by comparing sessionId.
 * State from previous sessions should be detected and explicitly reset.
 * This ensures stale state doesn't leak across sessions.
 *
 * The Router needs to re-evaluate each new user prompt to decide
 * whether to spawn agents. Agent mode is for SUBAGENTS, not for
 * the Router handling a new user prompt.
 *
 * @param {Object} hookInput - Parsed hook input
 * @returns {Object} Result with skipped, reason, stateReset, sessionBoundaryDetected
 */
function checkRouterModeReset(hookInput) {
  const result = {
    skipped: false,
    reason: null,
    stateReset: false,
    sessionBoundaryDetected: false,
  };

  // Get prompt
  const userPrompt = hookInput?.prompt || hookInput?.message || '';

  // Skip for slash commands (they are handled separately)
  if (userPrompt && userPrompt.trim().startsWith('/')) {
    result.skipped = true;
    result.reason = 'slash_command';
    return result;
  }

  // Internal task completion payloads should not reset/route like user requests.
  if (isTaskNotificationPrompt(userPrompt)) {
    result.skipped = true;
    result.reason = 'task_notification';
    return result;
  }

  // ROUTING-003 FIX: Detect session boundary before any state checks
  // Get current session ID from environment (or generate a fallback)
  const currentSessionId = process.env.CLAUDE_SESSION_ID || null;
  const currentState = routerState.getState();

  // Check if session has changed (stale state from previous session)
  // Session boundary is detected when:
  // 1. Current state has a sessionId AND it doesn't match current session
  // 2. Current state has no sessionId but current session has one (null -> defined)
  const stateSessionId = currentState.sessionId;
  const sessionChanged =
    (stateSessionId !== null && stateSessionId !== currentSessionId) ||
    (stateSessionId === null && currentSessionId !== null);

  if (sessionChanged) {
    result.sessionBoundaryDetected = true;
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error(
        `[user-prompt-unified:reset] Session boundary detected: ${stateSessionId} -> ${currentSessionId}`
      );
    }
  }

  // ROUTING-002 FIX: ALWAYS reset to router mode on new user prompt
  // Removed the "active agent context" check that preserved agent mode
  // for 30 minutes. This was causing Router to use blacklisted tools
  // because state.taskSpawned remained true from previous prompts.
  //
  // Design rationale:
  // - Each new user prompt is a NEW routing decision
  // - Router must evaluate whether to spawn agents
  // - Agent mode is for SUBAGENTS, not for Router handling new prompts
  // - Subagent context is tracked by subagent_id in hook input, not state file

  // Reset to router mode
  routerState.resetToRouterMode();
  result.stateReset = true;

  // ROUTING-003 FIX: Update sessionId in state after reset
  // This ensures the new session ID is persisted for future boundary detection
  if (currentSessionId !== null) {
    routerState.saveStateWithRetry({ sessionId: currentSessionId });
  }

  // PRESET-001: Update preset in state when AGENT_PRESET env var is set
  // This allows spawn-prompt-assembler to read the preset from router-state.json
  if (process.env.AGENT_PRESET) {
    routerState.saveStateWithRetry({ preset: process.env.AGENT_PRESET });
  }

  // CREATOR-ROUTING-001: Detect creator intent in user prompt
  // Sets flags in router-state.json for downstream routing-guard enforcement
  const creatorIntent = detectCreatorIntent(userPrompt);
  if (creatorIntent.detected) {
    routerState.saveStateWithRetry({
      creatorIntentDetected: true,
      detectedCreatorType: creatorIntent.type,
      requiredCreatorSkill: creatorIntent.skill,
      batchCreation: creatorIntent.isBatch || false,
    });

    if (process.env.ROUTER_DEBUG === 'true') {
      console.error(
        `[user-prompt-unified:creator] Creator intent detected: ${creatorIntent.type}${creatorIntent.isBatch ? ' (batch)' : ''}`
      );
    }
  }

  if (process.env.ROUTER_DEBUG === 'true') {
    console.error('[user-prompt-unified:reset] State reset to router mode (ROUTING-002 fix)');
    if (result.sessionBoundaryDetected) {
      console.error('[user-prompt-unified:reset] Session ID updated for ROUTING-003 fix');
    }
    if (process.env.AGENT_PRESET) {
      console.error(
        `[user-prompt-unified:reset] Preset set to ${process.env.AGENT_PRESET} (PRESET-001)`
      );
    }
  }

  return result;
}

// =============================================================================
// Check 2: Router Enforcer (uses shared routing-table.cjs)
// =============================================================================

/**
 * Keywords for complexity detection
 */
const COMPLEXITY_KEYWORDS = {
  trivial: ['hello', 'hi', 'thanks', 'thank you', 'bye', 'goodbye', 'what is', 'how are you'],
  low: ['typo', 'rename', 'fix typo', 'small fix', 'minor fix', 'quick fix'],
  high: [
    'auth',
    'authentication',
    'authorization',
    'security',
    'encryption',
    'password',
    'token',
    'jwt',
    'oauth',
    'payment',
    'integrate',
    'integration',
    'migrate',
    'migration',
    'architecture',
    'refactor',
  ],
  epic: [
    'rewrite',
    'rebuild',
    'new system',
    'platform',
    'framework',
    'all hooks',
    'all agents',
    'system-wide',
  ],
};

/**
 * Creator intent patterns for artifact creation detection
 * Used to detect when user wants to create artifacts (agents, skills, hooks, etc.)
 */
const CREATOR_INTENT_PATTERNS = [
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(agent|agents)\b/i,
    type: 'agent-creator',
  },
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(skill|skills)\b/i,
    type: 'skill-creator',
  },
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(hook|hooks)\b/i,
    type: 'hook-creator',
  },
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(workflow|workflows)\b/i,
    type: 'workflow-creator',
  },
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(template|templates)\b/i,
    type: 'template-creator',
  },
  {
    pattern: /\b(create|add|build|make|generate)\s+(\d+\s+)?(new\s+)?(schema|schemas)\b/i,
    type: 'schema-creator',
  },
];

/**
 * Detect creator intent in user prompt
 * @param {string} userPrompt - User's prompt text
 * @returns {{ detected: boolean, type?: string, isBatch?: boolean, skill?: string }}
 */
function detectCreatorIntent(userPrompt) {
  for (const { pattern, type } of CREATOR_INTENT_PATTERNS) {
    const match = userPrompt.match(pattern);
    if (match) {
      const isBatch = !!match[2]; // captured digit group (e.g., "10 agents")
      return { detected: true, type, isBatch, skill: type };
    }
  }
  return { detected: false };
}

// =============================================================================
// Token Monitoring + Auto-Compression (config.yaml)
// =============================================================================

let cachedConfig = null;

function getConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    cachedConfig = loadConfig();
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.warn('[user-prompt-unified] Failed to load config.yaml:', err.message);
    }
    cachedConfig = null;
  }
  return cachedConfig;
}

function readCompressionState() {
  try {
    if (!fs.existsSync(AUTO_COMPRESSION_STATE_PATH)) {
      return { sessions: {} };
    }
    return JSON.parse(fs.readFileSync(AUTO_COMPRESSION_STATE_PATH, 'utf8'));
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeCompressionState(state) {
  try {
    const dir = path.dirname(AUTO_COMPRESSION_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    atomicWriteJSONSync(AUTO_COMPRESSION_STATE_PATH, state);
  } catch (_err) {
    // Best-effort
  }
}

function readTokenSloState() {
  try {
    if (!fs.existsSync(TOKEN_SLO_STATE_PATH)) {
      return { sessions: {} };
    }
    return JSON.parse(fs.readFileSync(TOKEN_SLO_STATE_PATH, 'utf8'));
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeTokenSloState(state) {
  try {
    const dir = path.dirname(TOKEN_SLO_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    atomicWriteJSONSync(TOKEN_SLO_STATE_PATH, state);
  } catch (_err) {
    // Best-effort
  }
}

function computeRouterCostRisk(result) {
  const token = result?.tokenMonitoring || {};
  const planningReq = result?.routerEnforcement?.planningReq || {};
  const candidates = Array.isArray(result?.routerEnforcement?.candidates)
    ? result.routerEnforcement.candidates
    : [];
  const topScore = candidates[0]?.score || 0;
  const secondScore = candidates[1]?.score || 0;
  const ambiguityGap = Math.max(0, topScore - secondScore);
  const percent = Number(token.percentUsed || 0);
  const complexity = planningReq?.complexity || 'normal';
  const complexityWeight =
    complexity === 'epic' ? 30 : complexity === 'high' ? 22 : complexity === 'medium' ? 12 : 4;
  const ambiguityWeight = ambiguityGap <= 0.5 ? 20 : ambiguityGap <= 1.5 ? 12 : 4;
  const tokenWeight = Math.min(45, Math.max(0, percent * 0.45));
  const compressionWeight = result?.autoCompression?.needed ? 10 : 0;
  const downgradeWeight = token?.downgraded ? 8 : 0;
  const score = Math.min(
    100,
    Number(
      (
        tokenWeight +
        complexityWeight +
        ambiguityWeight +
        compressionWeight +
        downgradeWeight
      ).toFixed(2)
    )
  );
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';

  return {
    score,
    level,
    factors: {
      tokenPercentUsed: Number(percent.toFixed(2)),
      complexity,
      ambiguityGap: Number(ambiguityGap.toFixed(2)),
      autoCompressionNeeded: Boolean(result?.autoCompression?.needed),
      downgraded: Boolean(token?.downgraded),
    },
  };
}

function checkTokenMonitoring(hookInput) {
  const config = getConfig();
  const tokenMonitoring = config?.token_monitoring;
  if (!tokenMonitoring?.enabled) {
    return { enabled: false };
  }

  const prompt = hookInput?.prompt || hookInput?.message || '';
  const estimate = estimateTokens(prompt);
  const maxTokens = Number(tokenMonitoring.max_session_tokens || 0);
  const hardLimit = Number(tokenMonitoring.hard_limit || 0);
  const warningRatio = Number(tokenMonitoring.warning_ratio || 0.8);
  const criticalRatio = Number(tokenMonitoring.critical_ratio || 0.95);
  const breachWindowMs = Number(tokenMonitoring.breach_window_ms || 10 * 60 * 1000);
  const downgradeAfterBreaches = Number(tokenMonitoring.downgrade_after_breaches || 3);
  const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';

  const result = {
    enabled: true,
    promptTokens: estimate.tokens,
    maxTokens,
    hardLimit,
    sessionId,
    percentUsed:
      maxTokens > 0 ? Number((((estimate.tokens || 0) / maxTokens) * 100).toFixed(2)) : 0,
    status: 'ok',
    downgraded: false,
    breachCount: 0,
  };

  const usageRatio = maxTokens > 0 ? estimate.tokens / maxTokens : 0;
  if (hardLimit && estimate.tokens >= hardLimit) {
    result.status = 'hard_limit_exceeded';
  } else if (maxTokens && usageRatio >= criticalRatio) {
    result.status = 'critical';
  } else if (maxTokens && usageRatio >= warningRatio) {
    result.status = 'warning';
  }

  const state = readTokenSloState();
  const now = Date.now();
  const previous = state.sessions[sessionId] || {
    breachCount: 0,
    lastBreachAt: 0,
    downgradedUntil: 0,
  };

  const isBreach =
    result.status === 'warning' ||
    result.status === 'critical' ||
    result.status === 'hard_limit_exceeded';
  if (isBreach) {
    const withinWindow = now - Number(previous.lastBreachAt || 0) <= breachWindowMs;
    const breachCount = withinWindow ? Number(previous.breachCount || 0) + 1 : 1;
    const downgraded = breachCount >= downgradeAfterBreaches;
    const downgradedUntil = downgraded
      ? now + breachWindowMs
      : Number(previous.downgradedUntil || 0);
    state.sessions[sessionId] = {
      breachCount,
      lastBreachAt: now,
      downgradedUntil,
    };
    result.breachCount = breachCount;
    result.downgraded = downgraded || now < Number(previous.downgradedUntil || 0);
    writeTokenSloState(state);

    logRouterSloAlert({
      sessionId,
      severity: result.status === 'warning' ? 'warning' : 'critical',
      sloName: 'token_utilization',
      value: usageRatio,
      threshold: result.status === 'warning' ? warningRatio : criticalRatio,
      downgraded: result.downgraded,
      breachCount,
    });
  } else if (now < Number(previous.downgradedUntil || 0)) {
    result.downgraded = true;
    result.breachCount = Number(previous.breachCount || 0);
  } else if (previous.breachCount || previous.lastBreachAt || previous.downgradedUntil) {
    state.sessions[sessionId] = {
      breachCount: 0,
      lastBreachAt: 0,
      downgradedUntil: 0,
    };
    writeTokenSloState(state);
  }

  if (maxTokens && estimate.tokens >= maxTokens) {
    console.warn(
      `[user-prompt-unified] Token monitoring: prompt estimate ${estimate.tokens} exceeds max_session_tokens (${maxTokens}).`
    );
  }

  if (hardLimit && estimate.tokens >= hardLimit) {
    console.warn(
      `[user-prompt-unified] Token monitoring: prompt estimate ${estimate.tokens} exceeds hard_limit (${hardLimit}).`
    );
    try {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'token-monitoring',
        error: 'hard_limit_exceeded',
      });
    } catch (_err) {
      // Best-effort
    }
  }

  return result;
}

function maybeAutoCompress(tokenStatus) {
  const config = getConfig();
  const autoCompression = config?.memory_management?.auto_compression;
  if (!autoCompression?.enabled) {
    return { enabled: false };
  }

  const maxTokens = tokenStatus?.maxTokens || 0;
  const promptTokens = tokenStatus?.promptTokens || 0;
  const percentUsed = maxTokens ? (promptTokens / maxTokens) * 100 : 0;
  const thresholdPercent = Number(autoCompression.trigger_threshold || 0.9) * 100;

  if (percentUsed < thresholdPercent) {
    return { enabled: true, needed: false };
  }

  const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
  const state = readCompressionState();
  const currentCount = state.sessions[sessionId]?.count || 0;
  const maxCompressions = Number(autoCompression.max_compressions_per_session || 5);

  if (currentCount >= maxCompressions) {
    return { enabled: true, needed: false, skipped: 'max_compressions' };
  }

  const trigger = checkCompressionNeeded({
    tokenBudgetStatus: {
      percentUsed,
      status: percentUsed >= 90 ? 'CRITICAL' : percentUsed >= 80 ? 'WARNING' : 'OK',
    },
    operationCount: 0,
  });

  if (!trigger.needed) {
    return { enabled: true, needed: false };
  }

  try {
    triggerCompression({ reason: trigger.reason, urgency: trigger.urgency })
      .then(result => {
        if (result.success) {
          state.sessions[sessionId] = {
            count: currentCount + 1,
            lastRun: new Date().toISOString(),
          };
          writeCompressionState(state);
        }
      })
      .catch(() => {});
  } catch (_err) {
    // Best-effort
  }

  return { enabled: true, needed: true, reason: trigger.reason };
}

/**
 * Parse YAML frontmatter from agent file
 */
function parseFrontmatter(content) {
  if (!content || content.length > 50000) return null;

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim());
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.match(/^\s+-\s/)) {
      result[currentKey].push(line.replace(/^\s+-\s/, '').trim());
    }
  }

  return result;
}

/**
 * Load agents from disk (with caching)
 */
function loadAgents() {
  const now = Date.now();
  if (agentCache && now - agentCacheTime < AGENT_CACHE_TTL) {
    return agentCache;
  }

  const registryAgents = loadAgentsFromRegistry();
  if (registryAgents.length > 0) {
    agentCache = registryAgents;
    agentCacheTime = now;
    return registryAgents;
  }

  const agents = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);
          if (frontmatter && frontmatter.name) {
            agents.push({
              name: frontmatter.name,
              description: frontmatter.description || '',
              skills: frontmatter.skills || [],
              priority: frontmatter.priority || 'medium',
              path: path.relative(PROJECT_ROOT, fullPath),
            });
          }
        } catch (_e) {
          // Skip invalid files
        }
      }
    }
  }

  scanDir(AGENTS_DIR);

  agentCache = agents;
  agentCacheTime = now;
  return agents;
}

/**
 * Load agents from agent-registry.json (preferred, indexed)
 */
function loadAgentsFromRegistry() {
  try {
    if (!fs.existsSync(AGENT_REGISTRY_PATH)) return [];
    const registry = JSON.parse(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
    return agentsFromRegistry(registry);
  } catch (_e) {
    return [];
  }
}

/**
 * Normalize registry data into routing-scoring agent records
 * @param {Object} registry
 * @returns {Array<{name: string, description: string, skills: string[], priority: string, path: string}>}
 */
function agentsFromRegistry(registry) {
  if (!registry || !registry.agents) return [];
  const agents = [];
  for (const agent of Object.values(registry.agents)) {
    const name = agent?.id || agent?.displayName;
    if (!name) continue;
    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
    const description =
      capabilities[0]?.description || agent?.description || agent?.metadata?.description || '';
    const skillSet = new Set();
    const capabilityPhrases = new Set();
    for (const cap of capabilities) {
      if (Array.isArray(cap?.skills)) {
        for (const skill of cap.skills) skillSet.add(skill);
      }
      if (Array.isArray(cap?.triggerPhrases)) {
        for (const phrase of cap.triggerPhrases) {
          if (phrase) capabilityPhrases.add(String(phrase).toLowerCase());
        }
      }
      if (Array.isArray(cap?.tags)) {
        for (const tag of cap.tags) {
          if (tag) capabilityPhrases.add(String(tag).toLowerCase());
        }
      }
      if (Array.isArray(cap?.examples)) {
        for (const example of cap.examples) {
          if (example) capabilityPhrases.add(String(example).toLowerCase());
        }
      }
    }
    agents.push({
      name,
      description,
      skills: [...skillSet],
      priority: agent?.priority || agent?.constraints?.priority || 'medium',
      path: agent?.filePath || agent?.path || '',
      capabilityPhrases: [...capabilityPhrases].slice(0, 50),
    });
  }
  return agents;
}

/**
 * Detect complexity level and planning requirements
 */
function detectPlanningRequirement(prompt) {
  const promptLower = prompt.toLowerCase();

  let complexity = 'trivial';
  let requiresArchitectReview = false;
  let requiresSecurityReview = false;

  // Check for epic
  const epicMatches = COMPLEXITY_KEYWORDS.epic.filter(k => promptLower.includes(k)).length;
  if (epicMatches >= 1) {
    complexity = 'epic';
    requiresArchitectReview = true;
  }
  // Check for high
  else {
    const highMatches = COMPLEXITY_KEYWORDS.high.filter(k => promptLower.includes(k)).length;
    if (highMatches >= 2) {
      complexity = 'high';
      requiresArchitectReview = true;
    } else if (highMatches >= 1) {
      complexity = 'medium';
    }
  }

  // Security check
  const securityKeywords = [
    'auth',
    'authentication',
    'authorization',
    'password',
    'token',
    'jwt',
    'oauth',
    'security',
    'encrypt',
    'credential',
    'secret',
    'payment',
  ];
  const securityMatches = securityKeywords.filter(k => promptLower.includes(k)).length;
  if (securityMatches >= 1) {
    requiresSecurityReview = true;
  }

  // Check for low/trivial override
  const trivialMatches = COMPLEXITY_KEYWORDS.trivial.filter(k => promptLower.includes(k)).length;
  const lowMatches = COMPLEXITY_KEYWORDS.low.filter(k => promptLower.includes(k)).length;
  if (trivialMatches > 0 && complexity === 'trivial') {
    complexity = 'trivial';
  } else if (lowMatches > 0 && complexity === 'trivial') {
    complexity = 'low';
  }

  // Save complexity to router state
  routerState.setComplexity(complexity);
  if (requiresSecurityReview) {
    routerState.setSecurityRequired(true);
  }

  return {
    complexity,
    requiresArchitectReview,
    requiresSecurityReview,
    multiAgentRequired: requiresArchitectReview || requiresSecurityReview,
  };
}

/**
 * Score agents against the user prompt
 */
function scoreAgents(prompt, agents, classification) {
  const promptLower = prompt.toLowerCase();
  const scores = [];
  const detectedIntent = classification?.intent || 'general';

  // Score each agent
  for (const agent of agents) {
    let score = 0;
    const agentDesc = (agent.description + ' ' + agent.name).toLowerCase();
    const _agentName = agent.name.toLowerCase();

    // Match by description keywords
    const promptWords = promptLower.split(/\s+/);
    for (const word of promptWords) {
      if (word.length > 3 && agentDesc.includes(word)) {
        score += 1;
      }
    }

    // Match by capability phrases/tags/examples
    if (Array.isArray(agent.capabilityPhrases) && agent.capabilityPhrases.length > 0) {
      let capabilityHits = 0;
      for (const word of promptWords) {
        if (word.length <= 3) continue;
        if (agent.capabilityPhrases.some(phrase => phrase.includes(word) || phrase === word)) {
          score += 1;
          capabilityHits += 1;
        }
        if (capabilityHits >= 5) break;
      }
    }

    // Direct routing table match
    const preferredAgent = classification?.defaultAgent || getPreferredAgent(detectedIntent);
    if (preferredAgent && agent.name === preferredAgent) {
      score += 5;
    }

    // Priority boost
    if (agent.priority === 'high') score += 1;

    scores.push({ agent, score, intent: detectedIntent });
  }

  scores.sort((a, b) => b.score - a.score);
  return { candidates: scores.slice(0, 3), intent: detectedIntent };
}

function recordUserPromptResult(result) {
  if (!USER_PROMPT_RESULTS_LOG_ENABLED) return;
  try {
    if (!fs.existsSync(RUNTIME_DIR)) {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    }
    const entry = {
      timestamp: new Date().toISOString(),
      intent: result?.routerEnforcement?.intent || 'general',
      intentConfidence: result?.routerEnforcement?.intentConfidence,
      intentSource: result?.routerEnforcement?.intentSource,
      candidates: (result?.routerEnforcement?.candidates || [])
        .map(candidate => candidate?.agent?.name)
        .filter(Boolean),
      semanticCandidates: (result?.routerEnforcement?.semanticCandidates || []).map(candidate => ({
        agent: candidate?.agent,
        score: candidate?.score,
      })),
      capability: result?.routerEnforcement?.capability,
      defaultAgentForCapability: result?.routerEnforcement?.defaultAgentForCapability,
      tokenMonitoring: result?.tokenMonitoring
        ? {
            enabled: result.tokenMonitoring.enabled,
            status: result.tokenMonitoring.status,
            percentUsed: result.tokenMonitoring.percentUsed,
            downgraded: result.tokenMonitoring.downgraded,
            breachCount: result.tokenMonitoring.breachCount,
          }
        : undefined,
      autoCompression: result?.autoCompression
        ? {
            enabled: result.autoCompression.enabled,
            needed: result.autoCompression.needed,
            reason: result.autoCompression.reason,
            urgency: result.autoCompression.urgency,
          }
        : undefined,
      memoryHealth: result?.memoryHealth
        ? {
            status: result.memoryHealth.status,
            warningsCount: Array.isArray(result.memoryHealth.warnings)
              ? result.memoryHealth.warnings.length
              : 0,
          }
        : undefined,
      costRisk: result?.costRisk
        ? {
            score: result.costRisk.score,
            level: result.costRisk.level,
            factors: result.costRisk.factors,
          }
        : undefined,
    };
    appendJsonl(USER_PROMPT_RESULTS_PATH, entry, { maxLines: USER_PROMPT_RESULTS_MAX_LINES });
  } catch (_err) {
    // Best-effort; never block hook execution.
  }
}

/**
 * Analyze prompt for routing recommendations.
 * Advisory only - never blocks.
 *
 * @param {Object} hookInput - Parsed hook input
 * @returns {Object} Result with skipped, candidates, planningReq
 */
async function checkRouterEnforcement(hookInput, options = {}) {
  const result = { skipped: false, candidates: [], planningReq: null, intent: 'general' };

  const userPrompt = hookInput?.prompt || hookInput?.message || '';

  // Skip for very short prompts
  if (!userPrompt || userPrompt.length < 10) {
    result.skipped = true;
    result.reason = 'too_short';
    return result;
  }

  // Skip for slash commands
  if (userPrompt.trim().startsWith('/')) {
    result.skipped = true;
    result.reason = 'slash_command';
    return result;
  }

  if (isTaskNotificationPrompt(userPrompt)) {
    result.skipped = true;
    result.reason = 'task_notification';
    return result;
  }

  // Load agents and score
  const agents = loadAgents();
  if (agents.length === 0) {
    result.skipped = true;
    result.reason = 'no_agents';
    return result;
  }

  const classification = classifyIntent(userPrompt);
  const { candidates, intent } = scoreAgents(userPrompt, agents, classification);
  const planningReq = detectPlanningRequirement(userPrompt);

  result.candidates = candidates;
  result.planningReq = planningReq;
  result.intent = classification.intent || intent;
  result.intentConfidence = classification.confidence;
  result.intentSource = classification.source;
  result.capability = classification.capability;
  result.defaultAgentForCapability =
    classification.defaultAgent ||
    (classification.capability ? getAgentForCapability(classification.capability) : null);

  const topScore = candidates.length > 0 ? candidates[0].score : 0;
  const conservativeMode = Boolean(options.conservativeMode);
  if (conservativeMode) {
    result.conservativeMode = true;
  }
  const semanticDisabled = process.env.SEMANTIC_ROUTING === 'off' || conservativeMode;
  if (!semanticDisabled && (classification.intent === 'general' || topScore <= 2)) {
    const semanticCandidates = await semanticRouter.predict(userPrompt, {
      topK: 5,
      minScore: 0.25,
    });
    if (semanticCandidates.length > 0) {
      result.semanticCandidates = semanticCandidates;
      const semanticTop = semanticCandidates[0];
      if (semanticTop.score > 0.5) {
        const semanticAgent = agents.find(agent => agent.name === semanticTop.agent);
        if (semanticAgent) {
          result.candidates.unshift({
            agent: semanticAgent,
            score: semanticTop.score,
            intent: 'semantic',
            source: 'semantic',
          });
        }
      }
      console.error(
        `[user-prompt-unified] Semantic fallback: ${semanticCandidates
          .map(candidate => `${candidate.agent} (${candidate.score.toFixed(2)})`)
          .join(', ')}`
      );
    }
  }

  // Output routing info if clear recommendation
  if (candidates.length > 0 && candidates[0].score > 2) {
    console.error('\n+--------------------------------------------------+');
    console.error('| ROUTER ANALYSIS                                  |');
    console.error('+--------------------------------------------------+');
    console.error(`| Intent: ${intent.padEnd(39)} |`);
    console.error(`| Complexity: ${planningReq.complexity.padEnd(36)} |`);
    console.error('| Recommended agents:                              |');
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const c = candidates[i];
      if (c.score > 0) {
        const line = `|  ${i + 1}. ${c.agent.name} (score: ${c.score})`.padEnd(50) + '|';
        console.error(line);
      }
    }

    if (planningReq.multiAgentRequired) {
      console.error('+--------------------------------------------------+');
      console.error('| MULTI-AGENT PLANNING REQUIRED                    |');
      if (planningReq.requiresArchitectReview) {
        console.error('|  -> Architect review: REQUIRED                   |');
      }
      if (planningReq.requiresSecurityReview) {
        console.error('|  -> Security review: REQUIRED                    |');
      }
    }

    console.error('|                                                  |');
    console.error('| Use Task tool to spawn: ' + candidates[0].agent.name.padEnd(24) + '|');
    console.error('+--------------------------------------------------+\n');
  }

  return result;
}

// =============================================================================
// Check 3: Memory Reminder (from memory-reminder.cjs)
// =============================================================================

/**
 * Check memory files and remind if content exists.
 *
 * @param {Object} hookInput - Parsed hook input
 * @param {string} projectRoot - Project root path
 * @returns {Object} Result with show, files
 */
function checkMemoryReminder(hookInput, projectRoot = PROJECT_ROOT) {
  const result = { show: false, files: [] };

  const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');

  if (!fs.existsSync(memoryDir)) {
    return result;
  }

  const expectedFiles = [
    { name: 'learnings.md', description: 'Patterns, solutions, preferences' },
    { name: 'decisions.md', description: 'Architecture Decision Records' },
    { name: 'issues.md', description: 'Known issues, blockers' },
    { name: 'active_context.md', description: 'Long task scratchpad' },
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(memoryDir, file.name);
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      const lastModified = stats.mtime.toISOString().split('T')[0];

      result.files.push({
        ...file,
        exists: true,
        lines: lineCount,
        modified: lastModified,
      });
    } catch (_error) {
      result.files.push({
        ...file,
        exists: false,
      });
    }
  }

  // Check if there's meaningful content
  const hasContent = result.files.some(f => f.exists && f.lines > 5);
  if (!hasContent) {
    return result;
  }

  result.show = true;

  // Output reminder
  console.error('\n+--------------------------------------------------+');
  console.error('| MEMORY PROTOCOL REMINDER                         |');
  console.error('+--------------------------------------------------+');
  console.error('| Read memory files BEFORE starting work:          |');
  console.error('|                                                  |');

  for (const file of result.files) {
    if (file.exists && file.lines > 5) {
      const status = `${file.lines} lines, ${file.modified}`;
      console.error(`|  - ${file.name.padEnd(20)} (${status.padEnd(20)})|`);
    }
  }

  console.error('|                                                  |');
  console.error('| Path: .claude/context/memory/                    |');
  console.error('|                                                  |');
  console.error('| "If it is not in memory, it did not happen."    |');
  console.error('+--------------------------------------------------+');
  console.error('| SKILL PROTOCOL REMINDER                          |');
  console.error('+--------------------------------------------------+');
  console.error('| Invoke relevant skills BEFORE responding.        |');
  console.error('| When in doubt, use Skill tool (skill-discovery). |');
  console.error('+--------------------------------------------------+\n');

  return result;
}

// =============================================================================
// Check 4: Evolution Trigger Detection (merged logic)
// =============================================================================

/**
 * Evolution trigger patterns
 */
const EVOLUTION_TRIGGERS = [
  {
    pattern: /create\s+(a\s+)?new\s+(agent|skill|workflow|hook)/i,
    type: 'explicit_creation',
    priority: 'high',
  },
  { pattern: /need\s+(a|an)\s+\w+\s+(agent|skill)/i, type: 'capability_need', priority: 'high' },
  {
    pattern: /no\s+(matching|suitable|existing)\s+(agent|skill)/i,
    type: 'gap_detection',
    priority: 'high',
  },
  {
    pattern: /can('t|not)\s+find\s+(an?\s+)?(agent|skill)\s+for/i,
    type: 'gap_detection',
    priority: 'medium',
  },
  { pattern: /missing\s+(agent|skill|capability)/i, type: 'gap_detection', priority: 'medium' },
  { pattern: /add\s+(support|capability)\s+for/i, type: 'capability_request', priority: 'medium' },
  {
    pattern: /evolve\s+(the\s+)?(system|framework|ecosystem)/i,
    type: 'explicit_evolution',
    priority: 'high',
  },
  { pattern: /self[- ]evolv(e|ing)/i, type: 'explicit_evolution', priority: 'high' },
  {
    pattern: /extend\s+(the\s+)?(agent|skill)\s+(system|ecosystem)/i,
    type: 'extension_request',
    priority: 'medium',
  },
];

/**
 * Extract context around a match
 */
function extractContext(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  let context = text.substring(start, end);

  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context.replace(/\n/g, ' ').trim();
}

/**
 * Detect evolution triggers in text
 */
function detectTriggers(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const triggers = [];

  EVOLUTION_TRIGGERS.forEach(({ pattern, type, priority }) => {
    const match = text.match(pattern);
    if (match) {
      triggers.push({
        pattern: pattern.source,
        type,
        priority,
        match: match[0],
        context: extractContext(text, match.index, 100),
      });
    }
  });

  return triggers;
}

/**
 * Get evolution state with caching
 */
function getEvolutionState() {
  const defaultState = {
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
    lastUpdated: new Date().toISOString(),
  };

  return getCachedState(EVOLUTION_STATE_PATH, defaultState);
}

/**
 * Save evolution state with cache invalidation
 */
function saveEvolutionState(state) {
  try {
    const dir = path.dirname(EVOLUTION_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    atomicWriteJSONSync(EVOLUTION_STATE_PATH, state);
    invalidateCache(EVOLUTION_STATE_PATH);
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('Failed to save evolution state:', e.message);
    }
  }
}

/**
 * Check for evolution triggers in prompt.
 * Advisory only - writes suggestions to state.
 *
 * @param {Object} hookInput - Parsed hook input
 * @returns {Object} Result with enabled, triggers
 */
function checkEvolutionTrigger(hookInput) {
  const result = { enabled: true, triggers: [], suggestionAdded: false };

  // Check if detection is enabled
  const mode = process.env.EVOLUTION_TRIGGER_DETECTION || 'on';
  if (mode === 'off') {
    result.enabled = false;
    return result;
  }

  const userPrompt = hookInput?.prompt || hookInput?.message || '';
  if (!userPrompt) {
    return result;
  }

  // Detect triggers
  const triggers = detectTriggers(userPrompt);
  result.triggers = triggers;

  if (triggers.length === 0) {
    return result;
  }

  // Get current state and add suggestion
  const state = getEvolutionState();

  // Don't add if evolution in progress
  if (state.state !== 'idle') {
    return result;
  }

  // Create suggestion
  const suggestion = {
    id: `sug-${Date.now()}`,
    detectedAt: new Date().toISOString(),
    triggers: triggers.map(t => ({
      type: t.type,
      priority: t.priority,
      match: t.match,
    })),
    status: 'pending',
  };

  // Avoid duplicates
  const recentSuggestions = state.suggestions.filter(s => {
    const age = Date.now() - new Date(s.detectedAt).getTime();
    return age < 5 * 60 * 1000;
  });

  const isDuplicate = recentSuggestions.some(s => {
    const existingTypes = new Set(s.triggers.map(t => t.type));
    const newTypes = new Set(triggers.map(t => t.type));
    return [...newTypes].every(t => existingTypes.has(t));
  });

  if (!isDuplicate) {
    state.suggestions = [...recentSuggestions, suggestion].slice(-10);
    state.lastUpdated = new Date().toISOString();
    saveEvolutionState(state);
    result.suggestionAdded = true;

    if (process.env.DEBUG_HOOKS) {
      console.error(
        '[user-prompt-unified:evolution] Evolution trigger detected:',
        triggers[0].match
      );
    }
  }

  return result;
}

// =============================================================================
// Check 6: Correction Detection (Phase 2.1)
// =============================================================================

/**
 * Detect user correction patterns in prompt.
 * Logs corrections to session-metrics.json for adaptive quality gate thresholds.
 * Non-blocking: always passes through, never exits non-zero.
 *
 * @param {string} prompt - User prompt text
 */
function checkCorrectionPatterns(prompt) {
  try {
    if (!prompt || typeof prompt !== 'string') return;

    const isCorrection = CORRECTION_PATTERNS.some(p => p.test(prompt));
    if (!isCorrection) return;

    // Log correction to session metrics
    const metricsFile = path.join(RUNTIME_DIR, 'session-metrics.json');
    let metrics = { corrections_count: 0, prompt_count: 0 };
    try {
      if (fs.existsSync(metricsFile)) {
        metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      }
    } catch (_) {
      /* use defaults */
    }

    metrics.corrections_count = (metrics.corrections_count || 0) + 1;
    metrics.lastCorrectionAt = new Date().toISOString();

    // Atomic write
    const tmpFile = metricsFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(metrics, null, 2));
    fs.renameSync(tmpFile, metricsFile);

    process.stderr.write(
      `[Correction Detected] User correction pattern found (total: ${metrics.corrections_count})\n`
    );
  } catch (err) {
    // Non-blocking: fail silently
    process.stderr.write(`[correction-detection] Error: ${err.message}\n`);
  }
}

// =============================================================================
// Check 5: Memory Health Check (merged logic)
// =============================================================================

/**
 * Check memory system health.
 * Auto-archives and prunes if over thresholds.
 *
 * @param {Object} hookInput - Parsed hook input
 * @param {string} projectRoot - Project root path
 * @returns {Object} Result with status, warnings, metrics
 */
function checkMemoryHealth(hookInput, projectRoot = PROJECT_ROOT) {
  const result = {
    status: 'unavailable',
    warnings: [],
    metrics: {},
    autoActions: [],
  };

  // Try to load memory manager
  const memoryManagerPath = path.join(
    projectRoot,
    '.claude',
    'lib',
    'memory',
    'memory-manager.cjs'
  );
  if (!fs.existsSync(memoryManagerPath)) {
    return result;
  }

  try {
    const healthIntervalMs = Number(process.env.MEMORY_HEALTH_CHECK_INTERVAL_MS || 5 * 60 * 1000);
    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
    const lastCheckPath = path.join(runtimeDir, 'last-memory-health-check.txt');

    if (Number.isFinite(healthIntervalMs) && healthIntervalMs > 0 && fs.existsSync(lastCheckPath)) {
      const lastCheck = Number(fs.readFileSync(lastCheckPath, 'utf8'));
      if (Number.isFinite(lastCheck) && Date.now() - lastCheck <= healthIntervalMs) {
        return { ...result, status: 'skipped', reason: 'recent_health_check' };
      }
    }

    const { getMemoryHealth, checkAndArchiveLearnings, pruneCodebaseMap, CONFIG } = require(
      memoryManagerPath
    );

    // Get health status
    const health = getMemoryHealth(projectRoot);
    result.status = health.status;
    result.warnings = [...health.warnings];
    result.metrics = {
      learningsSizeKB: health.learningsSizeKB,
      codebaseMapEntries: health.codebaseMapEntries,
      sessionsCount: health.sessionsCount,
    };

    // Auto-remediation
    if (health.learningsSizeKB > CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB) {
      const archiveResult = checkAndArchiveLearnings(projectRoot);
      if (archiveResult.archived) {
        result.autoActions.push(
          `Archived ${Math.round(archiveResult.archivedBytes / 1024)}KB of learnings.md`
        );
      }
    }

    if (health.codebaseMapEntries > CONFIG.CODEBASE_MAP_MAX_ENTRIES) {
      const pruneResult = pruneCodebaseMap(projectRoot);
      if (pruneResult.totalPruned > 0) {
        result.autoActions.push(`Pruned ${pruneResult.totalPruned} stale codebase_map entries`);
      }
    }

    // Output if warnings or actions
    if (result.warnings.length > 0 || result.autoActions.length > 0) {
      console.error('[MEMORY HEALTH CHECK]');
      if (result.warnings.length > 0) {
        console.error('Warnings:');
        for (const warning of result.warnings) {
          console.error(`  - ${warning}`);
        }
      }
      if (result.autoActions.length > 0) {
        console.error('Auto-actions taken:');
        for (const action of result.autoActions) {
          console.error(`  - ${action}`);
        }
      }
      console.error('');
    }
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[user-prompt-unified:health] Error:', e.message);
    }
  }

  return result;
}

// =============================================================================
// Combined Runner
// =============================================================================

/**
 * Run all checks in order.
 * All checks are advisory - never blocks.
 *
 * @param {Object} hookInput - Parsed hook input
 * @param {string} projectRoot - Project root path
 * @returns {Object} Combined results from all checks
 */
// eslint-disable-next-line complexity
async function runAllChecks(hookInput, projectRoot = PROJECT_ROOT) {
  const input = hookInput || {};
  const userPrompt = input?.prompt || input?.message || '';

  // Avoid recursive routing churn when internal task notifications are delivered
  // through UserPromptSubmit. These are system payloads, not user requests.
  if (isTaskNotificationPrompt(userPrompt)) {
    const skipped = { skipped: true, reason: 'task_notification' };
    const result = {
      routerModeReset: skipped,
      routerEnforcement: skipped,
      tokenMonitoring: { enabled: false, ...skipped },
      memoryReminder: { show: false, files: [], ...skipped },
      evolutionTrigger: { detected: false, ...skipped },
      memoryHealth: { warnings: [], autoActions: [], ...skipped },
      stmWrite: null,
      exitCode: 0,
      systemNotificationBypass: true,
    };
    recordUserPromptResult(result);
    return result;
  }

  // Core Fundamentals: Write STM on every UserPromptSubmit (best-effort).
  // This ensures `.claude/context/memory/stm/session_current.json` stays current during the session,
  // not only at SessionEnd.
  let stmWrite = null;
  try {
    if (memoryTiers?.writeSTMEntry) {
      const sessionId =
        input.session_id ||
        input.sessionId ||
        process.env.CLAUDE_SESSION_ID ||
        `session-${Date.now()}`;
      const summary = input.prompt || input.message || 'User prompt submitted';
      stmWrite = memoryTiers.writeSTMEntry(
        {
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          summary,
        },
        projectRoot
      );
    }
  } catch (_e) {
    logger.warn('STM write failed', { error: _e.message });
    try {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'writeSTMEntry',
        error: _e.message,
      });
    } catch (_err) {
      // Best-effort
    }
  }

  // Continuous findings trend telemetry outside post-task/post-tool paths.
  // This keeps trend data fresh even in prompt flows with limited tool activity.
  try {
    recordPromptFindingsTrendSnapshot(projectRoot);
  } catch (_e) {
    // Best-effort telemetry only.
  }

  // Reflection Spawn Check: If requests exist, remind Router to spawn reflection-agent.
  try {
    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
    const spawnRequestPath = path.join(runtimeDir, 'reflection-spawn-request.json');
    const reminderPath = path.join(runtimeDir, 'reflection-reminder.txt');

    if (fs.existsSync(spawnRequestPath)) {
      const raw = fs.readFileSync(spawnRequestPath, 'utf8');
      const requests = (() => {
        try {
          const a = JSON.parse(raw);
          return Array.isArray(a) ? a : [];
        } catch {
          return [];
        }
      })();

      if (requests.length > 0) {
        if (!fs.existsSync(runtimeDir)) {
          fs.mkdirSync(runtimeDir, { recursive: true });
        }
        // Write reminder file
        fs.writeFileSync(
          reminderPath,
          `You have ${requests.length} pending reflection spawn request(s). Read .claude/context/runtime/reflection-spawn-request.json and spawn reflection-agent for each request (or the first batch). Then delete this file and clear/trim the spawn request file.\n`,
          'utf8'
        );
        if (process.env.DEBUG_HOOKS) {
          console.warn(
            '[user-prompt-unified] Reflection reminder written; Router must perform Step 0.'
          );
        }
      } else if (fs.existsSync(reminderPath)) {
        // Clean up stale reminder if request file is empty or invalid
        fs.unlinkSync(reminderPath);
      }
    } else if (fs.existsSync(reminderPath)) {
      // Clean up stale reminder if request file is missing
      fs.unlinkSync(reminderPath);
    }
  } catch (_e) {
    // best-effort; ignore
  }

  // Headless-safe reflection queue processing (optional, rate-limited).
  try {
    const mode = String(process.env.REFLECTION_QUEUE_PROCESS_ON_PROMPT || '').toLowerCase();
    const enabled = mode === '' || mode === 'on' || mode === 'true' || mode === '1';
    if (enabled) {
      const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
      const lastRunPath = path.join(runtimeDir, 'reflection-queue-processor-last.txt');
      const intervalMs = Number(process.env.REFLECTION_QUEUE_PROCESS_INTERVAL_MS || 10 * 60 * 1000);
      const timeoutMs = Number(process.env.REFLECTION_QUEUE_PROCESS_TIMEOUT_MS || 60000);
      let lastRun = 0;
      if (fs.existsSync(lastRunPath)) {
        const raw = Number(fs.readFileSync(lastRunPath, 'utf8'));
        if (Number.isFinite(raw)) lastRun = raw;
      }
      if (!lastRun || Date.now() - lastRun >= intervalMs) {
        if (!fs.existsSync(runtimeDir)) {
          fs.mkdirSync(runtimeDir, { recursive: true });
        }
        const processorPath = path.join(
          PROJECT_ROOT,
          '.claude',
          'hooks',
          'reflection',
          'reflection-queue-processor.cjs'
        );
        if (fs.existsSync(processorPath)) {
          const result = spawnSync(
            process.execPath,
            [processorPath],
            buildHiddenSpawnSyncOptions({
              cwd: PROJECT_ROOT,
              stdio: 'ignore',
              timeout: timeoutMs,
            })
          );
          fs.writeFileSync(lastRunPath, String(Date.now()), 'utf8');
          if (result.status !== 0 && process.env.DEBUG_HOOKS) {
            console.warn(
              `[user-prompt-unified] reflection-queue-processor exited ${result.status}`
            );
          }
        }
      }
    }
  } catch (_e) {
    // best-effort; ignore
  }

  // Daily/weekly maintenance fallback: run when date/week changes (e.g. SessionEnd rarely fires).
  try {
    const statusPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'context',
      'memory',
      'maintenance-status.json'
    );
    let lastWeekly = null;
    let lastDaily = null;
    if (fs.existsSync(statusPath)) {
      try {
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        lastWeekly = status.lastWeekly || null;
        lastDaily = status.lastDaily || null;
      } catch (_e) {
        // ignore parse errors
      }
    }
    const schedulerPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'lib',
      'memory',
      'memory-scheduler.cjs'
    );
    const getDayKey = value => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 10);
    };
    const getWeekKey = value => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return null;
      const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = utc.getUTCDay() || 7;
      utc.setUTCDate(utc.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
      return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };
    if (fs.existsSync(schedulerPath)) {
      const now = new Date();
      const lastDailyKey = getDayKey(lastDaily);
      const todayKey = getDayKey(now);
      if (!lastDailyKey || lastDailyKey !== todayKey) {
        if (process.env.DEBUG_HOOKS) {
          console.warn('[user-prompt-unified] Daily maintenance triggered (date change).');
        }
        const dailyTimeoutMs = Number(process.env.MEMORY_DAILY_FALLBACK_TIMEOUT_MS || 60000);
        const spawnResult = spawnSync(
          process.execPath,
          [schedulerPath, 'daily'],
          buildHiddenSpawnSyncOptions({
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: dailyTimeoutMs,
          })
        );
        if (spawnResult.signal === 'SIGTERM' || spawnResult.status !== 0) {
          console.warn(
            '[user-prompt-unified] Daily maintenance may be partial:',
            spawnResult.signal ? `timeout (${spawnResult.signal})` : `exit ${spawnResult.status}`
          );
        }
      }
      const lastWeeklyKey = getWeekKey(lastWeekly);
      const currentWeekKey = getWeekKey(now);
      if (!lastWeeklyKey || lastWeeklyKey !== currentWeekKey) {
        if (process.env.DEBUG_HOOKS) {
          console.warn('[user-prompt-unified] Weekly maintenance triggered (week change).');
        }
        const weeklyTimeoutMs = Number(process.env.MEMORY_WEEKLY_FALLBACK_TIMEOUT_MS || 60000);
        const spawnResult = spawnSync(
          process.execPath,
          [schedulerPath, 'weekly'],
          buildHiddenSpawnSyncOptions({
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            timeout: weeklyTimeoutMs,
          })
        );
        if (spawnResult.signal === 'SIGTERM' || spawnResult.status !== 0) {
          console.warn(
            '[user-prompt-unified] Weekly maintenance may be partial:',
            spawnResult.signal ? `timeout (${spawnResult.signal})` : `exit ${spawnResult.status}`
          );
        }
      }
    }
  } catch (_e) {
    // best-effort; ignore
  }

  const tokenMonitoring = checkTokenMonitoring(input);
  const result = {
    routerModeReset: checkRouterModeReset(input),
    routerEnforcement: await checkRouterEnforcement(input, {
      conservativeMode: Boolean(tokenMonitoring?.downgraded),
    }),
    tokenMonitoring,
    memoryReminder: checkMemoryReminder(input, projectRoot),
    evolutionTrigger: checkEvolutionTrigger(input),
    memoryHealth: checkMemoryHealth(input, projectRoot),
    stmWrite,
    exitCode: 0, // Always allow (advisory)
  };

  // Best-effort: auto-compression driven by config.yaml
  try {
    result.autoCompression = maybeAutoCompress(result.tokenMonitoring);
  } catch (_err) {
    result.autoCompression = { enabled: false };
  }

  try {
    const risk = computeRouterCostRisk(result);
    result.costRisk = risk;
    logRouterCostRiskEvent({
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      score: risk.score,
      level: risk.level,
      factors: risk.factors,
      notes: tokenMonitoring?.downgraded ? 'conservative_mode' : null,
    });
  } catch (_err) {
    // best-effort
  }

  recordUserPromptResult(result);

  // Correction detection (additive — runs after all existing checks)
  checkCorrectionPatterns(userPrompt);

  return result;
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();

    if (process.env.SCHEDULER_TICK_ON_PROMPT === 'on') {
      try {
        const { runTick } = libRequire(path.join('scheduler', 'scheduler-tick.cjs'));
        runTick(PROJECT_ROOT);
      } catch (err) {
        debugLog('user-prompt-unified', 'scheduler tick failed (ignored)', err);
      }
    }

    await runAllChecks(hookInput, PROJECT_ROOT);
    try {
      eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'UserPromptSubmit',
        duration: Date.now() - startTime,
        output: {
          status: 'ok',
        },
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(0);
  } catch (err) {
    try {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'user-prompt-unified',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(() => {
    process.exit(0);
  });
}

// =============================================================================
// Exports for testing
// =============================================================================

module.exports = {
  // Individual check functions
  checkRouterModeReset,
  checkRouterEnforcement,
  checkTokenMonitoring,
  checkMemoryReminder,
  checkEvolutionTrigger,
  checkMemoryHealth,
  computeRouterCostRisk,

  // Combined runner
  runAllChecks,

  // Helper exports for testing
  parseHookInput: parseHookInputAsync,
  detectTriggers,
  detectPlanningRequirement,
  scoreAgents,
  isTaskNotificationPrompt,
  shouldRecordPromptFindingsSnapshot,
  recordPromptFindingsTrendSnapshot,
  loadAgents,
  loadAgentsFromRegistry,
  agentsFromRegistry,
  buildHiddenSpawnSyncOptions,

  // Constants for testing
  ROUTING_TABLE,
  COMPLEXITY_KEYWORDS,
  EVOLUTION_TRIGGERS,
  PROJECT_ROOT,
};
