#!/usr/bin/env node
/**
 * Routing Guard - Unified Router Enforcement Hook
 * ================================================
 *
 * Consolidates 7 routing checks into a single guard:
 *
 * | Check | Name                       | Purpose                                      |
 * |-------|----------------------------|----------------------------------------------|
 * | 0     | router-bash-check          | Blocks non-whitelisted Bash commands         |
 * | 1     | router-self-check          | Blocks Router from blacklisted tools         |
 * | 2     | planner-first-guard        | Ensures PLANNER spawned for complex tasks    |
 * | 3     | task-create-guard          | Blocks TaskCreate without PLANNER            |
 * | 4     | security-review-guard      | Requires security review for impl agents     |
 * | 5     | router-write-guard         | Blocks direct writes without Task            |
 * | 6     | memory-pressure-check      | Blocks Task spawning under memory pressure   |
 * | 7     | specialist-override        | Warns developer spawn for specialist tasks   |
 *
 * Trigger: PreToolUse (matches: Task|TaskCreate|Edit|Write|NotebookEdit|Glob|Grep|WebSearch|Bash)
 *
 * ENFORCEMENT MODES:
 * - ROUTER_BASH_GUARD=block|warn|off (default: block)
 * - ROUTER_SELF_CHECK=block|warn|off (default: block)
 * - PLANNER_FIRST_ENFORCEMENT=block|warn|off (default: block)
 * - SECURITY_REVIEW_ENFORCEMENT=block|warn|off (default: block)
 * - ROUTER_WRITE_GUARD=block|warn|off (default: block)
 * - MEMORY_SPAWN_THROTTLING=true|false (default: true)
 * - SPECIALIST_ROUTING_ENFORCEMENT=warn|block|off (default: warn)
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (SEC-008: fail-closed on error)
 *
 * Override: Set HOOK_FAIL_OPEN=true for debugging only.
 *
 * @module routing-guard
 */

'use strict';

const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
  getEnforcementMode,
  formatResult,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const routerState = require('../../lib/routing/router-state.cjs');

// Memory Monitor integration (lazy-loaded to avoid circular dependencies)
let MemoryMonitor = null;
let memoryMonitor = null;

/**
 * Get or create the memory monitor instance (lazy initialization)
 * @returns {Object|null} MemoryMonitor instance or null if unavailable
 */
function getMemoryMonitor() {
  if (memoryMonitor === null && MemoryMonitor === null) {
    try {
      MemoryMonitor = require('../../lib/utils/memory-monitor.cjs');
      memoryMonitor = MemoryMonitor.getGlobalMonitor();
      // Don't auto-start - just use for spot checks
    } catch (_err) {
      // Memory monitor not available - graceful degradation
      MemoryMonitor = false; // Mark as unavailable
      memoryMonitor = false;
    }
  }
  return memoryMonitor || null;
}

// Event Bus integration (P1-6.4)
let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  // Graceful degradation: EventBus unavailable, continue without events
  eventBus = null;
}
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Violation Tracker integration (lazy-loaded)
let violationTracker = null;
function getViolationTracker() {
  if (violationTracker) return violationTracker;
  try {
    violationTracker = require('../../lib/monitoring/violation-tracker.cjs');
  } catch (_e) {
    // Graceful degradation — monitoring is optional
    violationTracker = null;
  }
  return violationTracker;
}

// =============================================================================
// INTRA-HOOK STATE CACHING (PERF-001)
// =============================================================================

/**
 * Cached router state for single hook invocation.
 * Prevents multiple getState() calls within runAllChecks().
 */
let _cachedRouterState = null;

/**
 * Check if state is stale (lastReset too old).
 * If stale, treat as router mode regardless of stored values.
 * This is a safety net if state-reset.cjs fails to run.
 *
 * Environment: STATE_STALE_THRESHOLD_MS (default: 600000 = 10 min)
 *
 * @param {Object} state - Router state object
 * @returns {Object} State object (possibly overridden to router mode)
 */
function applyStaleDetection(state) {
  const thresholdMs = parseInt(process.env.STATE_STALE_THRESHOLD_MS || '600000', 10);
  if (isNaN(thresholdMs) || thresholdMs <= 0) {
    return state; // Invalid threshold, skip detection
  }

  if (!state.lastReset) {
    // No lastReset timestamp -- treat as stale
    console.error(
      `[routing-guard] Stale state detected (no lastReset timestamp). Forcing router mode.`
    );
    return { ...state, mode: 'router', taskSpawned: false };
  }

  const resetTime = new Date(state.lastReset).getTime();
  if (isNaN(resetTime)) {
    // Invalid timestamp -- treat as stale
    console.error(
      `[routing-guard] Stale state detected (invalid lastReset: ${state.lastReset}). Forcing router mode.`
    );
    return { ...state, mode: 'router', taskSpawned: false };
  }

  const ageMs = Date.now() - resetTime;
  if (ageMs > thresholdMs) {
    console.error(
      `[routing-guard] Stale state detected (age: ${Math.round(ageMs / 1000)}s, threshold: ${Math.round(thresholdMs / 1000)}s). Forcing router mode.`
    );
    return { ...state, mode: 'router', taskSpawned: false };
  }

  return state;
}

/**
 * Get cached router state (single read per invocation)
 * PERF-001: Reduces 4 file reads to 1 per routing-guard invocation.
 * Applies staleness detection as safety net.
 */
