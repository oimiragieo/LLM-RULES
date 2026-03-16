'use strict';

/**
 * Adversarial Review Protocol
 *
 * Detects lazy approvals, forces re-analysis on zero findings, and classifies
 * findings by severity. Used by the adversarial-review skill to ensure code
 * reviews are substantive rather than rubber-stamp approvals.
 */

/** @type {RegExp[]} Patterns that indicate a lazy/non-substantive approval */
const LAZY_APPROVAL_PATTERNS = [
  /^looks\s+good$/i,
  /\blgtm\b/i,
  /^no\s+issues$/i,
  /^ship\s+it$/i,
  /^approved$/i,
];

/**
 * Evaluate a set of review findings to determine if re-analysis is required.
 *
 * @param {Array<{severity: string, description: string}>} findings - Array of review findings
 * @param {{ reAnalyzed?: boolean, noLegitimateIssues?: boolean }} [state] - Optional prior state
 * @returns {{ reAnalysisRequired: boolean, totalFindings: number, classified?: object }}
 */
function evaluateFindings(findings, state = {}) {
  const { reAnalyzed = false, noLegitimateIssues = false } = state;

  // Valid terminal state: reviewer confirmed clean after a re-analysis pass
  if (reAnalyzed && noLegitimateIssues) {
    return { reAnalysisRequired: false, totalFindings: findings.length };
  }

  // If we already did a re-analysis pass, don't loop again
  if (reAnalyzed) {
    return {
      reAnalysisRequired: false,
      totalFindings: findings.length,
      classified: classifyFindings(findings),
    };
  }

  if (findings.length === 0) {
    return { reAnalysisRequired: true, totalFindings: 0 };
  }

  return {
    reAnalysisRequired: false,
    totalFindings: findings.length,
    classified: classifyFindings(findings),
  };
}

/**
 * Classify findings by severity into named buckets.
 *
 * @param {Array<{severity: string, description: string}>} findings
 * @returns {{ critical: Array, high: Array, medium: Array, low: Array }}
 */
function classifyFindings(findings) {
  const result = { critical: [], high: [], medium: [], low: [] };
  for (const finding of findings) {
    const bucket =
      finding.severity && Object.prototype.hasOwnProperty.call(result, finding.severity)
        ? finding.severity
        : 'low';
    result[bucket].push(finding);
  }
  return result;
}

/**
 * Detect whether a review text is a lazy/non-substantive approval.
 *
 * Returns true only when the entire message (or a standalone token) matches
 * a known lazy pattern AND does not contain substantive finding indicators.
 *
 * @param {string} text - The review comment text
 * @returns {boolean}
 */
function detectLazyApproval(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }

  const trimmed = text.trim();

  // Patterns that indicate substantive review content — if present, it's not lazy
  const substantiveIndicators = /\d+\s*(issue|finding|bug|vulnerabilit|problem|error)/i;
  if (substantiveIndicators.test(trimmed)) {
    return false;
  }

  // Check for "approved" only when it appears as a standalone sentence
  // (not mid-sentence like "I approved of the approach but found...")
  for (const pattern of LAZY_APPROVAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Determine whether a re-analysis should be triggered based on finding count.
 *
 * @param {Array} findings - Current findings array
 * @param {number} [minFindings=1] - Minimum number of findings expected from a substantive review
 * @returns {boolean}
 */
function shouldReAnalyze(findings, minFindings = 1) {
  return findings.length < minFindings;
}

/**
 * Format an adversarial prompt that instructs a reviewer to actively seek problems.
 *
 * @param {{ code: string, context: string }} options
 * @returns {string}
 */
function formatAdversarialPrompt({ code, context }) {
  return [
    `You are performing an adversarial security and quality review of the following ${context || 'code'}.`,
    '',
    'Your goal is to FIND ISSUES — not to approve. Assume this code has vulnerabilities, bugs, or quality problems.',
    'Look specifically for:',
    '  - Security vulnerabilities (injection, auth bypass, data exposure)',
    '  - Logic errors and edge cases',
    '  - Missing validation or error handling',
    '  - Performance problems',
    '  - Maintenance and clarity issues',
    '',
    'Report every finding with a severity (critical/high/medium/low) and a concrete description.',
    'If you find no issues, explain in detail why each potential concern does NOT apply.',
    '',
    '```',
    code || '(no code provided)',
    '```',
  ].join('\n');
}

module.exports = {
  evaluateFindings,
  classifyFindings,
  detectLazyApproval,
  shouldReAnalyze,
  formatAdversarialPrompt,
  LAZY_APPROVAL_PATTERNS,
};
