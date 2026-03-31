#!/usr/bin/env node
'use strict';

const { PatternDetector } = require('./pattern-detector.cjs');
const { SuggestionGenerator } = require('./suggestion-generator.cjs');

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
  /** Minimum invocations a skill must have before being included in analysis. */
  minInvocationsForAnalysis: 20,
  /** Success rate below which a skill is considered frequently failing (0–1). */
  failureRateAlert: 0.3,
  /** Average duration in ms above which a skill is considered high-latency. */
  latencyAlertMs: 5000,
  /** Number of days of inactivity before a skill is considered underutilized. */
  unusedDays: 30,
  /** Minimum suggestion confidence required to trigger an evolution request (0–1). */
  confidenceThreshold: 0.7,
};

class EvolutionTrigger {
  /**
   * @param {object} [options]
   * @param {object|null} [options.evolutionRequestRouter] - Optional router with a
   *   createRequest(request) method. When omitted the trigger runs in dry-run mode:
   *   suggestions are still evaluated and returned but no requests are created.
   * @param {object} [options.thresholds] - Override any of the default thresholds.
   */
  constructor({ evolutionRequestRouter, thresholds } = {}) {
    this._router = evolutionRequestRouter != null ? evolutionRequestRouter : null;
    this._thresholds = Object.assign(
      {},
      DEFAULT_THRESHOLDS,
      thresholds != null && typeof thresholds === 'object' ? thresholds : {}
    );
  }

  /**
   * Evaluate usage data through the full pipeline:
   *   PatternDetector → SuggestionGenerator → EvolutionRequestRouter
   *
   * For each suggestion whose confidence meets or exceeds the configured
   * confidenceThreshold, the evolution-request-router is called (if provided).
   * When no router is provided the trigger runs in dry-run mode — suggestions
   * above the threshold are still listed in `triggered` but no requests are created.
   *
   * @param {import('./skill-usage-tracker.cjs').SkillUsageTracker} usageTracker
   * @returns {{ triggered: object[], skipped: object[], analyzed: number }}
   */
  evaluate(usageTracker) {
    const patternDetector = new PatternDetector({
      failingMinInvocations: this._thresholds.minInvocationsForAnalysis,
      failingSuccessRateThreshold: this._thresholds.failureRateAlert,
      highLatencyThresholdMs: this._thresholds.latencyAlertMs,
      underutilizedPeriodMs: this._thresholds.unusedDays * 24 * 60 * 60 * 1000,
    });

    const suggestionGenerator = new SuggestionGenerator();

    const { patterns } = patternDetector.detect(usageTracker);
    const { suggestions } = suggestionGenerator.generate(patterns);

    const triggered = [];
    const skipped = [];

    for (const suggestion of suggestions) {
      if (suggestion.confidence >= this._thresholds.confidenceThreshold) {
        triggered.push(suggestion);
        if (this._router !== null) {
          this._router.createRequest(_buildEvolutionRequest(suggestion));
        }
      } else {
        skipped.push(suggestion);
      }
    }

    return { triggered, skipped, analyzed: suggestions.length };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Build an evolution request object from a suggestion.
 *
 * @param {object} suggestion
 * @returns {object}
 */
function _buildEvolutionRequest(suggestion) {
  const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    trigger: `auto_${suggestion.type}`,
    summary: suggestion.reason,
    suggestedArtifactType: 'skill',
    targetArtifact: {
      type: 'skill',
      name: suggestion.skillName,
    },
    confidence: suggestion.confidence,
    source: 'evolution-trigger',
    status: 'proposed',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { EvolutionTrigger };
