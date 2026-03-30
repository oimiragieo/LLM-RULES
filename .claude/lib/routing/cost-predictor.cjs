'use strict';

/**
 * Cost Predictor
 *
 * Pre-task cost estimation using token estimation and model pricing from
 * ModelRegistry. Provides budget-aware model suggestions with quality
 * preferences and session burn-rate tracking via TokenAccountant.
 *
 * @module cost-predictor
 */

const { estimateTokens } = require('../utils/token-budget-tracker.cjs');

/**
 * Estimated output tokens as a fraction of estimated input tokens.
 * Typical LLM responses are shorter than their prompts.
 */
const ESTIMATED_OUTPUT_RATIO = 0.25;

/**
 * Default total budget for a session in USD.
 * Used as the reference value for remaining/status calculations in
 * getBudgetStatus() when no external budget limit is provided.
 */
const DEFAULT_SESSION_BUDGET_USD = 10.0;

/** Fraction of budget consumed at which status becomes 'warning' */
const WARNING_THRESHOLD = 0.8;

/** Fraction of budget consumed at which status becomes 'critical' */
const CRITICAL_THRESHOLD = 0.9;

/**
 * @typedef {Object} CostEstimate
 * @property {number} estimatedTokens       - Estimated input tokens
 * @property {number} inputCostUSD          - Input token cost in USD
 * @property {number} estimatedOutputTokens - Estimated output tokens
 * @property {number} outputCostUSD         - Output token cost in USD
 * @property {number} totalCostUSD          - Total estimated cost (input + output)
 * @property {string} model                 - Full model ID used for the estimate
 */

/**
 * @typedef {Object} ModelSuggestion
 * @property {string} model            - Full model ID of the suggested model
 * @property {number} estimatedCostUSD - Estimated cost for this model
 * @property {string} reason           - Human-readable explanation for the choice
 */

/**
 * @typedef {Object} BudgetStatus
 * @property {number} totalSpent           - Total USD spent so far (from TokenAccountant)
 * @property {number} remaining            - Remaining budget in USD (clamped to 0)
 * @property {number} burnRatePerMinute    - Current spend rate in USD/minute
 * @property {number} estimatedMinutesLeft - Minutes until budget is exhausted at current burn rate
 * @property {'ok'|'warning'|'critical'} status - Budget health status
 */

class CostPredictor {
  /**
   * @param {import('./model-registry.cjs').ModelRegistry} modelRegistry
   * @param {object} tokenAccountant - TokenAccountant instance providing session cost data
   */
  constructor(modelRegistry, tokenAccountant) {
    this._modelRegistry = modelRegistry;
    this._tokenAccountant = tokenAccountant;
  }

  /**
   * Estimate the cost of sending a prompt to a specific model.
   *
   * Input tokens are estimated via estimateTokens() (CHAR_TO_TOKEN_RATIO = 0.75).
   * Output tokens are estimated as ESTIMATED_OUTPUT_RATIO × input tokens.
   *
   * @param {string} prompt     - The prompt to estimate cost for (empty → zero cost)
   * @param {string} modelName  - Full model ID or shorthand alias (e.g. 'opus', 'haiku')
   * @returns {CostEstimate}
   * @throws {Error} When modelName does not resolve to a known model
   */
  estimateCost(prompt, modelName) {
    const model = this._resolveModel(modelName);

    // Empty / falsy prompt → zero cost
    if (!prompt) {
      return {
        estimatedTokens: 0,
        inputCostUSD: 0,
        estimatedOutputTokens: 0,
        outputCostUSD: 0,
        totalCostUSD: 0,
        model: model.id,
      };
    }

    const { tokens } = estimateTokens(prompt);
    const estimatedOutputTokens = Math.floor(tokens * ESTIMATED_OUTPUT_RATIO);
    const inputCostUSD = (tokens / 1000) * model.costPer1KInput;
    const outputCostUSD = (estimatedOutputTokens / 1000) * model.costPer1KOutput;

    return {
      estimatedTokens: tokens,
      inputCostUSD,
      estimatedOutputTokens,
      outputCostUSD,
      totalCostUSD: inputCostUSD + outputCostUSD,
      model: model.id,
    };
  }

