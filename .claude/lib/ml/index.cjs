/**
 * Phase 5 ML Features Integration Module
 *
 * Central entry point for all Phase 5 ML modules.
 * Provides unified access to:
 * - Pattern Detection (WorkflowPatternDetector)
 * - Cost Prediction (CostPredictor)
 * - Adaptive Execution (AdaptiveExecutor)
 * - Optimization Engine (OptimizationRecommender)
 *
 * Usage:
 *   const { PatternDetector, CostPredictor, AdaptiveExecutor, OptimizationEngine } = require('.claude/lib/ml');
 *
 * Feature Flags (from .env):
 *   - PATTERN_DETECTION_ENABLED (default: false)
 *   - COST_PREDICTION_ENABLED (default: false)
 *   - ADAPTIVE_EXECUTION_ENABLED (default: false)
 *   - PERFORMANCE_PROFILING_ENABLED (default: false)
 *   - PATTERN_LIBRARY_ENABLED (default: false)
 */

'use strict';

// Load environment configuration
const patternDetectionEnabled = process.env.PATTERN_DETECTION_ENABLED === 'true';
const costPredictionEnabled = process.env.COST_PREDICTION_ENABLED === 'true';
const adaptiveExecutionEnabled = process.env.ADAPTIVE_EXECUTION_ENABLED === 'true';
const performanceProfilingEnabled = process.env.PERFORMANCE_PROFILING_ENABLED === 'true';
const patternLibraryEnabled = process.env.PATTERN_LIBRARY_ENABLED === 'true';

// Lazy-load modules (only if enabled)
let WorkflowPatternDetector = null;
let CostPredictor = null;
let AdaptiveExecutor = null;
let OptimizationRecommender = null;

/**
 * Get Pattern Detector instance (lazy-loaded)
 * @param {Object} config - Configuration options
 * @returns {WorkflowPatternDetector|null} - Detector instance or null if disabled
 */
function getPatternDetector(config = {}) {
  if (!patternDetectionEnabled) {
    return null;
  }

  if (!WorkflowPatternDetector) {
    const module = require('./pattern-detector.cjs');
    WorkflowPatternDetector = module.WorkflowPatternDetector || module.PatternDetector;
  }

  return new WorkflowPatternDetector({
    minSupport: parseFloat(process.env.PATTERN_MIN_SUPPORT) || 0.1,
    minConfidence: parseFloat(process.env.PATTERN_MIN_CONFIDENCE) || 0.6,
    ...config,
  });
}

/**
 * Get Cost Predictor instance (lazy-loaded)
 * @param {Object} config - Configuration options
 * @returns {CostPredictor|null} - Predictor instance or null if disabled
 */
function getCostPredictor(config = {}) {
  if (!costPredictionEnabled) {
    return null;
  }

  if (!CostPredictor) {
    const module = require('./cost-predictor.cjs');
    CostPredictor = module.CostPredictor;
  }

  const budgetAlert = parseFloat(process.env.COST_BUDGET_ALERT_USD) || 10.0;

  return new CostPredictor({
    budgetAlertThreshold: budgetAlert,
    ...config,
  });
}

/**
 * Get Adaptive Executor instance (lazy-loaded)
 * @param {Object} config - Configuration options
 * @returns {AdaptiveExecutor|null} - Executor instance or null if disabled
 */
function getAdaptiveExecutor(config = {}) {
  if (!adaptiveExecutionEnabled) {
    return null;
  }

  if (!AdaptiveExecutor) {
    const module = require('./adaptive-executor.cjs');
    AdaptiveExecutor = module.AdaptiveExecutor;
  }

  const maxConcurrency = parseInt(process.env.ADAPTIVE_MAX_CONCURRENCY, 10) || 10;

  return new AdaptiveExecutor({
    maxConcurrency,
    ...config,
  });
}

/**
 * Get Optimization Engine instance (lazy-loaded)
 * @param {Object} config - Configuration options
 * @returns {OptimizationRecommender|null} - Engine instance or null if disabled
 */
function getOptimizationEngine(config = {}) {
  if (!performanceProfilingEnabled) {
    return null;
  }

  if (!OptimizationRecommender) {
    const module = require('./optimization-engine.cjs');
    OptimizationRecommender = module.OptimizationRecommender;
  }

  return new OptimizationRecommender(config);
}

/**
 * Check if any Phase 5 ML features are enabled
 * @returns {boolean} - True if any ML feature is enabled
 */
function isMLEnabled() {
  return (
    patternDetectionEnabled ||
    costPredictionEnabled ||
    adaptiveExecutionEnabled ||
    performanceProfilingEnabled ||
    patternLibraryEnabled
  );
}

/**
 * Get ML feature flags status
 * @returns {Object} - Object with all ML feature flags
 */
function getMLStatus() {
  return {
    patternDetectionEnabled,
    costPredictionEnabled,
    adaptiveExecutionEnabled,
    performanceProfilingEnabled,
    patternLibraryEnabled,
    anyEnabled: isMLEnabled(),
  };
}

// Export factory functions and utilities
module.exports = {
  // Factory functions (lazy-loaded, null if disabled)
  getPatternDetector,
  getCostPredictor,
  getAdaptiveExecutor,
  getOptimizationEngine,

  // Utility functions
  isMLEnabled,
  getMLStatus,

  // Feature flags (for checking before instantiation)
  ML_FEATURES: {
    PATTERN_DETECTION: patternDetectionEnabled,
    COST_PREDICTION: costPredictionEnabled,
    ADAPTIVE_EXECUTION: adaptiveExecutionEnabled,
    PERFORMANCE_PROFILING: performanceProfilingEnabled,
    PATTERN_LIBRARY: patternLibraryEnabled,
  },
};
