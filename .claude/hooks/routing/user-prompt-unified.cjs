#!/usr/bin/env node
/**
 * Unified UserPromptSubmit Hook
 *
 * Consolidates 5 UserPromptSubmit hooks into a single file for reduced I/O and process spawning:
 * 1. router-mode-reset.cjs - Resets router state on new prompts
 * 2. router-enforcer.cjs - Analyzes prompts for routing recommendations (uses routing-table.cjs)
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

// Import shared utilities
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputSync } = require('../../lib/utils/hook-input.cjs');

let memoryTiers = null;
try {
  memoryTiers = require('../../lib/memory/memory-tiers.cjs');
} catch (_e) {
  memoryTiers = null;
}
if (!memoryTiers) {
  console.warn('[user-prompt-unified] memory-tiers not loaded; STM write skipped.');
}
const { getCachedState, invalidateCache } = require('../../lib/utils/state-cache.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Import router state module
const routerState = require('./router-state.cjs');

// =============================================================================
// Constants
// =============================================================================

const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const _MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');

// Agent cache (shared across calls within same process)
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 300000; // 5 minutes

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
      console.log(
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

  if (process.env.ROUTER_DEBUG === 'true') {
    console.log('[user-prompt-unified:reset] State reset to router mode (ROUTING-002 fix)');
    if (result.sessionBoundaryDetected) {
      console.log('[user-prompt-unified:reset] Session ID updated for ROUTING-003 fix');
    }
  }

  return result;
}

// =============================================================================
// Check 2: Router Enforcer (uses routing-table.cjs)
// =============================================================================

/**
 * ROUTING_TABLE - Maps intent keywords to agent names
 * (Subset for common cases - full table in original hook)
 */
