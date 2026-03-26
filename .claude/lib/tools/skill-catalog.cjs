/**
 * SkillCatalog Tool - Runtime Skill Discovery
 *
 * Allows agents to query available skills dynamically at runtime.
 * Complements Phase 1D AVAILABLE_SKILLS injection with runtime queries.
 *
 * @module skill-catalog
 * @example
 * const { SkillCatalog } = require('./skill-catalog.cjs');
 * const result = SkillCatalog({ domain: 'testing', limit: 5 });
 *
 * @see {@link file://.claude/docs/SKILLCATALOG_ARCHITECTURE.md} Architecture
 * @see {@link file://.claude/config/skill-index.json} Data source
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const CORE_AGENT_RECOMMENDATIONS = Object.freeze({
  developer: ['tdd', 'debugging', 'code-quality-expert'],
  qa: ['tdd', 'verification-before-completion'],
});

/**
 * SkillCatalogQuery - Query interface for skill discovery
 *
 * Provides filtering, caching, and intelligent suggestions
 * for agent skill discovery.
 */
class SkillCatalogQuery {
  constructor(options = {}) {
    this.skillIndexPath =
      options.skillIndexPath || path.join(PROJECT_ROOT, '.claude/config/skill-index.json');
    this.skillIndex = null;
    this.cache = new Map();
    this.cacheTimeouts = new Map();
    this.CACHE_TTL = options.cacheTTL || 5 * 60 * 1000; // 5 minutes
    this.CACHE_MAX_SIZE = options.cacheMaxSize || 100; // LRU cache max entries
  }

  /**
   * Load skill index from file (lazy loading + caching)
   * @returns {Object} The skill index
   */
  getSkillIndex() {
    if (this.skillIndex) return this.skillIndex;

    try {
      const content = fs.readFileSync(this.skillIndexPath, 'utf-8');
      this.skillIndex = safeParseJSON(content);
      return this.skillIndex;
    } catch (error) {
      throw new Error(`Failed to load skill index: ${error.message}`);
    }
  }

