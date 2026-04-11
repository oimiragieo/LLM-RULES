#!/usr/bin/env node
/* eslint-disable max-lines */
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
const { spawnSync: spawnSync } = require('child_process');
// Resolve paths for reliable module loading
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');
// Helper for lib requires
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}
// Import shared utilities
const { PROJECT_ROOT: _PROJECT_ROOT } = libRequire(path.join('utils', 'project-root.cjs'));
const { parseHookInputAsync: parseHookInputAsync } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { loadConfig: loadConfig } = libRequire(path.join('utils', 'config-loader.cjs'));
const { appendJsonl: appendJsonl } = libRequire(path.join('utils', 'jsonl-utils.cjs'));
const { createLogger: createLogger } = libRequire(path.join('utils', 'logger.cjs'));
const { ROUTING_TABLE: ROUTING_TABLE, getPreferredAgent: getPreferredAgent } = libRequire(
  path.join('routing', 'routing-table.cjs')
);
const {
  classifyIntent: classifyIntent,
  classifyDomain: classifyDomain,
  isHierarchicalRoutingEnabled: isHierarchicalRoutingEnabled,
} = libRequire(path.join('routing', 'intent-classifier.cjs'));
const { getFlatRoutingFallbackAgent } = libRequire(
  path.join('routing', 'sub-router-selection.cjs')
);
const { getAgentForCapability: getAgentForCapability } = libRequire(
  path.join('routing', 'agent-registry-resolver.cjs')
);
const semanticRouter = libRequire(path.join('routing', 'semantic-router.cjs'));
const { estimateTokens: estimateTokens, trackAgentUsage: trackAgentUsage } = libRequire(
  path.join('utils', 'token-budget-tracker.cjs')
);
const { checkCompressionNeeded: checkCompressionNeeded, triggerCompression: triggerCompression } =
  libRequire(path.join('utils', 'compression-trigger.cjs'));
