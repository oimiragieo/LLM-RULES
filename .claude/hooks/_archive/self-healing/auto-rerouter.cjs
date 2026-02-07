#!/usr/bin/env node
/**
 * auto-rerouter.cjs
 * Hook for automatic rerouting suggestions in the multi-agent framework
 *
 * Rerouting Rules:
 * | Condition               | Action                              | Output                                          |
 * |-------------------------|-------------------------------------|------------------------------------------------|
 * | Agent fails 2+ times    | Suggest alternative agent           | { suggestion: "try developer instead of architect" } |
 * | Skill not found         | Suggest creation via evolution      | { suggestion: "skill not found, consider using evolution" } |
 * | Resource constraint     | Switch to lower-cost model          | { suggestion: "switch to haiku model" } |
 * | Task stuck (>10 min)    | Suggest decomposition               | { suggestion: "decompose task into smaller subtasks" } |
 *
 * Environment Variables:
 *   REROUTER_MODE=suggest (default) - Log suggestions
 *   REROUTER_MODE=off - Disable rerouting
 *
 * State File: .claude/context/self-healing/rerouter-state.json
 *
 * Exit codes:
 *   0 - Always (rerouting is advisory, never blocks)
 */

'use strict';

const fs = require('fs');
const path = require('path');
// SEC-007 FIX: Use safe JSON parsing to prevent prototype pollution
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
// NEW-HIGH-003 FIX: Use atomic writes to prevent state file corruption
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
} = require('../../lib/utils/hook-input.cjs');

// Configurable paths (can be overridden for testing)
let STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'rerouter-state.json'
);

// Thresholds
const AGENT_FAILURE_THRESHOLD = 2;
const TASK_STUCK_MINUTES = 10;
const OPUS_USAGE_THRESHOLD = 8;

/**
 * Agent alternative mappings
 * When an agent fails repeatedly, these are the suggested alternatives
 */
const AGENT_ALTERNATIVES = {
  architect: ['planner', 'developer'],
  developer: ['qa', 'python-pro', 'typescript-pro'],
  qa: ['developer'],
  planner: ['architect', 'developer'],
  'python-pro': ['developer', 'fastapi-pro'],
  'typescript-pro': ['developer', 'frontend-pro'],
  'security-architect': ['architect', 'developer'],
  devops: ['developer', 'devops-troubleshooter'],
  'devops-troubleshooter': ['devops', 'developer'],
};

/**
 * Path setter for testing
 * @param {string} filePath - Path to state file
 */
function setStateFile(filePath) {
  STATE_FILE = filePath;
}

/**
 * Check if rerouting is enabled
 * @returns {boolean}
 */
function isEnabled() {
  const mode = process.env.REROUTER_MODE || 'suggest';
  return mode !== 'off';
}

/**
 * Create default state structure
 * @returns {Object} Default state
 */
function createDefaultState() {
  return {
    agentFailures: {},
    taskStartTimes: {},
    modelUsage: {},
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Load state from file
 * SEC-007 FIX: Use safeParseJSON to prevent prototype pollution attacks
 * @returns {Object} Current state
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      // SEC-007: Use safe JSON parsing with schema validation
      const state = safeParseJSON(content, 'rerouter-state');
      return {
        ...createDefaultState(),
        ...state,
      };
    }
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[auto-rerouter] Error loading state:', e.message);
    }
  }
  return createDefaultState();
}

/**
 * Save state to file
 * NEW-HIGH-003 FIX: Use atomic writes to prevent state file corruption during crashes
 * @param {Object} state - State to save
 */
function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    state.lastUpdated = new Date().toISOString();
    // Use atomic write: writes to temp file, then renames (atomic on POSIX)
    atomicWriteJSONSync(STATE_FILE, state);
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[auto-rerouter] Error saving state:', e.message);
    }
  }
}

// ============================================
// Agent Failure Detection
// ============================================

/**
 * Record an agent failure
 * @param {string} agent - Agent name
 * @param {string} error - Error message
 */
function recordAgentFailure(agent, error) {
  const state = loadState();

  if (!state.agentFailures[agent]) {
    state.agentFailures[agent] = {
      count: 0,
      errors: [],
      lastFailed: null,
    };
  }

  state.agentFailures[agent].count++;
  state.agentFailures[agent].lastFailed = new Date().toISOString();
  state.agentFailures[agent].errors = [
    ...(state.agentFailures[agent].errors || []).slice(-4),
    error,
  ];

  saveState(state);
}

