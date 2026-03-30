'use strict';

/**
 * severity.cjs — P0-P3 severity matrix and 8 bug detection criteria.
 *
 * Exports:
 *   SEVERITY_LEVELS  — Object mapping P0-P3 keys to human-readable labels.
 *   BUG_CRITERIA     — Array of 8 criterion identifiers that a finding must
 *                      satisfy before being reported.
 *   Finding          — Class representing a single code review finding.
 *   validateFinding  — Function that checks structural validity of a finding.
 *   filterFindings   — Function that keeps only findings passing all criteria.
 */

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

/**
 * Four-tier severity scale used across all code review findings.
 *
 * @type {{ P0: string, P1: string, P2: string, P3: string }}
 */
const SEVERITY_LEVELS = {
  P0: 'critical',
  P1: 'urgent',
  P2: 'normal',
  P3: 'nice-to-have',
};

// ---------------------------------------------------------------------------
// Bug detection criteria
// ---------------------------------------------------------------------------

/**
 * The 8 criteria that every candidate finding must satisfy.
 * A finding is only reported when ALL criteria evaluate to `true`.
 *
 * Criterion definitions:
 *   meaningful_impact      — The bug has a real, observable impact on users or
 *                            system behaviour.
 *   discrete_actionable    — The finding is specific enough for a developer to
 *                            act on immediately without further investigation.
 *   appropriate_rigor      — The analysis is proportionate to the risk level
 *                            (no over-engineering, no hand-waving).
 *   introduced_in_changes  — The bug was introduced by the changes being
 *                            reviewed, not pre-existing code.
 *   worth_fixing           — The cost of fixing the bug is justified by the
 *                            benefit (not a nitpick or stylistic preference).
 *   no_unstated_assumptions — The finding does not depend on unverified
 *                            assumptions about how the code is called.
 *   provably_affected      — There is a concrete code path that triggers the
 *                            issue (not purely hypothetical).
 *   not_intentional        — The behaviour is unlikely to be a deliberate
 *                            design choice by the author.
 *
 * @type {string[]}
 */
const BUG_CRITERIA = [
  'meaningful_impact',
  'discrete_actionable',
  'appropriate_rigor',
  'introduced_in_changes',
  'worth_fixing',
  'no_unstated_assumptions',
  'provably_affected',
  'not_intentional',
];

// ---------------------------------------------------------------------------
// Finding class
// ---------------------------------------------------------------------------

/**
 * A single code review finding produced by the 2-pass review pipeline.
 */
class Finding {
  /**
   * @param {object} opts
   * @param {string}  opts.title          — Short summary (<=80 chars).
   * @param {string}  opts.explanation    — Full explanation of the issue.
   * @param {string}  opts.file           — Relative file path.
   * @param {number}  opts.lineStart      — First line of the problematic region.
   * @param {number}  opts.lineEnd        — Last line of the problematic region.
   * @param {string}  opts.priority       — One of P0, P1, P2, P3.
   * @param {string}  [opts.suggestedFix] — Optional remediation guidance.
   * @param {object}  [opts.criteriaResults] — Map of criterion → boolean.
   */
  constructor({
    title,
    explanation,
    file,
    lineStart,
    lineEnd,
    priority,
    suggestedFix,
    criteriaResults,
  }) {
    this.title = title;
    this.explanation = explanation;
    this.file = file;
    this.lineStart = lineStart;
    this.lineEnd = lineEnd;
    this.priority = priority;
    this.suggestedFix = suggestedFix;
    this.criteriaResults = criteriaResults || {};
  }
}

// ---------------------------------------------------------------------------
// validateFinding
// ---------------------------------------------------------------------------

/**
 * Validate the structural integrity of a finding.
 *
 * Checks:
 *   - `title` is a non-empty string of at most 80 characters.
 *   - `priority` is one of the keys defined in SEVERITY_LEVELS.
 *   - `criteriaResults` contains an entry for every criterion in BUG_CRITERIA.
 *
 * @param {Finding} finding
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFinding(finding) {
  const errors = [];

  // Title check
  if (!finding.title || finding.title.length > 80) {
    errors.push('title must be <= 80 characters');
  }

  // Priority check
  if (
    !finding.priority ||
    !Object.prototype.hasOwnProperty.call(SEVERITY_LEVELS, finding.priority)
  ) {
    errors.push(`priority must be one of: ${Object.keys(SEVERITY_LEVELS).join(', ')}`);
  }

  // Criteria presence check
  for (const criterion of BUG_CRITERIA) {
    if (
      !finding.criteriaResults ||
      !Object.prototype.hasOwnProperty.call(finding.criteriaResults, criterion)
    ) {
      errors.push(`missing criterion: ${criterion}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// filterFindings
// ---------------------------------------------------------------------------

/**
 * Filter a list of candidate findings, keeping only those where every one of
 * the 8 bug detection criteria evaluates to `true` in `criteriaResults`.
 *
 * A missing criterion key is treated the same as `false`.
 *
 * @param {Finding[]} candidates
 * @returns {Finding[]}
 */
function filterFindings(candidates) {
  return candidates.filter(finding =>
    BUG_CRITERIA.every(
      criterion =>
        finding.criteriaResults != null &&
        Object.prototype.hasOwnProperty.call(finding.criteriaResults, criterion) &&
        finding.criteriaResults[criterion] === true
    )
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SEVERITY_LEVELS,
  BUG_CRITERIA,
  Finding,
  validateFinding,
  filterFindings,
};
