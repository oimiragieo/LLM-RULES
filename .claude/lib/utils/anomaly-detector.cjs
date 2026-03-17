'use strict';

/**
 * Anomaly Preservation Utility (D7)
 *
 * Detects and preserves high-signal anomaly lines during context compression.
 * Lines containing severity keywords are tagged as anomalies and retained
 * even when the token budget is tight.
 *
 * @module anomaly-detector
 */

/**
 * Ordered list of anomaly severity keywords (case-insensitive match).
 * Ordered from highest to lowest severity so callers can filter by level.
 */
const ANOMALY_KEYWORDS = [
  'FATAL',
  'OOM',
  'segfault',
  'deadlock',
  'PANIC',
  'EXCEPTION',
  'CRITICAL',
  'ERROR',
  'WARNING',
];

/**
 * Compiled regex for fast line-level anomaly detection.
 * Matches any of the keywords as whole words (word boundaries) to avoid
 * false positives like "ERRORHANDLER" — but we allow partial matches because
 * log lines rarely embed keywords inside identifiers in practice.
 */
const ANOMALY_PATTERN = new RegExp(ANOMALY_KEYWORDS.join('|'), 'i');

/**
 * Detect whether a single line contains an anomaly keyword.
 *
 * @param {string} line - A single line of text
 * @returns {boolean} true if the line contains an anomaly keyword
 */
function isAnomalyLine(line) {
  if (typeof line !== 'string') return false;
  return ANOMALY_PATTERN.test(line);
}

/**
 * Return the highest-severity keyword matched in a line, or null.
 *
 * @param {string} line - A single line of text
 * @returns {string|null} The first (highest-severity) keyword matched, or null
 */
function getAnomalySeverity(line) {
  if (typeof line !== 'string') return null;
  for (const kw of ANOMALY_KEYWORDS) {
    if (new RegExp(kw, 'i').test(line)) {
      return kw.toUpperCase();
    }
  }
  return null;
}

/**
 * Filter an array of log/text lines, preserving anomaly lines even under a
 * tight token budget. Normal lines are dropped first when budget is exceeded.
 *
 * Algorithm:
 *   1. Classify each line as anomaly or normal.
 *   2. If total lines <= maxLines, return all lines unchanged.
 *   3. Otherwise, keep ALL anomaly lines and fill remaining slots with normal
 *      lines (taking the last N normal lines to preserve recency).
 *
 * @param {string[]} lines    - Array of text lines
 * @param {number}   maxLines - Maximum lines to return (token budget proxy)
 * @returns {string[]} Filtered lines with anomalies always preserved
 */
function filterPreservingAnomalies(lines, maxLines) {
  if (!Array.isArray(lines)) return [];
  if (typeof maxLines !== 'number' || maxLines <= 0) return [];

  if (lines.length <= maxLines) {
    return lines.slice();
  }

  const anomalyLines = [];
  const normalLines = [];

  for (const line of lines) {
    if (isAnomalyLine(line)) {
      anomalyLines.push(line);
    } else {
      normalLines.push(line);
    }
  }

  // Always keep anomaly lines. If anomalies alone exceed budget, keep the
  // most recent ones (last N).
  if (anomalyLines.length >= maxLines) {
    return anomalyLines.slice(-maxLines);
  }

  const normalSlots = maxLines - anomalyLines.length;
  const keptNormal = normalLines.slice(-normalSlots);

  // Re-interleave in original order for readability.
  // We need to preserve original ordering; iterate original lines and keep
  // those that appear in anomalyLines (all) or keptNormal (subset).
  // Note: if the same line string appears multiple times we need index-based
  // tracking. Use a counts approach.
  const anomalyCounts = new Map();
  for (const l of anomalyLines) {
    anomalyCounts.set(l, (anomalyCounts.get(l) || 0) + 1);
  }
  const normalCounts = new Map();
  for (const l of keptNormal) {
    normalCounts.set(l, (normalCounts.get(l) || 0) + 1);
  }

  const result = [];
  for (const line of lines) {
    if (isAnomalyLine(line)) {
      const remaining = anomalyCounts.get(line) || 0;
      if (remaining > 0) {
        result.push(line);
        anomalyCounts.set(line, remaining - 1);
      }
    } else {
      const remaining = normalCounts.get(line) || 0;
      if (remaining > 0) {
        result.push(line);
        normalCounts.set(line, remaining - 1);
      }
    }
  }

  return result;
}

module.exports = {
  ANOMALY_KEYWORDS,
  isAnomalyLine,
  getAnomalySeverity,
  filterPreservingAnomalies,
};
