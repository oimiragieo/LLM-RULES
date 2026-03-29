'use strict';

/**
 * Milestone Gate
 *
 * Evaluates whether a milestone is ready to complete.
 *
 * Checks:
 * 1. All features in milestone have status 'completed'. Any non-completed feature blocks.
 * 2. All validation assertions for milestone features are 'passed' in validation-state.json via gatekeeper's canComplete().
 * 3. Infrastructure features (empty fulfills array) exempt from assertion checks - only need completed status.
 * 4. Features with status 'cancelled' excluded from gate evaluation entirely.
 *
 * Dynamic: reads current feature list at invocation time, no caching.
 *
 * Returns {passed:boolean, blocking:[], scrutiny:{verdict}, userTesting:{verdict}}.
 *
 * Triggers scrutiny + user-testing validators (via external orchestrator, not directly).
 */

const fs = require('node:fs');
const path = require('node:path');
const { ValidationStateGatekeeper } = require('./validation-state-gatekeeper.cjs');

/**
 * MilestoneGate class
 *
 * Evaluates whether a milestone is ready to complete.
 */
class MilestoneGate {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.milestone - Milestone name to evaluate
   * @param {string} options.featuresPath - Path to features.json
   * @param {string} options.statePath - Path to validation-state.json
   */
  constructor(options) {
    this.milestone = options.milestone;
    this.featuresPath = options.featuresPath ? path.normalize(options.featuresPath) : null;
    this.statePath = options.statePath ? path.normalize(options.statePath) : null;

    // Results
    this.features = [];
    this.blocking = [];
    this.scrutinyResult = { verdict: 'not_run' };
    this.userTestingResult = { verdict: 'not_run' };
  }

  /**
   * Load features.json
   * @returns {Object[]} - Array of feature objects
   */
  _loadFeatures() {
    if (!this.featuresPath || !fs.existsSync(this.featuresPath)) {
      const error = new Error(`features.json not found: ${this.featuresPath}`);
      error.code = 'FILE_NOT_FOUND';
      throw error;
    }

    let content;
    try {
      content = fs.readFileSync(this.featuresPath, 'utf8');
    } catch (readErr) {
      const error = new Error(`Failed to read features.json: ${readErr.message}`);
      error.code = 'READ_ERROR';
      throw error;
    }

    if (!content || content.trim() === '') {
      const error = new Error('features.json is empty');
      error.code = 'INVALID_JSON';
      throw error;
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      const error = new Error(`Invalid JSON in features.json: ${parseErr.message}`);
      error.code = 'INVALID_JSON';
      throw error;
    }

    if (!data.features || !Array.isArray(data.features)) {
      const error = new Error('features.json missing features array');
      error.code = 'INVALID_SCHEMA';
      throw error;
    }

    return data.features;
  }

  /**
   * Filter features to only those in the target milestone
   * Exclude cancelled features entirely
   *
   * @param {Object[]} features - All features
   * @returns {Object[]} - Features in milestone (excluding cancelled)
   */
  _filterMilestoneFeatures(features) {
    return features.filter(feature => {
      // Must be in the target milestone
      if (feature.milestone !== this.milestone) {
        return false;
      }

      // Exclude cancelled features entirely
      if (feature.status === 'cancelled') {
        return false;
      }

      return true;
    });
  }

  /**
   * Check if a feature is an infrastructure feature
   * Infrastructure features have empty or missing fulfills array
   *
   * @param {Object} feature - Feature object
   * @returns {boolean} - True if infrastructure feature
   */
  _isInfrastructureFeature(feature) {
    const fulfills = feature.fulfills;
    return !fulfills || !Array.isArray(fulfills) || fulfills.length === 0;
  }

  /**
   * Check feature completion status
   * Returns blocking items for incomplete features
   *
   * @param {Object} feature - Feature to check
   * @returns {Object|null} - Blocking item or null if completed
   */
  _checkFeatureCompletion(feature) {
    if (feature.status !== 'completed') {
      return {
        featureId: feature.id,
        reason: 'feature_not_completed',
        status: feature.status,
      };
    }
    return null;
  }

  /**
   * Check assertion status for a feature
   * Infrastructure features (empty fulfills) are exempt
   *
   * @param {Object} feature - Feature to check
   * @param {ValidationStateGatekeeper} gatekeeper - Gatekeeper instance
   * @returns {Object[]} - Array of blocking items for failed assertions
   */
  _checkAssertions(feature, gatekeeper) {
    const blocking = [];

    // Infrastructure features exempt from assertion checks
    if (this._isInfrastructureFeature(feature)) {
      return blocking;
    }

    const assertionIds = feature.fulfills || [];

    for (const assertionId of assertionIds) {
      const assertion = gatekeeper.getAssertion(assertionId);

      if (!assertion) {
        // Assertion doesn't exist in state
        blocking.push({
          featureId: feature.id,
          assertionId,
          reason: 'assertion_not_found',
        });
      } else if (assertion.status !== 'passed') {
        // Assertion not passed
        blocking.push({
          featureId: feature.id,
          assertionId,
          reason: 'assertion_not_passed',
          assertionStatus: assertion.status,
        });
      }
    }

    return blocking;
  }

