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
 *   - ML_AUTOMATION_MODE (default: 'off') - off | log | enforce
 *     off: ML returns recommendations only; no auto-retrain, no applying config.
 *     log: same + retraining allowed; log recommendations (advice-only).
 *     enforce: retrain + allow applying config (future).
 *   - ML_DEBUG (default: unset) - set to 'true' for verbose ML logs (e.g. FeedbackLoop retraining).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load environment configuration
const patternDetectionEnabled = process.env.PATTERN_DETECTION_ENABLED === 'true';
const costPredictionEnabled = process.env.COST_PREDICTION_ENABLED === 'true';
const adaptiveExecutionEnabled = process.env.ADAPTIVE_EXECUTION_ENABLED === 'true';
const performanceProfilingEnabled = process.env.PERFORMANCE_PROFILING_ENABLED === 'true';
const patternLibraryEnabled = process.env.PATTERN_LIBRARY_ENABLED === 'true';

/** ML_AUTOMATION_MODE: off = advice only; log = retrain + log recommendations; enforce = retrain + apply (future) */
const ML_AUTOMATION_MODE = (process.env.ML_AUTOMATION_MODE || 'off').toLowerCase();
const ML_AUTOMATION_MODES = ['off', 'log', 'enforce'];
const effectiveMLAutomationMode = ML_AUTOMATION_MODES.includes(ML_AUTOMATION_MODE)
  ? ML_AUTOMATION_MODE
  : 'off';

// Lazy-load modules (only if enabled)
let WorkflowPatternDetector = null;
let CostPredictor = null;
let AdaptiveExecutor = null;
let OptimizationRecommender = null;

function getMlContextDir() {
  return path.join(process.cwd(), '.claude', 'context', 'ml');
}

function getDefaultModelPath() {
  return process.env.ML_MODEL_PATH || path.join(getMlContextDir(), 'pattern-model.json');
}

function getDefaultPolicyPath() {
  return process.env.ML_POLICY_PATH || path.join(getMlContextDir(), 'optimization-policies.json');
}

function getDefaultFeedbackStatePath() {
  return (
    process.env.ML_FEEDBACK_STATE_PATH || path.join(getMlContextDir(), 'feedback-loop-state.json')
  );
}

function getDefaultSessionsLogPath() {
  return process.env.ML_SESSIONS_LOG_PATH || path.join(getMlContextDir(), 'sessions.jsonl');
}

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
    WorkflowPatternDetector = module.WorkflowPatternDetector || module.PatternDetector || module;
  }

  const detector = new WorkflowPatternDetector({
    minSupport: parseFloat(process.env.PATTERN_MIN_SUPPORT) || 0.1,
    minConfidence: parseFloat(process.env.PATTERN_MIN_CONFIDENCE) || 0.6,
    ...config,
  });

  // Best-effort: load persisted model so new hook processes start trained once a model exists.
  const modelPath = config.modelPath || getDefaultModelPath();
  if (typeof detector.loadModel === 'function') {
    try {
      detector.loadModel(modelPath);
    } catch (_e) {
      // ignore load failures
    }
  }

  return detector;
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
 * @returns {OptimizationEngine|null} - Engine instance or null if disabled
 */
function getOptimizationEngine(config = {}) {
  if (!performanceProfilingEnabled) {
    return null;
  }

  if (!OptimizationRecommender) {
    const module = require('./optimization-engine.cjs');
    OptimizationRecommender = module.OptimizationEngine || module;
  }

  const patternDetector =
    config.patternDetector ||
    (patternDetectionEnabled ? getPatternDetector({ modelPath: config.modelPath }) : null);

  const persistencePath = config.persistencePath || getDefaultPolicyPath();
  const engine = new OptimizationRecommender(patternDetector, { ...config, persistencePath });

  // Best-effort: load policies if present
  if (typeof engine.loadPolicies === 'function' && fs.existsSync(persistencePath)) {
    try {
      engine.loadPolicies();
    } catch (_e) {
      // ignore load failures
    }
  }

  return engine;
}

/**
 * Get ML automation mode (off | log | enforce). Used to gate retraining and applying config.
 * @returns {string} - 'off' | 'log' | 'enforce'
 */
function getMLAutomationMode() {
  return effectiveMLAutomationMode;
}

/**
 * Get FeedbackLoop instance for SessionEnd ingestion and optional retraining.
 * Returns null if pattern detection or performance profiling is disabled.
 * Retraining is gated by ML_AUTOMATION_MODE (only log/enforce trigger retrain).
 * @param {Object} config - Optional { retrainThreshold, modelPath, policyPath }
 * @returns {FeedbackLoop|null}
 */
function getFeedbackLoop(config = {}) {
  if (!patternDetectionEnabled || !performanceProfilingEnabled) {
    return null;
  }
  const FeedbackLoopClass = require('./feedback-loop.cjs');
  const pd = getPatternDetector({ modelPath: config.modelPath || getDefaultModelPath() });
  const opt = getOptimizationEngine({
    ...config,
    patternDetector: pd,
    persistencePath: config.policyPath || getDefaultPolicyPath(),
    modelPath: config.modelPath || getDefaultModelPath(),
  });
  if (!pd || !opt) return null;
  return new FeedbackLoopClass(pd, opt, {
    retrainThreshold:
      config.retrainThreshold || parseInt(process.env.ML_RETRAIN_THRESHOLD, 10) || 10,
    modelPath: config.modelPath || getDefaultModelPath(),
    policyPath: config.policyPath || getDefaultPolicyPath(),
    statePath: config.statePath || getDefaultFeedbackStatePath(),
    sessionsPath: config.sessionsPath || getDefaultSessionsLogPath(),
    trainingWindow: config.trainingWindow || parseInt(process.env.ML_TRAINING_WINDOW, 10) || 200,
    maxSessionLogLines:
      config.maxSessionLogLines || parseInt(process.env.ML_SESSION_LOG_MAX_LINES, 10) || 2000,
    automationMode: effectiveMLAutomationMode,
  });
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
    automationMode: effectiveMLAutomationMode,
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
  getFeedbackLoop,

  // Utility functions
  isMLEnabled,
  getMLStatus,
  getMLAutomationMode,

  // Feature flags (for checking before instantiation)
  ML_FEATURES: {
    PATTERN_DETECTION: patternDetectionEnabled,
    COST_PREDICTION: costPredictionEnabled,
    ADAPTIVE_EXECUTION: adaptiveExecutionEnabled,
    PERFORMANCE_PROFILING: performanceProfilingEnabled,
    PATTERN_LIBRARY: patternLibraryEnabled,
  },
  /** Effective ML_AUTOMATION_MODE (off | log | enforce) */
  ML_AUTOMATION_MODE: effectiveMLAutomationMode,
};
