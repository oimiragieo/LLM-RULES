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

/**
 * Score a batch of memory items and return them sorted by importance (highest first).
 *
 * @param {Array<{text: string, area?: string, id?: string}>} items
 * @returns {Array<{text: string, area?: string, id?: string, score: number}>}
 */
function scoreBatch(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => ({
      ...item,
      score: scoreImportance(item.text, item.area),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Filter items above a minimum importance threshold.
 *
 * @param {Array<{text: string, area?: string}>} items
 * @param {number} [minScore=0.5] - Minimum score to include
 * @returns {Array<{text: string, area?: string, score: number}>}
 */
function filterByImportance(items, minScore = 0.5) {
  return scoreBatch(items).filter(item => item.score >= minScore);
}

/**
 * Score with configurable weights. Allows callers to override the default
 * keyword boost/penalty and area boosters.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.area]
 * @param {number} [options.highKeywordBoost=0.1]
 * @param {number} [options.lowKeywordPenalty=0.1]
 * @param {Record<string, number>} [options.areaBoosters]
 * @param {string[]} [options.highKeywords]
 * @param {string[]} [options.lowKeywords]
 * @returns {number} Score in [0.1, 1.0]
 */
function scoreWithWeights(text, options = {}) {
  if (typeof text !== 'string' || text.length === 0) return BASE_SCORE;

  const lower = text.toLowerCase();
  let score = BASE_SCORE;

  const hiBoost = options.highKeywordBoost ?? HIGH_KEYWORD_BOOST;
  const loPenalty = options.lowKeywordPenalty ?? LOW_KEYWORD_PENALTY;
  const hiKw = options.highKeywords || HIGH_KEYWORDS;
  const loKw = options.lowKeywords || LOW_KEYWORDS;
  const boosters = options.areaBoosters || AREA_BOOSTERS;

  for (const kw of hiKw) {
    if (lower.includes(kw)) score += hiBoost;
  }
  for (const kw of loKw) {
    if (lower.includes(kw)) score -= loPenalty;
  }
  if (options.area) {
    const boost = boosters[options.area.toLowerCase()];
    if (boost) score += boost;
  }

  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
  return Math.round(clamped * 100) / 100;
}

module.exports = {
  scoreImportance,
  scoreBatch,
  filterByImportance,
  scoreWithWeights,
  HIGH_KEYWORDS,
  LOW_KEYWORDS,
  AREA_BOOSTERS,
};
