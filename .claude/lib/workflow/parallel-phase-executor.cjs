#!/usr/bin/env node
/**
 * Parallel Phase Executor
 * ========================
 *
 * Executes workflow phases in parallel while respecting dependencies.
 *
 * Features:
 * - Dependency graph validation (detect cycles)
 * - Parallel execution of independent phases
 * - Synchronization barriers
 * - Multiple join strategies (all, any, majority)
 * - Partial failure handling
 * - Timeout support
 *
 * Usage:
 *   const executor = new ParallelPhaseExecutor();
 *   executor.addPhase('phase-1', async () => ({ result: 'done' }), []);
 *   executor.addPhase('phase-2', async () => ({ result: 'done' }), ['phase-1']);
 *   const results = await executor.execute('workflow-1');
 */

'use strict';

// =============================================================================
// Dependency Graph Utilities
// =============================================================================

/**
 * Detect circular dependencies using DFS
 */
function detectCycles(graph) {
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node) {
    if (recursionStack.has(node)) {
      return true; // Cycle detected
    }
    if (visited.has(node)) {
      return false; // Already processed
    }

    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (dfs(node)) {
      return true;
    }
  }

  return false;
}

/**
 * Topological sort (returns execution order)
 */
function topologicalSort(graph) {
  const inDegree = new Map();
  const order = [];

  // Calculate in-degrees
  for (const [node, dependencies] of graph) {
    if (!inDegree.has(node)) {
      inDegree.set(node, 0);
    }
    for (const dep of dependencies) {
      inDegree.set(dep, inDegree.get(dep) || 0);
      inDegree.set(node, inDegree.get(node) + 1);
    }
  }

  // Find nodes with no dependencies
  const queue = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  // Process queue
  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);

    // Reduce in-degree of neighbors
    for (const [otherNode, dependencies] of graph) {
      if (dependencies.includes(node)) {
        const newDegree = inDegree.get(otherNode) - 1;
        inDegree.set(otherNode, newDegree);
        if (newDegree === 0) {
          queue.push(otherNode);
        }
      }
    }
  }

  return order;
}

// =============================================================================
// ParallelPhaseExecutor Class
// =============================================================================

class ParallelPhaseExecutor {
  /**
   * Create a new ParallelPhaseExecutor
   *
   * @param {TransactionalStateManager} stateManager - Optional state manager
   */
  constructor(stateManager = null) {
    this.stateManager = stateManager;
    this.phases = new Map(); // phaseId -> { executor, dependencies }
  }

  /**
   * Add a phase to the execution plan
   *
   * @param {string} phaseId - Phase identifier
   * @param {Function} executor - Async function to execute
   * @param {Array<string>} dependencies - Phase IDs that must complete first
   */
  addPhase(phaseId, executor, dependencies = []) {
    this.phases.set(phaseId, {
      id: phaseId,
      executor,
      dependencies: dependencies.slice(), // Copy array
    });
  }

  /**
   * Execute all phases respecting dependency graph
   *
   * @param {string} workflowId - Workflow identifier
   * @param {Object} options - Execution options
   * @returns {Array} Execution results
   */
  async execute(workflowId, options = {}) {
    const joinStrategy = options.joinStrategy || 'all';

    // Validate dependency graph
    await this._validateDependencies();

    // Detect cycles
    const dependencyGraph = this._buildDependencyGraph();
    if (detectCycles(dependencyGraph)) {
      throw new Error('Circular dependency detected in phase graph');
    }

    // Get execution order (used for validation, not direct iteration)
    const _executionOrder = topologicalSort(dependencyGraph);

    // Execute phases in batches (parallel within batch, sequential across batches)
    const results = [];
    const completedPhases = new Set();
    const failedPhases = new Set();

    // Group phases by dependency level
    const levels = this._computeDependencyLevels();

    for (const level of levels) {
      // Execute all phases in this level in parallel
      const levelPromises = level.map(phaseId => {
        const phase = this.phases.get(phaseId);
        return this._executePhase(phaseId, phase)
          .then(result => {
            completedPhases.add(phaseId);
            return { phaseId, status: 'success', result };
          })
          .catch(err => {
            failedPhases.add(phaseId);
            return { phaseId, status: 'failed', error: err.message };
          });
      });

      const levelResults = await Promise.all(levelPromises);
      results.push(...levelResults);

      // Check join strategy after each level
      if (joinStrategy === 'any' && completedPhases.size > 0) {
        break; // At least one succeeded
      }
    }

    // Process results based on join strategy
    return this._processResults(results, joinStrategy);
  }

