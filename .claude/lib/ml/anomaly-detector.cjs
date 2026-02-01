/**
 * SPEC-025: Anomaly Detector
 *
 * Distance-based outlier detector on top of PatternDetector clustering output.
 *
 * This module is intentionally passive: it only returns classifications and
 * never triggers actions (no spawns, no retraining) to avoid feedback loops.
 */

'use strict';

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class AnomalyDetector {
  /**
   * @param {{analyze: (session: any) => any, isTrained?: boolean}} patternDetector
   * @param {{threshold?: number, treatUntrainedAsAnomaly?: boolean}} [config]
   */
  constructor(patternDetector, config = {}) {
    if (!patternDetector || typeof patternDetector.analyze !== 'function') {
      throw new TypeError('AnomalyDetector requires a PatternDetector-like dependency with analyze(session)');
    }

    this.patternDetector = patternDetector;
    this.threshold = toNumber(config.threshold, toNumber(process.env.ANOMALY_DISTANCE_THRESHOLD, 10));
    this.treatUntrainedAsAnomaly = Boolean(config.treatUntrainedAsAnomaly);
  }

  /**
   * Detect anomalies for a session.
   *
   * @param {any} session
   * @returns {{
   *   isAnomaly: boolean,
   *   severity: 'none'|'low'|'medium'|'high',
   *   reason: string,
   *   distance: number|null,
   *   threshold: number,
   *   patternId: number|null
   * }}
   */
  detect(session) {
    // If model is explicitly untrained, fail closed (no anomaly) unless opted in.
    if (this.patternDetector.isTrained === false && !this.treatUntrainedAsAnomaly) {
      return {
        isAnomaly: false,
        severity: 'none',
        reason: 'Anomaly detector not ready: pattern model not trained',
        distance: null,
        threshold: this.threshold,
        patternId: null,
      };
    }

    const analysis = this.patternDetector.analyze(session) || {};

    const patternId = typeof analysis.patternId === 'number' ? analysis.patternId : null;
    const distance =
      typeof analysis.distance === 'number' && Number.isFinite(analysis.distance)
        ? analysis.distance
        : null;

    // Unclassifiable session: treat as anomaly only if the model is actually trained
    // (otherwise it would trivially flag everything).
    if (patternId === -1) {
      if (this.patternDetector.isTrained === false && !this.treatUntrainedAsAnomaly) {
        return {
          isAnomaly: false,
          severity: 'none',
          reason: 'Anomaly detector not ready: pattern model not trained',
          distance,
          threshold: this.threshold,
          patternId,
        };
      }

      return {
        isAnomaly: true,
        severity: 'high',
        reason: 'Unclassifiable session (no matching pattern/cluster)',
        distance,
        threshold: this.threshold,
        patternId,
      };
    }

    if (distance === null) {
      return {
        isAnomaly: false,
        severity: 'none',
        reason: 'No distance available from pattern analysis',
        distance: null,
        threshold: this.threshold,
        patternId,
      };
    }

    if (distance > this.threshold * 2) {
      return {
        isAnomaly: true,
        severity: 'high',
        reason: `Distance ${distance.toFixed(3)} exceeds critical threshold ${(this.threshold * 2).toFixed(3)}`,
        distance,
        threshold: this.threshold,
        patternId,
      };
    }

    if (distance > this.threshold) {
      return {
        isAnomaly: true,
        severity: 'medium',
        reason: `Distance ${distance.toFixed(3)} exceeds threshold ${this.threshold.toFixed(3)}`,
        distance,
        threshold: this.threshold,
        patternId,
      };
    }

    return {
      isAnomaly: false,
      severity: 'none',
      reason: 'Within expected distance',
      distance,
      threshold: this.threshold,
      patternId,
    };
  }
}

module.exports = AnomalyDetector;

