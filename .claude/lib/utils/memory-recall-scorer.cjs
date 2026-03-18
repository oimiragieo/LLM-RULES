'use strict';

/**
 * Composite memory recall scorer.
 *
 * Scores each result with a weighted composite of:
 *   - semantic similarity (weight 0.5)
 *   - recency              (weight 0.3) — linear decay over 7 days
 *   - importance           (weight 0.2)
 *
 * @param {{ results: Array<{text: string, similarity: number, timestamp: Date, importance: number}>, now: Date }} opts
 * @returns {Array<{text: string, similarity: number, timestamp: Date, importance: number, compositeScore: number}>}
 */
function scoreAndSort({ results, now }) {
  const WEIGHT_SEMANTIC = 0.5;
  const WEIGHT_RECENCY = 0.3;
  const WEIGHT_IMPORTANCE = 0.2;

  const scored = results.map(result => {
    const ageMs = now.getTime() - result.timestamp.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recency = Math.max(0, 1 - ageDays / 7);

    const compositeScore =
      WEIGHT_SEMANTIC * result.similarity +
      WEIGHT_RECENCY * recency +
      WEIGHT_IMPORTANCE * result.importance;

    return { ...result, compositeScore };
  });

  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  return scored;
}

module.exports = { scoreAndSort };
