'use strict';

/**
 * composite-scorer.cjs
 *
 * Composite memory scoring module.
 *
 * Formula: similarity(0.5) + recency(0.3) + importance(0.2)
 *
 * - similarity: pre-computed externally, stored as entry.similarity (0-1)
 * - recency: exponential decay, half-life 7 days
 *   - score 1.0 at age=0, ~0.5 at age=7 days, approaches 0 at age=30+ days
 * - importance: entry.importance (0-1), default 0.5 when not specified
 *
 * Memory entry shape: { text, similarity, timestamp, importance? }
 *
 * @module composite-scorer
 */

// Composite weight constants
const WEIGHT_SIMILARITY = 0.5;
const WEIGHT_RECENCY = 0.3;
const WEIGHT_IMPORTANCE = 0.2;

// Recency decay constants
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const RECENCY_DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS; // ln(2) / half-life

// Consolidation threshold
const CONSOLIDATION_SIMILARITY_THRESHOLD = 0.85;

// Defaults
const DEFAULT_IMPORTANCE = 0.5;

/**
 * Compute the recency score for a given timestamp using exponential decay.
 * score = exp(-lambda * age_ms)
 * where lambda = ln(2) / half_life
 *
 * This gives:
 *   age = 0      → score = 1.0
 *   age = 7 days → score ≈ 0.5
 *   age = 30 days → score ≈ 0.054
 *
 * @param {string|number|Date} timestamp - ISO string, Unix ms, or Date object
 * @param {number} [now=Date.now()] - Reference time in ms (injectable for tests)
 * @returns {number} Recency score in [0, 1]
 */
function computeRecency(timestamp, now = Date.now()) {
  let ts;
  if (timestamp instanceof Date) {
    ts = timestamp.getTime();
  } else if (typeof timestamp === 'number') {
    ts = timestamp;
  } else if (typeof timestamp === 'string') {
    ts = Date.parse(timestamp);
  } else {
    return DEFAULT_IMPORTANCE; // unknown format → neutral
  }

  if (isNaN(ts)) return DEFAULT_IMPORTANCE;

  const ageMs = Math.max(0, now - ts);
  return Math.exp(-RECENCY_DECAY_LAMBDA * ageMs);
}

/**
 * Compute the composite score for a single memory entry.
 *
 * composite = similarity * 0.5 + recency * 0.3 + importance * 0.2
 *
 * @param {{ text: string, similarity: number, timestamp: string|number|Date, importance?: number }} entry
 * @param {string} _query - Unused (similarity is pre-computed on entry)
 * @param {number} [now=Date.now()] - Reference time in ms (injectable for tests)
 * @returns {number} Composite score in [0, 1]
 */
function scoreMemory(entry, _query, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 0;

  const similarity =
    typeof entry.similarity === 'number' ? Math.min(1, Math.max(0, entry.similarity)) : 0;
  const recency = computeRecency(entry.timestamp, now);
  const importance =
    typeof entry.importance === 'number'
      ? Math.min(1, Math.max(0, entry.importance))
      : DEFAULT_IMPORTANCE;

  return similarity * WEIGHT_SIMILARITY + recency * WEIGHT_RECENCY + importance * WEIGHT_IMPORTANCE;
}

/**
 * Rank an array of memory entries by composite score (descending).
 *
 * @param {Array<{ text: string, similarity: number, timestamp: string|number|Date, importance?: number }>} entries
 * @param {string} query - The search query (passed through to scoreMemory)
 * @param {number} [now=Date.now()] - Reference time in ms (injectable for tests)
 * @returns {Array<{ text: string, similarity: number, timestamp: string|number|Date, importance?: number, _compositeScore: number }>}
 */
function rankMemories(entries, query, now = Date.now()) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map(entry => ({
      ...entry,
      _compositeScore: scoreMemory(entry, query, now),
    }))
    .sort((a, b) => b._compositeScore - a._compositeScore);
}

/**
 * Determine whether two memory entries should be consolidated.
 * Returns true when their similarity to each other exceeds the threshold (0.85).
 *
 * NOTE: This function checks the pre-computed similarity values on the entries.
 * For two entries to be candidates for consolidation, their mutual similarity
 * should be high. Since similarity is computed externally (e.g., vector cosine),
 * we check the average of both entries' similarity scores as a proxy — or,
 * when comparing two entries directly, we check if both have similarity > threshold.
 *
 * The canonical use case: call this after a search where both entryA and entryB
 * were retrieved for the same query. If both have similarity > 0.85 to the query,
 * they are likely near-duplicates.
 *
 * @param {{ text: string, similarity: number }} entryA
 * @param {{ text: string, similarity: number }} entryB
 * @returns {boolean}
 */
function shouldConsolidate(entryA, entryB) {
  if (!entryA || !entryB) return false;

  const simA = typeof entryA.similarity === 'number' ? entryA.similarity : 0;
  const simB = typeof entryB.similarity === 'number' ? entryB.similarity : 0;

  // Both entries must individually exceed the consolidation threshold
  return simA > CONSOLIDATION_SIMILARITY_THRESHOLD && simB > CONSOLIDATION_SIMILARITY_THRESHOLD;
}

module.exports = {
  scoreMemory,
  rankMemories,
  shouldConsolidate,
  computeRecency,
  // Exported constants for testing and external use
  WEIGHT_SIMILARITY,
  WEIGHT_RECENCY,
  WEIGHT_IMPORTANCE,
  HALF_LIFE_MS,
  CONSOLIDATION_SIMILARITY_THRESHOLD,
  DEFAULT_IMPORTANCE,
};
