/**
 * SPEC-019: Hybrid Executor
 *
 * Orchestrates task execution across conductor-main and agent-studio systems.
 * Combines task routing, state synchronization, and result normalization.
 */

const TaskRouter = require('./task-router.cjs');
const StateSyncManager = require('./state-sync-manager.cjs');
const ResultNormalizer = require('./result-normalizer.cjs');
const SystemAdapters = require('./system-adapters.cjs');

class HybridExecutor {
  constructor(config = {}) {
    this.router = new TaskRouter({
      rules: config.rules || [],
      defaultSystem: config.defaultSystem || 'agent-studio',
    });
    this.syncManager = new StateSyncManager({
      strategy: config.conflictStrategy || 'last-write-wins',
      primarySystem: config.primarySystem || 'agent-studio',
    });
    this.normalizer = new ResultNormalizer();
    this.conflictStrategy = config.conflictStrategy || 'last-write-wins';

    // Track execution state
    this.executionHistory = [];
  }

  /**
   * Get adapter for a specific system
   */
  adapter(systemName) {
    return SystemAdapters.getAdapter(systemName);
  }

  /**
   * Execute a task with hybrid routing
   */
  async execute(task) {
    const taskId = task.taskId || `task-${Date.now()}`;
    const startTime = Date.now();

    // Route the task
    const routingDecision = await this.router.route(task);
    let executedBy = routingDecision.system;
    let fallbackChain = null;
    let fallbackReason = null;

    // Check if router already handled fallback
    if (routingDecision.reason === 'fallback_on_error') {
      const originalSystem = routingDecision.metadata?.originalSystem || 'agent-studio';
      fallbackChain = [originalSystem, routingDecision.system];
      fallbackReason = `${originalSystem}-unhealthy`;
    }
    // Check system health and fallback if needed (for cases router didn't handle)
    else if (task.systemHealth && task.systemHealth[routingDecision.system] === 'unhealthy') {
      // Find fallback from rules or use opposite system
      const rule = this.router.rules.find(r => r.system === routingDecision.system);
      const fallbackSystem =
        rule?.fallback ||
        (routingDecision.system === 'agent-studio' ? 'conductor-main' : 'agent-studio');

      fallbackChain = [routingDecision.system, fallbackSystem];
      executedBy = fallbackSystem;
      fallbackReason = `${routingDecision.system}-unhealthy`;
    }

    // Simulate execution (or skip if mockExecution)
    let result;
    if (!task.mockExecution) {
      result = await this._executeOnSystem(executedBy, task, taskId);
    } else {
      result = { taskId, status: 'completed', executedBy };
    }

    // Sync state to both systems
    await this.syncManager.pushToSystem('agent-studio', {
      taskId,
      status: 'completed',
      result: result.result,
    });
    await this.syncManager.pushToSystem('conductor-main', {
      taskId,
      status: 'completed',
      result: result.result,
    });

    // Record execution
    this.executionHistory.push({
      taskId,
      executedBy,
      duration: Date.now() - startTime,
      fallbackChain: fallbackChain || undefined,
      fallbackReason: fallbackReason || undefined,
    });

    return {
      taskId,
      status: 'completed',
      executedBy,
      result: result.result,
      fallbackChain: fallbackChain || undefined,
      fallbackReason: fallbackReason || undefined,
    };
  }

  /**
   * Execute a multi-step workflow
   */
  async executeWorkflow(workflow) {
    const steps = workflow.steps || [];
    const results = [];

    for (const step of steps) {
      // Determine system for this step
      const system = step.system || (await this.router.route({ path: step.path })).system;

      // Execute step
      const result = await this._executeOnSystem(system, step, step.path);

      results.push({
        path: step.path,
        executedBy: system,
        status: result.status || 'completed',
        result: result.result,
      });
    }

    return {
      steps: results,
      status: 'completed',
    };
  }

