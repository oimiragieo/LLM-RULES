/**
 * Result Ranker - Combine and rank hybrid search results
 *
 * Combines semantic and structural search results with intelligent ranking:
 * - Score combination with configurable weights
 * - Result deduplication
 * - Relevance ranking boosts
 * - Top-K selection
 *
 * @module code-indexing/result-ranker
 * @see {@link .claude/docs/PHASE_2_HYBRID_SEARCH_DESIGN.md}
 */

'use strict';

/**
 * Default score weights
 */
const DEFAULT_WEIGHTS = {
  semantic: 0.7,
  structural: 0.3,
  recency: 0.05,
  keyword: 0.1,
};

/**
 * Result ranker for hybrid search
 * @class ResultRanker
 */
class ResultRanker {
  /**
   * Initialize ranker with weights
   * @param {Object} weights - Score weights
   * @param {number} weights.semantic - Weight for semantic score (default: 0.7)
   * @param {number} weights.structural - Weight for structural score (default: 0.3)
   * @param {number} weights.recency - Weight for recency boost (default: 0.05)
   * @param {number} weights.keyword - Weight for keyword boost (default: 0.1)
   * @param {number} weights.confidenceThreshold - Minimum score to include (default: 0.3)
   */
  constructor(weights = {}) {
    this.weights = {
      semantic: weights.semantic ?? DEFAULT_WEIGHTS.semantic,
      structural: weights.structural ?? DEFAULT_WEIGHTS.structural,
      recency: weights.recency ?? DEFAULT_WEIGHTS.recency,
      keyword: weights.keyword ?? DEFAULT_WEIGHTS.keyword,
    };

    this.confidenceThreshold = weights.confidenceThreshold ?? 0.3;
  }

  /**
   * Calculate combined score
   * @param {number} semanticScore - Semantic similarity (0-1)
   * @param {number} structuralScore - Structural match (0 or 1)
   * @returns {number} Combined score (0-1)
   */
  calculateScore(semanticScore, structuralScore) {
    const baseScore =
      this.weights.semantic * semanticScore + this.weights.structural * structuralScore;

    // Normalize to 0-1 range
    const maxPossible = this.weights.semantic + this.weights.structural;
    return baseScore / maxPossible;
  }

  /**
   * Combine semantic and structural results
   * @param {SemanticResult[]} semanticResults - Results from Phase 1
   * @param {AstGrepResult[]} structuralResults - Results from ast-grep
   * @returns {HybridMatch[]} Combined, deduplicated results
   */
  combine(semanticResults, structuralResults) {
    // Handle empty inputs
    if (!semanticResults || semanticResults.length === 0) {
      return [];
    }

    // Create lookup map for structural matches
    const structuralMap = new Map();
    for (const sr of structuralResults || []) {
      const key = `${sr.filePath}:${sr.lineStart}-${sr.lineEnd}`;
      structuralMap.set(key, sr);
    }

    // Enhance semantic results with structural data
    const combined = semanticResults.map(semResult => {
      // Check for exact line range match
      const key = `${semResult.filePath}:${semResult.lineStart}-${semResult.lineEnd}`;
      const exactMatch = structuralMap.get(key);

      let structuralScore = 0.0;
      const sources = ['semantic'];
      let matches = null;

      if (exactMatch) {
        structuralScore = 1.0;
        sources.push('structural');
        matches = exactMatch.matches || null;
      }

      const combinedScore = this.calculateScore(semResult.semanticScore, structuralScore);

      return {
        filePath: semResult.filePath,
        lineStart: semResult.lineStart,
        lineEnd: semResult.lineEnd,
        content: semResult.content,
        score: combinedScore,
        semanticScore: semResult.semanticScore,
        structuralScore: structuralScore,
        sources: sources,
        metadata: semResult.metadata || {},
        matches: matches,
      };
    });

    return combined;
  }

  /**
   * Deduplicate results by file:line
   * @param {HybridMatch[]} results - Results to dedupe
   * @returns {HybridMatch[]} Deduplicated results
   */
  deduplicate(results) {
    if (!results || results.length === 0) {
      return [];
    }

    const seen = new Map();

    for (const result of results) {
      const key = `${result.filePath}:${result.lineStart}-${result.lineEnd}`;

      // Keep highest score when duplicates found
      if (!seen.has(key) || seen.get(key).score < result.score) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Sort results by combined score
   * @param {HybridMatch[]} results - Results to sort
   * @returns {HybridMatch[]} Sorted results (descending)
   */
  sort(results) {
    if (!results || results.length === 0) {
      return [];
    }

    return [...results].sort((a, b) => b.score - a.score);
  }

  /**
   * Return top-K results
   * @param {HybridMatch[]} results - Sorted results
   * @param {number} k - Number of results to return
   * @returns {HybridMatch[]} Top-K results
   */
  topK(results, k) {
    if (!results || results.length === 0) {
      return [];
    }

    return results.slice(0, k);
  }

  /**
   * Apply keyword boost to results
   * @param {HybridMatch[]} results - Results to boost
   * @param {string[]} keywords - Keywords to match
   * @returns {HybridMatch[]} Boosted results
   */
  applyKeywordBoost(results, keywords = []) {
    if (!results || results.length === 0 || !keywords || keywords.length === 0) {
      return results;
    }

    const keywordLower = keywords.map(k => k.toLowerCase());

    return results.map(result => {
      const contentLower = (result.content || '').toLowerCase();

      // Check if any keyword appears in content
      const hasKeyword = keywordLower.some(kw => contentLower.includes(kw));

      if (hasKeyword) {
        return {
          ...result,
          score: Math.min(1.0, result.score + this.weights.keyword),
        };
      }

      return result;
    });
  }

  /**
   * Apply recency boost to newer files
   * @param {HybridMatch[]} results - Results to boost
   * @returns {HybridMatch[]} Boosted results
   */
  applyRecencyBoost(results) {
    if (!results || results.length === 0) {
      return results;
    }

    // Find newest file timestamp
    const timestamps = results.map(r => r.metadata?.mtime || 0).filter(t => t > 0);

    if (timestamps.length === 0) {
      return results;
    }

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    return results.map(result => {
      const mtime = result.metadata?.mtime || 0;

      if (mtime === 0) {
        return result; // No timestamp, no boost
      }

      // Calculate age as fraction of 30 days
      const ageMs = now - mtime;
      const ageFraction = Math.min(1.0, ageMs / thirtyDaysMs);

      // Apply boost (newer files get higher boost)
      const boost = this.weights.recency * (1.0 - ageFraction);

      return {
        ...result,
        score: Math.min(1.0, result.score + boost),
      };
    });
  }

  /**
   * Filter results below confidence threshold
   * @param {HybridMatch[]} results - Results to filter
   * @returns {HybridMatch[]} Filtered results
   */
  filterByConfidence(results) {
    if (!results || results.length === 0) {
      return [];
    }

    return results.filter(r => r.score >= this.confidenceThreshold);
  }
}

module.exports = { ResultRanker };
