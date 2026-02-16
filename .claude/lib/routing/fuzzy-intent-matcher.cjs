'use strict';

const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_MAX_CANDIDATES = 5;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function jaccardSimilarity(aTokens, bTokens) {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Finds the best matching intent from user prompt using fuzzy text matching.
 *
 * @param {string} prompt - The user prompt to match against intent keywords
 * @param {Object.<string, string[]>} intentKeywords - Map of intent names to keyword arrays
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.threshold=0.6] - Minimum similarity threshold (0-1)
 * @returns {Object|null} Returns match object `{ intent, confidence, method: 'fuzzy' }` if found,
 *                        or `null` if no match meets threshold or input is invalid.
 *
 * @example
 * const result = fuzzyMatchIntent('fix the bug', { developer: ['fix bug'] });
 * // Returns: { intent: 'developer', confidence: 0.8, method: 'fuzzy' }
 *
 * const noMatch = fuzzyMatchIntent('xyz', { developer: ['fix bug'] });
 * // Returns: null
 */
function fuzzyMatchIntent(prompt, intentKeywords, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const normalized = String(prompt || '')
    .trim()
    .toLowerCase();
  if (normalized.length < 2 || !intentKeywords || typeof intentKeywords !== 'object') {
    return null;
  }
  const promptTokens = tokenize(normalized);
  if (promptTokens.length === 0) return null;

  const scores = [];
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    if (!Array.isArray(keywords)) continue;
    let best = 0;
    for (const kw of keywords) {
      const kwTokens = tokenize(kw);
      const score = jaccardSimilarity(promptTokens, kwTokens);
      if (score > best) best = score;
    }
    if (best >= threshold) {
      scores.push({ intent, confidence: best });
    }
  }
  if (scores.length === 0) return null;
  scores.sort((a, b) => b.confidence - a.confidence);
  const top = scores[0];
  return { intent: top.intent, confidence: top.confidence, method: 'fuzzy' };
}

/**
 * Finds multiple matching intents from user prompt, ranked by confidence.
 *
 * @param {string} prompt - The user prompt to match against intent keywords
 * @param {Object.<string, string[]>} intentKeywords - Map of intent names to keyword arrays
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.threshold=0.6] - Minimum similarity threshold (0-1)
 * @param {number} [options.maxCandidates=5] - Maximum number of matches to return
 * @returns {Array<Object>} Returns array of match objects sorted by confidence (highest first),
 *                          or empty array `[]` if no matches meet threshold or input is invalid.
 *                          Each match has shape: `{ intent, confidence, method: 'fuzzy' }`
 *
 * @example
 * const results = fuzzyMatchIntentAlternatives('review code', {
 *   developer: ['implement code'],
 *   'code-reviewer': ['code review', 'review code'],
 *   qa: ['run tests']
 * }, { threshold: 0.2, maxCandidates: 2 });
 * // Returns: [
 * //   { intent: 'code-reviewer', confidence: 0.9, method: 'fuzzy' },
 * //   { intent: 'developer', confidence: 0.3, method: 'fuzzy' }
 * // ]
 */
function fuzzyMatchIntentAlternatives(prompt, intentKeywords, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const normalized = String(prompt || '')
    .trim()
    .toLowerCase();
  if (normalized.length < 2 || !intentKeywords || typeof intentKeywords !== 'object') {
    return [];
  }
  const promptTokens = tokenize(normalized);
  if (promptTokens.length === 0) return [];

  const scores = [];
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    if (!Array.isArray(keywords)) continue;
    let best = 0;
    for (const kw of keywords) {
      const kwTokens = tokenize(kw);
      const score = jaccardSimilarity(promptTokens, kwTokens);
      if (score > best) best = score;
    }
    if (best >= threshold) {
      scores.push({ intent, confidence: best });
    }
  }
  if (scores.length === 0) return [];
  scores.sort((a, b) => b.confidence - a.confidence);
  return scores.slice(0, Math.max(0, maxCandidates)).map(match => ({ ...match, method: 'fuzzy' }));
}

module.exports = {
  fuzzyMatchIntent,
  fuzzyMatchIntentAlternatives,
  jaccardSimilarity,
  tokenize,
};