  /**
   * Determine scrutiny verdict based on features and blocking
   * If all features completed and assertions passed, scrutiny would be approved
   *
   * @returns {Object} - { verdict: string }
   */
  _determineScrutinyVerdict() {
    // If passed, scrutiny would be approved
    if (this.blocking.length === 0) {
      return { verdict: 'approved' };
    }

    // If there are feature completion blockers, scrutiny can't pass
    const hasIncompleteFeatures = this.blocking.some(b => b.reason === 'feature_not_completed');
    if (hasIncompleteFeatures) {
      return { verdict: 'skipped', reason: 'incomplete_features' };
    }

    // If assertions failed, scrutiny would have rejected
    const hasFailedAssertions = this.blocking.some(b => b.reason.startsWith('assertion_'));
    if (hasFailedAssertions) {
      return { verdict: 'rejected' };
    }

    return { verdict: 'not_run' };
  }

  /**
   * Determine user testing verdict based on features and blocking
   *
   * @returns {Object} - { verdict: string }
   */
  _determineUserTestingVerdict() {
    // If passed, user testing would be approved
    if (this.blocking.length === 0) {
      return { verdict: 'approved' };
    }

    // If there are feature completion blockers, user testing can't run
    const hasIncompleteFeatures = this.blocking.some(b => b.reason === 'feature_not_completed');
    if (hasIncompleteFeatures) {
      return { verdict: 'skipped', reason: 'incomplete_features' };
    }

    // If assertions failed, user testing would have rejected
    const hasFailedAssertions = this.blocking.some(b => b.reason.startsWith('assertion_'));
    if (hasFailedAssertions) {
      return { verdict: 'rejected' };
    }

    return { verdict: 'not_run' };
  }

  /**
   * Evaluate the milestone gate
   *
   * @returns {Promise<Object>} - { passed, blocking, scrutiny, userTesting }
   */
  async evaluate() {
    this.blocking = [];

    try {
      // Load features fresh at invocation time (dynamic, no caching)
      const allFeatures = this._loadFeatures();

      // Filter to milestone features, excluding cancelled
      const milestoneFeatures = this._filterMilestoneFeatures(allFeatures);

      // Empty milestone passes (nothing to block)
      if (milestoneFeatures.length === 0) {
        return {
          passed: true,
          blocking: [],
          features: [],
          scrutiny: { verdict: 'skipped', reason: 'empty_milestone' },
          userTesting: { verdict: 'skipped', reason: 'empty_milestone' },
        };
      }

      // Initialize gatekeeper for assertion checks
      const gatekeeper = new ValidationStateGatekeeper(this.statePath);

      // Check each feature
      for (const feature of milestoneFeatures) {
        // Check completion status
        const completionBlocker = this._checkFeatureCompletion(feature);
        if (completionBlocker) {
          this.blocking.push(completionBlocker);
          continue; // Skip assertion checks for incomplete features
        }

        // Check assertions (only for completed, non-infrastructure features)
        const assertionBlockers = this._checkAssertions(feature, gatekeeper);
        this.blocking.push(...assertionBlockers);
      }

      // Determine verdicts
      const passed = this.blocking.length === 0;
      const scrutinyVerdict = this._determineScrutinyVerdict();
      const userTestingVerdict = this._determineUserTestingVerdict();

      return {
        passed,
        blocking: this.blocking,
        features: milestoneFeatures.map(f => ({
          id: f.id,
          status: f.status,
          fulfills: f.fulfills || [],
        })),
        scrutiny: scrutinyVerdict,
        userTesting: userTestingVerdict,
      };
    } catch (err) {
      // Handle errors gracefully
      return {
        passed: false,
        blocking: [
          {
            reason: err.code === 'FILE_NOT_FOUND' ? 'features_file_error' : 'features_parse_error',
            error: err.message,
            code: err.code,
          },
        ],
        features: [],
        scrutiny: { verdict: 'error', error: err.message },
        userTesting: { verdict: 'error', error: err.message },
        error: err.message,
      };
    }
  }
}

/**
 * Convenience function to evaluate milestone gate
 *
 * @param {Object} options - Configuration options
 * @param {string} options.milestone - Milestone name
 * @param {string} options.featuresPath - Path to features.json
 * @param {string} options.statePath - Path to validation-state.json
 * @returns {Promise<Object>} - Gate result
 */
async function evaluateMilestoneGate(options) {
  const gate = new MilestoneGate(options);
  return gate.evaluate();
}

/**
 * Check if a specific feature can complete
 * Uses the gatekeeper's canComplete() method
 *
 * @param {string} statePath - Path to validation-state.json
 * @param {string[]} assertionIds - Assertion IDs the feature fulfills
 * @returns {Object} - { allowed, blocking }
 */
function canFeatureComplete(statePath, assertionIds) {
  const gatekeeper = new ValidationStateGatekeeper(statePath);
  return gatekeeper.canComplete(assertionIds);
}

/**
 * Get all features in a milestone that are blocking
 *
 * @param {string} featuresPath - Path to features.json
 * @param {string} milestone - Milestone name
 * @returns {Object[]} - Array of blocking features with reasons
 */
function getMilestoneBlockingFeatures(featuresPath, milestone) {
  const gate = new MilestoneGate({
    milestone,
    featuresPath,
    statePath: null, // Not needed for feature status check only
  });

  try {
    const allFeatures = gate._loadFeatures();
    const milestoneFeatures = gate._filterMilestoneFeatures(allFeatures);

    const blocking = [];
    for (const feature of milestoneFeatures) {
      const blocker = gate._checkFeatureCompletion(feature);
      if (blocker) {
        blocking.push(blocker);
      }
    }

    return blocking;
  } catch (err) {
    return [{ reason: 'features_file_error', error: err.message }];
  }
}

module.exports = {
  MilestoneGate,
  evaluateMilestoneGate,
  canFeatureComplete,
  getMilestoneBlockingFeatures,
};
