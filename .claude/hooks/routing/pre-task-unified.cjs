#!/usr/bin/env node
/**
 * Pre-Task Unified Hook
 * =====================
 *
 * Consolidates 3 PreToolUse(Task) hooks into a single guard:
 *
 * | Original Hook                    | Check                                    |
 * |----------------------------------|------------------------------------------|
 * | agent-context-pre-tracker.cjs    | Sets mode='agent' before task starts     |
 * | routing-guard.cjs                | Planner-first, security review, self-check|
 * | loop-prevention.cjs              | Prevents runaway loops                   |
 *
 * Trigger: PreToolUse(Task)
 *
 * ENFORCEMENT MODES:
 * - ROUTER_SELF_CHECK=block|warn|off (default: block)
 * - PLANNER_FIRST_ENFORCEMENT=block|warn|off (default: block)
 * - SECURITY_REVIEW_ENFORCEMENT=block|warn|off (default: block)
 * - LOOP_PREVENTION_MODE=block|warn|off (default: block)
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (SEC-008: fail-closed on error)
 *
 * Performance: Reduces 4 processes to 1, caches shared state reads
 *
 * @module pre-task-unified
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Resolve paths for reliable module loading
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');
const _HOOKS_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks');

// Helper for lib requires
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

// Shared utilities
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
} = libRequire(path.join('utils', 'hook-input.cjs'));
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const loopStateManager = libRequire(path.join('self-healing', 'loop-state-manager.cjs'));
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Loop state file path
 */
const LOOP_STATE_FILE = loopStateManager.LOOP_STATE_FILE;
const TASKLIST_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tasklist-first-loop-state.json'
);

/**
 * Default loop prevention limits
 */
const DEFAULT_EVOLUTION_BUDGET = 3;
const DEFAULT_COOLDOWN_MS = 300000; // 5 minutes
const DEFAULT_DEPTH_LIMIT = 5;
const DEFAULT_PATTERN_THRESHOLD = 3;
const DEFAULT_PATTERN_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const TASKLIST_LOOP_BREAKER_THRESHOLD = Number(
  process.env.TASKLIST_FIRST_LOOP_BREAKER_THRESHOLD || 3
);
const TASKLIST_LOOP_BREAKER_WINDOW_MS = Number(
  process.env.TASKLIST_FIRST_LOOP_BREAKER_WINDOW_MS || 120000
);

/**
 * Patterns to detect PLANNER agent spawns
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
 * Agents that need security review before spawning
 */
const IMPLEMENTATION_AGENTS = ['developer', 'qa', 'devops'];

/**
 * Evolution trigger keywords
 */
const EVOLUTION_TRIGGERS = [
  'agent-creator',
  'skill-creator',
  'workflow-creator',
  'hook-creator',
  'template-creator',
  'schema-creator',
  'create new agent',
  'create new skill',
  'create new workflow',
  'create new hook',
];

/**
 * Evolution types based on prompt content
 */
const EVOLUTION_TYPES = {
  agent: ['agent-creator', 'create new agent', 'create agent'],
  skill: ['skill-creator', 'create new skill', 'create skill'],
  workflow: ['workflow-creator', 'create new workflow', 'create workflow'],
  hook: ['hook-creator', 'create new hook', 'create hook'],
  template: ['template-creator', 'create new template', 'create template'],
  schema: ['schema-creator', 'create new schema', 'create schema'],
};

// =============================================================================
// STATE HELPERS
// =============================================================================

/**
 * Invalidate cached state (for testing)
 */
function invalidateCachedState() {
  // Also invalidate router-state's internal cache
  routerState.invalidateStateCache();
}

/**
 * Get loop state from file
 */
function getLoopState() {
  // Backward-compatible helper kept for tests/exports.
  return loopStateManager.getState();
}