/**
 * Clear agent failures (call after successful task)
 * @param {string} agent - Agent name
 */
function clearAgentFailures(agent) {
  const state = loadState();
  if (state.agentFailures[agent]) {
    delete state.agentFailures[agent];
    saveState(state);
  }
}

/**
 * Check if an agent has repeated failures and suggest alternative
 * @param {string} agent - Agent name
 * @returns {Object} Detection result with suggestion
 */
function checkAgentFailures(agent) {
  const state = loadState();

  const result = {
    type: 'agent_failure',
    detected: false,
    shouldReroute: false,
    suggestion: '',
    agent,
    failureCount: 0,
  };

  if (state.agentFailures[agent]) {
    result.failureCount = state.agentFailures[agent].count;

    if (result.failureCount >= AGENT_FAILURE_THRESHOLD) {
      result.detected = true;
      result.shouldReroute = true;

      const alternatives = AGENT_ALTERNATIVES[agent.toLowerCase()] || ['developer'];
      const alternative = alternatives[0];

      result.suggestion = `try ${alternative} instead of ${agent}`;
      result.alternatives = alternatives;
    }
  }

  return result;
}

// ============================================
// Skill Not Found Detection
// ============================================

/**
 * Detect skill not found from tool error
 * @param {Object} input - Hook input
 * @returns {Object} Detection result
 */
function detectSkillNotFound(input) {
  const result = {
    type: 'skill_not_found',
    detected: false,
    suggestion: '',
    skillName: null,
  };

  const toolName = input.tool_name || input.tool;
  const error = input.error || '';

  if (toolName !== 'Skill') {
    return result;
  }

  if (!error) {
    return result;
  }

  // Pattern: Skill "X" not found
  const match = error.match(/[Ss]kill "([^"]+)" not found/);
  if (match) {
    result.detected = true;
    result.skillName = match[1];
    result.suggestion = `skill "${match[1]}" not found, consider using evolution via skill-creator to create it`;
  }

  return result;
}

// ============================================
// Resource Constraint Detection
// ============================================

/**
 * Record model usage
 * @param {string} model - Model name (opus, sonnet, haiku)
 */
function recordModelUsage(model) {
  const state = loadState();

  if (!state.modelUsage) {
    state.modelUsage = {};
  }

  state.modelUsage[model] = (state.modelUsage[model] || 0) + 1;
  saveState(state);
}

/**
 * Check resource constraints (mainly opus usage)
 * @returns {Object} Detection result
 */
function checkResourceConstraints() {
  const state = loadState();

  const result = {
    type: 'resource_constraint',
    detected: false,
    suggestion: '',
    model: null,
    usage: 0,
  };

  const opusUsage = state.modelUsage?.opus || 0;

  if (opusUsage >= OPUS_USAGE_THRESHOLD) {
    result.detected = true;
    result.model = 'opus';
    result.usage = opusUsage;
    result.suggestion = 'switch to sonnet or haiku model to reduce resource usage';
  }

  return result;
}

// ============================================
// Task Stuck Detection
// ============================================

/**
 * Record task start time
 * @param {string} taskId - Task ID
 * @param {string} timestamp - Optional timestamp (default: now)
 */
function recordTaskStart(taskId, timestamp = null) {
  const state = loadState();

  if (!state.taskStartTimes) {
    state.taskStartTimes = {};
  }

  state.taskStartTimes[taskId] = timestamp || new Date().toISOString();
  saveState(state);
}

/**
 * Clear task start time (call on completion)
 * @param {string} taskId - Task ID
 */
function clearTaskStart(taskId) {
  const state = loadState();

  if (state.taskStartTimes && state.taskStartTimes[taskId]) {
    delete state.taskStartTimes[taskId];
    saveState(state);
  }
}

/**
 * Check if a task is stuck (running > 10 minutes)
 * @param {string} taskId - Task ID
 * @returns {Object} Detection result
 */
