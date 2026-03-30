'use strict';

/**
 * Model Router
 *
 * Runtime model selection integrating intent classification, cost prediction,
 * and budget constraints. Determines the most appropriate model for a given
 * prompt by:
 *
 * 1. Applying config overrides (highest precedence)
 * 2. Resolving via context agentType when provided
 * 3. Using intent classification -> defaultAgent -> resolveAgentModel precedence
 * 4. Falling back to complexity-based defaults when no agent is identified
 * 5. Applying budget constraints (can downgrade the selected model)
 *
 * Downgrade chain (most to least capable): opus -> sonnet -> haiku
 * qualityFloor prevents downgrading below a configured minimum.
 *
 * @module model-router
 */

const { resolveAgentModel } = require('../utils/agent-config-reader.cjs');

/**
 * Model downgrade chain — ordered from highest quality (most expensive) to
 * lowest quality (cheapest). Used by applyBudgetConstraint.
 *
 * @type {string[]}
 */
const DOWNGRADE_CHAIN = ['opus', 'sonnet', 'haiku'];

/**
 * Default budget threshold (USD). When remaining budget falls below this
 * value, applyBudgetConstraint will attempt a model downgrade.
 */
const DEFAULT_BUDGET_THRESHOLD = 1.0;

/**
 * Map confidence level to a complexity-based model shorthand.
 * Used as a fallback when intent classification does not yield a defaultAgent.
 *
 * @type {Record<string, string>}
 */
const CONFIDENCE_TO_MODEL = {
  high: 'opus',
  medium: 'sonnet',
  low: 'haiku',
};

/**
 * @typedef {Object} ModelRouterConfig
 * @property {string}  [model]        - Force a specific model (full ID or shorthand). Highest precedence.
 * @property {string}  [qualityFloor] - Minimum acceptable model shorthand (e.g. 'haiku', 'sonnet')
 */

/**
 * @typedef {Object} SelectionContext
 * @property {string}  [sessionId]   - Session identifier (used for budget tracking)
 * @property {string}  [agentType]   - Override agent type for model resolution
 * @property {Budget}  [budget]      - Budget constraint for this selection
 * @property {string}  [phase]       - Workflow phase (e.g. 'planning', 'coding')
 */

/**
 * @typedef {Object} Budget
 * @property {number} remaining     - Remaining budget in USD
 * @property {number} [threshold]   - Downgrade trigger threshold in USD (default: 1.0)
 * @property {string} [qualityFloor] - Minimum model shorthand after downgrade (e.g. 'haiku')
 */

/**
 * @typedef {Object} ModelSelection
 * @property {string}  model           - Full model ID (e.g. 'claude-opus-4-6')
 * @property {string}  shorthand       - Model shorthand alias (e.g. 'opus')
 * @property {string}  reason          - Human-readable explanation for this selection
 * @property {'intent'|'cost-override'|'budget-downgrade'|'complexity-default'|'config'} source
 *                                     - How the model was selected
 * @property {string}  originalModel   - Model before any budget-triggered downgrade
 * @property {number}  estimatedCostUSD - Estimated cost for this prompt + model in USD
 * @property {string}  confidence      - Confidence level from intent classification
 */

class ModelRouter {
  /**
   * @param {object} opts
   * @param {import('./model-registry.cjs').ModelRegistry} opts.modelRegistry
   * @param {import('./cost-predictor.cjs').CostPredictor}  opts.costPredictor
   * @param {{ classifyIntent: Function }}                   opts.intentClassifier
   * @param {ModelRouterConfig}                             [opts.config]
   */
  constructor({ modelRegistry, costPredictor, intentClassifier, config = {} }) {
    this._modelRegistry = modelRegistry;
    this._costPredictor = costPredictor;
    this._intentClassifier = intentClassifier;
    this._config = config || {};
  }