const ROUTING_TABLE = {
  bug: 'developer',
  coding: 'developer',
  feature: 'developer',
  test: 'qa',
  testing: 'qa',
  documentation: 'technical-writer',
  docs: 'technical-writer',
  security: 'security-architect',
  architecture: 'architect',
  design: 'architect',
  plan: 'planner',
  planning: 'planner',
  devops: 'devops',
  infrastructure: 'devops',
  review: 'code-reviewer',
  pr: 'code-reviewer',
  python: 'python-pro',
  typescript: 'typescript-pro',
  rust: 'rust-pro',
  go: 'golang-pro',
};

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
    for (const cap of capabilities) {
      if (Array.isArray(cap?.skills)) {
        for (const skill of cap.skills) skillSet.add(skill);
      }
    }
    agents.push({
      name,
      description,
      skills: [...skillSet],
      priority: agent?.priority || agent?.constraints?.priority || 'medium',
      path: agent?.filePath || agent?.path || '',
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
function scoreAgents(prompt, agents) {
  const promptLower = prompt.toLowerCase();
  const scores = [];

  // Detect intent from routing table
  let detectedIntent = 'general';
  for (const [keyword, _agent] of Object.entries(ROUTING_TABLE)) {
    if (promptLower.includes(keyword)) {
      detectedIntent = keyword;
      break;
    }
  }

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

    // Direct routing table match
    const preferredAgent = ROUTING_TABLE[detectedIntent];
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

/**
 * Analyze prompt for routing recommendations.
 * Advisory only - never blocks.
 *
 * @param {Object} hookInput - Parsed hook input
 * @returns {Object} Result with skipped, candidates, planningReq
 */
function checkRouterEnforcement(hookInput) {
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

  // Load agents and score
  const agents = loadAgents();
  if (agents.length === 0) {
    result.skipped = true;
    result.reason = 'no_agents';
    return result;
  }

  const { candidates, intent } = scoreAgents(userPrompt, agents);
  const planningReq = detectPlanningRequirement(userPrompt);

  result.candidates = candidates;
  result.planningReq = planningReq;
  result.intent = intent;

  // Output routing info if clear recommendation
  if (candidates.length > 0 && candidates[0].score > 2) {
    console.log('\n+--------------------------------------------------+');
    console.log('| ROUTER ANALYSIS                                  |');
    console.log('+--------------------------------------------------+');
    console.log(`| Intent: ${intent.padEnd(39)} |`);
    console.log(`| Complexity: ${planningReq.complexity.padEnd(36)} |`);
    console.log('| Recommended agents:                              |');
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const c = candidates[i];
      if (c.score > 0) {
        const line = `|  ${i + 1}. ${c.agent.name} (score: ${c.score})`.padEnd(50) + '|';
        console.log(line);
      }
    }

    if (planningReq.multiAgentRequired) {
      console.log('+--------------------------------------------------+');
      console.log('| MULTI-AGENT PLANNING REQUIRED                    |');
      if (planningReq.requiresArchitectReview) {
        console.log('|  -> Architect review: REQUIRED                   |');
      }
      if (planningReq.requiresSecurityReview) {
        console.log('|  -> Security review: REQUIRED                    |');
      }
    }

    console.log('|                                                  |');
    console.log('| Use Task tool to spawn: ' + candidates[0].agent.name.padEnd(24) + '|');
    console.log('+--------------------------------------------------+\n');
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
  console.log('\n+--------------------------------------------------+');
  console.log('| MEMORY PROTOCOL REMINDER                         |');
  console.log('+--------------------------------------------------+');
  console.log('| Read memory files BEFORE starting work:          |');
  console.log('|                                                  |');

  for (const file of result.files) {
    if (file.exists && file.lines > 5) {
      const status = `${file.lines} lines, ${file.modified}`;
      console.log(`|  - ${file.name.padEnd(20)} (${status.padEnd(20)})|`);
    }
  }

  console.log('|                                                  |');
  console.log('| Path: .claude/context/memory/                    |');
  console.log('|                                                  |');
  console.log('| "If it is not in memory, it did not happen."    |');
  console.log('+--------------------------------------------------+\n');

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
      console.log('[user-prompt-unified:evolution] Evolution trigger detected:', triggers[0].match);
    }
  }

  return result;
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
      console.log('[MEMORY HEALTH CHECK]');
      if (result.warnings.length > 0) {
        console.log('Warnings:');
        for (const warning of result.warnings) {
          console.log(`  - ${warning}`);
        }
      }
      if (result.autoActions.length > 0) {
        console.log('Auto-actions taken:');
        for (const action of result.autoActions) {
          console.log(`  - ${action}`);
        }
      }
      console.log('');
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
function runAllChecks(hookInput, projectRoot = PROJECT_ROOT) {
  const input = hookInput || {};

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
    // best-effort; ignore
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
        const spawnResult = spawnSync(process.execPath, [schedulerPath, 'daily'], {
          cwd: PROJECT_ROOT,
          stdio: 'ignore',
          timeout: dailyTimeoutMs,
        });
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
        const spawnResult = spawnSync(process.execPath, [schedulerPath, 'weekly'], {
          cwd: PROJECT_ROOT,
          stdio: 'ignore',
          timeout: weeklyTimeoutMs,
        });
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

  const result = {
    routerModeReset: checkRouterModeReset(input),
    routerEnforcement: checkRouterEnforcement(input),
    memoryReminder: checkMemoryReminder(input, projectRoot),
    evolutionTrigger: checkEvolutionTrigger(input),
    memoryHealth: checkMemoryHealth(input, projectRoot),
    stmWrite,
    exitCode: 0, // Always allow (advisory)
  };

  return result;
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  const startTime = Date.now();
  try {
    const hookInput = parseHookInputSync();
    runAllChecks(hookInput, PROJECT_ROOT);
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
  main();
}

// =============================================================================
// Exports for testing
// =============================================================================

module.exports = {
  // Individual check functions
  checkRouterModeReset,
  checkRouterEnforcement,
  checkMemoryReminder,
  checkEvolutionTrigger,
  checkMemoryHealth,

  // Combined runner
  runAllChecks,

  // Helper exports for testing
  parseHookInput: parseHookInputSync,
  detectTriggers,
  detectPlanningRequirement,
  scoreAgents,
  loadAgents,
  loadAgentsFromRegistry,
  agentsFromRegistry,

  // Constants for testing
  ROUTING_TABLE,
  COMPLEXITY_KEYWORDS,
  EVOLUTION_TRIGGERS,
  PROJECT_ROOT,
};