function checkTaskStuck(taskId) {
  const state = loadState();

  const result = {
    type: 'task_stuck',
    detected: false,
    suggestion: '',
    taskId,
    durationMinutes: 0,
  };

  const startTime = state.taskStartTimes?.[taskId];
  if (!startTime) {
    return result;
  }

  const startDate = new Date(startTime);
  const now = new Date();
  const durationMs = now.getTime() - startDate.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  result.durationMinutes = Math.round(durationMinutes * 10) / 10;

  if (durationMinutes >= TASK_STUCK_MINUTES) {
    result.detected = true;
    result.suggestion = `decompose task ${taskId} into smaller subtasks (running for ${result.durationMinutes} min)`;
  }

  return result;
}

// ============================================
// Prompt Analysis
// ============================================

/**
 * Extract agent name from prompt
 * @param {string} prompt - Task prompt
 * @returns {string|null} Agent name or null
 */
function extractAgentFromPrompt(prompt) {
  if (!prompt) return null;

  // Pattern: "You are the X agent"
  let match = prompt.match(/You are the (\w+) agent/i);
  if (match) {
    return match[1].toLowerCase();
  }

  // Pattern: "You are AGENT" (all caps)
  match = prompt.match(/You are (\w+)\./i);
  if (match) {
    const agent = match[1].toLowerCase();
    // Check if it's a known agent name
    if (
      AGENT_ALTERNATIVES[agent] ||
      ['developer', 'planner', 'architect', 'qa', 'devops', 'security-architect'].includes(agent)
    ) {
      return agent;
    }
  }

  return null;
}

// ============================================
// Main Analysis
// ============================================

/**
 * Get all suggestions based on hook input
 * @param {Object} input - Hook input
 * @returns {Array} Array of suggestion objects
 */
function getSuggestions(input) {
  const suggestions = [];

  // PERF-006/PERF-007: Use shared hook-input.cjs utilities
  const toolName = getToolName(input);
  const error = input.error;
  const toolInput = getToolInput(input);

  // 1. Check for Skill not found
  if (toolName === 'Skill' && error) {
    const skillResult = detectSkillNotFound(input);
    if (skillResult.detected) {
      suggestions.push(skillResult);
    }
  }

  // 2. Check for Task failures (agent failures)
  if (toolName === 'Task' && error) {
    const prompt = toolInput.prompt || '';
    const agent = extractAgentFromPrompt(prompt);

    if (agent) {
      recordAgentFailure(agent, error);
      const agentResult = checkAgentFailures(agent);
      if (agentResult.shouldReroute) {
        suggestions.push(agentResult);
      }
    }
  }

  // 3. Check resource constraints
  const resourceResult = checkResourceConstraints();
  if (resourceResult.detected) {
    suggestions.push(resourceResult);
  }

  return suggestions;
}

// parseHookInput removed - now using parseHookInputAsync from shared hook-input.cjs
// PERF-006/PERF-007: Eliminated ~40 lines of duplicated parsing code

/**
 * Main execution
 */
async function main() {
  try {
    // Check if enabled
    if (!isEnabled()) {
      process.exit(0);
    }

    // PERF-006/PERF-007: Use shared hook-input.cjs utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    // Get suggestions
    const suggestions = getSuggestions(hookInput);

    // Log suggestions in suggest mode
    const mode = process.env.REROUTER_MODE || 'suggest';
    if (mode === 'suggest' && suggestions.length > 0) {
      for (const suggestion of suggestions) {
        console.log(`[auto-rerouter] ${suggestion.type}: ${suggestion.suggestion}`);
      }
    }

    // Always exit successfully (advisory hook)
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[auto-rerouter] Error:', err.message);
      console.error('Stack:', err.stack);
    }
    // Fail silently
    process.exit(0);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Exports for testing
module.exports = {
  // Path setters
  setStateFile,

  // Core functions
  isEnabled,
  loadState,
  saveState,

  // Agent failure detection
  recordAgentFailure,
  clearAgentFailures,
  checkAgentFailures,

  // Skill not found detection
  detectSkillNotFound,

  // Resource constraint detection
  recordModelUsage,
  checkResourceConstraints,

  // Task stuck detection
  recordTaskStart,
  clearTaskStart,
  checkTaskStuck,

  // Analysis
  extractAgentFromPrompt,
  getSuggestions,

  // Main
  main,

  // Constants
  AGENT_ALTERNATIVES,
  AGENT_FAILURE_THRESHOLD,
  TASK_STUCK_MINUTES,
  OPUS_USAGE_THRESHOLD,
  get STATE_FILE() {
    return STATE_FILE;
  },
  PROJECT_ROOT,
};
