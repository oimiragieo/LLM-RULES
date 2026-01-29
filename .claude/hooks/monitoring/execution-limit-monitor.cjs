#!/usr/bin/env node
/**
 * Execution Limit Monitor Hook (P1-8.2)
 * ======================================
 *
 * Monitors agent execution limits to prevent runaway agents, control costs, and enable graceful termination.
 *
 * Features:
 * - Turn counting (max_turns) - prevents infinite loops
 * - Duration tracking (max_duration_ms) - prevents hung agents
 * - Cost estimation (max_cost_usd) - controls LLM costs
 * - Configurable timeout actions (warn/terminate/pause)
 * - Warning events at 80% threshold
 * - Exceeded events at 100% threshold
 *
 * Events Emitted:
 * - AGENT_LIMIT_WARNING (at 80% of limit)
 * - AGENT_LIMIT_EXCEEDED (at 100% of limit)
 *
 * Usage:
 *   const monitor = require('.claude/hooks/monitoring/execution-limit-monitor.cjs');
 *   monitor.startMonitoring('agent-123', { max_turns: 25, max_duration_ms: 600000, max_cost_usd: 1.0, timeout_action: 'terminate' });
 *   monitor.recordTurn('agent-123', { cost: 0.15 });
 *   const status = monitor.getStatus('agent-123');
 *   monitor.stopMonitoring('agent-123');
 *
 * @module execution-limit-monitor
 */

'use strict';

// Event Bus integration (P1-6.4)
let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  // Graceful degradation: EventBus unavailable, continue without events
  eventBus = null;
}

/**
 * Execution state tracker for each agent
 * @typedef {Object} ExecutionState
 * @property {number} turns - Current turn count
 * @property {number} startTime - Start timestamp (ms)
 * @property {number} cost - Accumulated cost (USD)
 * @property {Object} limits - Agent execution limits
 * @property {Set<string>} warnings - Set of warning types already emitted (prevents duplicates)
 */

/**
 * Active agent monitoring state (keyed by agentId)
 * @type {Map<string, ExecutionState>}
 */
const agents = new Map();

/**
 * Start monitoring an agent's execution limits
 * @param {string} agentId - Agent identifier
 * @param {Object} limits - Execution limits configuration
 * @param {number} [limits.max_turns] - Max tool call iterations
 * @param {number} [limits.max_duration_ms] - Max execution time in ms
 * @param {number} [limits.max_cost_usd] - Max cost in USD
 * @param {string} [limits.timeout_action='terminate'] - Action on timeout (warn|terminate|pause)
 */
function startMonitoring(agentId, limits = {}) {
  agents.set(agentId, {
    turns: 0,
    startTime: Date.now(),
    cost: 0,
    limits: {
      max_turns: limits.max_turns || Infinity,
      max_duration_ms: limits.max_duration_ms || Infinity,
      max_cost_usd: limits.max_cost_usd || Infinity,
      timeout_action: limits.timeout_action || 'terminate',
    },
    warnings: new Set(),
  });
}

/**
 * Record a tool call turn and check limits
 * @param {string} agentId - Agent identifier
 * @param {Object} [metadata] - Turn metadata
 * @param {number} [metadata.cost] - Cost of this turn in USD
 */
function recordTurn(agentId, metadata = {}) {
  const state = agents.get(agentId);
  if (!state) {
    // Agent not being monitored
    return;
  }

  // Increment turn count
  state.turns += 1;

  // Accumulate cost if provided
  if (typeof metadata.cost === 'number') {
    state.cost += metadata.cost;
  }

  // Check all limits
  checkLimits(agentId, state);
}

/**
 * Check if any limits are approaching or exceeded
 * @param {string} agentId - Agent identifier
 * @param {ExecutionState} state - Current execution state
 */
function checkLimits(agentId, state) {
  const elapsed = Date.now() - state.startTime;

  // Check turn limit
  if (state.limits.max_turns !== Infinity) {
    checkLimit(
      agentId,
      'max_turns',
      state.turns,
      state.limits.max_turns,
      state.limits.timeout_action,
      state.warnings
    );
  }

  // Check duration limit
  if (state.limits.max_duration_ms !== Infinity) {
    checkLimit(
      agentId,
      'max_duration_ms',
      elapsed,
      state.limits.max_duration_ms,
      state.limits.timeout_action,
      state.warnings
    );
  }

  // Check cost limit
  if (state.limits.max_cost_usd !== Infinity) {
    checkLimit(
      agentId,
      'max_cost_usd',
      state.cost,
      state.limits.max_cost_usd,
      state.limits.timeout_action,
      state.warnings
    );
  }
}

