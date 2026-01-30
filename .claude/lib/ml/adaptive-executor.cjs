/**
 * Phase 5: Adaptive Executor
 *
 * Optimizes execution based on learned patterns:
 * - Pattern-based optimization selection
 * - Model selection optimization
 * - Parameter recommendation engine
 * - Learning feedback integration
 */

class AdaptiveExecutor {
  constructor(config = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || 60000,
      maxConcurrency: config.maxConcurrency || 10,
      ...config,
    };

    this.executionHistory = [];
    this.strategyWeights = {
      parallel: 1.0,
      batch: 1.0,
      cache: 1.0,
      none: 1.0,
    };
    this.modelOutcomes = {};
  }

  /**
   * Select optimization strategy based on pattern
   * @param {Object} pattern - Pattern object
   * @returns {Object} Strategy recommendation
   */
  selectStrategy(pattern) {
    if (!pattern) return { type: 'none', reason: 'No pattern provided' };

    // Check for repeated similar tasks first - can be batched
    // (This takes priority over parallelization when tasks are similar)
    if (pattern.type === 'repeated' || this._hasRepeatedOperations(pattern)) {
      return {
        type: 'batch',
        reason: 'Multiple similar operations can be batched',
        expectedSpeedup: 0.3,
      };
    }

    // Check for independent tasks - can be parallelized
    if (pattern.type === 'independent' || this._hasIndependentTasks(pattern)) {
      return {
        type: 'parallel',
        reason: 'Tasks have no dependencies and can run in parallel',
        expectedSpeedup: 0.5,
      };
    }

    // Check for idempotent operations - can be cached
    if (pattern.type === 'idempotent' || this._isIdempotent(pattern)) {
      return {
        type: 'cache',
        reason: 'Operation is idempotent and results can be cached',
        expectedSpeedup: 0.7,
      };
    }

    // Use learned weights to select strategy
    const learnedStrategy = this._selectFromWeights(pattern);
    if (learnedStrategy.type !== 'none') {
      return learnedStrategy;
    }

    return { type: 'none', reason: 'No optimization applicable' };
  }

  _hasIndependentTasks(pattern) {
    if (!pattern.tasks || !Array.isArray(pattern.tasks)) return false;
    return pattern.tasks.every(t => !t.dependencies || t.dependencies.length === 0);
  }

  _hasRepeatedOperations(pattern) {
    if (!pattern.tasks || !Array.isArray(pattern.tasks)) return false;
    const operations = pattern.tasks
      .map(t => t.operation)
      .filter(op => op !== undefined && op !== null);
    if (operations.length === 0) return false;
    const unique = new Set(operations);
    return unique.size < operations.length / 2;
  }

  _isIdempotent(pattern) {
    const idempotentOps = ['Read', 'Grep', 'Glob', 'Search'];
    return pattern.operation && idempotentOps.includes(pattern.operation);
  }

  _selectFromWeights(_pattern) {
    // Select strategy based on historical success weights
    let maxWeight = 0;
    let bestStrategy = 'none';

    for (const [strategy, weight] of Object.entries(this.strategyWeights)) {
      if (weight > maxWeight && strategy !== 'none') {
        maxWeight = weight;
        bestStrategy = strategy;
      }
    }

    if (maxWeight > 1.5) {
      return {
        type: bestStrategy,
        reason: `Learned from historical outcomes (weight: ${maxWeight.toFixed(2)})`,
        expectedSpeedup: 0.2,
      };
    }

    return { type: 'none', reason: 'No strong pattern from history' };
  }

  /**
   * Recommend model based on task characteristics
   * @param {Object} task - Task description
   * @returns {string} Recommended model
   */
  recommendModel(task) {
    // Check historical outcomes for task type
    if (task.taskType && this.modelOutcomes[task.taskType]) {
      const outcomes = this.modelOutcomes[task.taskType];
      let bestModel = null;
      let bestRate = 0;

      for (const [model, stats] of Object.entries(outcomes)) {
        const successRate = stats.total > 0 ? stats.success / stats.total : 0;
        if (successRate > bestRate) {
          bestRate = successRate;
          bestModel = model;
        }
      }

      // If we have clear historical preference, use it
      if (bestModel && bestRate > 0.7) {
        return bestModel;
      }
    }

    // Default recommendations based on task complexity
    if (task.complexity === 'high' || task.criticalPath) {
      return 'claude-opus-4-5-20251101';
    }

    if (task.complexity === 'medium' || task.tokenEstimate > 3000) {
      return 'claude-sonnet-4-20250514';
    }

    return 'claude-haiku-4-20250514';
  }

  /**
   * Record outcome for model selection learning
   * @param {string} model - Model used
   * @param {string} taskType - Type of task
   * @param {boolean} success - Whether task succeeded
   */
  recordOutcome(model, taskType, success) {
    if (!this.modelOutcomes[taskType]) {
      this.modelOutcomes[taskType] = {};
    }
    if (!this.modelOutcomes[taskType][model]) {
      this.modelOutcomes[taskType][model] = { success: 0, total: 0 };
    }

    this.modelOutcomes[taskType][model].total++;
    if (success) {
      this.modelOutcomes[taskType][model].success++;
    }
  }

  /**
   * Adjust timeout based on historical duration
   * @param {Array} history - Array of {duration} records
   * @returns {number} Recommended timeout in ms
   */
  adjustTimeout(history) {
    if (!history || history.length === 0) {
      return this.config.defaultTimeout;
    }

    const durations = history.map(h => h.duration);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const max = Math.max(...durations);

    // Use 2x average or 1.5x max, whichever is larger (with buffer)
    return Math.max(avg * 2, max * 1.5);
  }

  /**
   * Adjust concurrency based on resource metrics
   * @param {Object} metrics - {cpuUsage, memoryUsage, activeConnections}
   * @returns {number} Recommended concurrency level
   */
  adjustConcurrency(metrics) {
    const baselineConcurrency = this.config.maxConcurrency;

    // Reduce concurrency under high load
    const cpuFactor = 1 - (metrics.cpuUsage || 0);
    const memoryFactor = 1 - (metrics.memoryUsage || 0);
    const loadFactor = Math.min(cpuFactor, memoryFactor);

    const recommended = Math.max(1, Math.floor(baselineConcurrency * loadFactor));
    return recommended;
  }

  /**
   * Record execution for learning
   * @param {Object} execution - {taskId, strategy, success, duration, cost}
   */
  recordExecution(execution) {
    this.executionHistory.push({
      ...execution,
      timestamp: new Date().toISOString(),
    });

    // Update strategy weights based on outcome
    if (execution.strategy) {
      const factor = execution.success ? 1.1 : 0.9;
      this.strategyWeights[execution.strategy] *= factor;

      // Normalize weights
      const total = Object.values(this.strategyWeights).reduce((s, w) => s + w, 0);
      for (const key of Object.keys(this.strategyWeights)) {
        this.strategyWeights[key] /= total / 4; // Keep average at 1.0
      }
    }
  }

  /**
   * Get execution history
   * @returns {Array} Execution history
   */
  getExecutionHistory() {
    return [...this.executionHistory];
  }

  /**
   * Get current strategy weights
   * @returns {Object} Strategy weights
   */
  getStrategyWeights() {
    return { ...this.strategyWeights };
  }

  /**
   * Recommend strategy for pattern based on learned history
   * @param {Object} pattern - Pattern to match
   * @returns {Object} Recommendation
   */
  recommendForPattern(pattern) {
    // Find executions with similar pattern type
    const relevant = this.executionHistory.filter(e => e.patternType === pattern.type);

    if (relevant.length === 0) {
      return this.selectStrategy(pattern);
    }

    // Count successes per strategy
    const strategyStats = {};
    for (const exec of relevant) {
      if (!strategyStats[exec.strategy]) {
        strategyStats[exec.strategy] = { success: 0, total: 0 };
      }
      strategyStats[exec.strategy].total++;
      if (exec.success) {
        strategyStats[exec.strategy].success++;
      }
    }

    // Find best strategy
    let bestStrategy = 'none';
    let bestRate = 0;
    for (const [strategy, stats] of Object.entries(strategyStats)) {
      const rate = stats.total > 0 ? stats.success / stats.total : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestStrategy = strategy;
      }
    }

    return {
      strategy: bestStrategy,
      confidence: bestRate,
      basedOn: relevant.length,
    };
  }
}

module.exports = { AdaptiveExecutor };
