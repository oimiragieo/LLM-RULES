/**
 * Phase 5: Cost Predictor
 *
 * Predicts and tracks LLM costs using:
 * - Token estimation (character counting, BPE approximation)
 * - Model pricing configuration
 * - Cost accumulation and forecasting
 * - Accuracy validation and tracking
 */

const fs = require('fs');
const path = require('path');

// Model pricing per 1000 tokens (approximate as of 2026)
const MODEL_PRICING = {
  // Opus models
  'claude-opus-4-5-20251101': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-20250514': { inputPer1k: 0.015, outputPer1k: 0.075 },

  // Sonnet models
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },

  // Haiku models
  'claude-haiku-4-20250514': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'claude-3-5-haiku-20241022': { inputPer1k: 0.00025, outputPer1k: 0.00125 },

  // Default fallback
  default: { inputPer1k: 0.003, outputPer1k: 0.015 },
};

// System prompt overhead (tokens)
const SYSTEM_OVERHEAD_TOKENS = 500;

class CostPredictor {
  constructor(config = {}) {
    this.config = {
      charsPerToken: config.charsPerToken || 4,
      systemOverhead: config.systemOverhead || SYSTEM_OVERHEAD_TOKENS,
      ...config,
    };

    this.sessionRequests = [];
    this.predictionHistory = [];
  }

  /**
   * Estimate token count from text
   * @param {string} text - Text to estimate
   * @param {Object} options - Options (includeSystemOverhead)
   * @returns {number} Estimated token count
   */
  estimateTokens(text, options = {}) {
    if (!text || typeof text !== 'string') return 0;

    // Basic estimation: ~4 characters per token
    let tokens = Math.ceil(text.length / this.config.charsPerToken);

    // Add overhead for system prompts
    if (options.includeSystemOverhead) {
      tokens += this.config.systemOverhead;
    }

    return tokens;
  }

  /**
   * Estimate tokens for a conversation
   * @param {Array} messages - Array of {role, content} messages
   * @returns {number} Total estimated tokens
   */
  estimateConversationTokens(messages) {
    if (!Array.isArray(messages)) return 0;

    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokens(msg.content || '');
      // Add overhead for message structure (~4 tokens per message)
      total += 4;
    }

    return total;
  }

  /**
   * Get pricing for a model
   * @param {string} model - Model identifier
   * @returns {Object} Pricing object {inputPer1k, outputPer1k}
   */
  getModelPricing(model) {
    return MODEL_PRICING[model] || MODEL_PRICING['default'];
  }

  /**
   * List all available model pricings
   * @returns {Array} Array of model names
   */
  listModelPricings() {
    return Object.keys(MODEL_PRICING).filter(k => k !== 'default');
  }

  /**
   * Calculate cost for a single request
   * @param {Object} request - {model, inputTokens, outputTokens}
   * @returns {number} Cost in dollars
   */
  calculateCost(request) {
    const pricing = this.getModelPricing(request.model);
    const inputCost = (request.inputTokens / 1000) * pricing.inputPer1k;
    const outputCost = (request.outputTokens / 1000) * pricing.outputPer1k;
    return inputCost + outputCost;
  }

  /**
   * Reset session tracking
   */
  resetSession() {
    this.sessionRequests = [];
  }

  /**
   * Add a request to session tracking
   * @param {Object} request - {model, inputTokens, outputTokens}
   */
  addRequest(request) {
    const cost = this.calculateCost(request);
    this.sessionRequests.push({
      ...request,
      cost,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get total session cost
   * @returns {number} Total cost in dollars
   */
  getSessionTotal() {
    return this.sessionRequests.reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get cost breakdown by model
   * @returns {Object} Cost by model
   */
  getCostBreakdown() {
    const breakdown = {};
    for (const request of this.sessionRequests) {
      if (!breakdown[request.model]) {
        breakdown[request.model] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
        };
      }
      breakdown[request.model].requests++;
      breakdown[request.model].inputTokens += request.inputTokens;
      breakdown[request.model].outputTokens += request.outputTokens;
      breakdown[request.model].cost += request.cost;
    }
    return breakdown;
  }

  /**
   * Forecast future costs based on historical data
   * @param {Array} history - Array of {date, cost}
   * @param {number} days - Days to forecast
   * @returns {Object} Forecast {predicted, confidence}
   */
  forecastCost(history, days) {
    if (!history || history.length === 0) {
      return { predicted: 0, confidence: 0 };
    }

    // Simple linear regression forecast
    const costs = history.map(h => h.cost);
    const n = costs.length;

    // Calculate average daily cost
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / n;

    // Calculate trend (simple linear)
    let trend = 0;
    if (n > 1) {
      const xMean = (n - 1) / 2;
      const yMean = avgCost;
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (costs[i] - yMean);
        denominator += (i - xMean) * (i - xMean);
      }
      trend = denominator !== 0 ? numerator / denominator : 0;
    }

    // Forecast
    const predicted = (avgCost + trend * n) * days;

    // Confidence based on data variance
    const variance = costs.reduce((sum, c) => sum + Math.pow(c - avgCost, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const cv = avgCost > 0 ? stdDev / avgCost : 1; // Coefficient of variation
    const confidence = Math.max(0, Math.min(1, 1 - cv));

    return { predicted, confidence };
  }

  /**
   * Calculate prediction accuracy
   * @param {number} predicted - Predicted value
   * @param {number} actual - Actual value
   * @returns {number} Accuracy (0-1)
   */
  calculateAccuracy(predicted, actual) {
    if (actual === 0) return predicted === 0 ? 1 : 0;
    const error = Math.abs(predicted - actual) / actual;
    return Math.max(0, 1 - error);
  }

  /**
   * Record a prediction for accuracy tracking
   * @param {number} predicted - Predicted value
   * @param {number} actual - Actual value
   */
  recordPrediction(predicted, actual) {
    const accuracy = this.calculateAccuracy(predicted, actual);
    this.predictionHistory.push({
      predicted,
      actual,
      accuracy,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Reset accuracy tracking
   */
  resetAccuracyTracking() {
    this.predictionHistory = [];
  }

  /**
   * Get average accuracy across all predictions
   * @returns {number} Average accuracy (0-1)
   */
  getAverageAccuracy() {
    if (this.predictionHistory.length === 0) return 1;
    const sum = this.predictionHistory.reduce((s, p) => s + p.accuracy, 0);
    return sum / this.predictionHistory.length;
  }

  /**
   * Get warnings when accuracy drops below threshold
   * @param {number} threshold - Minimum acceptable accuracy
   * @returns {Array} Array of warnings
   */
  getAccuracyWarnings(threshold = 0.8) {
    return this.predictionHistory
      .filter(p => p.accuracy < threshold)
      .map(p => ({
        message: `Prediction accuracy ${(p.accuracy * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%`,
        predicted: p.predicted,
        actual: p.actual,
        timestamp: p.timestamp,
      }));
  }
}

module.exports = { CostPredictor };
