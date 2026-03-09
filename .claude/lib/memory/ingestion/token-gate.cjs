'use strict';

/**
 * Token Gate for Ingestion Pipeline
 * =================================
 * Enforces maximum token counts on ingested file texts to prevent
 * blowing out the LLM context limits or Vector DB limits.
 */

const MAX_TOKENS_PER_FILE = 100000;
const CHARS_PER_TOKEN = 4; // Fast heuristic approximation

/**
 * Estimate token count using a standard heuristic.
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Check if the text exceeds the allowed token limit.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {boolean}
 */
function exceedsLimit(text, limit = MAX_TOKENS_PER_FILE) {
  return estimateTokens(text) > limit;
}

/**
 * Truncate the text to fit within the token limit.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string}
 */
function truncateToLimit(text, limit = MAX_TOKENS_PER_FILE) {
  if (!text) return '';
  const estimated = estimateTokens(text);
  if (estimated <= limit) return text;

  const charLimit = limit * CHARS_PER_TOKEN;
  return text.substring(0, charLimit);
}

module.exports = {
  estimateTokens,
  exceedsLimit,
  truncateToLimit,
  MAX_TOKENS_PER_FILE,
};
