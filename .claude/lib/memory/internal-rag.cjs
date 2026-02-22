'use strict';
/**
 * Internal RAG (Retrieval-Augmented Generation) Module (Track 3.1)
 *
 * Provides semantic retrieval over project memory using the existing
 * memory-manager searchMemory API. Returns ranked results with similarity
 * scores for use in research-synthesis and other skills.
 *
 * Wire step: After library tests pass, invoke skill-updater skill to prepend
 * Step 0 to research-synthesis/SKILL.md (creator-guard protected path).
 *
 * Note: BM25 returns `score`, vector search returns `similarity`.
 *       rankResults uses result.similarity || 0 (correct per plan confirmation).
 */

const memoryManager = require('./memory-manager.cjs');
const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = require('./memory-constants.cjs');

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_THRESHOLD = SEMANTIC_SEARCH_DEFAULT_THRESHOLD || 0.3;

/**
 * Rank results by similarity score descending, with optional filtering.
 *
 * @param {Array<{ content?: string, similarity?: number, score?: number, source?: string }>} results
 * @param {{ maxResults?: number, threshold?: number }} [opts]
 * @returns {Array<{ content?: string, similarity: number, source?: string }>}
 */
function rankResults(results, opts = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0;
  const maxResults = typeof opts.maxResults === 'number' ? opts.maxResults : Infinity;

  // Normalize similarity: use similarity field, fall back to score, then 0
  const withSim = results.map(r => ({
    ...r,
    similarity: typeof r.similarity === 'number' ? r.similarity : (typeof r.score === 'number' ? r.score : 0),
  }));

  // Filter by threshold, sort descending
  const filtered = withSim
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  return filtered.slice(0, maxResults);
}

/**
 * Format ranked results into a readable context string.
 *
 * @param {Array<{ content?: string, similarity?: number, source?: string }>} results
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
function formatContext(results, opts = {}) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const maxChars = typeof opts.maxChars === 'number' ? opts.maxChars : DEFAULT_MAX_CHARS;
  const parts = [];
  let totalChars = 0;

  for (const result of results) {
    const source = result.source || 'memory';
    const sim = typeof result.similarity === 'number'
      ? ` (${(result.similarity * 100).toFixed(0)}%)`
      : '';
    const content = String(result.content || '');
    const entry = `[${source}]${sim}\n${content}\n`;

    if (totalChars + entry.length > maxChars) {
      // Add truncated portion if any space remains
      const remaining = maxChars - totalChars;
      if (remaining > 50) {
        parts.push(entry.slice(0, remaining));
      }
      break;
    }
    parts.push(entry);
    totalChars += entry.length;
  }

  return parts.join('\n---\n');
}

/**
 * Search internal project memory and return ranked results with formatted context.
 *
 * @param {string} query - The search query
 * @param {{ limit?: number, threshold?: number, maxChars?: number }} [opts]
 * @returns {Promise<{ results: Array<object>, context: string }>}
 */
async function searchInternalContext(query, opts = {}) {
  const limit = typeof opts.limit === 'number' ? opts.limit : DEFAULT_LIMIT;
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_THRESHOLD;
  const maxChars = typeof opts.maxChars === 'number' ? opts.maxChars : DEFAULT_MAX_CHARS;

  try {
    // Guard against empty/invalid query
    const q = String(query || '').trim();
    if (!q) {
      return { results: [], context: '' };
    }

    const rawResults = await memoryManager.searchMemory(q, { limit, threshold });
    const results = rankResults(Array.isArray(rawResults) ? rawResults : [], { maxResults: limit, threshold: 0 });
    const context = formatContext(results, { maxChars });

    return { results, context };
  } catch (_err) {
    // Return safe defaults on any error
    return { results: [], context: '' };
  }
}

module.exports = {
  searchInternalContext,
  rankResults,
  formatContext,
};