/**
 * Check a specific limit and emit events if needed
 * @param {string} agentId - Agent identifier
 * @param {string} limitType - Type of limit (max_turns, max_duration_ms, max_cost_usd)
 * @param {number} current - Current value
 * @param {number} max - Maximum value
 * @param {string} timeoutAction - Action to take on timeout
 * @param {Set<string>} warnings - Set of warnings already emitted
 */
function checkLimit(agentId, limitType, current, max, timeoutAction, warnings) {
  const percentage = (current / max) * 100;

  // Emit warning at 80% threshold (once per limit type)
  if (percentage >= 80 && percentage < 100 && !warnings.has(`${limitType}_warning`)) {
    warnings.add(`${limitType}_warning`);
    emitWarning(agentId, limitType, current, max);
  }

  // Emit exceeded at 100% threshold (once per limit type)
  if (percentage >= 100 && !warnings.has(`${limitType}_exceeded`)) {
    warnings.add(`${limitType}_exceeded`);
    emitExceeded(agentId, limitType, current, max, timeoutAction);

    // Execute timeout action
    executeTimeoutAction(agentId, limitType, timeoutAction);
  }
}

/**
 * Emit warning event
 * @param {string} agentId - Agent identifier
 * @param {string} limitType - Type of limit
 * @param {number} current - Current value
 * @param {number} max - Maximum value
 */
function emitWarning(agentId, limitType, current, max) {
  if (!eventBus) return;

  const payload = {
    type: 'AGENT_LIMIT_WARNING',
    agentId,
    limitType,
    current,
    max,
    percentage: ((current / max) * 100).toFixed(1),
    timestamp: new Date().toISOString(),
  };

  eventBus.emit('AGENT_LIMIT_WARNING', payload);
}

/**
 * Emit exceeded event
 * @param {string} agentId - Agent identifier
 * @param {string} limitType - Type of limit
 * @param {number} current - Current value
 * @param {number} max - Maximum value
 * @param {string} action - Timeout action
 */
function emitExceeded(agentId, limitType, current, max, action) {
  if (!eventBus) return;

  const payload = {
    type: 'AGENT_LIMIT_EXCEEDED',
    agentId,
    limitType,
    current,
    max,
    action,
    timestamp: new Date().toISOString(),
  };

  eventBus.emit('AGENT_LIMIT_EXCEEDED', payload);
}

/**
 * Execute timeout action
 * @param {string} agentId - Agent identifier
 * @param {string} limitType - Type of limit that was exceeded
 * @param {string} action - Timeout action (warn|terminate|pause)
 */
function executeTimeoutAction(agentId, limitType, action) {
  switch (action) {
    case 'warn':
      // Log warning but continue execution
      console.warn(
        `[execution-limit-monitor] Agent ${agentId} exceeded ${limitType} (action: warn)`
      );
      break;

    case 'terminate':
      // Log error (actual termination would be handled by caller)
      console.error(`[execution-limit-monitor] Agent ${agentId} terminated: ${limitType} exceeded`);
      break;

    case 'pause':
      // Log pause (actual pause would be handled by caller)
      console.warn(
        `[execution-limit-monitor] Agent ${agentId} paused: ${limitType} exceeded (manual resume required)`
      );
      break;

    default:
      console.warn(`[execution-limit-monitor] Unknown timeout action: ${action}`);
  }
}

/**
 * Get current execution status for an agent
 * @param {string} agentId - Agent identifier
 * @returns {Object} Current execution status
 */
function getStatus(agentId) {
  const state = agents.get(agentId);
  if (!state) {
    return { turns: 0, elapsed: 0, cost: 0 };
  }

  return {
    turns: state.turns,
    elapsed: Date.now() - state.startTime,
    cost: state.cost,
    limits: state.limits,
  };
}

/**
 * Stop monitoring an agent and clean up resources
 * @param {string} agentId - Agent identifier
 */
function stopMonitoring(agentId) {
  agents.delete(agentId);
}

/**
 * Get all active agent IDs being monitored
 * @returns {string[]} Array of agent IDs
 */
function getActiveAgents() {
  return Array.from(agents.keys());
}

/**
 * Clear all monitoring state (for testing)
 */
function clearAll() {
  agents.clear();
}

// Export public API
module.exports = {
  startMonitoring,
  recordTurn,
  getStatus,
  stopMonitoring,
  getActiveAgents,
  clearAll,
};
