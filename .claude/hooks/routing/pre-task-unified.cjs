#!/usr/bin/env node
/**
 * Pre-Task Unified Hook
 * =====================
 *
 * Consolidates 4 PreToolUse(Task) hooks into a single guard:
 *
 * | Original Hook                    | Check                                    |
 * |----------------------------------|------------------------------------------|
 * | agent-context-pre-tracker.cjs    | Sets mode='agent' before task starts     |
 * | routing-guard.cjs                | Planner-first, security review, self-check|
 * | documentation-routing-guard.cjs  | Routes docs to technical-writer          |
 * | loop-prevention.cjs              | Prevents runaway loops                   |
 *
 * Trigger: PreToolUse(Task)
 *
 * ENFORCEMENT MODES:
 * - ROUTER_SELF_CHECK=block|warn|off (default: block)
 * - PLANNER_FIRST_ENFORCEMENT=block|warn|off (default: block)
 * - SECURITY_REVIEW_ENFORCEMENT=block|warn|off (default: block)
 * - DOCUMENTATION_ROUTING_GUARD=block|warn|off (default: block)
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

// Shared utilities
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const routerState = require('./router-state.cjs');
const loopStateManager = require('../../lib/self-healing/loop-state-manager.cjs');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Loop state file path
 */
const LOOP_STATE_FILE = loopStateManager.LOOP_STATE_FILE;

/**
 * Default loop prevention limits
 */
const DEFAULT_EVOLUTION_BUDGET = 3;
const DEFAULT_COOLDOWN_MS = 300000; // 5 minutes
const DEFAULT_DEPTH_LIMIT = 5;
const DEFAULT_PATTERN_THRESHOLD = 3;

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
 * Documentation-related keywords (high confidence)
 */
const DOC_KEYWORDS_HIGH = [
  'documentation',
  'document this',
  'write docs',
  'update docs',
  'create docs',
  'readme',
  'user guide',
  'api doc',
  'technical writing',
  'write guide',
  'how-to guide',
  'reference doc',
];

/**
 * Documentation-related keywords (medium confidence)
 */
const DOC_KEYWORDS_MEDIUM = [
  'document',
  'docs',
  'tutorial',
  'explain',
  'describe',
  'guide',
  'manual',
  'howto',
  'how-to',
];

/**
 * Patterns that indicate technical-writer agent spawn
 */
const TECH_WRITER_PATTERNS = {
  prompt: [
    'you are technical-writer',
    'you are the technical-writer',
    'as technical-writer',
    'you are tech-writer',
    'technical writer agent',
  ],
  description: ['technical-writer', 'tech-writer', 'documentation', 'writing docs'],
};

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
 * Check if the Task being spawned is a technical-writer agent
 */
function isTechWriterSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  for (const pattern of TECH_WRITER_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  for (const pattern of TECH_WRITER_PATTERNS.description) {
    if (description.includes(pattern)) return true;
  }
  return false;
}

/**
 * Detect documentation intent in text
 */