  /**
   * Suggest the best model for a prompt given a cost budget and optional quality bias.
   *
   * @param {string} prompt                              - The prompt to estimate
   * @param {object} opts
   * @param {number} opts.maxCostUSD                     - Maximum allowable total cost in USD
   * @param {'cost'|'balanced'|'quality'} [opts.qualityPreference='balanced'] - Selection bias
   * @returns {ModelSuggestion|null} null when no model fits within maxCostUSD
   */
  suggestModel(prompt, { maxCostUSD, qualityPreference = 'balanced' } = {}) {
    // listModels() returns models sorted cheapest-first
    const models = this._modelRegistry.listModels();

    // Collect all models that fit within the budget
    const affordable = [];
    for (const model of models) {
      const estimate = this.estimateCost(prompt, model.id);
      if (maxCostUSD !== undefined && estimate.totalCostUSD > maxCostUSD) {
        continue;
      }
      affordable.push({ model, estimatedCostUSD: estimate.totalCostUSD });
    }

    if (affordable.length === 0) {
      return null;
    }

    if (qualityPreference === 'cost') {
      // Cheapest model within budget (first in the list — sorted ascending)
      const pick = affordable[0];
      return {
        model: pick.model.id,
        estimatedCostUSD: pick.estimatedCostUSD,
        reason: 'Cheapest model within budget',
      };
    }

    if (qualityPreference === 'quality') {
      // Prefer opus; fall back to highest-cost model available within budget
      const opusEntry = affordable.find(a => a.model.shorthand === 'opus');
      if (opusEntry) {
        return {
          model: opusEntry.model.id,
          estimatedCostUSD: opusEntry.estimatedCostUSD,
          reason: 'Best quality model (opus) within budget',
        };
      }
      // opus not affordable — pick the most expensive/capable model that fits
      const pick = affordable[affordable.length - 1];
      return {
        model: pick.model.id,
        estimatedCostUSD: pick.estimatedCostUSD,
        reason: 'Best available quality model within budget',
      };
    }

    // balanced: prefer a middle-tier option (e.g. sonnet over haiku)
    if (affordable.length === 1) {
      return {
        model: affordable[0].model.id,
        estimatedCostUSD: affordable[0].estimatedCostUSD,
        reason: 'Only model within budget',
      };
    }

    const midIndex = Math.floor(affordable.length / 2);
    const pick = affordable[midIndex];
    return {
      model: pick.model.id,
      estimatedCostUSD: pick.estimatedCostUSD,
      reason: 'Balanced cost/quality model within budget',
    };
  }

  /**
   * Return the budget status for a session using the injected TokenAccountant.
   *
   * Burn rate is derived from the earliest record timestamp to now, allowing
   * estimation of how many minutes of budget remain at the current pace.
   *
   * @param {string} _sessionId - Session identifier (used for context / future per-session tracking)
   * @returns {BudgetStatus}
   */
  getBudgetStatus(_sessionId) {
    const sessionTotal = this._tokenAccountant.getSessionTotal();
    const totalSpent = sessionTotal.costUSD;
    const remaining = Math.max(0, DEFAULT_SESSION_BUDGET_USD - totalSpent);

    // Compute burn rate from record timestamps
    let burnRatePerMinute = 0;
    let estimatedMinutesLeft = Infinity;

    const data = this._tokenAccountant.toJSON();
    const allRecords = [];
    if (data.records && typeof data.records === 'object') {
      for (const taskRecords of Object.values(data.records)) {
        if (Array.isArray(taskRecords)) {
          for (const record of taskRecords) {
            if (record && record.timestamp) {
              allRecords.push(record);
            }
          }
        }
      }
    }

    if (allRecords.length > 0) {
      const timestamps = allRecords.map(r => new Date(r.timestamp).getTime());
      const earliest = Math.min(...timestamps);
      const elapsedMs = Date.now() - earliest;
      const elapsedMinutes = elapsedMs / 60000;

      if (elapsedMinutes > 0 && totalSpent > 0) {
        burnRatePerMinute = totalSpent / elapsedMinutes;
        estimatedMinutesLeft = remaining / burnRatePerMinute;
      }
    }

    // Determine status based on fraction of default budget consumed
    const percentSpent =
      DEFAULT_SESSION_BUDGET_USD > 0 ? totalSpent / DEFAULT_SESSION_BUDGET_USD : 0;
    let status;
    if (percentSpent >= CRITICAL_THRESHOLD) {
      status = 'critical';
    } else if (percentSpent >= WARNING_THRESHOLD) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      totalSpent,
      remaining,
      burnRatePerMinute,
      estimatedMinutesLeft,
      status,
    };
  }

  /**
   * Resolve a model name (full ID or shorthand) to its ModelEntry.
   * Throws a descriptive error if not found.
   *
   * @private
   * @param {string} modelName
   * @returns {import('./model-registry.cjs').ModelEntry}
   */
  _resolveModel(modelName) {
    const model = this._modelRegistry.getModel(modelName);
    if (!model) {
      const available = this._modelRegistry
        .listModels()
        .map(m => `${m.shorthand} (${m.id})`)
        .join(', ');
      throw new Error(`Unknown model: "${modelName}". Available models: ${available}`);
    }
    return model;
  }
}

module.exports = { CostPredictor, DEFAULT_SESSION_BUDGET_USD };
