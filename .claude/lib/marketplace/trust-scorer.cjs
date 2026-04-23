'use strict';
/**
 * Skill Trust Scoring Engine
 * ==========================
 * Pure-function trust scorer for the Skill Marketplace (v3.2.0, Slice S4).
 *
 * Score components (0-100 total):
 *   testCoverage      30 pts  — skill has tests (hasTests === true)
 *   ageStability      20 pts  — ageDays >= 30
 *   downloadCount     20 pts  — downloads >= 100
 *   peerReviewRating  30 pts  — proportional to reviewRating (0–4.0+, capped at 30)
 *
 * Trust tiers:
 *   builtin      = 100  (source === 'builtin', always score=100 regardless of signals)
 *   verified     = 80–99
 *   community    = 50–79
 *   experimental = 0–49
 *
 * Tier minimum thresholds are configurable via env vars:
 *   TRUST_TIER_VERIFIED_MIN   (default: 80)
 *   TRUST_TIER_COMMUNITY_MIN  (default: 50)
 *
 * @module trust-scorer
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum possible score for any non-builtin skill. */
const MAX_SCORE = 100;

/** Minimum score. */
const MIN_SCORE = 0;

/** Review rating that yields full review points (30 pts). Ratings above this are capped. */
const REVIEW_FULL_RATING = 4.0;

/** Points awarded for each score component at maximum. */
const COMPONENT_WEIGHTS = {
  testCoverage: 30,
  ageStability: 20,
  downloadCount: 20,
  peerReviewRating: 30,
};

/**
 * Tier threshold configuration.
 * Can be overridden per-process via TRUST_TIER_VERIFIED_MIN / TRUST_TIER_COMMUNITY_MIN.
 * Experimental tier minimum is always 0.
 */
const TIER_THRESHOLDS = {
  verified: parseInt(process.env.TRUST_TIER_VERIFIED_MIN || '80', 10),
  community: parseInt(process.env.TRUST_TIER_COMMUNITY_MIN || '50', 10),
  experimental: 0,
};

// ---------------------------------------------------------------------------
// Pure scoring logic
// ---------------------------------------------------------------------------

/**
 * Compute the test coverage points.
 * Full 30 pts if hasTests === true (any test file exists for the skill).
 *
 * @param {boolean} hasTests
 * @returns {number}
 */
function _testCoveragePoints(hasTests) {
  return hasTests === true ? COMPONENT_WEIGHTS.testCoverage : 0;
}

/**
 * Compute the age stability points.
 * Full 20 pts if ageDays >= 30 (skill is at least 30 days old — stable).
 *
 * @param {number} ageDays
 * @returns {number}
 */
function _ageStabilityPoints(ageDays) {
  return ageDays >= 30 ? COMPONENT_WEIGHTS.ageStability : 0;
}

/**
 * Compute the download count points.
 * Full 20 pts if downloadCount >= 100.
 *
 * @param {number} downloadCount
 * @returns {number}
 */
function _downloadCountPoints(downloadCount) {
  return downloadCount >= 100 ? COMPONENT_WEIGHTS.downloadCount : 0;
}

/**
 * Compute the peer review rating points.
 * Proportional to rating / REVIEW_FULL_RATING (4.0), capped at 30 pts.
 * Rating <= 0 yields 0 pts; rating >= 4.0 yields full 30 pts.
 *
 * @param {number} reviewRating
 * @returns {number}
 */
function _peerReviewPoints(reviewRating) {
  if (!reviewRating || reviewRating <= 0) return 0;
  const rawPoints = (reviewRating / REVIEW_FULL_RATING) * COMPONENT_WEIGHTS.peerReviewRating;
  return Math.min(Math.round(rawPoints), COMPONENT_WEIGHTS.peerReviewRating);
}

/**
 * Map a numeric score to a trust tier string.
 *
 * @param {number} score
 * @param {string} source
 * @returns {'builtin'|'verified'|'community'|'experimental'}
 */
function _scoreTier(score, source) {
  if (source === 'builtin') return 'builtin';
  if (score >= TIER_THRESHOLDS.verified) return 'verified';
  if (score >= TIER_THRESHOLDS.community) return 'community';
  return 'experimental';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a 0-100 trust score and tier for a skill based on quality signals.
 *
 * This is a pure function: no I/O, no side effects, same input → same output.
 *
 * @param {object}  signals
 * @param {string}  signals.source          — 'builtin' | 'community' | 'external' etc.
 * @param {boolean} signals.hasTests        — true if test file(s) exist for this skill
 * @param {number}  [signals.testCount]     — number of test cases (informational; not scored separately)
 * @param {number}  [signals.ageDays]       — skill age in days (0 = new)
 * @param {number}  [signals.downloadCount] — total download count (0 = new/unlisted)
 * @param {number}  [signals.reviewRating]  — community review rating 0.0–5.0 (0 = unrated)
 * @returns {{ score: number, tier: string, breakdown: object }}
 */
function scoreSkill(signals) {
  // Builtin skills always score 100 regardless of other signals.
  if (signals.source === 'builtin') {
    return {
      score: 100,
      tier: 'builtin',
      breakdown: {
        testCoverage: COMPONENT_WEIGHTS.testCoverage,
        ageStability: COMPONENT_WEIGHTS.ageStability,
        downloadCount: COMPONENT_WEIGHTS.downloadCount,
        peerReviewRating: COMPONENT_WEIGHTS.peerReviewRating,
      },
    };
  }

  const testCoverage = _testCoveragePoints(signals.hasTests);
  const ageStability = _ageStabilityPoints(signals.ageDays || 0);
  const downloadCount = _downloadCountPoints(signals.downloadCount || 0);
  const peerReviewRating = _peerReviewPoints(signals.reviewRating || 0);

  const rawScore = testCoverage + ageStability + downloadCount + peerReviewRating;
  const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, rawScore));

  return {
    score,
    tier: _scoreTier(score, signals.source),
    breakdown: { testCoverage, ageStability, downloadCount, peerReviewRating },
  };
}

module.exports = {
  scoreSkill,
  TIER_THRESHOLDS,
  COMPONENT_WEIGHTS,
};
