#!/usr/bin/env node
/**
 * Agent Health Tracker
 * ====================
 *
 * Tracks agent spawn success/failure.
 * Isolates agents after 3 consecutive failures.
 * Periodically attempts recovery.
 *
 * Health state transitions:
 *
 * healthy --[1 failure]--> healthy (reset consecutive)
 * healthy --[success]--> healthy
 * healthy --[3 consecutive failures]--> unavailable (isolated)
 * healthy --[success rate < 0.7]--> degraded
 *
 * degraded --[success]--> healthy (if rate >= 0.9)
 * degraded --[3 consecutive failures]--> unavailable
 *
 * unavailable --[recovery window passed]--> degraded (retry)
 * unavailable --[recovery success]--> healthy
 *
 * @module agent-health-tracker
 * @see {@link file://.claude/docs/PHASE_3_IMPLEMENTATION_ARCHITECTURE.md} Design
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Number of consecutive failures before isolation
 * @type {number}
 */
const FAILURE_THRESHOLD = 3;

/**
 * Success rate below which agent is considered degraded
 * @type {number}
 */
const DEGRADED_THRESHOLD = 0.7;

/**
 * Minimum number of operations before success rate degradation check applies
 * This prevents brand new agents from being degraded after just 1-2 failures
 * @type {number}
 */
const MIN_HISTORY_FOR_DEGRADATION = 5;

/**
 * Success rate above which a degraded agent can recover to healthy
 * @type {number}
 */
const RECOVERY_THRESHOLD = 0.9;

/**
 * Time in ms before an isolated agent can attempt recovery (5 minutes)
 * @type {number}
 */
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;

// =============================================================================
// AgentHealthTracker Class
// =============================================================================

/**
 * Tracks agent health and manages state transitions
 */
class AgentHealthTracker {
  /**
   * Create a new AgentHealthTracker
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.registryPath] - Path to agent registry JSON file
   * @param {number} [options.failureThreshold] - Number of failures before isolation
   * @param {number} [options.recoveryWindow] - Time in ms before recovery attempt
   */
  constructor(options = {}) {
    this.registryPath =
      options.registryPath || path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');
    this.failureThreshold = options.failureThreshold || FAILURE_THRESHOLD;
    this.recoveryWindow = options.recoveryWindow || RECOVERY_WINDOW_MS;
  }