function getCachedRouterState() {
  if (_cachedRouterState === null) {
    const rawState = routerState.getState();
    _cachedRouterState = applyStaleDetection(rawState);
  }
  return _cachedRouterState;
}

/**
 * Invalidate cached state (call at start of each invocation and for testing)
 */
function invalidateCachedState() {
  _cachedRouterState = null;
  routerState.invalidateStateCache();
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Tools watched by this unified guard
 */
const ALL_WATCHED_TOOLS = [
  // Self-check blacklist (Router shouldn't use these directly)
  'Glob',
  'Grep',
  'WebSearch',
  'Bash', // Added: Router can only use whitelisted git commands
  // Write tools (require agent context)
  'Edit',
  'Write',
  'NotebookEdit',
  // Agent spawning tools (require planning/security checks)
  'Task',
  'TaskCreate',
];

/**
 * Tools that Router should NEVER use directly (must spawn agent)
 * From router-self-check.cjs
 * Note: Bash is CONDITIONALLY blacklisted - only whitelisted git commands are allowed
 */
const BLACKLISTED_TOOLS = ['Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'WebSearch'];

/**
 * Router Bash Whitelist (ADR-030)
 * Router may ONLY use these exact Bash commands. ALL other Bash commands require spawning an agent.
 * Exhaustive list - if it's not here, Router cannot use it.
 */
const ROUTER_BASH_WHITELIST = [
  // Git status commands
  /^git\s+status(\s+-s|\s+--short)?$/,
  // Git log commands (limited output)
  /^git\s+log\s+--oneline\s+-\d{1,2}$/,
  // Git diff name-only
  /^git\s+diff\s+--name-only$/,
  // Git branch listing
  /^git\s+branch$/,
];

/**
 * Tools that are always allowed for Router
 * From router-self-check.cjs
 */
const WHITELISTED_TOOLS = ['TaskUpdate', 'TaskList', 'TaskGet', 'Read', 'AskUserQuestion'];

/**
 * Write tools that require agent context
 * From router-write-guard.cjs
 */
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/**
 * Agents that need security review before spawning
 * From security-review-guard.cjs
 */
const IMPLEMENTATION_AGENTS = ['developer', 'qa', 'devops'];

/**
 * Specialist keyword map - maps specialist agent names to trigger keywords
 * Check 7: Warns when developer is spawned for tasks that match specialist keywords
 *
 * ADR-088: Uses contextual phrases (not single words) to reduce false positives.
 * Matched with word-boundary regex to prevent substring matches.
 */
const SPECIALIST_KEYWORD_MAP = {
  'technical-writer': [
    'write documentation',
    'update documentation',
    'update docs',
    'update readme',
    'write docs',
    'api documentation',
    'create docs',
    'document the api',
    'generate documentation',
    'fix documentation',
    'review documentation',
  ],
  'code-simplifier': [
    'refactor for clarity',
    'clean up code',
    'simplify code',
    'reduce complexity',
    'code cleanup',
    'improve readability',
    'simplify the',
    'refactor the',
    'clean up the',
  ],
  'code-reviewer': [
    'review code',
    'code review',
    'pr review',
    'review the pr',
    'review the implementation',
    'audit code',
    'review pull request',
  ],
  qa: [
    'write tests',
    'run tests',
    'test strategy',
    'test coverage',
    'test suite',
    'qa validation',
    'add tests',
    'fix tests',
    'run the tests',
    'test plan',
  ],
  devops: [
    'set up docker',
    'configure ci',
    'deploy to production',
    'deploy to staging',
    'set up deployment',
    'kubernetes config',
    'pipeline config',
    'ci/cd pipeline',
    'infrastructure setup',
    'helm chart',
  ],
  'database-architect': [
    'database schema',
    'schema migration',
    'database migration',
    'query optimization',
    'data model design',
    'create migration',
    'optimize queries',
  ],
  researcher: [
    'research options',
    'investigate options',
    'compare alternatives',
    'fact-find',
    'research best practices',
    'explore approaches',
  ],
  'devops-troubleshooter': [
    'debug production',
    'troubleshoot the',
    'diagnose issue',
    'investigate outage',
  ],
  'incident-responder': [
    'production incident',
    'handle outage',
    'incident response',
    'production outage',
    'sre practices',
    'on-call handoff',
    'handle the incident',
    'incident affecting',
  ],
  architect: [
    'design the architecture',
    'system design',
    'architectural decision',
    'choose tech stack',
    'design the system',
    'architecture review',
    'system architecture',
    'migrating to microservices',
  ],
  'security-architect': [
    'security review',
    'threat model',
    'security audit',
    'vulnerability assessment',
    'penetration test',
    'owasp review',
    'audit of the',
    'security of the',
  ],
  pm: [
    'user stories',
    'product requirements',
    'feature roadmap',
    'sprint planning',
    'product backlog',
    'acceptance criteria',
    'write user stories',
    'product requirements for',
  ],
  planner: [
    'break down this',
    'task breakdown',
    'break down the',
    'decompose this',
    'split this into',
    'plan the implementation',
  ],
  'mobile-ux-reviewer': [
    'ux review',
    'accessibility audit',
    'usability review',
    'mobile ux',
    'hig compliance',
    'design critique',
    'ux review of',
    'accessibility of',
  ],
  'c4-context': [
    'c4 context diagram',
    'system context diagram',
    'c4 system context',
    'context diagram for',
  ],
  'c4-container': [
    'c4 container diagram',
    'container architecture',
    'c4 deployment',
    'deployment architecture',
  ],
  'c4-component': [
    'c4 component diagram',
    'component architecture',
    'component boundaries',
    'component diagram for',
  ],
  'c4-code': [
    'c4 code diagram',
    'code-level architecture',
    'c4 code documentation',
    'code documentation for',
  ],
  'data-engineer': [
    'data pipeline',
    'etl pipeline',
    'data transformation',
    'data validation pipeline',
    'analytics pipeline',
    'data infrastructure',
    'build the data pipeline',
  ],
  'ai-ml-specialist': [
    'train model',
    'machine learning model',
    'deep learning',
    'model deployment',
    'mlops pipeline',
    'fine-tune model',
    'train the',
    'recommendation model',
  ],
  'web3-blockchain-expert': [
    'smart contract',
    'solidity contract',
    'defi protocol',
    'blockchain integration',
    'token contract',
    'web3 integration',
    'write the solidity',
  ],
  'scientific-research-expert': [
    'genomic analysis',
    'computational biology',
    'scientific workflow',
    'cheminformatics analysis',
    'research methodology',
    'scientific computing',
    'genomic analysis workflow',
    'variant calling',
  ],
  'gamedev-pro': [
    'game development',
    'game physics',
    'game mechanics',
    'unity project',
    'unreal engine project',
    'godot project',
    'game physics for',
  ],
  'reverse-engineer': [
    'reverse engineer',
    'reverse engineering',
    'decompile the',
    'analyze the legacy',
    'understand the legacy',
    'reverse engineer the legacy',
  ],
};

/**
 * Patterns to detect PLANNER agent spawns
 * From planner-first-guard.cjs
 */
const PLANNER_PATTERNS = {
  prompt: ['you are planner', 'you are the planner', 'as planner'],
  description: ['planner'],
};

/**
 * Patterns to detect SECURITY-ARCHITECT agent spawns
 */
const SECURITY_PATTERNS = {
  prompt: ['you are security', 'you are the security', 'security-architect', 'security architect'],
  description: ['security'],
};

/**
 * Files that are always allowed for writes (framework internal operations)
 * From router-write-guard.cjs
 */
const ALWAYS_ALLOWED_WRITE_PATTERNS = [
  /\.claude[/\\]context[/\\]runtime[/\\]/,
  /\.claude[/\\]context[/\\]memory[/\\]/,
  /\.gitkeep$/,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a file path is always allowed for writes
 * @param {string} filePath - File path to check
 * @returns {boolean}
 */
function isAlwaysAllowedWrite(filePath) {
  if (!filePath) return false;
  const normalizedPath = path.normalize(filePath);
  return ALWAYS_ALLOWED_WRITE_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Check if the Task being spawned is a PLANNER agent
 * @param {Object} toolInput - The Task tool input
 * @returns {boolean}
 */
function isPlannerSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  for (const pattern of PLANNER_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  for (const pattern of PLANNER_PATTERNS.description) {
    if (description.includes(pattern)) return true;
  }
  return false;
}

/**
 * Check if the Task being spawned is a SECURITY-ARCHITECT agent
 * @param {Object} toolInput - The Task tool input
 * @returns {boolean}
 */
function isSecuritySpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  for (const pattern of SECURITY_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  for (const pattern of SECURITY_PATTERNS.description) {
    if (description.includes(pattern)) return true;
  }
  return false;
}

/**
 * Check if the Task being spawned is an implementation agent
 * @param {Object} toolInput - The Task tool input
 * @returns {boolean}
 */
function isImplementationAgentSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  return IMPLEMENTATION_AGENTS.some(
    agent => prompt.includes(`you are ${agent}`) || prompt.includes(`you are the ${agent}`)
  );
}

// =============================================================================
// HELPER FUNCTIONS FOR BASH VALIDATION
// =============================================================================

/**
 * Check if a Bash command is in the Router whitelist (ADR-030)
 * @param {string} command - The bash command to check
 * @returns {boolean} True if command is whitelisted for Router
 */
function isWhitelistedBashCommand(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }
  const trimmed = command.trim();
  return ROUTER_BASH_WHITELIST.some(pattern => pattern.test(trimmed));
}

/**
 * Extract task ID from agent prompt
 * @param {string} prompt - Agent prompt text
 * @returns {string|null} Extracted task ID or null
 */
function extractTaskIdFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }
  // Pattern: "Task ID: task-123" or "Your Task ID: task-456"
  const match = prompt.match(/Task ID:\s*([a-zA-Z0-9-]+)/i);
  return match ? match[1] : null;
}

