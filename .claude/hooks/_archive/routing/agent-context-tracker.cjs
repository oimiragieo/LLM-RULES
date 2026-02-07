#!/usr/bin/env node
/**
 * Agent Context Tracker Hook
 *
 * Trigger: PostToolUse (Task)
 *
 * Sets the router state to "agent" mode when a Task tool is used.
 * This indicates that an agent has been spawned and writes should be allowed.
 *
 * Additionally detects and marks special agent spawns:
 * - PLANNER: Detected via subagent_type, description, or prompt patterns
 * - SECURITY-ARCHITECT: Detected via subagent_type, description, or prompt patterns
 *
 * Exit codes:
 * - 0: Always allow (this hook only tracks state)
 */

const routerState = require('./router-state.cjs');

// PERF-006: Use shared hook-input utility instead of duplicated parseHookInput function
const { parseHookInputSync, getToolName, getToolInput } = require('../../lib/utils/hook-input.cjs');

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility
const parseHookInput = parseHookInputSync;

/**
 * Extract task description from tool input
 */
function extractTaskDescription(toolInput) {
  if (!toolInput) return null;

  // Try to get description from various possible fields
  if (toolInput.description) return toolInput.description;
  if (toolInput.prompt) {
    // Extract first line or truncate
    const firstLine = toolInput.prompt.split('\n')[0];
    return firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
  }
  if (toolInput.subagent_type) return `${toolInput.subagent_type} agent`;

  return 'Task spawned';
}

/**
 * Detect if this is a PLANNER agent spawn
 * Detection criteria:
 * - subagent_type contains 'plan'
 * - description contains 'planner' (case-insensitive)
 * - prompt contains 'You are PLANNER' or 'You are the PLANNER'
 */
function isPlannerSpawn(toolInput) {
  if (!toolInput) return false;

  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const prompt = toolInput.prompt || '';

  // Check subagent_type for 'plan'
  if (subagentType.includes('plan')) return true;

  // Check description for 'planner' (case-insensitive)
  if (description.includes('planner')) return true;

  // Check prompt for 'You are PLANNER' or 'You are the PLANNER'
  if (prompt.includes('You are PLANNER') || prompt.includes('You are the PLANNER')) return true;

  return false;
}

/**
 * Detect if this is a SECURITY-ARCHITECT agent spawn
 * Detection criteria:
 * - subagent_type contains 'security'
 * - description contains 'security' (case-insensitive)
 * - prompt contains 'SECURITY-ARCHITECT'
 */
function isSecuritySpawn(toolInput) {
  if (!toolInput) return false;

  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const prompt = toolInput.prompt || '';

  // Check subagent_type for 'security'
  if (subagentType.includes('security')) return true;

  // Check description for 'security' (case-insensitive)
  if (description.includes('security')) return true;

  // Check prompt for 'SECURITY-ARCHITECT'
  if (prompt.includes('SECURITY-ARCHITECT')) return true;

  return false;
}

/**
 * Main execution
 */
function main() {
  const hookInput = parseHookInput();

  // PERF-006: Validate this is a Task tool call using shared helper
  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') {
    // Not a Task tool, skip
    process.exit(0);
  }

  // PERF-006: Get tool input to extract description using shared helper
  const toolInput = getToolInput(hookInput);
  const description = extractTaskDescription(toolInput);

  // Enter agent mode
  const state = routerState.enterAgentMode(description);

  // Detect and mark special agent spawns
  if (isPlannerSpawn(toolInput)) {
    routerState.markPlannerSpawned();
    if (process.env.ROUTER_DEBUG === 'true') {
      console.log('[agent-context-tracker] PLANNER agent detected and marked');
    }
  }

  if (isSecuritySpawn(toolInput)) {
    routerState.markSecuritySpawned();
    if (process.env.ROUTER_DEBUG === 'true') {
      console.log('[agent-context-tracker] SECURITY-ARCHITECT agent detected and marked');
    }
  }

  // Show state change in verbose mode
  if (process.env.ROUTER_DEBUG === 'true') {
    console.log('[agent-context-tracker] Entered agent mode');
    console.log(`[agent-context-tracker] Task: ${description}`);
    console.log(`[agent-context-tracker] Spawned at: ${state.taskSpawnedAt}`);
  }

  // Always allow - this hook only manages state
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main, parseHookInput };