function detectDocumentationIntent(text) {
  const textLower = text.toLowerCase();
  const matchedKeywords = [];

  // Check high-confidence keywords
  for (const keyword of DOC_KEYWORDS_HIGH) {
    if (textLower.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length > 0) {
    return { isDocTask: true, confidence: 'high', matchedKeywords };
  }

  // Check medium-confidence keywords
  for (const keyword of DOC_KEYWORDS_MEDIUM) {
    if (textLower.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  if (
    matchedKeywords.length >= 2 ||
    (matchedKeywords.length >= 1 && (textLower.includes('write') || textLower.includes('create')))
  ) {
    return { isDocTask: true, confidence: 'medium', matchedKeywords };
  }

  return { isDocTask: false, confidence: 'low', matchedKeywords };
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
 * Extract agent type from prompt/description
 */
function extractAgentType(prompt, description) {
  const combined = `${prompt} ${description}`.toLowerCase();

  const agentTypes = [
    'developer',
    'planner',
    'architect',
    'qa',
    'security-architect',
    'devops',
    'technical-writer',
    'evolution-orchestrator',
    'reflection-agent',
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
// TASKLIST_FIRST_ENFORCEMENT=block|warn|off (default: block)

/**
 * Enforce TaskList() before Task() in the same session (since last UserPromptSubmit).
 * @param {string} toolName - Tool being used
 * @returns {{ pass: boolean, result?: 'block'|'warn', message?: string }}
 */
function checkTaskListFirst(toolName) {
  if (toolName !== 'Task') {
    return { pass: true };
  }
  const mode = (process.env.TASKLIST_FIRST_ENFORCEMENT || 'block').toLowerCase();
  if (mode === 'off') {
    return { pass: true };
  }
  if (routerState.isTaskListCalledSincePrompt()) {
    return { pass: true };
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
Spawn PLANNER first: Task({ description: 'Planner designing...', prompt: 'You are PLANNER...' })`;

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
// CHECK 3: Documentation Routing Guard (from documentation-routing-guard.cjs)
// =============================================================================

/**
 * Ensures documentation requests are routed to technical-writer agent.
 *
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkDocumentationRouting(toolInput) {
  const enforcement = getEnforcementMode('DOCUMENTATION_ROUTING_GUARD', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';
  const combinedText = `${prompt} ${description}`;

  const detection = detectDocumentationIntent(combinedText);

  if (!detection.isDocTask) {
    return { pass: true };
  }

  // This is a documentation task - check if technical-writer is being spawned
  if (isTechWriterSpawn(toolInput)) {
    return { pass: true };
  }

  // Documentation task but NOT spawning technical-writer
  const message = `[DOCUMENTATION ROUTING VIOLATION] Documentation task detected (${detection.confidence} confidence).
Keywords matched: ${detection.matchedKeywords.join(', ')}

Documentation tasks should be routed to technical-writer agent:
  Task({ subagent_type: 'general-purpose', description: 'Technical writer creating docs...',
         prompt: 'You are TECHNICAL-WRITER...' })`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    console.warn(message);
    return { pass: true, result: 'warn', message };
  }
}

// =============================================================================
// CHECK 4: Loop Prevention (from loop-prevention.cjs)
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
  const agentType = extractAgentType(prompt, description);
  const spawnAction = `spawn:${agentType}`;
  const threshold = getPatternThreshold();

  const entry = loopState.actionHistory?.find(a => a.action === spawnAction);
  const count = entry ? entry.count : 0;

  if (count >= threshold) {
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

    const agentType = extractAgentType(prompt, description);
    loopStateManager.recordSpawn(agentType);

    if (isEvolutionTrigger(prompt)) {
      const evolutionType = detectEvolutionType(prompt) || 'unknown';
      loopStateManager.recordEvolution(evolutionType);
    }
  } catch (err) {
    auditLog('pre-task-unified', 'loop_state_update_failed', { error: err.message });
  }
}

// =============================================================================
// COMBINED CHECK
// =============================================================================

/**
 * Run all 4 checks in order.
 *
 * Order:
 * 0. TaskList-first: TaskList() must be called before Task() in same session
 * 1. Agent Context Pre-Tracker (always passes, sets state)
 * 2. Routing Guard (planner-first, security review)
 * 3. Documentation Routing Guard
 * 4. Loop Prevention
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

  // Check 0: TaskList-first (TASKLIST_FIRST_ENFORCEMENT=block|warn|off, default block)
  const taskListFirstResult = checkTaskListFirst(toolName);
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

  // Check 3: Documentation Routing Guard
  const docResult = checkDocumentationRouting(toolInput);
  if (!docResult.pass) {
    return {
      pass: false,
      exitCode: docResult.result === 'block' ? 2 : 0,
      message: docResult.message,
    };
  }

  // Check 4: Loop Prevention
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
  return { pass: true, exitCode: 0 };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main execution function
 */
async function main() {
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
      console.log(formatResult(result.exitCode === 2 ? 'block' : 'warn', result.message));
      process.exit(result.exitCode);
    }

    // All checks passed
    process.exit(0);
  } catch (err) {
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
  checkDocumentationRouting,
  checkLoopPrevention,

  // Helper functions (for testing)
  isPlannerSpawn,
  isSecuritySpawn,
  isImplementationAgentSpawn,
  isTechWriterSpawn,
  detectDocumentationIntent,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getLoopState,
  invalidateCachedState,
  updateLoopStateAfterAllow,

  // Constants
  DOC_KEYWORDS_HIGH,
  DOC_KEYWORDS_MEDIUM,
  TECH_WRITER_PATTERNS,
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
};
