#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// Default configuration values
// ---------------------------------------------------------------------------
const DEFAULTS = {
  /** successRate threshold below which a skill is "frequently failing" */
  failingSuccessRateThreshold: 0.5,
  /** minimum invocations required before flagging as frequently-failing */
  failingMinInvocations: 10,
  /** milliseconds of inactivity before a skill is "underutilized" (default: 7 days) */
  underutilizedPeriodMs: 7 * 24 * 60 * 60 * 1000,
  /** avgDurationMs strictly above this value triggers a "high-latency" pattern (default: 5s) */
  highLatencyThresholdMs: 5000,
  /** time window in ms within which two different skills are considered co-occurring */
  coOccurrenceWindowMs: 60 * 1000,
  /** minimum number of co-occurring pairs required to surface the pattern */
  coOccurrenceMinCount: 3,
};

class PatternDetector {
  /**
   * @param {object} [config]
   * @param {number} [config.failingSuccessRateThreshold]
   * @param {number} [config.failingMinInvocations]
   * @param {number} [config.underutilizedPeriodMs]
   * @param {number} [config.highLatencyThresholdMs]
   * @param {number} [config.coOccurrenceWindowMs]
   * @param {number} [config.coOccurrenceMinCount]
   */
  constructor(config) {
    const cfg = config != null && typeof config === 'object' ? config : {};
    this._config = {
      failingSuccessRateThreshold:
        cfg.failingSuccessRateThreshold != null
          ? cfg.failingSuccessRateThreshold
          : DEFAULTS.failingSuccessRateThreshold,
      failingMinInvocations:
        cfg.failingMinInvocations != null
          ? cfg.failingMinInvocations
          : DEFAULTS.failingMinInvocations,
      underutilizedPeriodMs:
        cfg.underutilizedPeriodMs != null
          ? cfg.underutilizedPeriodMs
          : DEFAULTS.underutilizedPeriodMs,
      highLatencyThresholdMs:
        cfg.highLatencyThresholdMs != null
          ? cfg.highLatencyThresholdMs
          : DEFAULTS.highLatencyThresholdMs,
      coOccurrenceWindowMs:
        cfg.coOccurrenceWindowMs != null ? cfg.coOccurrenceWindowMs : DEFAULTS.coOccurrenceWindowMs,
      coOccurrenceMinCount:
        cfg.coOccurrenceMinCount != null ? cfg.coOccurrenceMinCount : DEFAULTS.coOccurrenceMinCount,
    };
  }

  /**
   * Analyze a SkillUsageTracker and return detected patterns.
   *
   * @param {import('./skill-usage-tracker.cjs').SkillUsageTracker} usageTracker
   * @returns {{ patterns: Array<{type: string, skillNames: string[], description: string, severity: string, data: object}> }}
   */
  detect(usageTracker) {
    const allStats = usageTracker.getAllStats();
    const allRecords = usageTracker._readAllRecords();
    const patterns = [];

    _detectFrequentlyFailing(allStats, this._config, patterns);
    _detectUnderutilized(allStats, this._config, patterns);
    _detectHighLatency(allStats, this._config, patterns);
    _detectCoOccurring(allRecords, this._config, patterns);

    return { patterns };
  }
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

/**
 * Detect skills that fail more than half the time and have enough invocations
 * to be statistically meaningful.
 */
function _detectFrequentlyFailing(allStats, config, patterns) {
  for (const [skillName, stats] of Object.entries(allStats)) {
    if (
      stats.invocations > config.failingMinInvocations &&
      stats.successRate < config.failingSuccessRateThreshold
    ) {
      patterns.push({
        type: 'frequently-failing',
        skillNames: [skillName],
        description:
          `Skill "${skillName}" has a success rate of ` +
          `${(stats.successRate * 100).toFixed(1)}% over ${stats.invocations} invocations`,
        severity: 'high',
        data: {
          successRate: stats.successRate,
          invocations: stats.invocations,
        },
      });
    }
  }
}

/**
 * Detect skills whose last invocation is older than the configured period,
 * indicating they have had zero invocations in that time window.
 */
function _detectUnderutilized(allStats, config, patterns) {
  const now = Date.now();
  for (const [skillName, stats] of Object.entries(allStats)) {
    const lastUsedMs = stats.lastUsed != null ? new Date(stats.lastUsed).getTime() : null;
    const isUnderutilized = lastUsedMs === null || now - lastUsedMs > config.underutilizedPeriodMs;
    if (isUnderutilized) {
      const periodDays = Math.round(config.underutilizedPeriodMs / (24 * 60 * 60 * 1000));
      patterns.push({
        type: 'underutilized',
        skillNames: [skillName],
        description:
          stats.lastUsed != null
            ? `Skill "${skillName}" has not been used in the last ${periodDays} day(s) (last used: ${stats.lastUsed})`
            : `Skill "${skillName}" has never been used`,
        severity: 'low',
        data: {
          lastUsed: stats.lastUsed,
          invocations: stats.invocations,
          periodMs: config.underutilizedPeriodMs,
        },
      });
    }
  }
}

/**
 * Detect skills whose average execution duration exceeds the configured threshold.
 */
function _detectHighLatency(allStats, config, patterns) {
  for (const [skillName, stats] of Object.entries(allStats)) {
    if (stats.avgDurationMs > config.highLatencyThresholdMs) {
      patterns.push({
        type: 'high-latency',
        skillNames: [skillName],
        description:
          `Skill "${skillName}" has an average duration of ` +
          `${Math.round(stats.avgDurationMs)}ms (threshold: ${config.highLatencyThresholdMs}ms)`,
        severity: 'medium',
        data: {
          avgDurationMs: stats.avgDurationMs,
          thresholdMs: config.highLatencyThresholdMs,
        },
      });
    }
  }
}

/**
 * Detect pairs of skills that are frequently invoked together within a
 * short time window — a signal that they may be merged or coupled.
 *
 * Algorithm: sort records by timestamp, then use a sliding window to count
 * how many times each unique (skillA, skillB) pair appears within
 * `coOccurrenceWindowMs` of each other.
 */
function _detectCoOccurring(records, config, patterns) {
  if (records.length < 2) return;

  // Sort ascending by timestamp
  const sorted = records
    .filter(r => r.timestamp != null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (sorted.length < 2) return;

  /** @type {Map<string, number>} */
  const pairCounts = new Map();
  const windowMs = config.coOccurrenceWindowMs;

  for (let i = 0; i < sorted.length; i++) {
    const tA = new Date(sorted[i].timestamp).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      const tB = new Date(sorted[j].timestamp).getTime();
      if (tB - tA > windowMs) break;
      if (sorted[i].skillName === sorted[j].skillName) continue;

      // Canonical pair key (alphabetically sorted to avoid double-counting)
      const pair = [sorted[i].skillName, sorted[j].skillName].sort().join('\x00');
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    }
  }

  for (const [pair, count] of pairCounts.entries()) {
    if (count >= config.coOccurrenceMinCount) {
      const [skillA, skillB] = pair.split('\x00');
      patterns.push({
        type: 'co-occurring',
        skillNames: [skillA, skillB],
        description:
          `Skills "${skillA}" and "${skillB}" co-occur ${count} time(s) ` +
          `within a ${windowMs}ms window`,
        severity: 'low',
        data: {
          coOccurrenceCount: count,
          windowMs,
        },
      });
    }
  }
}

module.exports = { PatternDetector };
