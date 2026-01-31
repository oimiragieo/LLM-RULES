/**
 * Hybrid Search Engine - Three-stage hybrid search pipeline
 *
 * Orchestrates semantic + structural search:
 * 1. Semantic Search (Phase 1 - IndexManager)
 * 2. Structural Refinement (ast-grep)
 * 3. Result Combination & Ranking
 *
 * @module code-indexing/hybrid-search
 * @see {@link .claude/context/artifacts/PHASE_2_HYBRID_SEARCH_DESIGN.md}
 */

'use strict';

const { QueryAnalyzer } = require('./query-analyzer.cjs');
const { ResultRanker } = require('./result-ranker.cjs');

/**
 * Default configuration
 */
const DEFAULT_OPTIONS = {
  semanticWeight: 0.7,
  structuralWeight: 0.3,
  topK: 10,
  useRipgrep: true,
  ripgrepTimeout: 100
};

/**
 * Hybrid search engine combining semantic and structural search
 * @class HybridSearch
 */
class HybridSearch {
  /**
   * Initialize hybrid search engine
   * @param {Object} indexManager - Phase 1 index manager
   * @param {Object} options - Configuration
   * @param {Object} options.astGrep - ast-grep wrapper instance
   * @param {Object} options.queryAnalyzer - Query analyzer instance
   * @param {Object} options.ranker - Result ranker instance
   * @param {number} options.semanticWeight - Semantic weight (default: 0.7)
   * @param {number} options.structuralWeight - Structural weight (default: 0.3)
   * @param {number} options.topK - Max results (default: 10)
   * @param {boolean} options.useRipgrep - Enable ripgrep pre-filter (default: true)
   */
  constructor(indexManager, options = {}) {
    this.indexManager = indexManager;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Initialize components (provided or create defaults)
    this.astGrep = options.astGrep || null;
    this.queryAnalyzer = options.queryAnalyzer || new QueryAnalyzer();
    this.ranker = options.ranker || new ResultRanker({
      semantic: this.options.semanticWeight,
      structural: this.options.structuralWeight
    });
  }

  /**
   * Perform hybrid search (three-stage pipeline)
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {string} options.pattern - Optional ast-grep pattern
   * @param {string} options.language - Language filter
   * @param {number} options.limit - Max results (default: 10)
   * @returns {Promise<HybridSearchResult>} Search results with scores
   */
  async search(query, options = {}) {
    const timing = {};
    const startTotal = Date.now();

    // Stage 0: Query Analysis
    const analysis = this.queryAnalyzer.analyze(query);

    // Stage 1: Semantic Search (Phase 1)
    const semanticStart = Date.now();
    const limit = options.limit || this.options.topK;
    const language = options.language || analysis.language;
    const semanticResults = await this.semanticStage(query, limit * 2, language);
    timing.semantic = Date.now() - semanticStart;

    // Stage 2: Structural Refinement (ast-grep)
    let structuralResults = [];
    const pattern = options.pattern || analysis.astPattern;
    const astGrepLanguage = language || 'javascript';

    if (pattern && this.astGrep && await this.astGrep.isAvailable()) {
      const astGrepStart = Date.now();
      structuralResults = await this.structuralStage(
        semanticResults,
        pattern,
        astGrepLanguage
      );
      timing.astGrep = Date.now() - astGrepStart;
    }

    // Stage 3: Combine and Rank
    const combineStart = Date.now();
    const combinedResults = this.combineResults(semanticResults, structuralResults);
    timing.combine = Date.now() - combineStart;

    timing.total = Date.now() - startTotal;

    return {
      query,
      pattern,
      results: combinedResults.slice(0, limit),
      totalMatches: combinedResults.length,
      timing
    };
  }

  /**
   * Semantic search stage
   * @param {string} query - Query string
   * @param {number} limit - Max results
   * @param {string} language - Optional language filter
   * @returns {Promise<SemanticResult[]>} Semantic results
   */
  async semanticStage(query, limit = 20, language = null) {
    const searchOptions = { limit };

    // Add language filter if provided
    if (language) {
      searchOptions.filters = { language };
    }

    const results = await this.indexManager.semanticSearch(query, searchOptions);
    return results;
  }

  /**
   * Structural search stage (ast-grep refinement)
   * @param {SemanticResult[]} semanticResults - Results from semantic stage
   * @param {string} pattern - ast-grep pattern
   * @param {string} language - Programming language
   * @returns {Promise<HybridResult[]>} Results with structural scores
   */
  async structuralStage(semanticResults, pattern, language) {
    if (!pattern || !this.astGrep) {
      return [];
    }

    const available = await this.astGrep.isAvailable();
    if (!available) {
      return [];
    }

    return await this.astGrep.refine(semanticResults, pattern, language);
  }

  /**
   * Combine semantic and structural results
   * @param {SemanticResult[]} semanticResults - Results from Phase 1
   * @param {AstGrepResult[]} structuralResults - Results from ast-grep (optional)
   * @returns {HybridMatch[]} Combined, ranked results
   */
  combineResults(semanticResults, structuralResults = []) {
    // Combine using ranker
    let combined = this.ranker.combine(semanticResults, structuralResults);

    // Deduplicate
    combined = this.ranker.deduplicate(combined);

    // Sort by score descending
    combined = this.ranker.sort(combined);

    // Filter by confidence threshold
    combined = this.ranker.filterByConfidence(combined);

    return combined;
  }
}

module.exports = { HybridSearch };
