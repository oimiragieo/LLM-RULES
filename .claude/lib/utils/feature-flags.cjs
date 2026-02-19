/**
 * Feature Flags System - Phased Rollout
 *
 * Supports gradual rollout (10% → 50% → 100%) with consistent hashing
 * for stable user assignment. Includes rollback procedure for emergency
 * disabling.
 *
 * Environment Variables:
 * - MEMORY_SYSTEM_ENABLED: true/false
 * - MEMORY_ROLLOUT_PERCENTAGE: 0-100
 * - PARTY_MODE_ENABLED: true/false
 * - PARTY_ROLLOUT_PERCENTAGE: 0-100
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class FeatureFlags {
  constructor(options = {}) {
    this.flags = new Map();
    this.rolloutPercentages = new Map();
    this.rollbackHistory = new Map();
    this.projectRoot = options.projectRoot || process.cwd();
    this.configPath = options.configPath || path.join(this.projectRoot, '.claude', 'config.yaml');

    // Initialize from environment variables
    this._initializeFromConfigAndEnv();
  }

  /**
   * Initialize feature flags from config and environment variables.
   * Priority: Environment Variables > Config File > Defaults
   * @private
   */
  _initializeFromConfigAndEnv() {
    const configFeatures = this._readConfigFeatures();
    const partyConfigEnabled = configFeatures.partyMode?.enabled === true;
    const elicitationConfigEnabled = configFeatures.advancedElicitation?.enabled === true;

    const partyEnvEnabled = process.env.PARTY_MODE_ENABLED;
    const partyEnvRollout = process.env.PARTY_ROLLOUT_PERCENTAGE;
    const elicitationEnvEnabled = process.env.ELICITATION_ENABLED;
    const memoryEnvEnabled = process.env.MEMORY_SYSTEM_ENABLED;
    const memoryEnvRollout = process.env.MEMORY_ROLLOUT_PERCENTAGE;

    // Memory System feature
    this._registerFeature(
      'memory_system',
      memoryEnvEnabled === 'true',
      this._parsePercentage(memoryEnvRollout, 0)
    );

    // Party Mode feature
    this._registerFeature(
      'party_mode',
      partyEnvEnabled ? partyEnvEnabled === 'true' : partyConfigEnabled,
      this._parsePercentage(partyEnvRollout, partyConfigEnabled ? 100 : 0)
    );

    // Advanced Elicitation feature
    this._registerFeature(
      'advanced_elicitation',
      elicitationEnvEnabled ? elicitationEnvEnabled === 'true' : elicitationConfigEnabled,
      elicitationConfigEnabled ? 100 : 0
    );
  }

  /**
   * Read feature section from .claude/config.yaml
   * @private
   * @returns {object} feature flags from config or empty object
   */
  _readConfigFeatures() {
    try {
      if (!fs.existsSync(this.configPath)) return {};
      const parsed = yaml.load(fs.readFileSync(this.configPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return {};
      const features = parsed.features;
      return features && typeof features === 'object' ? features : {};
    } catch (_err) {
      return {};
    }
  }

  /**
   * Register a feature flag
   * @private
   * @param {string} name - Feature name
   * @param {boolean} enabled - Whether feature is enabled
   * @param {number} rolloutPercentage - Rollout percentage (0-100)
   */
  _registerFeature(name, enabled, rolloutPercentage) {
    if (rolloutPercentage < 0 || rolloutPercentage > 100) {
      throw new Error(`Rollout percentage must be between 0 and 100, got ${rolloutPercentage}`);
    }

    this.flags.set(name, enabled);
    this.rolloutPercentages.set(name, rolloutPercentage);
    this.rollbackHistory.set(name, []);
  }

  /**
   * Parse percentage from string, with validation
   * @private
   * @param {string} value - Percentage value as string
   * @param {number} defaultValue - Default if invalid
   * @returns {number} - Parsed percentage
   */
  _parsePercentage(value, defaultValue) {
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      console.warn(`Invalid percentage value "${value}", defaulting to ${defaultValue}`);
      return defaultValue;
    }

    return parsed;
  }

  /**
   * Check if a feature is globally enabled
   * @param {string} featureName - Feature to check
   * @returns {boolean} - True if enabled
   */
  isEnabled(featureName) {
    return this.flags.get(featureName) || false;
  }

  /**
   * Get rollout percentage for a feature
   * @param {string} featureName - Feature to check
   * @returns {number} - Rollout percentage (0-100)
   */
  getRolloutPercentage(featureName) {
    return this.rolloutPercentages.get(featureName) || 0;
  }

  /**
   * Determine if feature should be used for this session
   * Uses consistent hashing for stable assignment
   *
   * @param {string} featureName - Feature to check
   * @param {string} sessionId - Session/user identifier
   * @returns {boolean} - True if feature should be used
   */
  shouldUse(featureName, sessionId) {
    // If feature disabled globally, return false
    if (!this.isEnabled(featureName)) {
      return false;
    }

    const percentage = this.getRolloutPercentage(featureName);

    // 0% rollout = disabled for everyone
    if (percentage === 0) {
      return false;
    }

    // 100% rollout = enabled for everyone
    if (percentage === 100) {
      return true;
    }

    // Gradual rollout: use consistent hashing
    return this._hashToPercentage(featureName, sessionId) < percentage;
  }

  /**
   * Hash session ID to percentage for consistent assignment
   * @private
   * @param {string} featureName - Feature name
   * @param {string} sessionId - Session identifier
   * @returns {number} - Hash percentage (0-99)
   */
  _hashToPercentage(featureName, sessionId) {
    // Fallback for empty/null IDs
    const id = sessionId || 'default-session';

    // Combine feature name + session ID for namespacing
    const input = `${featureName}:${id}`;

    // SHA-256 hash
    const hash = crypto.createHash('sha256').update(input).digest('hex');

    // Use first 8 hex chars for percentage (0-99)
    const intValue = parseInt(hash.substring(0, 8), 16);
    return intValue % 100;
  }

  /**
   * Rollback a feature (emergency disable)
   * @param {string} featureName - Feature to rollback
   * @param {string} reason - Reason for rollback
   */
  rollback(featureName, reason) {
    console.warn(`[ROLLBACK] Disabling feature "${featureName}": ${reason}`);

    // Disable feature
    this.flags.set(featureName, false);

    // Reset rollout to 0%
    this.rolloutPercentages.set(featureName, 0);

    // Record rollback
    const history = this.rollbackHistory.get(featureName) || [];
    history.push({
      timestamp: new Date().toISOString(),
      reason,
    });
    this.rollbackHistory.set(featureName, history);
  }

  /**
   * Get status of a feature
   * @param {string} featureName - Feature to check
   * @returns {object} - Status object
   */
  getStatus(featureName) {
    return {
      enabled: this.isEnabled(featureName),
      rolloutPercentage: this.getRolloutPercentage(featureName),
      rollbackHistory: this.rollbackHistory.get(featureName) || [],
    };
  }

  /**
   * Get status of all features
   * @returns {object} - All feature statuses
   */
  getAllStatus() {
    const status = {};
    for (const featureName of this.flags.keys()) {
      status[featureName] = this.getStatus(featureName);
    }
    return status;
  }
}

module.exports = { FeatureFlags };