  /**
   * Load registry from file
   *
   * @returns {Object} The agent registry
   * @throws {Error} If file doesn't exist or can't be parsed
   */
  loadRegistry() {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(`Registry not found: ${this.registryPath}`);
    }
    const { safeParseJSON } = require('../utils/safe-json.cjs');
    const content = fs.readFileSync(this.registryPath, 'utf-8');
    return safeParseJSON(content, null, null, { agents: {} });
  }

  /**
   * Save registry to file atomically
   *
   * @param {Object} registry - The registry to save
   */
  saveRegistry(registry) {
    atomicWriteJSONSync(this.registryPath, registry);
  }

  /**
   * Record successful spawn/task completion
   *
   * @param {string} agentId - The agent ID
   * @param {number|null} [executionMs] - Execution time in milliseconds
   * @returns {boolean} True if recorded, false if agent not found
   */
  recordSuccess(agentId, executionMs = null) {
    const registry = this.loadRegistry();
    const agent = registry.agents[agentId];

    if (!agent) {
      console.warn(`[agent-health] Agent ${agentId} not found in registry`);
      return false;
    }

    // Update counters
    agent.health.successCount++;
    agent.health.consecutiveFailures = 0;
    agent.health.lastSuccessAt = new Date().toISOString();
    agent.health.lastUpdate = new Date().toISOString();

    // Update execution time (rolling average)
    if (executionMs !== null) {
      const total = agent.health.successCount + agent.health.failureCount;
      const currentAvg = agent.health.averageExecutionMs || 0;
      // Calculate new average (weighted)
      if (total === 1) {
        agent.health.averageExecutionMs = executionMs;
      } else {
        agent.health.averageExecutionMs = (currentAvg * (total - 1) + executionMs) / total;
      }
    }

    // Update success rate
    this.updateSuccessRate(agent);

    // Check for recovery from degraded (if success rate >= 0.9)
    if (agent.health.status === 'degraded' && agent.health.successRate >= RECOVERY_THRESHOLD) {
      agent.health.status = 'healthy';
      agent.health.isolatedAt = null;
      agent.health.isolationReason = null;
    }

    // Update health arrays
    this.updateHealthArrays(registry);
    this.saveRegistry(registry);

    return true;
  }

  /**
   * Record spawn/task failure
   *
   * @param {string} agentId - The agent ID
   * @param {string} [reason] - Failure reason
   * @returns {boolean} True if recorded, false if agent not found
   */
  recordFailure(agentId, reason = 'Unknown failure') {
    const registry = this.loadRegistry();
    const agent = registry.agents[agentId];

    if (!agent) {
      console.warn(`[agent-health] Agent ${agentId} not found in registry`);
      return false;
    }

    // Update counters
    agent.health.failureCount++;
    agent.health.consecutiveFailures++;
    agent.health.lastFailureAt = new Date().toISOString();
    agent.health.lastUpdate = new Date().toISOString();

    // Update success rate
    this.updateSuccessRate(agent);

    // Check for isolation (3 consecutive failures) - takes priority
    if (agent.health.consecutiveFailures >= this.failureThreshold) {
      agent.health.status = 'unavailable';
      agent.health.isolatedAt = new Date().toISOString();
      agent.health.isolationReason = `${this.failureThreshold} consecutive failures: ${reason}`;
    }
    // Check for degradation (success rate < 0.7)
    // Only applies when there's enough history (MIN_HISTORY_FOR_DEGRADATION operations)
    // This prevents brand new agents from being degraded after just 1-2 failures
    else {
      const totalOperations = agent.health.successCount + agent.health.failureCount;
      if (
        totalOperations >= MIN_HISTORY_FOR_DEGRADATION &&
        agent.health.successRate < DEGRADED_THRESHOLD
      ) {
        agent.health.status = 'degraded';
      }
    }

    // Update health arrays
    this.updateHealthArrays(registry);
    this.saveRegistry(registry);

    return true;
  }

  /**
   * Attempt recovery for isolated agents
   *
   * @param {string} agentId - The agent ID
   * @returns {{ success: boolean, reason: string }} Recovery result
   */
  attemptRecovery(agentId) {
    const registry = this.loadRegistry();
    const agent = registry.agents[agentId];

    if (!agent) {
      return { success: false, reason: 'Agent not found' };
    }

    if (agent.health.status !== 'unavailable') {
      return { success: false, reason: 'Agent not isolated' };
    }

    // Check recovery window
    const isolatedAt = new Date(agent.health.isolatedAt);
    const now = new Date();
    const timeSinceIsolation = now - isolatedAt;

    if (timeSinceIsolation < this.recoveryWindow) {
      const remainingMs = this.recoveryWindow - timeSinceIsolation;
      const remainingSecs = Math.ceil(remainingMs / 1000);
      return {
        success: false,
        reason: `Recovery cooldown active (${remainingSecs}s remaining)`,
      };
    }

    // Reset for recovery attempt
    agent.health.consecutiveFailures = 0;
    agent.health.status = 'degraded';
    agent.health.lastUpdate = new Date().toISOString();

    // Keep isolation info for audit trail (don't clear isolatedAt/isolationReason)

    // Update health arrays
    this.updateHealthArrays(registry);
    this.saveRegistry(registry);

    return { success: true, reason: 'Recovery attempted, status set to degraded' };
  }

  /**
   * Get health report for all agents
   *
   * @returns {Object} Health report with summary and agent lists
   */
  getHealthReport() {
    const registry = this.loadRegistry();

    return {
      summary: {
        totalAgents: registry.metadata.totalAgents,
        healthy: registry.health.healthy.length,
        degraded: registry.health.degraded.length,
        unavailable: registry.health.unavailable.length,
        lastCheck: new Date().toISOString(),
      },
      healthy: registry.health.healthy,
      degraded: registry.health.degraded.map(id => ({
        id,
        successRate: registry.agents[id]?.health.successRate,
        consecutiveFailures: registry.agents[id]?.health.consecutiveFailures,
      })),
      unavailable: registry.health.unavailable.map(id => ({
        id,
        isolatedAt: registry.agents[id]?.health.isolatedAt,
        reason: registry.agents[id]?.health.isolationReason,
      })),
    };
  }

  /**
   * Reset agent health to default
   *
   * @param {string} agentId - The agent ID
   * @returns {boolean} True if reset, false if agent not found
   */
  resetHealth(agentId) {
    const registry = this.loadRegistry();
    const agent = registry.agents[agentId];

    if (!agent) {
      return false;
    }

    agent.health = {
      status: 'healthy',
      consecutiveFailures: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 1.0,
      averageExecutionMs: null,
      lastUpdate: new Date().toISOString(),
      isolatedAt: null,
      isolationReason: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    };

    // Update health arrays
    this.updateHealthArrays(registry);
    this.saveRegistry(registry);

    return true;
  }

  /**
   * Update success rate calculation
   *
   * @param {Object} agent - The agent object
   */
  updateSuccessRate(agent) {
    const total = agent.health.successCount + agent.health.failureCount;
    if (total === 0) {
      agent.health.successRate = 1.0;
    } else {
      agent.health.successRate = agent.health.successCount / total;
    }
  }

  /**
   * Update health arrays in registry
   *
   * @param {Object} registry - The registry object
   */
  updateHealthArrays(registry) {
    registry.health.healthy = [];
    registry.health.degraded = [];
    registry.health.unavailable = [];

    for (const [agentId, agent] of Object.entries(registry.agents)) {
      switch (agent.health.status) {
        case 'healthy':
          registry.health.healthy.push(agentId);
          break;
        case 'degraded':
          registry.health.degraded.push(agentId);
          break;
        case 'unavailable':
          registry.health.unavailable.push(agentId);
          break;
      }
    }

    // Update metadata
    registry.metadata.healthyAgents = registry.health.healthy.length;
    registry.metadata.degradedAgents = registry.health.degraded.length;
    registry.metadata.unavailableAgents = registry.health.unavailable.length;
    registry.metadata.lastHealthCheck = new Date().toISOString();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let trackerInstance = null;

/**
 * Get or create singleton tracker instance
 *
 * @param {Object} [options] - Options for new instance
 * @returns {AgentHealthTracker} The tracker instance
 */
function getInstance(options = {}) {
  if (!trackerInstance) {
    trackerInstance = new AgentHealthTracker(options);
  }
  return trackerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
function resetInstance() {
  trackerInstance = null;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  AgentHealthTracker,
  getInstance,
  resetInstance,
  FAILURE_THRESHOLD,
  DEGRADED_THRESHOLD,
  RECOVERY_THRESHOLD,
  RECOVERY_WINDOW_MS,
  MIN_HISTORY_FOR_DEGRADATION,
};