  /**
   * Select the best model for a given prompt and optional context.
   *
   * Precedence (highest to lowest):
   * 1. config.model override
   * 2. context.agentType — resolveAgentModel(agentType)
   * 3. Intent classification defaultAgent — resolveAgentModel(defaultAgent)
   * 4. Complexity-based default derived from intent confidence
   *
   * After selection, budget constraints are applied if context.budget is provided.
   *
   * @param {string}          prompt   - The user prompt to route
   * @param {SelectionContext} [context={}] - Optional routing context
   * @returns {ModelSelection}
   */
  selectModel(prompt, context = {}) {
    const normalizedPrompt = typeof prompt === 'string' ? prompt : '';
    const { agentType, budget } = context || {};

    // -----------------------------------------------------------------
    // 1. Config model override (highest precedence)
    // -----------------------------------------------------------------
    if (this._config.model) {
      const configModel = this._modelRegistry.getModel(this._config.model);
      if (configModel) {
        const cost = this._costPredictor.estimateCost(normalizedPrompt, configModel.id);
        let selection = {
          model: configModel.id,
          shorthand: configModel.shorthand,
          reason: `Config override: ${this._config.model}`,
          source: 'config',
          originalModel: configModel.id,
          estimatedCostUSD: cost.totalCostUSD,
          confidence: 'high',
        };
        if (budget) {
          selection = this._applyAndRecost(selection, budget, normalizedPrompt);
        }
        return selection;
      }
      // Config model not found in registry — fall through to dynamic routing
    }

    // -----------------------------------------------------------------
    // 2. Context agentType override
    // -----------------------------------------------------------------
    if (agentType && typeof agentType === 'string') {
      const agentResolution = resolveAgentModel(agentType);
      const agentModel = this._modelRegistry.getModel(agentResolution.model);
      if (agentModel) {
        const cost = this._costPredictor.estimateCost(normalizedPrompt, agentModel.id);
        let selection = {
          model: agentModel.id,
          shorthand: agentModel.shorthand,
          reason: `Agent type '${agentType}' resolved to ${agentModel.id} (via ${agentResolution.source})`,
          source: 'intent',
          originalModel: agentModel.id,
          estimatedCostUSD: cost.totalCostUSD,
          confidence: 'high',
        };
        if (budget) {
          selection = this._applyAndRecost(selection, budget, normalizedPrompt);
        }
        return selection;
      }
    }

    // -----------------------------------------------------------------
    // 3. Intent classification -> defaultAgent -> resolveAgentModel
    // -----------------------------------------------------------------
    const intentResult = this._intentClassifier.classifyIntent(normalizedPrompt);
    const { intent, defaultAgent, confidence } = intentResult || {};

    let selectedModel = null;
    let source = 'complexity-default';
    let reason = '';

    if (defaultAgent && typeof defaultAgent === 'string') {
      const agentResolution = resolveAgentModel(defaultAgent);
      const agentModel = this._modelRegistry.getModel(agentResolution.model);
      if (agentModel) {
        selectedModel = agentModel;
        source = 'intent';
        reason = `Intent '${intent || 'unknown'}' mapped to agent '${defaultAgent}' -> ${agentModel.id}`;
      }
    }

    // -----------------------------------------------------------------
    // 4. Complexity-based fallback (from confidence)
    // -----------------------------------------------------------------
    if (!selectedModel) {
      const complexityShorthand = CONFIDENCE_TO_MODEL[confidence] || CONFIDENCE_TO_MODEL['low'];
      selectedModel = this._modelRegistry.getModel(complexityShorthand);
      source = 'complexity-default';
      reason = `Complexity-based selection: confidence '${confidence || 'low'}' -> ${complexityShorthand}`;
    }

    // Guard: ensure selectedModel is always a valid registry entry
    if (!selectedModel) {
      selectedModel = this._modelRegistry.getModel('haiku');
      source = 'complexity-default';
      reason = 'Fallback to haiku (no model resolved)';
    }

    const cost = this._costPredictor.estimateCost(normalizedPrompt, selectedModel.id);
    let selection = {
      model: selectedModel.id,
      shorthand: selectedModel.shorthand,
      reason,
      source,
      originalModel: selectedModel.id,
      estimatedCostUSD: cost.totalCostUSD,
      confidence: confidence || 'low',
    };

    // -----------------------------------------------------------------
    // 5. Budget constraint
    // -----------------------------------------------------------------
    if (budget) {
      selection = this._applyAndRecost(selection, budget, normalizedPrompt);
    }

    return selection;
  }

  /**
   * Apply a budget constraint to an existing model selection.
   *
   * When remaining budget is below the threshold, downgrades the model one
   * step in the DOWNGRADE_CHAIN (opus -> sonnet -> haiku). Never downgrades
   * below qualityFloor.
   *
   * @param {ModelSelection} selection - Current model selection
   * @param {Budget|null}    budget    - Budget constraint (null = no-op)
   * @returns {ModelSelection} Possibly-downgraded selection
   */
  applyBudgetConstraint(selection, budget) {
    if (!budget) return selection;

    const remaining = typeof budget.remaining === 'number' ? budget.remaining : Infinity;
    const threshold =
      typeof budget.threshold === 'number' ? budget.threshold : DEFAULT_BUDGET_THRESHOLD;
    const qualityFloor = budget.qualityFloor || 'haiku';

    // No downgrade needed — budget is healthy
    if (remaining >= threshold) return selection;

    const currentShorthand = selection.shorthand;
    const currentIdx = DOWNGRADE_CHAIN.indexOf(currentShorthand);
    const floorIdx = DOWNGRADE_CHAIN.indexOf(qualityFloor);

    // Floor defaults to haiku (last item) if qualityFloor is not in chain
    const effectiveFloorIdx = floorIdx === -1 ? DOWNGRADE_CHAIN.length - 1 : floorIdx;

    // Cannot downgrade: unknown shorthand, or already at/below floor
    if (currentIdx === -1 || currentIdx >= effectiveFloorIdx) {
      return selection;
    }

    // Move one step down the chain
    const nextShorthand = DOWNGRADE_CHAIN[currentIdx + 1];
    const nextModel = this._modelRegistry.getModel(nextShorthand);

    // Model not in registry (should not happen with standard config)
    if (!nextModel) return selection;

    return {
      ...selection,
      model: nextModel.id,
      shorthand: nextModel.shorthand,
      reason: `Budget downgrade: remaining $${remaining.toFixed(4)} < threshold $${threshold} (${currentShorthand} -> ${nextShorthand})`,
      source: 'budget-downgrade',
      originalModel: selection.originalModel || selection.model,
    };
  }

  /**
   * Apply budget constraint and recalculate cost if the model changed.
   *
   * @private
   * @param {ModelSelection} selection
   * @param {Budget}         budget
   * @param {string}         prompt
   * @returns {ModelSelection}
   */
  _applyAndRecost(selection, budget, prompt) {
    const constrained = this.applyBudgetConstraint(selection, budget);
    if (constrained.model !== selection.model) {
      try {
        const newCost = this._costPredictor.estimateCost(prompt, constrained.model);
        constrained.estimatedCostUSD = newCost.totalCostUSD;
      } catch (_err) {
        // Keep existing estimatedCostUSD if recalculation fails
      }
    }
    return constrained;
  }
}

module.exports = { ModelRouter, DOWNGRADE_CHAIN, DEFAULT_BUDGET_THRESHOLD };
