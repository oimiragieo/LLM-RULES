'use strict';

/**
 * adaptive-recall.cjs
 *
 * Adaptive memory recall with importance-based reranking and iterative deepening.
 * Synchronous only, no LLM calls.
 *
 * @module adaptive-recall
 */

// importance-scorer.cjs is a sibling module — imported by callers who combine scoring with recall

// Stop-words to filter when generating sub-queries
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'is', 'are', 'was',
  'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'it',
  'its', 'this', 'that', 'these', 'those', 'not', 'no', 'so', 'if',
]);

/**
 * Compute a combined ranking score for a result entry.
 * Blends text relevance score with importance score.
 *
 * @param {object} result
 * @returns {number}
 */
function _combinedScore(result) {
  const textScore = typeof result.score === 'number' ? result.score : 0.5;
  const importance = typeof result.importance === 'number' ? result.importance : 0.5;
  // Weight: 50% text relevance, 50% importance
  return textScore * 0.5 + importance * 0.5;
}

/**
 * Rerank search results by blending text relevance and importance score.
 * Does not mutate the input array.
 *
 * @param {string} query - The search query
 * @param {Array<object>} results - Array of search result objects
 * @param {object} [options] - Optional configuration
 * @param {number} [options.maxResults] - Maximum results to return
 * @returns {Array<object>} Reordered results (highest combined score first)
 */
function enhanceRecall(query, results, options) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  // Copy to avoid mutation
  const copy = results.slice();

  // Sort descending by combined score
  copy.sort((a, b) => _combinedScore(b) - _combinedScore(a));

  const maxResults = (options && typeof options.maxResults === 'number')
    ? options.maxResults
    : copy.length;

  return copy.slice(0, maxResults);
}

/**
 * Extract focused sub-queries from a broad query by isolating meaningful keywords.
 *
 * @param {string} query - The original broad query
 * @returns {Array<string>} Array of focused sub-query strings
 */
function generateSubQueries(query) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    return [];
  }

  // Tokenize: split on whitespace and punctuation, lowercase
  const tokens = query
    .toLowerCase()
    .split(/[\s\-_,.:;!?/\\()[\]{}'"]+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  if (tokens.length === 0) {
    return [];
  }

  // Each meaningful token becomes a focused sub-query
  // Also generate pairs for richer context
  const subs = [];

  // Single-keyword sub-queries
  for (const t of tokens) {
    subs.push(t);
  }

  // Bigram sub-queries (adjacent meaningful tokens)
  for (let i = 0; i < tokens.length - 1; i++) {
    subs.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  // De-duplicate while preserving order
  const seen = new Set();
  return subs.filter(s => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * Iteratively deepen search by expanding sub-queries up to maxDepth.
 * Returns an array of query strings tried at this depth and below.
 * (In production, these would be fed to the actual search engine.)
 *
 * @param {string} query - The search query
 * @param {number} depth - Current depth (start at 0)
 * @param {number} [maxDepth=3] - Maximum recursion depth
 * @returns {Array<string>} Array of queries explored
 */
function iterativeDeepen(query, depth, maxDepth) {
  const limit = typeof maxDepth === 'number' ? maxDepth : 3;

  if (depth >= limit) {
    return [];
  }

  const explored = [query];

  if (depth < limit - 1) {
    const subs = generateSubQueries(query);
    for (const sub of subs) {
      const deeper = iterativeDeepen(sub, depth + 1, limit);
      for (const d of deeper) {
        explored.push(d);
      }
    }
  }

  // De-duplicate
  return [...new Set(explored)];
}

module.exports = {
  enhanceRecall,
  generateSubQueries,
  iterativeDeepen,
};