  /**
   * Main query function - find skills by criteria
   * @param {Object} options - Query options
   *   - domain: string (e.g., 'testing', 'security')
   *   - category: string (e.g., 'code-quality')
   *   - agentType: string (e.g., 'developer', 'qa')
   *   - tags: string[] (all must match - AND logic)
   *   - limit: number (1-50, default 10)
   * @returns {Object} Response with skills, count, suggestions
   */
  query(options = {}) {
    // Handle undefined/null options
    if (options === undefined || options === null) {
      options = {};
    }

    // 1. Validate options
    const validationError = this.validateOptions(options);
    if (validationError) {
      return this.buildErrorResponse(validationError);
    }

    // 2. Check cache
    const cacheKey = this.getCacheKey(options);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // 3. Load skill index
    let skillIndex;
    try {
      skillIndex = this.getSkillIndex();
    } catch (error) {
      return this.buildErrorResponse(error.message);
    }

    // 4. Get all skills as array
    let results = Object.entries(skillIndex.skills || {}).map(([name, skill]) => ({
      ...skill,
      name: skill?.name || name,
    }));

    // 5. Apply filters
    if (options.domain) {
      results = results.filter(s => s.domain === options.domain);
    }

    if (options.category) {
      results = results.filter(s => s.category === options.category);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(skill =>
        options.tags.every(tag => skill.tags && skill.tags.includes(tag))
      );
    }

    if (options.agentType) {
      // Get recommended skills for this agent type
      const configuredRecommended =
        skillIndex.discovery?.recommendedForAgent?.[options.agentType] || [];
      const fallbackRecommended = CORE_AGENT_RECOMMENDATIONS[options.agentType] || [];
      const orderedRecommended = [...fallbackRecommended, ...configuredRecommended];
      const recommendedSet = new Set(orderedRecommended);
      const recommendationRank = new Map(
        orderedRecommended.map((skillName, index) => [skillName, index])
      );

      // Mark recommended skills
      results = results.map(skill => ({
        ...skill,
        recommended:
          recommendedSet.has(skill.name) ||
          (skill.agentPrimary && skill.agentPrimary.includes(options.agentType)) ||
          false,
      }));

      // Sort with recommended first
      results.sort((a, b) => {
        const aRank = recommendationRank.has(a.name)
          ? recommendationRank.get(a.name)
          : Number.MAX_SAFE_INTEGER;
        const bRank = recommendationRank.has(b.name)
          ? recommendationRank.get(b.name)
          : Number.MAX_SAFE_INTEGER;
        if (a.recommended && !b.recommended) return -1;
        if (!a.recommended && b.recommended) return 1;
        if (aRank !== bRank) return aRank - bRank;
        return 0;
      });
    }

    // 6. Check results
    if (results.length === 0) {
      const response = this.buildNoMatchResponse(options, skillIndex);
      // Cache the no-match response too
      this.setCache(cacheKey, response);
      return response;
    }

    // 7. Limit results
    const limit = options.limit || 10;
    results = results.slice(0, limit);

    // 8. Build and cache response
    const response = {
      success: true,
      skills: results,
      count: results.length,
      query: options,
    };

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Generate alternative query suggestions when no matches found
   * @param {Object} options - The original query options
   * @param {Object} skillIndex - The skill index
   * @returns {Object} No-match response with suggestions
   */
  buildNoMatchResponse(options, skillIndex) {
    const suggestions = [];

    // Get available domains and categories for suggestions
    const availableDomains = Object.keys(skillIndex.index?.byDomain || {});
    const availableCategories = Object.keys(skillIndex.index?.byCategory || {});
    const availableTags = this.extractAllTags(skillIndex);

    // Strategy 1: Broaden domain filter
    if (options.domain) {
      suggestions.push({
        ...options,
        domain: undefined,
        message: `Remove domain filter (was: '${options.domain}')`,
      });
    }

    // Strategy 2: Remove tags filter
    if (options.tags && options.tags.length > 0) {
      suggestions.push({
        ...options,
        tags: undefined,
        message: `Remove tags filter (was: ${options.tags.join(', ')})`,
      });
    }

    // Strategy 3: Remove category filter
    if (options.category) {
      suggestions.push({
        ...options,
        category: undefined,
        message: `Remove category filter (was: '${options.category}')`,
      });
    }

    // Strategy 4: Try first available domain
    if (availableDomains.length > 0 && !suggestions.some(s => s.domain === availableDomains[0])) {
      suggestions.push({
        domain: availableDomains[0],
        message: `Try domain: '${availableDomains[0]}'`,
      });
    }

    return {
      success: false,
      skills: [],
      count: 0,
      query: options,
      suggestions: {
        message: `No skills found matching: ${this.describeQuery(options)}`,
        alternatives: suggestions.slice(0, 3),
        availableDomains: availableDomains,
        availableCategories: availableCategories,
        availableTags: availableTags.slice(0, 20),
      },
    };
  }

  /**
   * Extract all unique tags from skill index
   * @param {Object} skillIndex - The skill index
   * @returns {string[]} Array of unique tags
   */
  extractAllTags(skillIndex) {
    const tagsSet = new Set();
    Object.values(skillIndex.skills || {}).forEach(skill => {
      if (skill.tags && Array.isArray(skill.tags)) {
        skill.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }

  /**
   * Validate query options
   * @param {Object} options - Query options to validate
   * @returns {string|null} Error message or null if valid
   */
  validateOptions(options) {
    if (typeof options !== 'object' || options === null) {
      return 'Options must be an object';
    }

    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) {
        return 'limit must be an integer between 1 and 50';
      }
    }

    if (options.tags !== undefined) {
      if (!Array.isArray(options.tags)) {
        return 'tags must be an array of strings';
      }
      if (!options.tags.every(t => typeof t === 'string')) {
        return 'all tags must be strings';
      }
    }

    return null;
  }

  /**
   * Build error response
   * @param {string} error - Error message
   * @returns {Object} Error response
   */
  buildErrorResponse(error) {
    return {
      success: false,
      error: error,
      skills: [],
      count: 0,
    };
  }

  /**
   * Get list of available domains and categories
   * @returns {Object} Filter metadata
   */
  getAvailableFilters() {
    const skillIndex = this.getSkillIndex();

    const domains = Object.keys(skillIndex.index?.byDomain || {});
    const categories = Object.keys(skillIndex.index?.byCategory || {});
    const agentTypes = Object.keys(skillIndex.discovery?.recommendedForAgent || {});

    return {
      domains,
      categories,
      agentTypes,
      totalSkills: skillIndex.metadata?.totalSkills || Object.keys(skillIndex.skills || {}).length,
    };
  }

  /**
   * Generate cache key from query options
   * @param {Object} options - Query options
   * @returns {string} Cache key
   */
  getCacheKey(options) {
    // Sort keys for deterministic hashing
    return JSON.stringify(options, Object.keys(options || {}).sort());
  }

  /**
   * Get value from cache if valid
   * @param {string} key - Cache key
   * @returns {Object|null} Cached value or null
   */
  getFromCache(key) {
    if (this.cache.has(key)) {
      const timeout = this.cacheTimeouts.get(key);
      if (timeout && Date.now() > timeout) {
        this.cache.delete(key);
        this.cacheTimeouts.delete(key);
        return null;
      }
      return this.cache.get(key);
    }
    return null;
  }

  /**
   * Store value in cache
   * @param {string} key - Cache key
   * @param {Object} value - Value to cache
   */
  setCache(key, value) {
    // Implement LRU: remove oldest if at max size
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.cacheTimeouts.delete(firstKey);
    }

    this.cache.set(key, value);
    this.cacheTimeouts.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Helper: describe query in human-readable form
   * @param {Object} options - Query options
   * @returns {string} Human-readable description
   */
  describeQuery(options) {
    const parts = [];
    if (options.domain) parts.push(`domain='${options.domain}'`);
    if (options.category) parts.push(`category='${options.category}'`);
    if (options.tags?.length > 0) parts.push(`tags=[${options.tags.join(', ')}]`);
    if (options.agentType) parts.push(`agentType='${options.agentType}'`);
    return parts.join(' AND ') || 'all skills';
  }

  /**
   * Clear cache (useful for testing and skill updates)
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimeouts.clear();
    this.skillIndex = null;
  }
}

// Singleton instance
const queryEngine = new SkillCatalogQuery();

/**
 * Public API: SkillCatalog function
 * This is what agents call at runtime
 *
 * @param {Object} options - Query options
 * @returns {Object} Query result
 */
function SkillCatalog(options) {
  return queryEngine.query(options);
}

// Exports for testing and tool registration
module.exports = {
  SkillCatalog,
  SkillCatalogQuery,
  getInstance: () => queryEngine,
};
