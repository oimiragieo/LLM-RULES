'use strict';

/**
 * importance-scorer.cjs
 *
 * Heuristic-based memory importance scoring.
 * Synchronous only, no LLM calls. Must complete in <5ms.
 *
 * @module importance-scorer
 */

// Keywords that indicate high-importance content
const HIGH_KEYWORDS = [
  'security',
  'authentication',
  'xss',
  'injection',
  'adr',
  'architecture',
  'breaking-change',
  'critical',
  'vulnerability',
  'exploit',
];

// Keywords that indicate low-importance content (style/formatting only)
const LOW_KEYWORDS = [
  'formatting',
  'whitespace',
  'style',
  'typo',
  'cosmetic',
  'indentation',
  'spacing',
];

// Area-specific score boosters
const AREA_BOOSTERS = {
  security: 0.2,
  architecture: 0.15,
};

// Score adjustment per keyword match
const HIGH_KEYWORD_BOOST = 0.1;
const LOW_KEYWORD_PENALTY = 0.1;

// Score bounds
const SCORE_MIN = 0.1;
const SCORE_MAX = 1.0;

// Base score for any text with no keyword matches
const BASE_SCORE = 0.5;

/**
 * Score the importance of a memory text using keyword heuristics.
 *
 * @param {string} text - The memory text to score
 * @param {string} [area] - Optional memory area (e.g., 'security', 'architecture')
 * @returns {number} Importance score in [0.1, 1.0]
 */
function scoreImportance(text, area) {
  if (typeof text !== 'string' || text.length === 0) {
    return BASE_SCORE;
  }

  const lower = text.toLowerCase();
  let score = BASE_SCORE;

  // Apply high-keyword boosts
  for (const kw of HIGH_KEYWORDS) {
    if (lower.includes(kw)) {
      score += HIGH_KEYWORD_BOOST;
    }
  }

  // Apply low-keyword penalties
  for (const kw of LOW_KEYWORDS) {
    if (lower.includes(kw)) {
      score -= LOW_KEYWORD_PENALTY;
    }
  }

  // Apply area booster if provided
  if (area && typeof area === 'string') {
    const boost = AREA_BOOSTERS[area.toLowerCase()];
    if (boost) {
      score += boost;
    }
  }

  // Clamp to valid range and round to 2 decimal places to avoid floating-point drift
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
  return Math.round(clamped * 100) / 100;
}

module.exports = {
  scoreImportance,
  HIGH_KEYWORDS,
  LOW_KEYWORDS,
  AREA_BOOSTERS,
};