function readTaskListLoopState(stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeTaskListLoopState(state, stateFile = TASKLIST_LOOP_STATE_FILE) {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (_err) {
    // Best-effort
  }
}

function registerTaskListFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const now = Date.now();
  const state = readTaskListLoopState();
  const prev = state.sessions[sessionId] || { count: 0, updatedAt: 0 };
  const withinWindow = now - Number(prev.updatedAt || 0) <= TASKLIST_LOOP_BREAKER_WINDOW_MS;
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    updatedAt: now,
  };
  state.sessions[sessionId] = next;
  writeTaskListLoopState(state);
  return next.count;
}

function clearTaskListFirstViolation(sessionId = process.env.CLAUDE_SESSION_ID || 'unknown') {
  const state = readTaskListLoopState();
  if (state.sessions[sessionId]) {
    delete state.sessions[sessionId];
    writeTaskListLoopState(state);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if the Task being spawned is a PLANNER agent
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
 */
function isImplementationAgentSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  return IMPLEMENTATION_AGENTS.some(
    agent => prompt.includes(`you are ${agent}`) || prompt.includes(`you are the ${agent}`)
  );
}

/**
 * Extract task description from tool input
 */
function extractTaskDescription(toolInput) {
  if (!toolInput) return 'agent task';

  if (toolInput.description) return toolInput.description;
  if (toolInput.prompt) {
    const firstLine = toolInput.prompt.split('\n')[0];
    return firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
  }
  if (toolInput.subagent_type) return `${toolInput.subagent_type} agent`;

  return 'agent task';
}

/**
 * Extract agent type from tool input, prompt, or description
 * @param {string} prompt - Task prompt
 * @param {string} description - Task description
 * @param {Object} toolInput - Full tool input (optional, for subagent_type field)
 */
function extractAgentType(prompt, description, toolInput = null) {
  // FIRST: Check if subagent_type is directly provided in tool_input
  if (toolInput && toolInput.subagent_type) {
    return toolInput.subagent_type.toLowerCase();
  }

  const combined = `${prompt} ${description}`.toLowerCase();

  // Comprehensive agent list from agent-registry.json (49 agents)
  // Sorted longest-first to prevent partial matches (e.g., 'security-architect' before 'architect')
  const agentTypes = [
    // Orchestrators (longest first)
    'evolution-orchestrator',
    'master-orchestrator',
    'party-orchestrator',
    'swarm-coordinator',
    // Specialized (longest first)
    'tauri-desktop-developer',
    'expo-mobile-developer',
    'devops-troubleshooter',
    'security-architect',
    'incident-responder',
    'reverse-engineer',
    'database-architect',
    'conductor-validator',
    'code-simplifier',
    'code-reviewer',
    'technical-writer',
    'reflection-agent',
    'context-compressor',
    'ai-ml-specialist',
    'mobile-ux-reviewer',
    'scientific-research',
    'web3-blockchain',
    // Domain specialists
    'android',
    'data-engineer',
    'fastapi',
    'frontend',
    'gamedev',
    'golang',
    'graphql',
    'ios',
    'java',
    'nextjs',
    'nodejs',
    'php',
    'python',
    'rust',
    'sveltekit',
    'typescript',
    // C4 diagrams
    'c4-component',
    'c4-container',
    'c4-context',
    'c4-code',
    // Core agents
    'researcher',
    'devops',
    'architect',
    'developer',
    'planner',
    'router',
    'pm',
    'qa',
  ];

  for (const type of agentTypes) {
    if (combined.includes(type)) {
      return type;
    }
  }

  const youAreMatch = combined.match(/you are (?:the )?(\w+(?:-\w+)*)/i);
  if (youAreMatch) {
    return youAreMatch[1].toLowerCase();
  }

  return 'unknown';
}

/**
 * Check if prompt triggers evolution
 */
function isEvolutionTrigger(prompt) {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return EVOLUTION_TRIGGERS.some(t => lower.includes(t.toLowerCase()));
}

/**
 * Detect evolution type from prompt
 */
function detectEvolutionType(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  for (const [type, patterns] of Object.entries(EVOLUTION_TYPES)) {
    if (patterns.some(p => lower.includes(p))) {
      return type;
    }
  }
  return null;
}

/**
 * Get configured limits from environment
 */
function getDepthLimit() {
  const envDepth = process.env.LOOP_DEPTH_LIMIT;
  if (envDepth) {
    const parsed = parseInt(envDepth, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_DEPTH_LIMIT;
}

function getPatternThreshold() {
  const envThreshold = process.env.LOOP_PATTERN_THRESHOLD;
  if (envThreshold) {
    const parsed = parseInt(envThreshold, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_THRESHOLD;
}

function getPatternWindowMs() {
  const envWindowMs = process.env.LOOP_PATTERN_WINDOW_MS;
  if (envWindowMs) {
    const parsed = parseInt(envWindowMs, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_WINDOW_MS;
}

function parseIsoToMs(value) {
  if (!value || typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEvolutionBudget() {
  const envBudget = process.env.LOOP_EVOLUTION_BUDGET;
  if (envBudget) {
    const parsed = parseInt(envBudget, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EVOLUTION_BUDGET;
}

function getCooldownMs() {
  const envCooldown = process.env.LOOP_COOLDOWN_MS;
  if (envCooldown) {
    const parsed = parseInt(envCooldown, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_COOLDOWN_MS;
}

// =============================================================================
// CHECK 0: TaskList-first (TaskList() must be called before Task() in same session)
// =============================================================================
// TASKLIST_FIRST_ENFORCEMENT=block|warn|off (default: warn)

/**
 * Enforce TaskList() before Task() in the same session (since last UserPromptSubmit).
 * @param {string} toolName - Tool being used
 * @returns {{ pass: boolean, result?: 'block'|'warn', message?: string }}
 */
function checkTaskListFirst(toolName, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }
  const mode = (process.env.TASKLIST_FIRST_ENFORCEMENT || 'warn').toLowerCase();
  if (mode === 'off') {
    return { pass: true };
  }
  if (routerState.isTaskListCalledSincePrompt()) {
    const sessionId =
      hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
    clearTaskListFirstViolation(sessionId);
    return { pass: true };
  }
  const sessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const repeated = registerTaskListFirstViolation(sessionId);
  if (repeated >= TASKLIST_LOOP_BREAKER_THRESHOLD) {
    const message = `[TASKLIST-FIRST LOOP-BREAKER] TaskList-first violation repeated ${repeated}x in this session window.
Temporarily allowing Task spawn to avoid autonomous deadlock.`;
    return { pass: true, result: 'warn', message };
  }
  const message =
    'TaskList() must be called before Task(). Call TaskList() first, then spawn with Task().';
  if (mode === 'warn') {
    return { pass: true, result: 'warn', message };
  }
  return { pass: false, result: 'block', message };
}

// =============================================================================
// CHECK 1: Agent Context Pre-Tracker (from agent-context-pre-tracker.cjs)
// =============================================================================

/**
 * Sets mode='agent' BEFORE the task starts to prevent race conditions.
 * Always passes (tracking only, never blocks).
 *
 * @param {Object} hookInput - Full hook input
 * @returns {{ pass: boolean, message?: string }}
 */
function checkAgentContextPreTracker(hookInput) {
  const toolInput = getToolInput(hookInput);
  const taskDescription = extractTaskDescription(toolInput);

  // Set mode to agent BEFORE task starts
  routerState.enterAgentMode(taskDescription);

  if (process.env.ROUTER_DEBUG === 'true') {
    console.error(`[pre-task-unified:context] Pre-set mode=agent for: ${taskDescription}`);
  }

  // Always pass (tracking only)
  return { pass: true };
}

// =============================================================================
// CHECK 2: Routing Guard (from routing-guard.cjs)
// =============================================================================

/**
 * Combined routing guard checks:
 * - Planner-first enforcement
 * - Security review enforcement
 *
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string, markPlanner?: boolean, markSecurity?: boolean }}
 */
function checkRoutingGuard(toolName, toolInput) {
  // Only applies to Task tool
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const state = routerState.getState();

  // Check 2a: Planner-First Guard
  const plannerEnforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (plannerEnforcement !== 'off') {
    const isPlannerRequired = state.requiresPlannerFirst;
    const plannerAlreadySpawned = state.plannerSpawned;

    if (isPlannerRequired && !plannerAlreadySpawned) {
      // Check if THIS spawn is a PLANNER spawn
      if (isPlannerSpawn(toolInput)) {
        return { pass: true, markPlanner: true };
      }

      // Not a PLANNER spawn, but PLANNER is required
      const complexity = state.complexity || 'unknown';
      const message = `[PLANNER-FIRST VIOLATION] High/Epic complexity (${complexity}) requires PLANNER agent first.
Spawn PLANNER first: Task({ task_id: 'task-1', description: 'Planner designing...', prompt: 'You are PLANNER...' })`;

      if (plannerEnforcement === 'block') {
        return { pass: false, result: 'block', message };
      } else {
        console.warn(message);
      }
    }
  }

  // Check 2b: Security Review Guard
  const securityEnforcement = getEnforcementMode('SECURITY_REVIEW_ENFORCEMENT', 'block');
  if (securityEnforcement !== 'off') {
    if (state.requiresSecurityReview && !state.securitySpawned) {
      // Check if this is a SECURITY-ARCHITECT spawn
      if (isSecuritySpawn(toolInput)) {
        return { pass: true, markSecurity: true };
      }

      // Check if spawning an implementation agent
      if (isImplementationAgentSpawn(toolInput)) {
        const message = `[SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;

        if (securityEnforcement === 'block') {
          return { pass: false, result: 'block', message };
        } else {
          console.warn(message);
        }
      }
    }
  }

  return { pass: true };
}

// =============================================================================
// CHECK 3: Loop Prevention (from loop-prevention.cjs)
// =============================================================================

/**
 * Prevents runaway loops via:
 * 1. Spawn depth limit
 * 2. Pattern detection
 * 3. Evolution budget
 * 4. Cooldown period
 *
 * @param {Object} hookInput - Full hook input
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkLoopPrevention(hookInput) {
  const toolName = getToolName(hookInput);

  // Only check Task tool
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('LOOP_PREVENTION_MODE', 'block');
  if (enforcement === 'off') {
    auditLog('pre-task-unified', 'security_override_used', {
      check: 'loop-prevention',
      override: 'LOOP_PREVENTION_MODE=off',
    });
    return { pass: true };
  }

  const toolInput = getToolInput(hookInput);
  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';
  const loopState = loopStateManager.getState();

  // Check 4a: Spawn Depth
  const depthLimit = getDepthLimit();
  if (loopState.spawnDepth >= depthLimit) {
    const message = `[LOOP PREVENTION] Spawn depth limit exceeded (${loopState.spawnDepth}/${depthLimit}). Too many nested agent spawns.

This is a safety mechanism to prevent infinite loops.`;

    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    } else {
      console.warn(message);
    }
  }

  // Check 4b: Pattern Detection
  const agentType = extractAgentType(prompt, description, toolInput);
  const spawnAction = `spawn:${agentType}`;
  const threshold = getPatternThreshold();
  const patternWindowMs = getPatternWindowMs();

  const entry = loopState.actionHistory?.find(a => a.action === spawnAction);
  const count = entry ? Number(entry.count || 0) : 0;
  const lastAtMs = parseIsoToMs(entry?.lastAt);
  const hasRecentPattern = lastAtMs > 0 && Date.now() - lastAtMs <= patternWindowMs;
  const activeNestedSpawn = Number(loopState.spawnDepth || 0) > 0;

  // Pattern blocking is only meaningful while we are actively inside nested spawn
  // chains, and only for recent repeated patterns.
  // Sequential top-level Task() usage can legitimately repeat agent types.
  if (activeNestedSpawn && hasRecentPattern && count >= threshold) {
    const message = `[LOOP PREVENTION] Pattern detected: "${spawnAction}" repeated ${count} times. Threshold is ${threshold}.

This is a safety mechanism to prevent infinite loops.`;

    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    } else {
      console.warn(message);
    }
  }

  // Check 4c: Evolution triggers
  if (isEvolutionTrigger(prompt)) {
    const budget = getEvolutionBudget();
    if (loopState.evolutionCount >= budget) {
      const message = `[LOOP PREVENTION] Evolution budget exhausted (${loopState.evolutionCount}/${budget}). Session limit reached.

This is a safety mechanism to prevent infinite loops.`;

      if (enforcement === 'block') {
        return { pass: false, result: 'block', message };
      } else {
        console.warn(message);
      }
    }

    // Check cooldown for specific evolution type
    const evolutionType = detectEvolutionType(prompt);
    if (evolutionType && loopState.lastEvolutions?.[evolutionType]) {
      const cooldownMs = getCooldownMs();
      const lastTime = new Date(loopState.lastEvolutions[evolutionType]).getTime();
      const elapsed = Date.now() - lastTime;
      const remainingMs = cooldownMs - elapsed;

      if (remainingMs > 0) {
        const remainingMin = Math.ceil(remainingMs / 60000);
        const message = `[LOOP PREVENTION] Cooldown period active for ${evolutionType} evolution. Wait ${remainingMin} minute(s).

This is a safety mechanism to prevent infinite loops.`;

        if (enforcement === 'block') {
          return { pass: false, result: 'block', message };
        } else {
          console.warn(message);
        }
      }
    }
  }

  return { pass: true };
}

/**
 * Best-effort: update loop-prevention counters after a Task is allowed.
 *
 * This is the critical missing wiring that makes spawnDepth/evolutionCount actionable.
 */
function updateLoopStateAfterAllow(hookInput) {
  try {
    const toolInput = getToolInput(hookInput);
    const prompt = toolInput.prompt || '';
    const description = toolInput.description || '';

    const agentType = extractAgentType(prompt, description, toolInput);
    loopStateManager.recordSpawn(agentType);

    if (isEvolutionTrigger(prompt)) {
      const evolutionType = detectEvolutionType(prompt) || 'unknown';
      loopStateManager.recordEvolution(evolutionType);
    }
  } catch (err) {
    auditLog('pre-task-unified', 'loop_state_update_failed', { error: err.message });
  }
}

function extractTaskIdFromTaskInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const rawTaskId = toolInput.task_id ?? toolInput.taskId ?? toolInput.id ?? null;
  return rawTaskId != null ? String(rawTaskId) : null;
}

function updateTaskLifecycleStateAfterAllow(hookInput) {
  try {
    const toolInput = getToolInput(hookInput);
    const taskId = extractTaskIdFromTaskInput(toolInput);
    if (!taskId) return;

    // Ensure the active spawn task is discoverable by post-task hooks.
    routerState.setCurrentSpawnTaskId(taskId);
    // Ensure progress visibility even if spawned agents delay/skip TaskUpdate.
    routerState.recordTaskUpdate(taskId, 'in_progress');
  } catch (err) {
    auditLog('pre-task-unified', 'task_lifecycle_update_failed', { error: err.message });
  }
}

// =============================================================================
// COMBINED CHECK
// =============================================================================

/**
 * Run all 3 checks in order.
 *
 * Order:
 * 0. TaskList-first: TaskList() must be called before Task() in same session
 * 1. Agent Context Pre-Tracker (always passes, sets state)
 * 2. Routing Guard (planner-first, security review)
 * 3. Loop Prevention
 *
 * @param {Object} hookInput - Full hook input
 * @returns {{ pass: boolean, exitCode: number, message?: string }}
 */
function runAllChecks(hookInput) {
  const toolName = getToolName(hookInput);

  // Skip if not a Task tool
  if (toolName !== 'Task') {
    return { pass: true, exitCode: 0 };
  }

  // Invalidate cache for fresh state
  invalidateCachedState();

  const toolInput = getToolInput(hookInput);

  // Check 0: TaskList-first (TASKLIST_FIRST_ENFORCEMENT=block|warn|off, default warn)
  const taskListFirstResult = checkTaskListFirst(toolName, hookInput);
  if (!taskListFirstResult.pass) {
    return {
      pass: false,
      exitCode: taskListFirstResult.result === 'block' ? 2 : 0,
      message: taskListFirstResult.message,
    };
  }
  if (taskListFirstResult.result === 'warn') {
    console.warn(taskListFirstResult.message);
  }

  // Check 1: Agent Context Pre-Tracker (always passes, sets state)
  const _contextResult = checkAgentContextPreTracker(hookInput);
  // Note: This always passes, just sets mode

  // Check 2: Routing Guard
  const routingResult = checkRoutingGuard(toolName, toolInput);
  if (!routingResult.pass) {
    return {
      pass: false,
      exitCode: routingResult.result === 'block' ? 2 : 0,
      message: routingResult.message,
    };
  }
  // Handle planner/security markers
  if (routingResult.markPlanner) {
    routerState.markPlannerSpawned();
  }
  if (routingResult.markSecurity) {
    routerState.markSecuritySpawned();
  }

  // Check 3: Loop Prevention
  const loopResult = checkLoopPrevention(hookInput);
  if (!loopResult.pass) {
    return {
      pass: false,
      exitCode: loopResult.result === 'block' ? 2 : 0,
      message: loopResult.message,
    };
  }

  // All checks passed
  updateLoopStateAfterAllow(hookInput);
  updateTaskLifecycleStateAfterAllow(hookInput);
  return { pass: true, exitCode: 0 };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow (fail open for missing input)
      process.exit(0);
    }

    const toolName = getToolName(hookInput);

    // Skip if not a Task tool
    if (toolName !== 'Task') {
      process.exit(0);
    }

    const result = runAllChecks(hookInput);

    if (!result.pass) {
      try {
        if (result.exitCode === 2) {
          await eventBus.emit(EventTypes.TOOL_BLOCKED, {
            type: EventTypes.TOOL_BLOCKED,
            timestamp: new Date().toISOString(),
            toolName: 'Task',
            duration: Date.now() - startTime,
            reason: result.message,
          });
        } else {
          await eventBus.emit(EventTypes.TOOL_COMPLETED, {
            type: EventTypes.TOOL_COMPLETED,
            timestamp: new Date().toISOString(),
            toolName: 'Task',
            duration: Date.now() - startTime,
            output: {
              status: 'warn',
              reason: result.message,
            },
          });
        }
      } catch (_err) {
        // Best-effort
      }
      console.log(formatResult(result.exitCode === 2 ? 'block' : 'warn', result.message));
      process.exit(result.exitCode);
    }

    // All checks passed
    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'Task',
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
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'pre-task-unified',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    // SEC-008: Allow debug override for troubleshooting
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      auditLog('pre-task-unified', 'fail_open_override', { error: err.message });
      process.exit(0);
    }

    // Audit log the error
    auditLog('pre-task-unified', 'error_fail_closed', { error: err.message });

    // SEC-008: Fail closed - deny when security state unknown
    process.exit(2);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Main functions
  main,
  runAllChecks,

  // Individual check functions (for testing)
  checkTaskListFirst,
  checkAgentContextPreTracker,
  checkRoutingGuard,
  checkLoopPrevention,

  // Helper functions (for testing)
  isPlannerSpawn,
  isSecuritySpawn,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getLoopState,
  readTaskListLoopState,
  writeTaskListLoopState,
  registerTaskListFirstViolation,
  clearTaskListFirstViolation,
  invalidateCachedState,
  updateLoopStateAfterAllow,

  // Constants
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
};