// =============================================================================
// CHECK FUNCTIONS (one per original hook)
// =============================================================================

/**
 * Check 0: Router Bash Check (blocks non-whitelisted Bash commands in router context)
 * ADR-030: Router may ONLY use whitelisted git commands via Bash
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input containing command
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkRouterBash(toolName, toolInput = {}) {
  // Only applies to Bash tool
  if (toolName !== 'Bash') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('ROUTER_BASH_GUARD', 'block');
  if (enforcement === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'routing-guard',
      'ROUTER_BASH_GUARD',
      'off',
      'Router can use any Bash command'
    );
    return { pass: true };
  }

  // PERF-001: Use cached state instead of fresh read
  const state = getCachedRouterState();
  if (state.mode === 'agent' || state.taskSpawned) {
    // Agents can use any Bash commands (they have full tools)
    return { pass: true };
  }

  // In Router context - check if command is whitelisted
  const command = toolInput.command || '';
  if (isWhitelistedBashCommand(command)) {
    return { pass: true };
  }

  // Router is using non-whitelisted Bash command - VIOLATION
  const truncatedCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;
  const message = `
+======================================================================+
|  ROUTER BASH VIOLATION BLOCKED (ADR-030)                             |
+======================================================================+
|  Command: ${truncatedCmd.padEnd(56)}|
|                                                                      |
|  Router can ONLY use these Bash commands:                            |
|    - git status [-s|--short]                                         |
|    - git log --oneline -N (where N is 1-99)                          |
|    - git diff --name-only                                            |
|    - git branch                                                      |
|                                                                      |
|  ALL other Bash commands require spawning an agent:                  |
|    - Test execution (pnpm test, npm test) --> Spawn QA               |
|    - Build commands --> Spawn DEVELOPER                              |
|    - File operations --> Spawn DEVELOPER                             |
|                                                                      |
|  Example:                                                            |
|    Task({                                                            |
|      subagent_type: 'general-purpose',                               |
|      description: 'QA running tests',                                |
|      prompt: 'You are QA. Run tests and analyze results...'          |
|    })                                                                |
|                                                                      |
+======================================================================+
`;

  // Record violation in violation-tracker
  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: 'Bash',
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'router-bash-whitelist',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
      metadata: { command: truncatedCmd },
    });
  }

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

/**
 * Check 1: Router Self-Check (blocks blacklisted tools in router context)
 * Original: router-self-check.cjs
 *
 * FIX: For write tools (Edit, Write, NotebookEdit), check if the target file
 * is in the always-allowed list (memory files, runtime files) before blocking.
 * This allows spawned agents to write to memory even if state shows router mode.
 *
 * DEBUG: Set ROUTER_DEBUG=false to disable verbose logging (enabled by default).
 *
 * @param {string} toolName - Tool being used
 * @param {Object} [toolInput] - Tool input (required for write tools to check file path)
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkRouterSelfCheck(toolName, toolInput = {}) {
  // PROC-007 FIX (Option D): Enable debug logging by default (opt-out via ROUTER_DEBUG=false)
  const DEBUG = process.env.ROUTER_DEBUG !== 'false';

  /**
   * Log debug message with timestamp and context
   */
  function debugLog(message, data = null) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [routing-guard]`;
    if (data) {
      console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`${prefix} ${message}`);
    }
  }

  debugLog('checkRouterSelfCheck called', { tool: toolName });

  const enforcement = getEnforcementMode('ROUTER_SELF_CHECK', 'block');
  debugLog('Enforcement mode check', { enforcement });

  if (enforcement === 'off') {
    debugLog('ALLOW: enforcement disabled');
    return { pass: true };
  }

  // Always allow whitelisted tools
  if (WHITELISTED_TOOLS.includes(toolName)) {
    debugLog('ALLOW: tool is whitelisted', { tool: toolName });
    return { pass: true };
  }

  // If not a blacklisted tool, allow
  if (!BLACKLISTED_TOOLS.includes(toolName)) {
    debugLog('ALLOW: tool not in blacklist', { tool: toolName });
    return { pass: true };
  }

  debugLog('Tool is blacklisted, checking context...', { tool: toolName });

  // FIX: For write tools, check if file is always-allowed (memory, runtime)
  // This allows spawned agents to write to memory files even if state
  // incorrectly shows router mode (race condition / state sync issue)
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = extractFilePath(toolInput);
    if (isAlwaysAllowedWrite(filePath)) {
      debugLog('ALLOW: write to always-allowed file', { tool: toolName, filePath });
      return { pass: true };
    }
  }

  // PERF-001: Use cached state instead of fresh read
  const state = getCachedRouterState();
  debugLog('Router state check', {
    mode: state.mode,
    taskSpawned: state.taskSpawned,
    lastReset: state.lastReset,
  });

  if (state.mode === 'agent' || state.taskSpawned) {
    debugLog('ALLOW: Agent mode or task spawned', {
      mode: state.mode,
      taskSpawned: state.taskSpawned,
    });
    return { pass: true };
  }

  // Router is using blacklisted tool directly - violation
  debugLog('BLOCK: Router using blacklisted tool', { tool: toolName, enforcement });
  const message = `[ROUTER SELF-CHECK VIOLATION] Router attempted to use blacklisted tool: ${toolName}
