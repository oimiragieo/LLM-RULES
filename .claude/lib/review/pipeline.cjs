'use strict';

/**
 * pipeline.cjs — 2-pass code review pipeline with structured output.
 *
 * Exports:
 *   ReviewPipeline  — Class orchestrating the 2-pass review process.
 *   computeOverallAssessment — Pure function determining the overall verdict.
 *
 * Pipeline flow:
 *   Pass 1 (runPass1): Analyse the diff and generate candidate findings.
 *                      Each changed hunk produces one candidate Finding.
 *                      Mock analysis: all 8 bug-detection criteria set to true.
 *
 *   Pass 2 (runPass2): Validate candidates against the 8 bug-detection criteria
 *                      using filterFindings() from severity.cjs.  Only findings
 *                      where every criterion is true survive.
 *
 *   run():            Orchestrate both passes, compute stats, determine the
 *                     overall assessment, and return a ReviewResult object that
 *                     is fully serialisable via JSON.stringify().
 *
 * ReviewResult shape:
 *   {
 *     overallAssessment: 'approve' | 'request-changes' | 'comment',
 *     findings:          Finding[],
 *     stats: {
 *       filesReviewed:     number,
 *       findingsCount:     number,
 *       severityBreakdown: { P0: number, P1: number, P2: number, P3: number },
 *     },
 *     metadata: {
 *       mode:     string,
 *       duration: number,   // milliseconds
 *     },
 *   }
 */

const { Finding, BUG_CRITERIA, filterFindings } = require('./severity.cjs');

// ---------------------------------------------------------------------------
// computeOverallAssessment
// ---------------------------------------------------------------------------

/**
 * Determine the overall assessment from the validated findings array.
 *
 * Rules (applied in priority order):
 *   1. Any P0 or P1 finding  → 'request-changes'
 *   2. Any P2 finding         → 'comment'
 *   3. No findings or P3 only → 'approve'
 *
 * @param {Finding[]} findings  — Validated findings from Pass 2.
 * @returns {'approve'|'request-changes'|'comment'}
 */
function computeOverallAssessment(findings) {
  for (const f of findings) {
    if (f.priority === 'P0' || f.priority === 'P1') {
      return 'request-changes';
    }
  }
  for (const f of findings) {
    if (f.priority === 'P2') {
      return 'comment';
    }
  }
  return 'approve';
}

// ---------------------------------------------------------------------------
// ReviewPipeline class
// ---------------------------------------------------------------------------

/**
 * 2-pass review pipeline.
 *
 * @example
 * const pipeline = new ReviewPipeline({ mode: 'base-branch', diffData });
 * const result   = pipeline.run();
 * console.log(JSON.stringify(result));
 */
class ReviewPipeline {
  /**
   * @param {object}  opts
   * @param {string}  opts.mode               — Review mode ('base-branch',
   *                                            'uncommitted', 'commit', 'custom').
   * @param {object}  opts.diffData            — Structured diff data as returned
   *                                            by the diff-engine functions.
   *                                            Shape: { files: FileDiff[] }
   * @param {string}  [opts.customInstructions] — Optional user-provided review
   *                                            criteria for 'custom' mode.
   */
  constructor({ mode, diffData, customInstructions }) {
    this.mode = mode;
    this.diffData = diffData;
    this.customInstructions = customInstructions;
  }

  // -------------------------------------------------------------------------
  // Pass 1 — candidate generation
  // -------------------------------------------------------------------------

  /**
   * Generate candidate findings by analysing the diff.
   *
   * Mock implementation: each non-binary file hunk produces exactly one
   * candidate Finding.  All 8 bug-detection criteria are pre-set to `true`
   * (no real LLM analysis is performed).  Each candidate is annotated with
   * `pass: 1` for traceability.
   *
   * @returns {Finding[]}
   */
  runPass1() {
    const candidates = [];

    for (const file of this.diffData.files || []) {
      // Binary files have no diff content to analyse.
      if (file.binary) continue;

      for (const hunk of file.hunks || []) {
        // Build a criteria map where every criterion passes (mock analysis).
        const criteriaResults = {};
        for (const criterion of BUG_CRITERIA) {
          criteriaResults[criterion] = true;
        }

        const lineEnd = hunk.newStart + (hunk.newLines > 0 ? hunk.newLines - 1 : 0);

        const candidate = new Finding({
          title: `Potential issue in ${file.path} at line ${hunk.newStart}`,
          explanation: `Changed hunk starting at line ${hunk.newStart} in ${file.path} warrants review.`,
          file: file.path,
          lineStart: hunk.newStart,
          lineEnd,
          priority: 'P2',
          suggestedFix: 'Review this change carefully.',
          criteriaResults,
        });

        // Annotate with the pass number for traceability (VAL-CR-005).
        candidate.pass = 1;

        candidates.push(candidate);
      }
    }

    return candidates;
  }

  // -------------------------------------------------------------------------
  // Pass 2 — criteria validation
  // -------------------------------------------------------------------------

  /**
   * Validate candidate findings against the 8 bug-detection criteria.
   *
   * Uses filterFindings() from severity.cjs to discard any candidate where
   * at least one criterion is false or missing.  Retained findings are
   * annotated with `pass: 2` for traceability.
   *
   * @param {Finding[]} candidates  — Output of runPass1().
   * @returns {Finding[]}            Validated findings.
   */
  runPass2(candidates) {
    const validated = filterFindings(candidates);
    // Annotate survivors with the pass number for downstream traceability.
    for (const finding of validated) {
      finding.pass = 2;
    }
    return validated;
  }

  // -------------------------------------------------------------------------
  // run() — orchestrate both passes
  // -------------------------------------------------------------------------

  /**
   * Run both passes and return a structured ReviewResult.
   *
   * @returns {{
   *   overallAssessment: 'approve'|'request-changes'|'comment',
   *   findings: Finding[],
   *   stats: {
   *     filesReviewed: number,
   *     findingsCount: number,
   *     severityBreakdown: {P0:number, P1:number, P2:number, P3:number},
   *   },
   *   metadata: { mode: string, duration: number },
   * }}
   */
  run() {
    const startTime = Date.now();

    // Pass 1: generate candidates
    const candidates = this.runPass1();

    // Pass 2: validate against 8 criteria
    const findings = this.runPass2(candidates);

    // Compute severity breakdown
    const severityBreakdown = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const finding of findings) {
      if (Object.prototype.hasOwnProperty.call(severityBreakdown, finding.priority)) {
        severityBreakdown[finding.priority]++;
      }
    }

    // Determine overall assessment
    const overallAssessment = computeOverallAssessment(findings);

    const duration = Date.now() - startTime;

    return {
      overallAssessment,
      findings,
      stats: {
        filesReviewed: (this.diffData.files || []).length,
        findingsCount: findings.length,
        severityBreakdown,
      },
      metadata: {
        mode: this.mode,
        duration,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ReviewPipeline,
  computeOverallAssessment,
};
