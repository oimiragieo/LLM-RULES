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
 * Persistence (VAL-RF-016 to VAL-RF-019):
 * - persist() writes to disk using atomic writes (write-to-temp + rename)
 * - load() reads from disk for startup recovery
 * - Handles corrupted/missing files gracefully
 *
 * @module token-accountant
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

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
   * @returns {{ tasks: Object, session: Object, records: Object }}
   */
  toJSON() {
    const tasks = {};
    const records = {};
    for (const [taskId, taskRecords] of this._tasks) {
      tasks[taskId] = this.getTaskCost(taskId);
      records[taskId] = taskRecords;
    }
    return {
      tasks,
      session: this.getSessionTotal(),
      records, // Include raw records for persistence
    };
  }

  /**
   * VAL-RF-016, VAL-RF-019: Persist state to disk using atomic writes.
   *
   * Uses write-to-temp + rename pattern to prevent data corruption on crash.
   * Creates parent directories if they don't exist.
   *
   * @param {string} filePath - Path to the persistence file
   * @throws {Error} If write fails (caller should handle gracefully)
   */
  persist(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('persist() requires a valid file path');
    }

    const data = this.toJSON();
    // Add version for future migration compatibility
    data.version = 1;
    data.persistedAt = new Date().toISOString();

    // atomicWriteJSONSync creates parent dirs and uses atomic write
    atomicWriteJSONSync(filePath, data);
  }

  /**
   * VAL-RF-017, VAL-RF-018: Load state from disk for startup recovery.
   *
   * Handles corrupted and missing files gracefully (no crash, empty state).
   *
   * @param {string} filePath - Path to the persistence file
   * @returns {boolean} True if data was loaded, false otherwise
   */
  load(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // VAL-RF-018: Missing file is okay - just start with empty state
      return false;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // safeParseJSON returns the parsed object directly (not { success, data })
      const data = safeParseJSON(content, null);

      if (!data || typeof data !== 'object') {
        // VAL-RF-017: Corrupted file - log warning and continue with empty state
        // (In production, this would log to stderr, but we fail silently here)
        return false;
      }

      // Restore records if present (from our own persist format)
      if (data.records && typeof data.records === 'object') {
        for (const [taskId, taskRecords] of Object.entries(data.records)) {
          if (Array.isArray(taskRecords)) {
            // Validate each record before restoring
            const validRecords = taskRecords.filter(
              r =>
                r &&
                typeof r === 'object' &&
                typeof r.inputTokens === 'number' &&
                typeof r.outputTokens === 'number' &&
                typeof r.model === 'string' &&
                typeof r.agentType === 'string'
            );
            if (validRecords.length > 0) {
              this._tasks.set(taskId, validRecords);
            }
          }
        }
        return true;
      }

      // If no records but has tasks (older format), reconstruct minimal records
      if (data.tasks && typeof data.tasks === 'object') {
        for (const [taskId, taskCost] of Object.entries(data.tasks)) {
          if (taskCost && typeof taskCost === 'object') {
            // Create a synthetic record from the cost summary
            const inputTokens = taskCost.inputTokens || 0;
            const outputTokens = taskCost.outputTokens || 0;
            if (inputTokens > 0 || outputTokens > 0) {
              this._tasks.set(taskId, [
                {
                  inputTokens,
                  outputTokens,
                  model: DEFAULT_MODEL, // Unknown model, use default
                  agentType: 'unknown',
                  timestamp: data.persistedAt || new Date().toISOString(),
                },
              ]);
            }
          }
        }
        return true;
      }

      // Empty or unrecognized format - start fresh
      return false;
    } catch (_err) {
      // VAL-RF-017: Any error reading/parsing - fail gracefully
      return false;
    }
  }
}

module.exports = {
  TokenAccountant,
  MODEL_PRICING,
  DEFAULT_MODEL,
};