Spawn an agent via Task() tool to perform this operation.`;

  // Record violation in violation-tracker
  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: toolName,
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'router-blacklist',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
    });
  }

  if (enforcement === 'block') {
    debugLog('Returning BLOCK decision');
    return { pass: false, result: 'block', message };
  } else {
    debugLog('Returning WARN decision');
    return { pass: true, result: 'warn', message };
  }
}

/**
 * Check 2: Planner-First Guard (requires PLANNER for complex tasks)
 * Original: planner-first-guard.cjs
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string, markPlanner?: boolean }}
 */
function checkPlannerFirst(toolName, toolInput) {
  // Only applies to Task tool
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'routing-guard',
      'PLANNER_FIRST_ENFORCEMENT',
      'off',
      'Planner-first requirement bypassed'
    );
    return { pass: true };
  }

  // PERF-001: Use cached state for planner checks
  const state = getCachedRouterState();
  const isPlannerRequired = state.requiresPlannerFirst;
  const plannerAlreadySpawned = state.plannerSpawned;

  // If planner not required or already spawned, allow
  if (!isPlannerRequired || plannerAlreadySpawned) {
    return { pass: true };
  }

  // Check if THIS spawn is a PLANNER spawn (breaks the cycle)
  if (isPlannerSpawn(toolInput)) {
    return { pass: true, markPlanner: true };
  }

  // Not a PLANNER spawn, but PLANNER is required - violation
  const complexity = state.complexity || 'unknown';
  const message = `[PLANNER-FIRST VIOLATION] High/Epic complexity (${complexity}) requires PLANNER agent first.
