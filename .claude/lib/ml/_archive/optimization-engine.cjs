/**
 * OptimizationEngine.cjs
 *
 * SPEC-024: Automated Optimization
 * Applies configuration policies based on detected workflow patterns.
 *
 * Readiness: optimize() is only useful when the PatternDetector is trained.
 * Use isReady() before calling optimize() to avoid permanently null results.
 * Training happens when FeedbackLoop.process(session) is called at SessionEnd
 * (or manually) and ingest count reaches retrainThreshold; retraining is gated
 * by ML_AUTOMATION_MODE (off | log | enforce).
 */

'use strict';

const fs = require('fs');
const path = require('path');

class OptimizationEngine {
  constructor(patternDetector, config = {}) {
    this.patternDetector = patternDetector;
    this.policies = config.policies || this._getDefaultPolicies();
    this.persistencePath = config.persistencePath || null;
  }

  /**
   * Check whether the engine can produce useful recommendations.
   * Requires a trained PatternDetector; otherwise optimize() will return null.
   * @returns {{ ready: boolean, reason?: string }}
   */
  isReady() {
    if (!this.patternDetector) {
      return { ready: false, reason: 'No pattern detector configured' };
    }
    if (!this.patternDetector.isTrained) {
      return {
        ready: false,
        reason:
          'Pattern detector not trained; run FeedbackLoop.process(session) at SessionEnd until retrain triggers',
      };
    }
    return { ready: true };
  }

  /**
   * Analyze a completed session and recommend configuration changes for next time.
   * Returns null if not ready (use isReady() first). Recommendations are advisory-only
   * unless ML_AUTOMATION_MODE=enforce (caller must apply or log).
   * @param {Object} session - The completed workflow session data { history, metrics, trace }
   * @returns {Object|null} Configuration overrides or null if no recommendation
   */
  optimize(session) {
    const readiness = this.isReady();
    if (!readiness.ready) {
      return null;
    }

    const verification = this.patternDetector.analyze(session);

    // logic: If valid pattern found, lookup policy
    if (verification.patternId !== -1 && this.policies[verification.patternId]) {
      // In a real system, we might merge this with existing config
      // For V1, we return the specific policy overrides
      return {
        ...this.policies[verification.patternId],
        _meta: {
          reason: `Matched Pattern ${verification.patternId} (Confidence: ${verification.confidence})`,
          patternId: verification.patternId,
        },
      };
    }

    return null;
  }

  /**
   * Save current policies to disk
   */
  savePolicies() {
    if (!this.persistencePath) return;
    fs.writeFileSync(this.persistencePath, JSON.stringify(this.policies, null, 2));
  }

  /**
   * Load policies from disk
   */
  loadPolicies() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    try {
      this.policies = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));
    } catch (err) {
      console.error('[OptimizationEngine] Failed to load policies:', err);
    }
  }

  _getDefaultPolicies() {
    return {
      // Cluster 0 (e.g., Quick/Small Tasks) -> High Concurrency, Fast Model
      0: {
        maxConcurrency: 50,
        modelPreference: 'fast-v1',
        retryLimit: 1,
      },
      // Cluster 1 (e.g., Heavy/Architectural) -> Low Concurrency, Smart Model
      1: {
        maxConcurrency: 5,
        modelPreference: 'reasoning-v1',
        retryLimit: 5,
      },
    };
  }
}

module.exports = OptimizationEngine;