const { getContextPressure: getContextPressure } = libRequire(
  path.join('utils', 'context-token-estimator.cjs')
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
const { getCachedState: getCachedState, invalidateCache: invalidateCache } = libRequire(
  path.join('utils', 'state-cache.cjs')
);
const { atomicWriteJSONSync: atomicWriteJSONSync } = libRequire(
  path.join('utils', 'atomic-write.cjs')
);
const { readSpawnRequestsFile: readSpawnRequestsFile } = libRequire(
  path.join('reflection', 'spawn-request-contract.cjs')
);
const { buildStep0ReminderMessage: buildStep0ReminderMessage } = libRequire(
  path.join('reflection', 'reflection-reminder-message.cjs')
);
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes: EventTypes } = libRequire(path.join('events', 'event-types.cjs'));
const { logRouterCostRiskEvent: logRouterCostRiskEvent, logRouterSloAlert: logRouterSloAlert } =
  libRequire(path.join('monitoring', 'router-churn-log.cjs'));
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
const USER_PROMPT_RESULTS_MAX_LINES = Number(process.env.USER_PROMPT_RESULTS_MAX_LINES || 2e3);
const EVOLUTION_REQUESTS_PATH = path.join(RUNTIME_DIR, 'evolution-requests.jsonl');
const EVOLUTION_SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'evolution-spawn-request.json');
const EVOLUTION_REMINDER_PATH = path.join(RUNTIME_DIR, 'evolution-reminder.txt');
const FINDINGS_PROMPT_SNAPSHOT_STATE_FILE = path.join(
  RUNTIME_DIR,
  'findings-trend-prompt-snapshot-state.json'
);
// Agent cache (shared across calls within same process)
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 3e5; // 5 minutes
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
function buildHiddenSpawnSyncOptions(base = {}) {
  return { ...base, windowsHide: true };
}
function getFindingsSnapshotIntervalMs() {
  const intervalRaw = Number(process.env.FINDINGS_TREND_SNAPSHOT_INTERVAL_MS);
  return Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 15 * 60 * 1e3;
}
function shouldRecordPromptFindingsSnapshot(
  nowMs = Date.now(),
  stateFilePath = FINDINGS_PROMPT_SNAPSHOT_STATE_FILE
) {
  const intervalMs = getFindingsSnapshotIntervalMs();
  try {
    if (!fs.existsSync(stateFilePath)) return true;
    const payload = safeParseJSON(fs.readFileSync(stateFilePath, 'utf8'));
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
 */ function checkRouterModeReset(hookInput) {
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

  // Design rationale:
  // - Each new user prompt is a NEW routing decision
  // - Router must evaluate whether to spawn agents
  // - Agent mode is for SUBAGENTS, not for Router handling new prompts
  // - Subagent context is tracked by subagent_id in hook input, not state file
  // Reset to router mode while keeping prompt-scoped metadata batched into the same write.
  const creatorIntent = detectCreatorIntent(userPrompt);
  routerState.resetToRouterMode({
    sessionId: currentSessionId,
    preset: process.env.AGENT_PRESET || null,
    creatorIntentDetected: creatorIntent.detected,
    detectedCreatorType: creatorIntent.detected ? creatorIntent.type : null,
    requiredCreatorSkill: creatorIntent.detected ? creatorIntent.skill : null,
    batchCreation: creatorIntent.detected ? creatorIntent.isBatch || false : false,
  });
  result.stateReset = true;
  if (creatorIntent.detected) {
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

function readJsonlEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => safeParseJSON(line, null))
      .filter(entry => entry && typeof entry === 'object');
  } catch (_err) {
    return [];
  }
}

function detectRecurringCriticalEvolution(requests, threshold = 3) {
  const minHits = Number.isFinite(Number(threshold)) ? Number(threshold) : 3;
  const groups = new Map();

  for (const req of requests) {
    const severity = String(req?.severity || '').toUpperCase();
    const priority = String(req?.priority || '').toLowerCase();
    const isCritical = severity === 'CRITICAL' || priority === 'high';
    if (!isCritical) continue;
    const key =
      String(req?.targetArtifact?.name || '').trim() ||
      String(req?.summary || '').trim() ||
      String(req?.evidence || '').trim();
    if (!key) continue;
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const pending = [];
  for (const [key, count] of groups.entries()) {
    if (count < minHits) continue;
    pending.push({
      id: `evo-auto-${Buffer.from(key).toString('hex').slice(0, 12)}`,
      trigger: 'recurring_critical',
      key,
      count,
      threshold: minHits,
      status: 'pending',
      generatedAt: new Date().toISOString(),
    });
  }
  return pending;
}

function syncEvolutionSpawnReminder(options = {}) {
  const requestsPath = options.requestsPath || EVOLUTION_REQUESTS_PATH;
  const spawnPath = options.spawnPath || EVOLUTION_SPAWN_REQUEST_PATH;
  const reminderPath = options.reminderPath || EVOLUTION_REMINDER_PATH;
  const threshold = Number(options.threshold || process.env.EVOLUTION_AUTO_TRIGGER_THRESHOLD || 3);
  const pending = detectRecurringCriticalEvolution(readJsonlEntries(requestsPath), threshold);
  if (pending.length === 0) {
    if (fs.existsSync(reminderPath)) fs.unlinkSync(reminderPath);
    if (fs.existsSync(spawnPath)) fs.unlinkSync(spawnPath);
    return { pending: 0 };
  }

  fs.mkdirSync(path.dirname(spawnPath), { recursive: true });
  atomicWriteJSONSync(spawnPath, pending);
  const reminder =
    `Step 0.8: ${pending.length} recurring critical evolution request(s) detected.\n` +
    `Read .claude/context/runtime/evolution-spawn-request.json and spawn evolution-orchestrator.\n`;
  fs.writeFileSync(reminderPath, reminder, 'utf8');
  return { pending: pending.length };
}
// =============================================================================
// Check 2: Router Enforcer (uses shared routing-table.cjs)
// =============================================================================
/**
 * Keywords for complexity detection
 */ const COMPLEXITY_KEYWORDS = {
  trivial: ['hello', 'hi', 'thanks', 'thank you', 'bye', 'goodbye', 'what is', 'how are you'],
  low: ['typo', 'rename', 'fix typo', 'small fix', 'minor fix', 'quick fix'],
  high: ['integrate', 'integration', 'migrate', 'migration', 'architecture', 'refactor'],
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
  documentationTargets: [
    'readme',
    'docs',
    'documentation',
    'guide',
    'tutorial',
    'changelog',
    'api doc',
    'markdown',
  ],
  narrowTargets: ['module', 'file', 'function', 'class', 'method', 'component', 'readme'],
  broadTargets: [
    'system',
    'platform',
    'framework',
    'codebase',
    'repo',
    'all hooks',
    'all agents',
    'entire',
  ],
  securityDomains: [
    'auth',
    'authentication',
    'authorization',
    'security',
    'encryption',
    'password',
    'token',
    'jwt',
    'oauth',
    'oauth2',
    'refresh token',
    'credential',
    'payment',
    'rbac',
  ],
  implementationVerbs: ['implement', 'build', 'create', 'add', 'integrate', 'migrate', 'design'],
  reviewVerbs: ['review', 'audit', 'analyze', 'investigate', 'validate'],
  rewriteVerbs: ['rewrite', 'rebuild', 'replace', 're-architect'],
};
/**
 * Creator intent patterns for artifact creation detection
 * Used to detect when user wants to create artifacts (agents, skills, hooks, etc.)
 */ const CREATOR_INTENT_PATTERNS = [
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
 */ function detectCreatorIntent(userPrompt) {
  for (const { pattern: pattern, type: type } of CREATOR_INTENT_PATTERNS) {
    const match = userPrompt.match(pattern);
    if (match) {
      const isBatch = !!match[2]; // captured digit group (e.g., "10 agents")
      return { detected: true, type: type, isBatch: isBatch, skill: type };
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
    return safeParseJSON(fs.readFileSync(AUTO_COMPRESSION_STATE_PATH, 'utf8'));
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
    return safeParseJSON(fs.readFileSync(TOKEN_SLO_STATE_PATH, 'utf8'));
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
    score: score,
    level: level,
    factors: {
      tokenPercentUsed: Number(percent.toFixed(2)),
      complexity: complexity,
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
  const breachWindowMs = Number(tokenMonitoring.breach_window_ms || 10 * 60 * 1e3);
  const downgradeAfterBreaches = Number(tokenMonitoring.downgrade_after_breaches || 3);
  const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';

  const usageStats = trackAgentUsage(sessionId, { inputTokens: estimate.tokens });
  const totalTokens = usageStats.totalTokens || estimate.tokens;

  const result = {
    enabled: true,
    promptTokens: totalTokens,
    prompt: prompt,
    maxTokens: maxTokens,
    hardLimit: hardLimit,
    sessionId: sessionId,
    percentUsed: maxTokens > 0 ? Number(((totalTokens / maxTokens) * 100).toFixed(2)) : 0,
    status: 'ok',
    downgraded: false,
    breachCount: 0,
  };
  const usageRatio = maxTokens > 0 ? totalTokens / maxTokens : 0;
  if (hardLimit && totalTokens >= hardLimit) {
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
      breachCount: breachCount,
      lastBreachAt: now,
      downgradedUntil: downgradedUntil,
    };
    result.breachCount = breachCount;
    result.downgraded = downgraded || now < Number(previous.downgradedUntil || 0);
    writeTokenSloState(state);
    logRouterSloAlert({
      sessionId: sessionId,
      severity: result.status === 'warning' ? 'warning' : 'critical',
      sloName: 'token_utilization',
      value: usageRatio,
      threshold: result.status === 'warning' ? warningRatio : criticalRatio,
      downgraded: result.downgraded,
      breachCount: breachCount,
    });
  } else if (now < Number(previous.downgradedUntil || 0)) {
    result.downgraded = true;
    result.breachCount = Number(previous.breachCount || 0);
  } else if (previous.breachCount || previous.lastBreachAt || previous.downgradedUntil) {
    state.sessions[sessionId] = { breachCount: 0, lastBreachAt: 0, downgradedUntil: 0 };
    writeTokenSloState(state);
  }
  if (maxTokens && totalTokens >= maxTokens) {
    console.warn(
      `[user-prompt-unified] Token monitoring: cumulative tokens ${totalTokens} exceeds max_session_tokens (${maxTokens}).`
    );
  }
  if (hardLimit && totalTokens >= hardLimit) {
    console.warn(
      `[user-prompt-unified] Token monitoring: cumulative tokens ${totalTokens} exceeds hard_limit (${hardLimit}).`
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
  const promptTokens = tokenStatus?.promptTokens || 0;
  // Use the context window size (not maxTokens which is the output token limit).
  // Default to 200000 (Claude opus/sonnet context window) or read from env.
  const contextWindowSize =
    Number(process.env.CONTEXT_THRESHOLD_RED) ||
    (tokenStatus?.model && String(tokenStatus.model).includes('opus') ? 200000 : 200000);
  const percentUsed = contextWindowSize ? (promptTokens / contextWindowSize) * 100 : 0;
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
      percentUsed: percentUsed,
      status: percentUsed >= 90 ? 'CRITICAL' : percentUsed >= 80 ? 'WARNING' : 'OK',
    },
    operationCount: 0,
  });

  // Track 1.1: Precise Tokenizer Context-Pressure Check
  const pressureRatio = getContextPressure({
    incomingTaskPrompt: tokenStatus?.prompt || '',
  });
  const pressureThreshold = Number(process.env.CONTEXT_PRESSURE_THRESHOLD) || 0.8;
  if (pressureRatio >= pressureThreshold) {
    trigger.needed = true;
    trigger.reason = `Context pressure ratio ${pressureRatio.toFixed(2)} exceeds threshold ${pressureThreshold}`;
    trigger.urgency = 'high';
  }

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
      .catch(err => {
        if (process.env.DEBUG_HOOKS) {
          console.warn('[user-prompt-unified] Auto-compression trigger failed:', err?.message);
        }
      });
  } catch (_err) {
    // Best-effort
  }
  return { enabled: true, needed: true, reason: trigger.reason };
}
/**
 * Parse YAML frontmatter from agent file
 */ function parseFrontmatter(content) {
  if (!content || content.length > 5e4) return null;
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
 */ function loadAgents() {
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
 */ function loadAgentsFromRegistry() {
  try {
    if (!fs.existsSync(AGENT_REGISTRY_PATH)) return [];
    const registry = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
    return agentsFromRegistry(registry);
  } catch (_e) {
    return [];
  }
}
/**
 * Normalize registry data into routing-scoring agent records
 * @param {Object} registry
 * @returns {Array<{name: string, description: string, skills: string[], priority: string, path: string}>}
 */ function agentsFromRegistry(registry) {
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
      name: name,
      description: description,
      skills: [...skillSet],
      priority: agent?.priority || agent?.constraints?.priority || 'medium',
      path: agent?.filePath || agent?.path || '',
      capabilityPhrases: [...capabilityPhrases].slice(0, 50),
    });
  }
  return agents;
}

function promptHasAnySignal(promptLower, phrases) {
  return (
    Array.isArray(phrases) &&
    phrases.some(phrase => promptLower.includes(String(phrase).toLowerCase()))
  );
}

function countPromptSignals(promptLower, phrases) {
  return Array.isArray(phrases)
    ? phrases.filter(phrase => promptLower.includes(String(phrase).toLowerCase())).length
    : 0;
}

function detectPrimaryAction(promptLower) {
  const ACTION_PATTERNS = [
    { action: 'trivial_fix', pattern: /\bfix\s+(a\s+)?(typo|spelling|copy|comment)\b/i },
    { action: 'rename', pattern: /\brename\b/i },
    { action: 'rewrite', pattern: /\b(rewrite|rebuild|replace|re-architect)\b/i },
    { action: 'implement', pattern: /\b(implement|build|create|add|integrate|migrate)\b/i },
    { action: 'review', pattern: /\b(review|audit|analyze|investigate|validate)\b/i },
    { action: 'fix', pattern: /\bfix\b/i },
    { action: 'update', pattern: /\bupdate\b/i },
  ];

  for (const entry of ACTION_PATTERNS) {
    if (entry.pattern.test(promptLower)) {
      return entry.action;
    }
  }

  return 'general';
}
/**
 * Detect complexity level and planning requirements
 */ function detectPlanningRequirement(prompt) {
  const promptLower = String(prompt || '').toLowerCase();
  const primaryAction = detectPrimaryAction(promptLower);
  const trivialSignals = countPromptSignals(promptLower, COMPLEXITY_KEYWORDS.trivial);
  const lowSignals = countPromptSignals(promptLower, COMPLEXITY_KEYWORDS.low);
  const highSignals = countPromptSignals(promptLower, COMPLEXITY_KEYWORDS.high);
  const epicSignals = countPromptSignals(promptLower, COMPLEXITY_KEYWORDS.epic);
  const securitySignals = countPromptSignals(promptLower, COMPLEXITY_KEYWORDS.securityDomains);
  const hasDocumentationTarget = promptHasAnySignal(
    promptLower,
    COMPLEXITY_KEYWORDS.documentationTargets
  );
  const hasBroadTarget = promptHasAnySignal(promptLower, COMPLEXITY_KEYWORDS.broadTargets);
  const hasNarrowTarget = promptHasAnySignal(promptLower, COMPLEXITY_KEYWORDS.narrowTargets);
  const hasImplementationVerb =
    primaryAction === 'implement' ||
    promptHasAnySignal(promptLower, COMPLEXITY_KEYWORDS.implementationVerbs);
  const hasReviewVerb =
    primaryAction === 'review' || promptHasAnySignal(promptLower, COMPLEXITY_KEYWORDS.reviewVerbs);
  const hasRewriteVerb =
    primaryAction === 'rewrite' ||
    promptHasAnySignal(promptLower, COMPLEXITY_KEYWORDS.rewriteVerbs);
  const isTrivialFix =
    primaryAction === 'trivial_fix' ||
    (primaryAction === 'rename' && !hasBroadTarget) ||
    lowSignals > 0;
  const documentationOnly =
    hasDocumentationTarget && !hasImplementationVerb && securitySignals === 0;
  const securityHeavy =
    securitySignals >= 2 ||
    promptHasAnySignal(promptLower, ['oauth2', 'jwt', 'rbac', 'refresh token']);

  let complexity = trivialSignals > 0 ? 'trivial' : 'low';

  if (isTrivialFix && !hasBroadTarget) {
    complexity = hasNarrowTarget || securitySignals > 0 ? 'low' : 'trivial';
  } else if (documentationOnly) {
    complexity = hasRewriteVerb ? 'medium' : 'low';
  } else if (hasRewriteVerb && hasBroadTarget) {
    complexity = 'epic';
  } else if (hasImplementationVerb && (securityHeavy || hasBroadTarget || highSignals >= 2)) {
    complexity = 'high';
  } else if (hasRewriteVerb || highSignals > 0 || hasReviewVerb) {
    complexity = securityHeavy && hasImplementationVerb ? 'high' : 'medium';
  } else if (trivialSignals > 0) {
    complexity = 'trivial';
  }

  if (epicSignals > 0 && !documentationOnly && hasBroadTarget) {
    complexity = 'epic';
  }

  const requiresArchitectReview = complexity === 'high' || complexity === 'epic';
  const requiresSecurityReview =
    securitySignals > 0 &&
    !documentationOnly &&
    !isTrivialFix &&
    (hasImplementationVerb || hasReviewVerb || securityHeavy || hasBroadTarget);

  // PLATFORM AWARENESS INJECTION (Phase 4.3 Remediation)
  // Ensure all spawned agents are aware they are on Windows to prevent pathing loops.
  const platformRule =
    '\n+======================================================================+\n' +
    '|  PLATFORM AWARENESS: YOU ARE ON WINDOWS                              |\n' +
    '+======================================================================+\n' +
    '|  1. USE NATIVE PATHS: Use C:/... instead of /c/...                   |\n' +
    '|  2. NO BASH REDIRECTION: Avoid cat > file. Use Write/Edit tools.     |\n' +
    '|  3. NO /tmp: Use the project temp dir provided in the prompt.         |\n' +
    '+======================================================================+\n';

  return {
    complexity: complexity,
    requiresArchitectReview: requiresArchitectReview,
    requiresSecurityReview: requiresSecurityReview,
    multiAgentRequired: requiresArchitectReview || requiresSecurityReview,
    stateUpdates: {
      complexity: complexity,
      requiresPlannerFirst: complexity === 'high' || complexity === 'epic',
      requiresSecurityReview: requiresSecurityReview,
      platformAwarenessRule: platformRule,
    },
  };
}
/**
 * Score agents against the user prompt
 */ function scoreAgents(prompt, agents, classification) {
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
        if (agent.capabilityPhrases.some(phrase => word.includes(phrase) || phrase === word)) {
          score += 1;
          capabilityHits += 1;
        }
        if (capabilityHits >= 5) break;
      }
    }
    // Direct routing table match
    const preferredAgent = classification?.defaultAgent || getPreferredAgent(detectedIntent);
    if (preferredAgent && agent.name === preferredAgent) {
      score += 8;
    }

    // MULTI-AGENT TEAM BOOST (Phase 4.4 Hardening)
    // If it's an external integration, we NEED the security architect and planner too.
    if (detectedIntent === 'artifact-integrator') {
      if (['security-architect', 'planner'].includes(agent.name)) {
        score += 7; // Boost the support team
      }
    }

    // WINNER-TAKES-ALL REDUCTION (Phase 4.2 Optimization)
    // If we have a very strong intent match, deprioritize overlapping generic agents.
    if (detectedIntent === 'code_review' && agent.name === 'architect') {
      const archKeywords = ['system', 'topology', 'database schema', 'schema', 'restructure'];
      const hasArchSignal = archKeywords.some(k => promptLower.includes(k));
      if (!hasArchSignal) {
        score -= 5; // Deprioritize architect if it's just a code review
      }
    }

    if (
      detectedIntent === 'artifact-integrator' &&
      (agent.name === 'researcher' || agent.name === 'developer')
    ) {
      score -= 10; // Forced specialist-first for repo onboarding
    }

    // Priority boost
    if (agent.priority === 'high') score += 1;
    scores.push({ agent: agent, score: score, intent: detectedIntent });
  }

  scores.sort((a, b) => b.score - a.score);

  // Filter out weak candidates if we have a clear winner (gap > 8)
  // This prevents spawning a second agent when one is clearly superior.
  if (scores.length > 1 && scores[0].score - scores[1].score > 8) {
    return { candidates: [scores[0]], intent: detectedIntent };
  }

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
 */ // eslint-disable-next-line complexity
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
  const planningReq = detectPlanningRequirement(userPrompt);
  routerState.saveStateWithRetry(planningReq.stateUpdates);
  result.planningReq = planningReq;

  if (isHierarchicalRoutingEnabled()) {
    const hierarchicalMatch = classifyDomain(userPrompt);
    const hierarchicalTarget =
      hierarchicalMatch.type === 'domain' ? hierarchicalMatch.router : hierarchicalMatch.agent;
    const hierarchicalAgent = agents.find(agent => agent.name === hierarchicalTarget) || {
      name: hierarchicalTarget,
      description:
        hierarchicalMatch.type === 'domain'
          ? `${hierarchicalMatch.domain} domain sub-router`
          : `Direct hierarchical route for ${hierarchicalTarget}`,
      priority: 'high',
    };

    result.candidates = [
      {
        agent: hierarchicalAgent,
        score: 10,
        intent: hierarchicalMatch.domain || hierarchicalTarget,
        source: 'hierarchical',
      },
    ];
    result.intent = hierarchicalMatch.domain || hierarchicalTarget;
    result.intentConfidence = 'high';
    result.intentSource = 'hierarchical';
    result.defaultAgentForCapability = hierarchicalTarget;
    result.routingType = 'hierarchical';
    result.originalPrompt = userPrompt;
    result.flatFallbackAgent = getFlatRoutingFallbackAgent(userPrompt);
    if (hierarchicalMatch.type === 'domain') {
      result.domain = hierarchicalMatch.domain;
      result.subRouter = hierarchicalMatch.router;
    } else {
      result.directAgent = hierarchicalMatch.agent;
    }

    console.error('\n+--------------------------------------------------+');
    console.error('| ROUTER ANALYSIS (HIERARCHICAL)                   |');
    console.error('+--------------------------------------------------+');
    console.error(`| Route type: ${hierarchicalMatch.type.padEnd(35)} |`);
    if (hierarchicalMatch.type === 'domain') {
      console.error(`| Domain: ${hierarchicalMatch.domain.padEnd(39)} |`);
      console.error(`| Sub-router: ${hierarchicalMatch.router.padEnd(35)} |`);
    } else {
      console.error(`| Direct agent: ${hierarchicalMatch.agent.padEnd(35)} |`);
    }
    console.error(`| Complexity: ${planningReq.complexity.padEnd(36)} |`);
    console.error('|                                                  |');
    console.error(`| Use Task tool to spawn: ${hierarchicalTarget.padEnd(24)} |`);
    console.error('+--------------------------------------------------+\n');

    return result;
  }

  const conservativeMode = Boolean(options.conservativeMode);
  if (conservativeMode) {
    result.conservativeMode = true;
  }
  const semanticDisabled = process.env.SEMANTIC_ROUTING === 'off' || conservativeMode;
  const routingPriority = String(process.env.ROUTING_PRIORITY || 'semantic').toLowerCase();

  // Always run keyword classification for metadata (intent name, capability, disambiguation)
  const classification = classifyIntent(userPrompt);
  const { candidates: candidates, intent: intent } = scoreAgents(
    userPrompt,
    agents,
    classification
  );

  result.candidates = candidates;
  result.intent = classification.intent || intent;
  // Store last classified intent in router state for feedback loop
  try {
    const routerState = require(path.join(LIB_DIR, 'routing', 'router-state.cjs'));
    if (routerState.setLastClassifiedIntent) {
      routerState.setLastClassifiedIntent(result.intent);
    }
  } catch (_e) {
    /* best-effort */
  }
  result.intentConfidence = classification.confidence;
  result.intentSource = classification.source;
  result.capability = classification.capability;
  result.defaultAgentForCapability =
    classification.defaultAgent ||
    (classification.capability ? getAgentForCapability(classification.capability) : null);
  const topScore = candidates.length > 0 ? candidates[0].score : 0;

  if (!semanticDisabled && routingPriority === 'semantic') {
    // SEMANTIC-PRIMARY mode: embedding-based routing runs first, keywords are tiebreaker
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
          // Semantic winner goes to position 0 with high score
          result.candidates.unshift({
            agent: semanticAgent,
            score: 10 + semanticTop.score,
            intent: 'semantic',
            source: 'semantic-primary',
          });
        }
      } else if (semanticCandidates.length >= 2) {
        // Weak semantic signal — use keyword as tiebreaker if semantic top-2 are close
        const scoreDelta = semanticCandidates[0].score - semanticCandidates[1].score;
        if (scoreDelta < 0.05 && topScore > 2) {
          // Keyword classifier has a clear winner and semantic is ambiguous — keep keyword result
          result.intentSource = 'keyword-tiebreaker';
        }
      }
      console.error(
        `[user-prompt-unified] Semantic-primary: ${semanticCandidates.map(candidate => `${candidate.agent} (${candidate.score.toFixed(2)})`).join(', ')}`
      );
    }
  } else if (!semanticDisabled && (classification.intent === 'general' || topScore <= 2)) {
    // KEYWORD-PRIMARY mode (old behavior): semantic runs only as fallback
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
            source: 'semantic-fallback',
          });
        }
      }
      console.error(
        `[user-prompt-unified] Semantic fallback: ${semanticCandidates.map(candidate => `${candidate.agent} (${candidate.score.toFixed(2)})`).join(', ')}`
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
    const isHighComplexity = planningReq.complexity === 'high' || planningReq.complexity === 'epic';
    if (isHighComplexity) {
      console.error('| Spawn PLANNER first via Task tool                |');
      const planningContext = `${intent} -> ${candidates[0].agent.name}`;
      console.error('| Planning context: ' + planningContext.padEnd(30) + '|');
    } else {
      console.error('| Use Task tool to spawn: ' + candidates[0].agent.name.padEnd(24) + '|');
    }
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
 */ function checkMemoryReminder(hookInput, projectRoot = PROJECT_ROOT) {
  const result = { show: false, files: [] };
  const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
  if (!fs.existsSync(memoryDir)) {
    return result;
  }
  const expectedFiles = [
    { name: 'patterns.json', description: 'Reusable implementation patterns' },
    { name: 'gotchas.json', description: 'Recurring pitfalls and fixes' },
    { name: 'learnings.md', description: 'Patterns, solutions, preferences' },
    { name: 'decisions.md', description: 'Architecture Decision Records' },
    { name: 'issues.md', description: 'Known issues, blockers' },
    { name: 'active_context.md', description: 'Long task scratchpad' },
  ];
  for (const file of expectedFiles) {
    const filePath = path.join(memoryDir, file.name);
    try {
      const stats = fs.statSync(filePath);
      let lineCount = 0;
      if (stats.size > 100000) {
        // Estimate line count for large files to avoid FileTooLargeError (approx 80 chars per line)
        lineCount = Math.ceil(stats.size / 80);
      } else {
        const content = fs.readFileSync(filePath, 'utf-8');
        lineCount = content.split('\n').length;
      }
      const lastModified = stats.mtime.toISOString().split('T')[0];
      result.files.push({
        ...file,
        exists: true,
        lines: lineCount,
        modified: lastModified,
        size: stats.size,
      });
    } catch (_error) {
      result.files.push({ ...file, exists: false });
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
 */ const EVOLUTION_TRIGGERS = [
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
 */ function extractContext(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  let context = text.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';
  return context.replace(/\n/g, ' ').trim();
}
/**
 * Detect evolution triggers in text
 */ function detectTriggers(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const triggers = [];
  EVOLUTION_TRIGGERS.forEach(({ pattern: pattern, type: type, priority: priority }) => {
    const match = text.match(pattern);
    if (match) {
      triggers.push({
        pattern: pattern.source,
        type: type,
        priority: priority,
        match: match[0],
        context: extractContext(text, match.index, 100),
      });
    }
  });
  return triggers;
}
/**
 * Get evolution state with caching
 */ function getEvolutionState() {
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
 */ function saveEvolutionState(state) {
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
 */ function checkEvolutionTrigger(hookInput) {
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
    triggers: triggers.map(t => ({ type: t.type, priority: t.priority, match: t.match })),
    status: 'pending',
  };
  // Avoid duplicates
  const recentSuggestions = state.suggestions.filter(s => {
    const age = Date.now() - new Date(s.detectedAt).getTime();
    return age < 5 * 60 * 1e3;
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
 */ function checkCorrectionPatterns(prompt) {
  try {
    if (!prompt || typeof prompt !== 'string') return;
    const isCorrection = CORRECTION_PATTERNS.some(p => p.test(prompt));
    if (!isCorrection) return;
    // Log correction to session metrics
    const metricsFile = path.join(RUNTIME_DIR, 'session-metrics.json');
    let metrics = { corrections_count: 0, prompt_count: 0 };
    try {
      if (fs.existsSync(metricsFile)) {
        metrics = safeParseJSON(fs.readFileSync(metricsFile, 'utf8'));
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
 */ function checkMemoryHealth(hookInput, projectRoot = PROJECT_ROOT) {
  const result = { status: 'unavailable', warnings: [], metrics: {}, autoActions: [] };
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
    const healthIntervalMs = Number(process.env.MEMORY_HEALTH_CHECK_INTERVAL_MS || 5 * 60 * 1e3);
    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
    const lastCheckPath = path.join(runtimeDir, 'last-memory-health-check.txt');
    if (Number.isFinite(healthIntervalMs) && healthIntervalMs > 0 && fs.existsSync(lastCheckPath)) {
      const lastCheck = Number(fs.readFileSync(lastCheckPath, 'utf8'));
      if (Number.isFinite(lastCheck) && Date.now() - lastCheck <= healthIntervalMs) {
        return { ...result, status: 'skipped', reason: 'recent_health_check' };
      }
    }
    const {
      getMemoryHealth: getMemoryHealth,
      checkAndArchiveLearnings: checkAndArchiveLearnings,
      pruneCodebaseMap: pruneCodebaseMap,
      CONFIG: CONFIG,
    } = require(memoryManagerPath);
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
      // Await the async writeSTMEntry so that session_current.json is flushed before
      // runAllChecks returns. Without await the promise resolves after the caller
      // proceeds, making the STM file unreliable for downstream consumers.
      stmWrite = await memoryTiers.writeSTMEntry(
        { session_id: sessionId, timestamp: new Date().toISOString(), summary: summary },
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
      const requests = readSpawnRequestsFile(spawnRequestPath);
      if (requests.length > 0) {
        if (!fs.existsSync(runtimeDir)) {
          fs.mkdirSync(runtimeDir, { recursive: true });
        }
        // Write reminder file
        fs.writeFileSync(reminderPath, buildStep0ReminderMessage(requests.length), 'utf8');
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
  // Heartbeat Step 0.5: Check if heartbeat loops are active. If not, write a reminder
  // so the router spawns heartbeat-orchestrator on the first prompt of a new session.
  try {
    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
    const pingPath = path.join(runtimeDir, 'heartbeat-session-ping.json');
    const heartbeatReminderPath = path.join(runtimeDir, 'heartbeat-reminder.txt');
    let needsHeartbeat = false;

    if (!fs.existsSync(pingPath)) {
      needsHeartbeat = true;
    } else {
      const pingRaw = fs.readFileSync(pingPath, 'utf8');
      const ping = safeParseJSON(pingRaw);
      const expiresAt = ping?.expires_at;
      if (!expiresAt || Date.now() > new Date(expiresAt).getTime()) {
        needsHeartbeat = true;
      }
    }

    if (needsHeartbeat && !fs.existsSync(heartbeatReminderPath)) {
      if (!fs.existsSync(runtimeDir)) {
        fs.mkdirSync(runtimeDir, { recursive: true });
      }
      fs.writeFileSync(
        heartbeatReminderPath,
        'STEP 0.5: Heartbeat loops are NOT active. Spawn heartbeat-orchestrator with Skill({ skill: "heartbeat" }) or Task({ subagent_type: "heartbeat-orchestrator" }) to register all cron loops. Delete this file after spawning.\n',
        'utf8'
      );
    } else if (!needsHeartbeat && fs.existsSync(heartbeatReminderPath)) {
      fs.unlinkSync(heartbeatReminderPath);
    }
  } catch (_e) {
    // best-effort; ignore
  }

  // Stale Plan Detector (Step 0.3): Scan for plans with uncompleted tasks older than 3 days.
  try {
    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
    const plansDir = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
    const stalePlansReminderPath = path.join(runtimeDir, 'stale-plans-reminder.txt');
    // UTC epoch math: DST-safe for file-age comparison. 1h skew at DST transitions
    // is acceptable for 3-day windows (relative error < 2%).
    const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;

    if (!fs.existsSync(plansDir)) {
      // No plans directory yet, remove reminder if it exists
      if (fs.existsSync(stalePlansReminderPath)) {
        fs.unlinkSync(stalePlansReminderPath);
      }
    } else {
      const planFiles = fs
        .readdirSync(plansDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
        .map(dirent => dirent.name);

      const stalePlans = [];

      for (const fileName of planFiles) {
        const filePath = path.join(plansDir, fileName);
        const stats = fs.statSync(filePath);

        // Check if file is older than 3 days
        if (stats.mtimeMs < threeDaysAgoMs) {
          const content = fs.readFileSync(filePath, 'utf8');
          // Count uncompleted tasks: lines matching "- [ ]"
          const uncompletedCount = (content.match(/^\s*-\s*\[\s*\]\s/gm) || []).length;

          if (uncompletedCount > 0) {
            const modifiedDate = new Date(stats.mtimeMs).toISOString().split('T')[0];
            stalePlans.push({
              fileName,
              modifiedDate,
              uncompletedCount,
            });
          }
        }
      }

      if (stalePlans.length > 0) {
        if (!fs.existsSync(runtimeDir)) {
          fs.mkdirSync(runtimeDir, { recursive: true });
        }
        const reminderContent = [
          `STEP 0.3: ${stalePlans.length} stale plan(s) with uncompleted tasks:`,
          ...stalePlans.map(
            plan =>
              `- ${plan.fileName} (modified: ${plan.modifiedDate}, ${plan.uncompletedCount} uncompleted task${plan.uncompletedCount !== 1 ? 's' : ''})`
          ),
          '',
        ].join('\n');
        fs.writeFileSync(stalePlansReminderPath, reminderContent, 'utf8');
      } else if (fs.existsSync(stalePlansReminderPath)) {
        // No stale plans found, clean up reminder
        fs.unlinkSync(stalePlansReminderPath);
      }
    }
  } catch (_e) {
    // best-effort; ignore
  }

  // Pipeline Obligations Reminder: ccusage + self-review at every milestone.
  // IRON LAW: Router MUST run ccusage and self-review. Written on EVERY prompt.
  try {
    const obligationsPath = path.join(RUNTIME_DIR, 'pipeline-obligations-reminder.txt');
    // Read live token data from ccusage-statusline hook output
    const ccStatusPath = path.join(RUNTIME_DIR, 'ccusage-status.txt');
    let liveTokens =
      '(ccusage-status.txt not found — ccusage-statusline hook may not have fired yet)';
    try {
      if (fs.existsSync(ccStatusPath)) {
        liveTokens = fs.readFileSync(ccStatusPath, 'utf8').trim();
      }
    } catch (_readErr) {
      // best-effort
    }
    // Count stale worktrees (older than 2 hours)
    let worktreeWarning = '';
    try {
      const wtDir = path.join(PROJECT_ROOT, '.claude', 'worktrees');
      if (fs.existsSync(wtDir)) {
        const dirs = fs.readdirSync(wtDir).filter(d => d.startsWith('agent-'));
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const stale = dirs.filter(d => {
          try {
            return fs.statSync(path.join(wtDir, d)).mtimeMs < twoHoursAgo;
          } catch {
            return false;
          }
        });
        if (stale.length > 0) {
          worktreeWarning =
            '\n4. WORKTREE CLEANUP (MANDATORY): ' +
            stale.length +
            ' stale worktree(s) older than 2 hours detected in .claude/worktrees/.' +
            '\n   Run: git worktree prune && remove stale dirs.' +
            '\n   Stale: ' +
            stale.slice(0, 5).join(', ') +
            (stale.length > 5 ? '...' : '') +
            '\n   NEVER leave orphaned worktrees — they waste disk and cause branch conflicts.';
        }
      }
    } catch (_wtErr) {
      // best-effort
    }
    const obligationsContent = [
      'PIPELINE OBLIGATIONS (MANDATORY — DO NOT SKIP — EVERY RESPONSE THAT COMPLETES WORK):',
      '',
      '1. TOKEN REPORTING: At EVERY milestone/phase end, READ this file and display to user:',
      '   File: .claude/context/runtime/ccusage-status.txt',
      '   (Already populated by ccusage-statusline.cjs hook on every prompt — do NOT run npx ccusage)',
      '   Current data: ' + liveTokens,
      '',
      '2. MILESTONE SELF-REVIEW: At EVERY milestone, ask:',
      '   "Can I improve what I just delivered?" If YES → create a reflection.',
      '   NEVER dismiss failures as "pre-existing". NEVER skip this.',
      '',
      '3. Before claiming ANY pipeline/task complete:',
      '   - Displayed token data from ccusage-status.txt to the user',
      '   - Self-reviewed and either improved or documented why not',
      worktreeWarning,
      '',
      'These apply to EVERY response completing work — not just "final" tasks.',
    ].join('\n');
    if (!fs.existsSync(RUNTIME_DIR)) {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    }
    fs.writeFileSync(obligationsPath, obligationsContent, 'utf8');
  } catch (_e) {
    // best-effort; never block prompt
  }

  // Evolution Step 0.8: derive pending auto-evolution requests from recurring critical entries.
  try {
    syncEvolutionSpawnReminder();
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
      const intervalMs = Number(process.env.REFLECTION_QUEUE_PROCESS_INTERVAL_MS || 10 * 60 * 1e3);
      const timeoutMs = Number(process.env.REFLECTION_QUEUE_PROCESS_TIMEOUT_MS || 6e4);
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
            buildHiddenSpawnSyncOptions({ cwd: PROJECT_ROOT, stdio: 'ignore', timeout: timeoutMs })
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
        const status = safeParseJSON(fs.readFileSync(statusPath, 'utf8'));
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
      const weekNo = Math.ceil(((utc - yearStart) / 864e5 + 1) / 7);
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
        const dailyTimeoutMs = Number(process.env.MEMORY_DAILY_FALLBACK_TIMEOUT_MS || 6e4);
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
        const weeklyTimeoutMs = Number(process.env.MEMORY_WEEKLY_FALLBACK_TIMEOUT_MS || 6e4);
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
    tokenMonitoring: tokenMonitoring,
    memoryReminder: checkMemoryReminder(input, projectRoot),
    evolutionTrigger: checkEvolutionTrigger(input),
    memoryHealth: checkMemoryHealth(input, projectRoot),
    stmWrite: stmWrite,
    exitCode: 0,
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
  // Token reporting reminder — nudge the router to include token reporting in planner spawns.
  // This is a lightweight stderr hint; the actual injection happens in prompt-assembler.cjs (Patch 5).
  // Kill switch: set SPAWN_TOKEN_REPORTING=off to suppress.
  if (String(process.env.SPAWN_TOKEN_REPORTING || 'on').toLowerCase() !== 'off') {
    try {
      const statusFile = path.join(RUNTIME_DIR, 'ccusage-status.txt');
      if (fs.existsSync(statusFile)) {
        const status = fs.readFileSync(statusFile, 'utf8').trim();
        if (status) {
          process.stderr.write(`[token-report] ${status.split('\n')[0]}\n`);
        }
      }
    } catch (_tokenErr) {
      // Fail-open: never block prompt over token reporting
    }
  }
  return result;
}
// =============================================================================
// Prompt Injection Detection (P1-003)
// =============================================================================
const INJECTION_PATTERNS = {
  // Direct instruction override
  ignoreInstructions: {
    pattern: /ignore\s+(all\s+)?(previous|earlier|prior)\s+(instructions|rules|directives)/gi,
    severity: 'CRITICAL',
    category: 'instruction_override',
  },
  disregardRules: {
    pattern: /disregard\s+(all\s+)?(previous|earlier|system)\s+(instructions|rules|directives)/gi,
    severity: 'CRITICAL',
    category: 'instruction_override',
  },
  systemPromptLeak: {
    pattern:
      /(output|print|show|display|reveal)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions|rules)/gi,
    severity: 'CRITICAL',
    category: 'information_disclosure',
  },
  // Jailbreak patterns
  danMode: {
    pattern: /(enable|activate|switch\s+to)\s+(DAN|developer)\s+mode/gi,
    severity: 'CRITICAL',
    category: 'jailbreak',
  },
  evilMode: {
    pattern: /(evil|unfiltered|unrestricted)\s+mode/gi,
    severity: 'HIGH',
    category: 'jailbreak',
  },
  pretendRole: {
    pattern:
      /(pretend|act\s+as|roleplay)\s+(you\s+are|as)\s+(not\s+)?(an?\s+)?(assistant|AI|language model)/gi,
    severity: 'HIGH',
    category: 'jailbreak',
  },
  // Framework knowledge extraction
  frameworkLeak: {
    pattern: /(CLAUDE\.md|router-decision|agent\s+identity|spawn\s+prompt)/gi,
    severity: 'HIGH',
    category: 'information_disclosure',
  },
  memoryLeak: {
    pattern: /(learnings\.md|decisions\.md|issues\.md|memory\s+files)/gi,
    severity: 'MEDIUM',
    category: 'information_disclosure',
  },
  // Constraint bypass
  noRestrictions: {
    pattern: /(no|without|ignore)\s+(restrictions|limitations|constraints|safety)/gi,
    severity: 'HIGH',
    category: 'constraint_bypass',
  },
  overrideRules: {
    pattern: /(override|bypass|circumvent)\s+(rules|policies|guidelines)/gi,
    severity: 'HIGH',
    category: 'constraint_bypass',
  },
};
/**
 * Calculate Shannon entropy for obfuscation detection
 * @param {string} str - Input string
 * @returns {number} Entropy value (0-8)
 */ function calculateEntropy(str) {
  if (!str || str.length === 0) {
    return 0;
  }
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
/**
 * Detect and sanitize prompt injection patterns
 *
 * @param {string} userInput - Raw user prompt
 * @returns {{safe: boolean, sanitized: string, detections: object[], blocked: boolean, reason?: string, warnings?: string}}
 */ function sanitizePrompt(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return { safe: true, sanitized: '', detections: [], blocked: false };
  }
  const detections = [];
  let sanitized = userInput;
  // Check each injection pattern
  for (const [key, config] of Object.entries(INJECTION_PATTERNS)) {
    const matches = userInput.match(config.pattern);
    if (matches) {
      detections.push({
        pattern: key,
        severity: config.severity,
        category: config.category,
        matches: matches.length,
        samples: matches.slice(0, 2),
      });
      // CRITICAL = immediate block
      if (config.severity === 'CRITICAL') {
        logger.warn('[SECURITY] Prompt injection detected', {
          pattern: key,
          category: config.category,
          matches: matches.length,
        });
        if (eventBus) {
          eventBus.emit(EventTypes.SECURITY_VIOLATION, {
            type: 'prompt_injection_attempt',
            pattern: key,
            category: config.category,
            timestamp: new Date().toISOString(),
          });
        }
        return {
          safe: false,
          sanitized: '',
          detections: detections,
          blocked: true,
          reason: `Prompt injection detected: ${config.category}`,
        };
      }
      // HIGH/MEDIUM = sanitize pattern
      if (config.severity === 'HIGH' || config.severity === 'MEDIUM') {
        sanitized = sanitized.replace(config.pattern, '[REDACTED]');
      }
    }
  }
  // Entropy check for obfuscated instructions
  const entropy = calculateEntropy(userInput);
  if (entropy > 7.5 && userInput.length > 500) {
    // High entropy + long prompt = possible encoded attack
    detections.push({
      pattern: 'high_entropy',
      severity: 'MEDIUM',
      category: 'obfuscation',
      entropy: entropy.toFixed(2),
    });
    logger.warn('[SECURITY] High entropy prompt detected', {
      entropy: entropy.toFixed(2),
      length: userInput.length,
    });
  }
  // Success: sanitized with warnings if detections exist
  return {
    safe: true,
    sanitized: sanitized,
    detections: detections,
    blocked: false,
    warnings:
      detections.length > 0 ? `Sanitized ${detections.length} injection patterns` : undefined,
  };
}
// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();

    const result = await runAllChecks(hookInput, PROJECT_ROOT);

    const outputPayload = { status: 'ok' };
    if (result && result.autoCompression && result.autoCompression.needed) {
      const reason = result.autoCompression.reason || 'Token budget/context limit approached';
      outputPayload.message = `[SYSTEM URGENT]: Auto-compression triggered (${reason}). You MUST stop your current workflow and IMMEDIATELY invoke the \`context-compressor\` skill before proceeding to prevent a 400 Prompt Too Long fatal crash.`;
    }

    try {
      eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'UserPromptSubmit',
        duration: Date.now() - startTime,
        output: outputPayload,
      });
    } catch (_err) {
      // Best-effort
    }

    if (outputPayload.message) {
      process.stdout.write(JSON.stringify(outputPayload) + '\n');
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
// =============================================================================
// Exports for wrapper/tests
// =============================================================================
module.exports = {
  main: main,
  // Individual check functions
  checkRouterModeReset: checkRouterModeReset,
  checkRouterEnforcement: checkRouterEnforcement,
  checkTokenMonitoring: checkTokenMonitoring,
  checkMemoryReminder: checkMemoryReminder,
  checkEvolutionTrigger: checkEvolutionTrigger,
  checkMemoryHealth: checkMemoryHealth,
  computeRouterCostRisk: computeRouterCostRisk,
  // Combined runner
  runAllChecks: runAllChecks,
  // Helper exports for testing
  parseHookInput: parseHookInputAsync,
  detectTriggers: detectTriggers,
  detectRecurringCriticalEvolution: detectRecurringCriticalEvolution,
  syncEvolutionSpawnReminder: syncEvolutionSpawnReminder,
  detectPlanningRequirement: detectPlanningRequirement,
  scoreAgents: scoreAgents,
  isTaskNotificationPrompt: isTaskNotificationPrompt,
  shouldRecordPromptFindingsSnapshot: shouldRecordPromptFindingsSnapshot,
  recordPromptFindingsTrendSnapshot: recordPromptFindingsTrendSnapshot,
  loadAgents: loadAgents,
  loadAgentsFromRegistry: loadAgentsFromRegistry,
  agentsFromRegistry: agentsFromRegistry,
  buildHiddenSpawnSyncOptions: buildHiddenSpawnSyncOptions,
  // Prompt injection detection (P1-003)
  sanitizePrompt: sanitizePrompt,
  calculateEntropy: calculateEntropy,
  // Constants for testing
  ROUTING_TABLE: ROUTING_TABLE,
  COMPLEXITY_KEYWORDS: COMPLEXITY_KEYWORDS,
  EVOLUTION_TRIGGERS: EVOLUTION_TRIGGERS,
  PROJECT_ROOT: PROJECT_ROOT,
};