Spawn PLANNER first: Task({ description: 'Planner designing...', prompt: 'You are PLANNER...' })`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

/**
 * Check 3: TaskCreate Guard (requires PLANNER before creating complex tasks)
 * Original: task-create-guard.cjs
 *
 * @param {string} toolName - Tool being used
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkTaskCreate(toolName) {
  // Only applies to TaskCreate tool
  if (toolName !== 'TaskCreate') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'routing-guard',
      'PLANNER_FIRST_ENFORCEMENT',
      'off',
      'TaskCreate without planner allowed'
    );
    return { pass: true };
  }

  // PERF-001: Use cached state for task-create checks
  const state = getCachedRouterState();
  const isPlannerRequired = state.requiresPlannerFirst;
  const isPlannerSpawned = state.plannerSpawned;

  // If planner not required or already spawned, allow
  if (!isPlannerRequired || isPlannerSpawned) {
    return { pass: true };
  }

  // Violation: trying to create tasks without planner
  const complexity = state.complexity || 'unknown';
  const message = `[TASK-CREATE VIOLATION] Complex task (${complexity}) requires PLANNER agent.
Spawn PLANNER first, then PLANNER will create the tasks.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

/**
 * Check 4: Security Review Guard (requires security review for impl agents)
 * Original: security-review-guard.cjs
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string, markSecurity?: boolean }}
 */
