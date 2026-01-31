#!/usr/bin/env node
/**
 * Agent Health Hook
 * =================
 *
 * Tracks agent spawn success/failure after Task() calls.
 * Integrates with AgentHealthTracker to record health metrics.
 *
 * Hook type: PostToolUse (Task tool)
 * Also provides PreToolUse for blocking unavailable agents.
 *
 * @module agent-health-hook
 * @see {@link file://.claude/lib/tools/agent-health-tracker.cjs} Health tracker
 * @see {@link file://.claude/docs/PHASE_3_IMPLEMENTATION_ARCHITECTURE.md} Design
 */

'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { AgentHealthTracker } = require('../../lib/tools/agent-health-tracker.cjs');

// =============================================================================
// Configuration
// =============================================================================

/**
 * Hook configuration
 */
const hookConfig = {
  name: 'agent-health-hook',
  description: 'Track agent spawn success/failure for health-aware routing',
  triggers: ['Task'],
  phase: 'PostToolUse',
  mode: process.env.AGENT_HEALTH_HOOK || 'enabled',
};

/**
 * Get registry path from environment or default
 */
function getRegistryPath() {
  return (
    process.env.AGENT_REGISTRY_PATH ||
    path.join(PROJECT_ROOT, '.claude/context/agent-registry.json')
  );
}

// =============================================================================
// Agent Extraction
// =============================================================================

/**
 * Extract agent ID from spawn prompt
 *
 * Patterns supported:
 * - "You are DEVELOPER agent"
 * - "You are the PLANNER agent"
 * - "Read: .claude/agents/core/developer.md"
 *
 * @param {string} prompt - The spawn prompt
 * @returns {string|null} The agent ID or null if not found
 */
function extractAgentId(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }

  // Pattern 1: "You are DEVELOPER agent" or "You are the PLANNER agent"
  const pattern1 = /You are (?:the )?([A-Z][A-Z0-9_-]+)(?: agent)?/i;
  const match1 = prompt.match(pattern1);
  if (match1) {
    return match1[1].toLowerCase().replace(/_/g, '-');
  }

  // Pattern 2: "Read: .claude/agents/core/developer.md"
  const pattern2 =
    /\.claude\/agents\/(?:core|specialized|domain|orchestrators)\/([a-z0-9-]+)\.md/i;
  const match2 = prompt.match(pattern2);
  if (match2) {
    return match2[1].toLowerCase();
  }

  return null;
}

/**
 * Extract agent ID from Task tool input
 *
 * @param {Object} toolInput - The tool input
 * @returns {string|null} The agent ID or null if not found
 */
function extractAgentFromInput(toolInput) {
  if (!toolInput) {
    return null;
  }

  // Check prompt first
  if (toolInput.prompt) {
    const fromPrompt = extractAgentId(toolInput.prompt);
    if (fromPrompt) return fromPrompt;
  }

  // Check description field
  if (toolInput.description) {
    const descLower = toolInput.description.toLowerCase();

    // Common patterns in description
    const agentPatterns = [
      /^(developer|planner|architect|qa|security-architect|security|devops|code-reviewer|frontend-pro|frontend|researcher)\b/,
      /(developer|planner|architect|qa|security|devops|reviewer|frontend)\s+(implementing|designing|reviewing|testing|deploying|researching)/i,
    ];

    for (const pattern of agentPatterns) {
      const match = descLower.match(pattern);
      if (match) return match[1].toLowerCase().replace(/_/g, '-');
    }
  }

  return null;
}

// =============================================================================
// Hook Functions
// =============================================================================

/**
 * PostToolUse hook - records success/failure after Task completes
 *
 * @param {Object} context - The hook context
 * @param {string} context.toolName - Name of the tool
 * @param {Object} context.toolInput - Tool input
 * @param {Object} context.toolResult - Tool result
 * @param {number} [context.startTime] - When the task started
 * @returns {Promise<{decision: string}>} Hook decision
 */
async function postToolUse(context) {
  // Skip if disabled
  if (hookConfig.mode === 'off' || hookConfig.mode === 'disabled') {
    return { decision: 'allow' };
  }

  const { toolName, toolInput, toolResult } = context;

  // Only process Task tool
  if (toolName !== 'Task') {
    return { decision: 'allow' };
  }

  // Handle missing input or result
  if (!toolInput || !toolResult) {
    return { decision: 'allow' };
  }

  // Extract agent ID
  const agentId = extractAgentFromInput(toolInput);
  if (!agentId) {
    // Can't track if we don't know the agent
    return { decision: 'allow' };
  }

  try {
    const tracker = new AgentHealthTracker({ registryPath: getRegistryPath() });
    const startTime = context.startTime || Date.now();
    const executionMs = Date.now() - startTime;

    // Determine success/failure from result
    const isError = toolResult.error || toolResult.status === 'error';
    if (isError) {
      const reason = toolResult.error?.message || toolResult.message || 'Task spawn failed';
      tracker.recordFailure(agentId, reason);
    } else {
      tracker.recordSuccess(agentId, executionMs);
    }
  } catch (err) {
    // Don't fail the hook if health tracking fails
    if (process.env.DEBUG_HEALTH_HOOK) {
      console.error(`[agent-health-hook] Error: ${err.message}`);
    }
  }

  return { decision: 'allow' };
}

/**
 * PreToolUse hook - blocks unavailable agents, attempts recovery
 *
 * @param {Object} context - The hook context
 * @param {string} context.toolName - Name of the tool
 * @param {Object} context.toolInput - Tool input
 * @returns {Promise<{decision: string, message?: string, suggestion?: string}>} Hook decision
 */
async function preToolUse(context) {
  const { toolName, toolInput } = context;

  // Only process Task tool
  if (toolName !== 'Task') {
    return { decision: 'allow' };
  }

  // Handle missing input
  if (!toolInput) {
    return { decision: 'allow' };
  }

  // Extract agent ID
  const agentId = extractAgentFromInput(toolInput);
  if (!agentId) {
    return { decision: 'allow' };
  }

  try {
    const tracker = new AgentHealthTracker({ registryPath: getRegistryPath() });
    const registry = tracker.loadRegistry();
    const agent = registry.agents[agentId];

    if (!agent) {
      // Unknown agent - allow spawn (may be new agent)
      return { decision: 'allow' };
    }

    // Block unavailable agents (unless recovery possible)
    if (agent.health.status === 'unavailable') {
      const recovery = tracker.attemptRecovery(agentId);

      if (!recovery.success) {
        return {
          decision: 'block',
          message: `Agent ${agentId} is currently unavailable: ${agent.health.isolationReason}. ${recovery.reason}`,
          suggestion: `Try alternative agents with similar capabilities.`,
        };
      }
      // Recovery succeeded - agent is now degraded, allow spawn
    }

    // Warn for degraded agents but allow spawn
    if (agent.health.status === 'degraded') {
      if (process.env.DEBUG_HEALTH_HOOK) {
        console.warn(
          `[agent-health] Agent ${agentId} is degraded (success rate: ${(agent.health.successRate * 100).toFixed(1)}%)`
        );
      }
    }

    return { decision: 'allow' };
  } catch (err) {
    // Don't fail the hook if health check fails
    if (process.env.DEBUG_HEALTH_HOOK) {
      console.error(`[agent-health-hook] Error: ${err.message}`);
    }
    return { decision: 'allow' };
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  name: hookConfig.name,
  description: hookConfig.description,
  postToolUse,
  preToolUse,
  extractAgentId,
  extractAgentFromInput,
};
