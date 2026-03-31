#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// Confidence constants
// ---------------------------------------------------------------------------
/** Confidence data-volume scale factor: invocations needed to reach full confidence. */
const INVOCATIONS_FULL_CONFIDENCE = 100;

/** Confidence data-volume scale factor: co-occurrence count needed for full confidence. */
const CO_OCCURRENCE_FULL_CONFIDENCE = 20;

class SuggestionGenerator {
  /**
   * Generate actionable suggestions from an array of detected patterns.
   *
   * @param {Array<{type:string, skillNames:string[], description:string, severity:string, data:object}>} patterns
   * @returns {{ suggestions: Array<{type:string, skillName:string, reason:string, confidence:number, action:object}> }}
   */
  generate(patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return { suggestions: [] };
    }

    const suggestions = [];
    for (const pattern of patterns) {
      const suggestion = _buildSuggestion(pattern);
      if (suggestion !== null) {
        suggestions.push(suggestion);
      }
    }

    return { suggestions };
  }
}

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------

/**
 * Dispatch a pattern to the appropriate suggestion builder.
 *
 * @param {object} pattern
 * @returns {object|null}
 */
function _buildSuggestion(pattern) {
  switch (pattern.type) {
    case 'high-latency':
      return _buildOptimizeSuggestion(pattern);
    case 'frequently-failing':
      return _buildSplitSuggestion(pattern);
    case 'co-occurring':
      return _buildMergeSuggestion(pattern);
    case 'underutilized':
      return _buildDeprecateSuggestion(pattern);
    default:
      return null;
  }
}

/**
 * Build an "optimize" suggestion from a high-latency pattern.
 * Confidence increases as avgDurationMs exceeds the threshold.
 *
 * @param {object} pattern
 * @returns {object}
 */
function _buildOptimizeSuggestion(pattern) {
  const skillName = pattern.skillNames[0];
  const { avgDurationMs, thresholdMs } = pattern.data;

  // Confidence: how far avgDurationMs exceeds the threshold, capped at 1.
  // At 2× threshold → ~0.5, at 4× threshold → ~0.75, asymptotically approaches 1.
  const ratio = thresholdMs > 0 ? avgDurationMs / thresholdMs : 1;
  const confidence = Math.min(1, 1 - 1 / ratio);

  return {
    type: 'optimize',
    skillName,
    reason:
      `Skill "${skillName}" has high average latency of ${Math.round(avgDurationMs)}ms ` +
      `(threshold: ${thresholdMs}ms). Consider adding caching or simplifying the skill logic.`,
    confidence: _clamp(confidence),
    action: {
      type: 'optimize-skill',
      suggestions: ['add-caching', 'simplify-logic'],
    },
  };
}

/**
 * Build a "split" suggestion from a frequently-failing pattern.
 * Confidence increases with invocation count (data volume) and lower success rate.
 *
 * @param {object} pattern
 * @returns {object}
 */
function _buildSplitSuggestion(pattern) {
  const skillName = pattern.skillNames[0];
  const { successRate, invocations } = pattern.data;

  // Confidence: combine data volume weight and failure severity.
  const dataWeight = Math.min(1, invocations / INVOCATIONS_FULL_CONFIDENCE);
  const severityWeight = 1 - successRate; // lower successRate → higher weight
  const confidence = dataWeight * 0.6 + severityWeight * 0.4;

  return {
    type: 'split',
    skillName,
    reason:
      `Skill "${skillName}" fails frequently ` +
      `(success rate: ${(successRate * 100).toFixed(1)}% over ${invocations} invocations). ` +
      `The skill may be too broad — splitting it into focused sub-skills could reduce failures.`,
    confidence: _clamp(confidence),
    action: {
      type: 'split-skill',
      targetSkill: skillName,
    },
  };
}

/**
 * Build a "merge" suggestion from a co-occurring pattern.
 * Confidence increases with co-occurrence count.
 *
 * @param {object} pattern
 * @returns {object}
 */
function _buildMergeSuggestion(pattern) {
  const [skillA, skillB] = pattern.skillNames;
  const { coOccurrenceCount, windowMs } = pattern.data;

  // Confidence: proportion of full confidence count, capped at 1.
  const confidence = Math.min(1, coOccurrenceCount / CO_OCCURRENCE_FULL_CONFIDENCE);

  return {
    type: 'merge',
    skillName: `${skillA}+${skillB}`,
    reason:
      `Skills "${skillA}" and "${skillB}" co-occur ${coOccurrenceCount} time(s) ` +
      `within a ${windowMs}ms window. Merging them into a single skill may reduce overhead.`,
    confidence: _clamp(confidence),
    action: {
      type: 'merge-skills',
      targetSkills: [skillA, skillB],
    },
  };
}

/**
 * Build a "deprecate" suggestion from an underutilized pattern.
 * Confidence is higher when the skill has never been used.
 *
 * @param {object} pattern
 * @returns {object}
 */
function _buildDeprecateSuggestion(pattern) {
  const skillName = pattern.skillNames[0];
  const { lastUsed, invocations, periodMs } = pattern.data;

  let confidence;
  if (lastUsed === null || lastUsed === undefined) {
    // Never used → high confidence this is a candidate for deprecation.
    confidence = 0.9;
  } else {
    // The longer it has been since last use (relative to period), the more confident.
    const msSinceUse = Date.now() - new Date(lastUsed).getTime();
    const periodsElapsed = periodMs > 0 ? msSinceUse / periodMs : 1;
    confidence = Math.min(0.85, 0.4 + 0.3 * Math.min(1, periodsElapsed - 1));
  }

  const unusedDesc =
    lastUsed != null
      ? `last used ${lastUsed}`
      : invocations === 0
        ? 'never invoked'
        : 'not recently invoked';

  return {
    type: 'deprecate',
    skillName,
    reason:
      `Skill "${skillName}" appears underutilized (${unusedDesc}). ` +
      `Consider deprecating or archiving it to reduce maintenance overhead.`,
    confidence: _clamp(confidence),
    action: {
      type: 'deprecate-skill',
      targetSkill: skillName,
    },
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a confidence value to the range [0, 1].
 * @param {number} value
 * @returns {number}
 */
function _clamp(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = { SuggestionGenerator };