function checkSecurityReview(toolName, toolInput) {
  // Only applies to Task tool
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('SECURITY_REVIEW_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  // PERF-001: Use cached state for security review checks
  // Note: getCachedRouterState() handles errors internally via state-cache.cjs
  const state = getCachedRouterState();

  // Check if security review required but not done
  if (!state.requiresSecurityReview || state.securitySpawned) {
    return { pass: true };
  }

  // Check if this is a SECURITY-ARCHITECT spawn (breaks the cycle)
  if (isSecuritySpawn(toolInput)) {
    return { pass: true, markSecurity: true };
  }

  // Check if spawning an implementation agent
  if (!isImplementationAgentSpawn(toolInput)) {
    return { pass: true };
  }

  // Violation: implementation agent without security review
  const message = `[SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

/**
 * Check 5: Router Write Guard (requires agent context for writes)
 * Original: router-write-guard.cjs
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkRouterWrite(toolName, toolInput) {
  // Only applies to write tools
  if (!WRITE_TOOLS.includes(toolName)) {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('ROUTER_WRITE_GUARD', 'block');
  if (enforcement === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'routing-guard',
      'ROUTER_WRITE_GUARD',
      'off',
      'Router can write without agent context'
    );
    return { pass: true };
  }

  // Get file path
  const filePath = extractFilePath(toolInput);

  // Check if file is always allowed (framework internal)
  if (isAlwaysAllowedWrite(filePath)) {
    return { pass: true };
  }

  // Check if write is allowed (agent context)
  const { allowed, _reason } = routerState.checkWriteAllowed();
  if (allowed) {
    return { pass: true };
  }

  // Violation: write without agent context
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const message = `[ROUTER WRITE BLOCKED] Tool: ${toolName}, File: ${fileName}
The Router cannot directly edit files. Spawn an agent using the Task tool.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

// =============================================================================
// CHECK 6: MEMORY PRESSURE (blocks Task spawning under memory pressure)
// =============================================================================

/**
 * Check 6: Memory Pressure Check (blocks agent spawning under memory pressure)
 *
 * When heap usage exceeds critical threshold, blocks Task tool to prevent
 * additional memory consumption from spawning new agents.
 *
 * Environment Variables:
 *   MEMORY_SPAWN_THROTTLING=true|false (default: true)
 *
 * @param {string} toolName - Tool being used
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkMemoryPressure(toolName) {
  // Only applies to Task tool (agent spawning)
  if (toolName !== 'Task') {
    return { pass: true };
  }

  // Check if memory spawn throttling is enabled
  const throttlingEnabled = process.env.MEMORY_SPAWN_THROTTLING !== 'false';
  if (!throttlingEnabled) {
    return { pass: true };
  }

  // Get memory monitor (lazy-loaded)
  const monitor = getMemoryMonitor();
  if (!monitor) {
    // Memory monitor unavailable - allow (fail-open for this optional check)
    return { pass: true };
  }

  // Perform a heap check
  monitor.checkHeap();

  // Check if we should pause spawning
  const { shouldPause, reason, stats } = monitor.shouldPauseSpawning();

  if (shouldPause) {
    const heapUsedMB = stats?.current?.heapUsedMB?.toFixed(1) || 'unknown';
    const heapLimitMB = stats?.current?.heapLimitMB?.toFixed(1) || 'unknown';
    const percentStr = stats?.current?.percent
      ? (stats.current.percent * 100).toFixed(1)
      : 'unknown';

    const message = `
+======================================================================+
|  MEMORY PRESSURE - AGENT SPAWNING PAUSED                             |
+======================================================================+
|  Heap Usage: ${heapUsedMB}MB / ${heapLimitMB}MB (${percentStr}%)
|
|  Reason: ${reason}
|
|  Actions to recover:
|    1. Wait for existing agents to complete
|    2. Reduce concurrent agent spawns
|    3. Increase NODE_OPTIONS --max-old-space-size
|    4. Set MEMORY_SPAWN_THROTTLING=false to override (not recommended)
|
|  Memory Stats:
|    - Min: ${(stats?.min * 100)?.toFixed(1) || 'N/A'}%
|    - Max: ${(stats?.max * 100)?.toFixed(1) || 'N/A'}%
|    - Avg: ${(stats?.avg * 100)?.toFixed(1) || 'N/A'}%
|    - Trend: ${stats?.trend > 0 ? '+' : ''}${(stats?.trend * 100)?.toFixed(2) || 'N/A'}%
|
+======================================================================+
`;

    // Log to audit
    auditLog('routing-guard', 'memory_pressure_block', {
      heapUsedMB,
      heapLimitMB,
      percent: percentStr,
      reason,
    });

    // Block the spawn
    return { pass: false, result: 'block', message };
  }

  // Memory is OK - emit stats for monitoring if in debug mode
  if (process.env.DEBUG_HOOKS === 'true' && stats) {
    console.error(
      `[routing-guard] Memory check passed: ${(stats.current.percent * 100).toFixed(1)}%`
    );
  }

  return { pass: true };
}

// =============================================================================
// CHECK 7: SPECIALIST OVERRIDE (warns developer spawn for specialist tasks)
// =============================================================================

/**
 * Check 7: Specialist Override Check (warns when developer is spawned for specialist tasks)
 *
 * Detects when 'developer' agent is spawned for tasks that match specialist keywords
 * (documentation, refactoring, testing, deployment, etc.). Encourages specialist-first routing.
 *
 * Environment Variables:
 *   SPECIALIST_ROUTING_ENFORCEMENT=warn|block|off (default: warn)
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input containing prompt and description
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkSpecialistOverride(toolName, toolInput = {}) {
  // Only applies to Task tool
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('SPECIALIST_ROUTING_ENFORCEMENT', 'warn');
  if (enforcement === 'off') {
    return { pass: true };
  }

  // Only check developer spawns
  const prompt = (toolInput.prompt || '').toLowerCase();
  const isDeveloperSpawn =
    prompt.includes('you are developer') || prompt.includes('you are the developer');

  if (!isDeveloperSpawn) {
    return { pass: true };
  }

  // Scan combined prompt + description for specialist keywords
  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;

  // Find matching specialist (ADR-088: word-boundary matching to reduce false positives)
  for (const [specialist, phrases] of Object.entries(SPECIALIST_KEYWORD_MAP)) {
    for (const phrase of phrases) {
      // Escape regex special chars in phrase, then add word boundaries
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');

      if (regex.test(combined)) {
        // Found a match - developer is being used for specialist work
        const message = `[SPECIALIST-OVERRIDE] Developer spawn detected for ${specialist} task.
Keyword: "${phrase}"
Suggestion: Use ${specialist} agent instead for better results.

Developer should be LAST RESORT. Specialists have domain-specific prompts and skills.`;

        // Record violation in violation-tracker
        const tracker = getViolationTracker();
        if (tracker) {
          tracker.recordViolation({
            tool: 'Task',
            action: enforcement === 'block' ? 'blocked' : 'warned',
            checkName: 'specialist-override',
            routerMode: 'router',
            sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
            metadata: {
              keyword: phrase,
              suggestedSpecialist: specialist,
            },
          });
        }

        if (enforcement === 'block') {
          return { pass: false, result: 'block', message };
        } else {
          return { pass: true, result: 'warn', message };
        }
      }
    }
  }

  // No specialist keywords found - allow
  return { pass: true };
}

// =============================================================================
// CHECK 8: TASKLIST-FIRST GATE (requires TaskList before other tools)
// =============================================================================

/**
 * Check 8: TaskList-First Gate
 * Blocks routing-guard-watched tools until TaskList() is called in current prompt cycle.
 *
 * Environment: TASKLIST_FIRST_ENFORCEMENT=block|warn|off (default: warn)
 *
 * Exempt: Only applies in router mode (not agent mode).
 * Does NOT apply to: Read, TaskList, TaskGet, TaskUpdate, AskUserQuestion
 * (those are whitelisted and never reach routing-guard anyway).
 *
 * NOTE: Default is WARN (not block) for safe rollout. Switch to block after
 * 1 session with no false positives.
 *
 * @param {string} toolName - Tool being used
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkTaskListFirstGate(toolName) {
  const enforcement = getEnforcementMode('TASKLIST_FIRST_ENFORCEMENT', 'warn');
  if (enforcement === 'off') {
    return { pass: true };
  }

  // Only applies in router mode
  const state = getCachedRouterState();
  if (state.mode === 'agent' || state.taskSpawned) {
    return { pass: true };
  }

  // Check if TaskList was already called
  if (state.taskListCalledSincePrompt) {
    return { pass: true };
  }

  // Router is using a tool without calling TaskList first
  const message = `[TASKLIST-FIRST VIOLATION] Router must call TaskList() before using ${toolName}.
Call TaskList() first to check existing tasks, then proceed with your operation.`;

  // Record violation
  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: toolName,
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'tasklist-first-gate',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
    });
  }

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Run all routing checks
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result: string, message: string }}
 */
function runAllChecks(toolName, toolInput) {
  // Check 8: TaskList-First Gate (must come first -- protocol compliance)
  const taskListCheck = checkTaskListFirstGate(toolName);
  if (!taskListCheck.pass) {
    return { pass: false, result: taskListCheck.result, message: taskListCheck.message };
  }
  if (taskListCheck.result === 'warn') {
    console.warn(taskListCheck.message);
  }

  // Check 0: Router Bash Check (ADR-030 - must come first for Bash commands)
  const bashCheck = checkRouterBash(toolName, toolInput);
  if (!bashCheck.pass) {
    return { pass: false, result: bashCheck.result, message: bashCheck.message };
  }
  if (bashCheck.result === 'warn') {
    console.warn(bashCheck.message);
  }

  // Check 1: Router Self-Check (now receives toolInput for file path checking)
  const selfCheck = checkRouterSelfCheck(toolName, toolInput);
  if (!selfCheck.pass) {
    return { pass: false, result: selfCheck.result, message: selfCheck.message };
  }
  if (selfCheck.result === 'warn') {
    // Log warning but continue checks
    console.warn(selfCheck.message);
  }

  // Check 2: Planner-First Guard
  const plannerCheck = checkPlannerFirst(toolName, toolInput);
  if (!plannerCheck.pass) {
    return { pass: false, result: plannerCheck.result, message: plannerCheck.message };
  }
  if (plannerCheck.markPlanner) {
    // Mark planner as spawned in state
    routerState.markPlannerSpawned();
  }
  if (plannerCheck.result === 'warn') {
    console.warn(plannerCheck.message);
  }

  // Check 3: TaskCreate Guard
  const taskCreateCheck = checkTaskCreate(toolName);
  if (!taskCreateCheck.pass) {
    return { pass: false, result: taskCreateCheck.result, message: taskCreateCheck.message };
  }
  if (taskCreateCheck.result === 'warn') {
    console.warn(taskCreateCheck.message);
  }

  // Check 4: Security Review Guard
  const securityCheck = checkSecurityReview(toolName, toolInput);
  if (!securityCheck.pass) {
    return { pass: false, result: securityCheck.result, message: securityCheck.message };
  }
  if (securityCheck.markSecurity) {
    // Mark security as spawned in state
    routerState.markSecuritySpawned();
  }
  if (securityCheck.result === 'warn') {
    console.warn(securityCheck.message);
  }

  // Check 5: Router Write Guard
  const writeCheck = checkRouterWrite(toolName, toolInput);
  if (!writeCheck.pass) {
    return { pass: false, result: writeCheck.result, message: writeCheck.message };
  }
  if (writeCheck.result === 'warn') {
    console.warn(writeCheck.message);
  }

  // Check 6: Memory Pressure Check (for Task tool only)
  const memoryCheck = checkMemoryPressure(toolName);
  if (!memoryCheck.pass) {
    return { pass: false, result: memoryCheck.result, message: memoryCheck.message };
  }

  // Check 7: Specialist Override Check (warn when developer is used for specialist tasks)
  const specialistCheck = checkSpecialistOverride(toolName, toolInput);
  if (!specialistCheck.pass) {
    return { pass: false, result: specialistCheck.result, message: specialistCheck.message };
  }
  if (specialistCheck.result === 'warn') {
    console.warn(specialistCheck.message);
  }

  // All checks passed
  return { pass: true, result: 'allow', message: '' };
}

/**
 * Main entry point for routing guard hook.
 *
 * Validates that Router follows the router-first protocol and enforces
 * complex task planning and security review requirements. Consolidated
 * from 5 original guards (router-self-check, planner-first-guard,
 * task-create-guard, security-review-guard, router-write-guard).
 *
 * @async
 * @returns {Promise<void>} Exits with:
 *   - 0 if operation is allowed
 *   - 2 if operation is blocked (fail-closed on error)
 *
 * @throws {Error} Caught internally; triggers fail-closed behavior.
 *   When security state is unknown, exits with code 2 to prevent bypass.
 *
 * Exit Behavior:
 *   - Allowed: process.exit(0)
 *   - Blocked: process.exit(2) + message to stdout
 *   - Error: process.exit(2) + JSON audit log to stderr
 */
async function main() {
  const startTime = Date.now();
  try {
    // PERF-001: Invalidate cache at start of each invocation
    invalidateCachedState();

    // Parse the hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow (fail open for missing input)
      process.exit(0);
    }

    // Get tool name and input
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Skip if not a watched tool
    if (!toolName || !ALL_WATCHED_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    // Emit TOOL_INVOKED event (P1-6.4 - async, non-blocking)
    if (eventBus) {
      try {
        eventBus.emit('TOOL_INVOKED', {
          type: 'TOOL_INVOKED',
          toolName,
          input: toolInput,
          agentId: process.env.CLAUDE_AGENT_ID || 'router',
          taskId: process.env.CLAUDE_TASK_ID || 'unknown',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        // Graceful degradation: event emission failed, continue
        console.error('[routing-guard] Event emission failed:', err.message);
      }
    }

    // Emit AGENT_STARTED event if spawning agent (P1-6.4)
    if (toolName === 'Task' && eventBus) {
      try {
        // Extract agent type from toolInput
        const agentType = toolInput?.subagent_type || 'general-purpose';
        const taskId = extractTaskIdFromPrompt(toolInput?.prompt) || 'unknown';
        const agentId = `${agentType}-${Date.now()}`;

        eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId,
          agentType,
          taskId,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        // Graceful degradation
        console.error('[routing-guard] AGENT_STARTED event emission failed:', err.message);
      }
    }

    // Run all checks
    const result = runAllChecks(toolName, toolInput);

    if (!result.pass) {
      if (eventBus) {
        try {
          if (result.result === 'block') {
            await eventBus.emit(EventTypes.TOOL_BLOCKED, {
              type: EventTypes.TOOL_BLOCKED,
              timestamp: new Date().toISOString(),
              toolName,
              duration: Date.now() - startTime,
              reason: result.message,
            });
          } else {
            await eventBus.emit(EventTypes.TOOL_COMPLETED, {
              type: EventTypes.TOOL_COMPLETED,
              timestamp: new Date().toISOString(),
              toolName,
              duration: Date.now() - startTime,
              output: {
                status: result.result,
                reason: result.message,
              },
            });
          }
        } catch (_err) {
          // Best-effort
        }
      }
      // HOOK-009: Security audit log for blocked/warned actions
      auditLog('routing-guard', `security_${result.result}`, {
        tool: toolName,
        reason: result.message,
        mode: routerState.getState().mode,
      });

      // Output block/warn result
      console.log(formatResult(result.result, result.message));
      process.exit(result.result === 'block' ? 2 : 0);
    }

    // All checks passed
    if (eventBus) {
      try {
        await eventBus.emit(EventTypes.TOOL_COMPLETED, {
          type: EventTypes.TOOL_COMPLETED,
          timestamp: new Date().toISOString(),
          toolName,
          duration: Date.now() - startTime,
          output: {
            status: 'ok',
          },
        });
      } catch (_err) {
        // Best-effort
      }
    }
    process.exit(0);
  } catch (err) {
    if (eventBus) {
      try {
        await eventBus.emit(EventTypes.TOOL_FAILED, {
          type: EventTypes.TOOL_FAILED,
          timestamp: new Date().toISOString(),
          toolName: 'routing-guard',
          error: err.message,
        });
      } catch (_err) {
        // Best-effort
      }
    }
    // SEC-008: Allow debug override for troubleshooting
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      auditLog('routing-guard', 'fail_open_override', { error: err.message });
      process.exit(0);
    }

    // Audit log the error
    auditLog('routing-guard', 'error_fail_closed', { error: err.message });

    // SEC-008: Fail closed - deny when security state unknown
    process.exit(2);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

/**
 * Module exports for routing-guard hook.
 *
 * @typedef {Object} RoutingGuardExports
 * @property {Function} main - Main entry point for routing guard hook
 * @property {Function} runAllChecks - Run all routing checks on tool invocation
 * @property {Function} checkRouterBash - Check Router bash whitelist compliance
 * @property {Function} checkRouterSelfCheck - Check Router self-check constraints
 * @property {Function} checkPlannerFirst - Check PLANNER-first enforcement
 * @property {Function} checkTaskCreate - Check TaskCreate complexity enforcement
 * @property {Function} checkSecurityReview - Check security review requirements
 * @property {Function} checkRouterWrite - Check direct write restrictions
 * @property {Function} checkMemoryPressure - Check memory pressure before agent spawning
 * @property {Function} checkSpecialistOverride - Check specialist-first routing (Check 7)
 * @property {Function} isPlannerSpawn - Detect if spawn is a PLANNER agent
 * @property {Function} isSecuritySpawn - Detect if spawn is security-related
 * @property {Function} isImplementationAgentSpawn - Detect if spawn is implementation agent
 * @property {Function} isAlwaysAllowedWrite - Check if write operation is allowed
 * @property {Function} isWhitelistedBashCommand - Check if bash command is whitelisted
 * @property {Function} getCachedRouterState - Get cached router state (PERF-001)
 * @property {Function} invalidateCachedState - Invalidate router state cache
 * @property {Function} getMemoryMonitor - Get memory monitor instance for heap checks
 * @property {Array<string>} ALL_WATCHED_TOOLS - Tools monitored by this guard
 * @property {Array<string>} BLACKLISTED_TOOLS - Tools Router cannot use directly
 * @property {Array<string>} WHITELISTED_TOOLS - Tools only Router can use
 * @property {Array<string>} WRITE_TOOLS - Edit/Write operations that require agent context
 * @property {Array<string>} IMPLEMENTATION_AGENTS - Agents that perform implementation
 * @property {Array<string>} ROUTER_BASH_WHITELIST - Allowed bash commands (git only)
 * @property {Object} SPECIALIST_KEYWORD_MAP - Maps specialist agents to trigger keywords
 */

// Export for testing
module.exports = {
  main,
  runAllChecks,
  checkRouterBash,
  checkRouterSelfCheck,
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkRouterWrite,
  checkMemoryPressure,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  isPlannerSpawn,
  isSecuritySpawn,
  isImplementationAgentSpawn,
  isAlwaysAllowedWrite,
  isWhitelistedBashCommand,
  extractTaskIdFromPrompt,
  // Staleness detection (Fix 4b)
  applyStaleDetection,
  // PERF-001: Cache management
  getCachedRouterState,
  invalidateCachedState,
  // Memory monitoring
  getMemoryMonitor,
  // Constants
  ALL_WATCHED_TOOLS,
  BLACKLISTED_TOOLS,
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  IMPLEMENTATION_AGENTS,
  ROUTER_BASH_WHITELIST,
  SPECIALIST_KEYWORD_MAP,
};
