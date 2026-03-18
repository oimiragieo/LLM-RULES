'use strict';

/**
 * Token Accountant
 *
 * Per-task token usage tracking with model-based cost estimation.
 *
 * Pricing (per 1K tokens, USD):
 *   haiku:  input=$0.25, output=$1.25
 *   sonnet: input=$3,    output=$15
 *   opus:   input=$15,   output=$75
 *
 * @module token-accountant
 */

const MODEL_PRICING = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

const DEFAULT_MODEL = 'sonnet';

/**
 * @typedef {Object} UsageRecord
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {string} model
 * @property {string} agentType
 * @property {string} timestamp
 */

class TokenAccountant {
  constructor() {
    /** @type {Map<string, UsageRecord[]>} */
    this._tasks = new Map();
  }

  /**
   * Record token usage for a task.
   *
   * @param {string} taskId
   * @param {{ inputTokens?: number, outputTokens?: number, model?: string, agentType?: string }} usage
   */
  recordUsage(taskId, usage) {
    if (!taskId || typeof taskId !== 'string') return;
    if (!usage || typeof usage !== 'object') return;

    const inputTokens = Math.max(0, typeof usage.inputTokens === 'number' ? usage.inputTokens : 0);
    const outputTokens = Math.max(
      0,
      typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
    );
    const model =
      typeof usage.model === 'string' && usage.model in MODEL_PRICING ? usage.model : DEFAULT_MODEL;
    const agentType = typeof usage.agentType === 'string' ? usage.agentType : 'unknown';

    if (!this._tasks.has(taskId)) {
      this._tasks.set(taskId, []);
    }

    this._tasks.get(taskId).push({
      inputTokens,
      outputTokens,
      model,
      agentType,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Calculate cost for a given model and token counts.
   * @private
   */
  _calculateCost(inputTokens, outputTokens, model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
    return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
  }

  /**
   * Get cost breakdown for a specific task.
   *
   * @param {string} taskId
   * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number, costUSD: number } | null}
   */
  getTaskCost(taskId) {
    if (!this._tasks.has(taskId)) return null;

    const records = this._tasks.get(taskId);
    let inputTokens = 0;
    let outputTokens = 0;
    let costUSD = 0;

    for (const r of records) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costUSD += this._calculateCost(r.inputTokens, r.outputTokens, r.model);
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD: Math.round(costUSD * 1000000) / 1000000, // avoid floating point noise
    };
  }

  /**
   * Get aggregated session totals across all tasks.
   *
   * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number, costUSD: number, taskCount: number }}
   */
  getSessionTotal() {
    let inputTokens = 0;
    let outputTokens = 0;
    let costUSD = 0;

    for (const [, records] of this._tasks) {
      for (const r of records) {
        inputTokens += r.inputTokens;
        outputTokens += r.outputTokens;
        costUSD += this._calculateCost(r.inputTokens, r.outputTokens, r.model);
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD: Math.round(costUSD * 1000000) / 1000000,
      taskCount: this._tasks.size,
    };
  }

  /**
   * Get usage aggregated by agent type.
   *
   * @param {string} agentType
   * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number, costUSD: number, taskCount: number }}
   */
  getByAgent(agentType) {
    let inputTokens = 0;
    let outputTokens = 0;
    let costUSD = 0;
    const taskIds = new Set();

    for (const [taskId, records] of this._tasks) {
      for (const r of records) {
        if (r.agentType === agentType) {
          inputTokens += r.inputTokens;
          outputTokens += r.outputTokens;
          costUSD += this._calculateCost(r.inputTokens, r.outputTokens, r.model);
          taskIds.add(taskId);
        }
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD: Math.round(costUSD * 1000000) / 1000000,
      taskCount: taskIds.size,
    };
  }

  /**
   * Serialize to JSON-friendly object.
   *
   * @returns {{ tasks: Object, session: Object }}
   */
  toJSON() {
    const tasks = {};
    for (const [taskId] of this._tasks) {
      tasks[taskId] = this.getTaskCost(taskId);
    }
    return {
      tasks,
      session: this.getSessionTotal(),
    };
  }
}

module.exports = {
  TokenAccountant,
  MODEL_PRICING,
  DEFAULT_MODEL,
};