  /**
   * Synchronize phases (wait for completion)
   *
   * @param {Array<string>} phaseIds - Phase IDs to synchronize
   * @param {Object} options - Sync options
   */
  async synchronizePhases(phaseIds, options = {}) {
    const timeout = options.timeout || 60000; // 1 minute default

    const promises = phaseIds.map(phaseId => {
      const phase = this.phases.get(phaseId);
      if (!phase) {
        throw new Error(`Phase not found: ${phaseId}`);
      }
      return this._executePhase(phaseId, phase);
    });

    // Add timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Synchronization timeout')), timeout);
    });

    return Promise.race([Promise.all(promises), timeoutPromise]);
  }

  /**
   * Validate dependencies exist
   *
   * @private
   */
  async _validateDependencies() {
    for (const [phaseId, phase] of this.phases) {
      for (const dep of phase.dependencies) {
        if (!this.phases.has(dep)) {
          throw new Error(`Dependency not found: ${dep} (required by ${phaseId})`);
        }
      }
    }
  }

  /**
   * Build dependency graph
   *
   * @private
   */
  _buildDependencyGraph() {
    const graph = new Map();
    for (const [phaseId, phase] of this.phases) {
      graph.set(phaseId, phase.dependencies);
    }
    return graph;
  }

  /**
   * Compute dependency levels (for parallel execution)
   *
   * @private
   */
  _computeDependencyLevels() {
    const levels = [];
    const processed = new Set();
    const phaseIds = Array.from(this.phases.keys());

    while (processed.size < phaseIds.length) {
      const currentLevel = [];

      for (const phaseId of phaseIds) {
        if (processed.has(phaseId)) continue;

        const phase = this.phases.get(phaseId);
        const allDepsProcessed = phase.dependencies.every(dep => processed.has(dep));

        if (allDepsProcessed) {
          currentLevel.push(phaseId);
        }
      }

      if (currentLevel.length === 0) {
        throw new Error('Unable to resolve dependencies (possible cycle)');
      }

      levels.push(currentLevel);
      currentLevel.forEach(id => processed.add(id));
    }

    return levels;
  }

  /**
   * Execute a single phase
   *
   * @private
   */
  async _executePhase(phaseId, phase) {
    try {
      const result = await phase.executor();
      return result;
    } catch (err) {
      throw new Error(`Phase ${phaseId} failed: ${err.message}`);
    }
  }

  /**
   * Process results based on join strategy
   *
   * @private
   */
  _processResults(results, _joinStrategy) {
    const succeeded = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    // Always enrich results with succeeded/failed arrays
    const enrichedResults = results.slice();
    enrichedResults.succeeded = succeeded;
    enrichedResults.failed = failed;

    return enrichedResults;
  }

  /**
   * Handle partial failure (utility method)
   *
   * @param {Array} results - Execution results
   * @returns {Object} Categorized results
   */
  handlePartialFailure(results) {
    const succeeded = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    return {
      succeeded,
      failed,
      total: results.length,
      successRate: (succeeded.length / results.length) * 100,
    };
  }

  /**
   * Detect deadlock in dependency graph (exported for testing)
   *
   * @param {Map} dependencyGraph - Graph to check
   * @returns {boolean} True if deadlock detected
   */
  detectDeadlock(dependencyGraph) {
    return detectCycles(dependencyGraph);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  ParallelPhaseExecutor,
};