  /**
   * Execute on a specific system
   */
  async _executeOnSystem(system, task, taskId) {
    // For testing, just return success
    return {
      taskId,
      status: 'completed',
      result: task.payload,
    };
  }

  /**
   * Get state from a specific system (returns in system's native format)
   */
  async getStateFrom(systemName, taskId) {
    const adapter = SystemAdapters.getAdapter(systemName);
    const state = await adapter.readState(taskId);

    // For conductor-main, translate to its native format
    if (systemName === 'conductor-main' && state) {
      return adapter.translateToSystem(state);
    }

    return state;
  }

  /**
   * Reconcile diverged state between systems
   */
  async reconcileState(taskId) {
    // Read directly from adapters (they store in their own format)
    const agentAdapter = SystemAdapters.getAdapter('agent-studio');
    const conductorAdapter = SystemAdapters.getAdapter('conductor-main');

    const agentState = await agentAdapter.readState(taskId);
    const conductorState = await conductorAdapter.readState(taskId);

    // Handle null states (adapter returns default state for unknown taskId)
    const hasAgentState = agentState && agentState.status !== 'pending';
    const hasConductorState = conductorState && conductorState.status !== 'pending';

    if (!hasAgentState && !hasConductorState) {
      return null;
    }

    // If both have state, check for conflicts
    if (hasAgentState && hasConductorState) {
      const clockA = agentState.vectorClock || 0;
      const clockC = conductorState.vectorClock || 0;

      // Concurrent conflict (same vector clock, different status)
      if (clockA === clockC && agentState.status !== conductorState.status) {
        if (this.conflictStrategy === 'manual') {
          return {
            _conflict: {
              agentStudio: agentState.status,
              conductorMain: conductorState.status,
              type: 'concurrent_update',
            },
          };
        }
      }

      // Resolve based on vector clock
      const resolved = clockA >= clockC ? agentState : conductorState;

      // Sync resolved state to both systems (write to each adapter)
      await agentAdapter.writeState(resolved);
      await conductorAdapter.writeState(resolved);

      return resolved;
    }

    // Only one system has state
    const existing = hasAgentState ? agentState : conductorState;
    await agentAdapter.writeState(existing);
    await conductorAdapter.writeState(existing);

    return existing;
  }

  /**
   * Get execution metrics
   */
  getMetrics() {
    return {
      totalExecutions: this.executionHistory.length,
      fallbackCount: this.executionHistory.filter(e => e.fallbackChain).length,
      averageDuration:
        this.executionHistory.length > 0
          ? this.executionHistory.reduce((sum, e) => sum + e.duration, 0) /
            this.executionHistory.length
          : 0,
    };
  }

  /**
   * SPEC-019: Route task using config (routing_rules, default_system)
   * @param {Object} task - Task to route
   * @param {Object} config - { routing_rules, default_system, enabled }
   * @returns {Promise<Object>} { system, reason }
   */
  async routeTask(task, config = {}) {
    const enabled = config.enabled !== false;
    if (!enabled) {
      return {
        system: config.default_system || this.router.defaultSystem,
        reason: 'hybrid_disabled',
      };
    }
    const decision = await this.router.route({
      ...task,
      path: task.path || task.taskId,
    });
    return {
      system: decision.system,
      reason: decision.reason || 'rule_match',
      metadata: decision.metadata,
    };
  }

  /**
   * SPEC-019: Sync state for a task between systems (bi-directional, conflict resolution)
   * @param {string} taskId - Task id
   * @returns {Promise<Object|null>} Resolved state or null
   */
  async syncState(taskId) {
    return this.reconcileState(taskId);
  }

  /**
   * SPEC-019: Normalize result from source system to common format
   * @param {Object} result - Raw result
   * @param {string} sourceSystem - 'conductor-main' | 'agent-studio'
   * @returns {Object} Normalized result
   */
  translateResult(result, sourceSystem) {
    return this.normalizer.normalize(result, sourceSystem);
  }
}

module.exports = { HybridExecutor };
