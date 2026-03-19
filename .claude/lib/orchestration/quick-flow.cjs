'use strict';

/**
 * Quick Flow — Solo Dev Mode
 *
 * Three modes for different development velocities:
 *   SOLO:       Skip planner, skip review, minimal overhead (bug fixes, trivial changes)
 *   STANDARD:   Use planner for non-trivial, review for non-trivial (default)
 *   ENTERPRISE: Always plan, always review, security gates (production systems)
 *
 * @module quick-flow
 */

const FlowMode = Object.freeze({
  SOLO: 'solo',
  STANDARD: 'standard',
  ENTERPRISE: 'enterprise',
});

/**
 * Classify task complexity from indicators.
 *
 * @param {{ fileCount?: number, hasArchDecision?: boolean }} indicators
 * @returns {{ level: string }}
 */
function classifyComplexity(indicators) {
  const files = indicators.fileCount || 0;
  const arch = Boolean(indicators.hasArchDecision);

  if (files >= 15 && arch) return { level: 'epic' };
  if (files >= 10) return { level: 'high' };
  if (arch) return { level: 'medium' };
  if (files > 1) return { level: 'low' };
  return { level: 'trivial' };
}

class QuickFlow {
  /**
   * @param {{ mode: string }} opts
   */
  constructor(opts = {}) {
    this.mode = opts.mode || FlowMode.STANDARD;
  }

  /**
   * Should a planner be spawned for this complexity?
   * @param {{ level?: string }} [complexity]
   * @returns {boolean}
   */
  shouldUsePlanner(complexity) {
    if (this.mode === FlowMode.ENTERPRISE) return true;
    if (this.mode === FlowMode.SOLO) return false;
    // STANDARD: plan for medium+
    const level = complexity?.level || 'trivial';
    return !['trivial', 'low'].includes(level);
  }

  /**
   * Should code review be performed?
   * @param {{ level?: string }} [complexity]
   * @returns {boolean}
   */
  shouldReview(complexity) {
    if (this.mode === FlowMode.ENTERPRISE) return true;
    if (this.mode === FlowMode.SOLO) return false;
    const level = complexity?.level || 'trivial';
    return level !== 'trivial';
  }

  /**
   * Should security review be performed?
   * @param {{ level?: string, hasSecurity?: boolean }} [context]
   * @returns {boolean}
   */
  shouldSecurityReview(context) {
    if (context?.hasSecurity) return true;
    if (this.mode === FlowMode.ENTERPRISE) return true;
    return false;
  }

  /**
   * Get phases for this mode and complexity.
   * @param {{ level?: string }} [complexity]
   * @returns {string[]}
   */
  getPhases(complexity) {
    const phases = [];
    if (this.shouldUsePlanner(complexity)) phases.push('plan');
    phases.push('implement');
    if (this.shouldReview(complexity)) phases.push('review');
    if (
      this.mode === FlowMode.ENTERPRISE ||
      (complexity?.level && !['trivial'].includes(complexity.level))
    ) {
      phases.push('deploy');
    }
    return phases;
  }

  /**
   * Get recommended mode for a complexity level.
   * @param {string} complexityLevel
   * @returns {string}
   */
  static getRecommendedMode(complexityLevel) {
    switch (complexityLevel) {
      case 'trivial':
        return FlowMode.SOLO;
      case 'low':
      case 'medium':
        return FlowMode.STANDARD;
      default:
        return FlowMode.ENTERPRISE;
    }
  }
}

module.exports = {
  QuickFlow,
  FlowMode,
  classifyComplexity,
};
