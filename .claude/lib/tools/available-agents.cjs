/**
 * AvailableAgents Tool - Agent Discovery and Health-Aware Routing
 *
 * Enables runtime discovery of agents by capability, domain, or health status.
 * Similar to SkillCatalog for skills, this tool queries the agent registry.
 *
 * @module available-agents
 * @example
 * const { AvailableAgents } = require('./available-agents.cjs');
 * const result = AvailableAgents({ capability: 'code-review', minSuccessRate: 0.8 });
 *
 * @see {@link file://.claude/docs/PHASE_3_IMPLEMENTATION_ARCHITECTURE.md} Architecture
 * @see {@link file://.claude/context/agent-registry.json} Data source
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/**
 * AvailableAgentsQuery - Query interface for agent discovery
 *
 * Provides capability-based filtering, health-aware selection,
 * caching, and intelligent fallback suggestions.
 */
class AvailableAgentsQuery {
  /**
   * Create an AvailableAgentsQuery instance
   * @param {Object} options - Configuration options
   * @param {string} options.registryPath - Path to agent registry JSON
   * @param {number} options.cacheTTL - Cache TTL in milliseconds (default: 2 minutes)
   * @param {number} options.cacheMaxSize - Maximum cache entries (default: 50)
   */
  constructor(options = {}) {
    this.registryPath =
      options.registryPath || path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');
    this.registry = null;
    this.cache = new Map();
    this.cacheTimeouts = new Map();
    this.CACHE_TTL = options.cacheTTL || 2 * 60 * 1000; // 2 minutes
    this.CACHE_MAX_SIZE = options.cacheMaxSize || 50;
  }

  /**
   * Load registry from file (lazy loading + caching)
   * @returns {Object} The agent registry
   * @throws {Error} If registry cannot be loaded
   */
  getRegistry() {
    if (this.registry) return this.registry;

    try {
      const content = fs.readFileSync(this.registryPath, 'utf-8');
      this.registry = JSON.parse(content);
      return this.registry;
    } catch (error) {
      throw new Error(`Failed to load agent registry: ${error.message}`);
    }
  }

  /**
   * Main query function - find agents by criteria
   *
   * @param {Object} options - Query options
   * @param {string} options.capability - Filter by capability (e.g., 'code-review')
   * @param {string} options.domain - Filter by domain (e.g., 'code', 'testing')
   * @param {string} options.category - Filter by category (e.g., 'core', 'specialized')
   * @param {boolean} options.excludeFailed - Exclude unavailable agents (default: true)
   * @param {number} options.minSuccessRate - Minimum success rate 0-1 (default: 0.7)
   * @param {number} options.limit - Maximum results 1-50 (default: 10)
   * @returns {Object} Query result with matching agents
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

    // 3. Load registry
    let registry;
    try {
      registry = this.getRegistry();
    } catch (error) {
      return this.buildErrorResponse(error.message);
    }

    let agents = [];

    // 4. Filter by capability (using index for O(1) lookup)
    if (options.capability) {
      const capAgentIds = registry.index?.byCapability?.[options.capability] || [];
      agents = capAgentIds.map(id => registry.agents[id]).filter(Boolean);
    }
    // 5. Filter by domain (using index)
    else if (options.domain) {
      const domainAgentIds = registry.index?.byDomain?.[options.domain] || [];
      agents = domainAgentIds.map(id => registry.agents[id]).filter(Boolean);
    }
    // 6. Filter by category (using index)
    else if (options.category) {
      const categoryAgentIds = registry.index?.byCategory?.[options.category] || [];
      agents = categoryAgentIds.map(id => registry.agents[id]).filter(Boolean);
    }
    // 7. Default: all agents
    else {
      agents = Object.values(registry.agents || {});
    }

    // 8. Filter by health status
    const excludeFailed = options.excludeFailed !== false; // default true
    if (excludeFailed) {
      agents = agents.filter(a => a.health?.status !== 'unavailable');
    }

    // 9. Filter by minimum success rate
    const minRate = options.minSuccessRate ?? 0.7;
    agents = agents.filter(a => (a.health?.successRate ?? 1.0) >= minRate);

    // 10. Sort by success rate DESC (best first), then by execution time
    agents.sort((a, b) => {
      const rateA = a.health?.successRate ?? 1.0;
      const rateB = b.health?.successRate ?? 1.0;
      if (rateB !== rateA) {
        return rateB - rateA;
      }
      // Secondary sort: prefer faster agents
      const timeA = a.health?.averageExecutionMs ?? Infinity;
      const timeB = b.health?.averageExecutionMs ?? Infinity;
      return timeA - timeB;
    });

    // 11. Apply limit
    const limit = Math.min(options.limit || 10, 50);
    agents = agents.slice(0, limit);

    // 12. Build and cache response
    const response = {
      success: true,
      agents: agents,
      count: agents.length,
      query: options,
    };

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Get a single agent by ID
   * @param {string} agentId - The agent ID
   * @returns {Object|null} The agent or null if not found
   */
  getAgent(agentId) {
    try {
      const registry = this.getRegistry();
      return registry.agents?.[agentId] || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if an agent is available (optionally for a specific capability)
   * @param {string} agentId - The agent ID
   * @param {string} capability - Optional capability to check
   * @returns {boolean} True if agent is available
   */
  isAvailable(agentId, capability = null) {
    const agent = this.getAgent(agentId);
    if (!agent) return false;
    if (agent.health?.status === 'unavailable') return false;

    if (capability) {
      return agent.capabilities?.some(c => c.name === capability) ?? false;
    }

    return true;
  }

  /**
   * Get the best agent for a capability
   * @param {string} capability - The capability to find
   * @returns {Object|null} The best agent or null
   */
  getBestAgent(capability) {
    const result = this.query({
      capability,
      excludeFailed: true,
      minSuccessRate: 0.7,
      limit: 1,
    });

    return result.success && result.count > 0 ? result.agents[0] : null;
  }

  /**
   * Get available filter options
   * @returns {Object} Filter metadata (capabilities, domains, categories)
   */
  getAvailableFilters() {
    try {
      const registry = this.getRegistry();

      return {
        capabilities: Object.keys(registry.index?.byCapability || {}),
        domains: Object.keys(registry.index?.byDomain || {}),
        categories: Object.keys(registry.index?.byCategory || {}),
        totalAgents: registry.metadata?.totalAgents || Object.keys(registry.agents || {}).length,
        healthyAgents: registry.metadata?.healthyAgents || registry.health?.healthy?.length || 0,
      };
    } catch {
      return {
        capabilities: [],
        domains: [],
        categories: [],
        totalAgents: 0,
        healthyAgents: 0,
      };
    }
  }

  /**
   * Get available capabilities
   * @returns {string[]} List of available capabilities
   */
  getAvailableCapabilities() {
    const filters = this.getAvailableFilters();
    return filters.capabilities;
  }

  /**
   * Get available domains
   * @returns {string[]} List of available domains
   */
  getAvailableDomains() {
    const filters = this.getAvailableFilters();
    return filters.domains;
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

    if (options.minSuccessRate !== undefined) {
      if (
        typeof options.minSuccessRate !== 'number' ||
        options.minSuccessRate < 0 ||
        options.minSuccessRate > 1
      ) {
        return 'minSuccessRate must be a number between 0 and 1';
      }
    }

    return null;
  }

  /**
   * Build error response
   * @param {string} error - Error message
   * @returns {Object} Error response object
   */
  buildErrorResponse(error) {
    return {
      success: false,
      error: error,
      agents: [],
      count: 0,
    };
  }

  /**
   * Build response when no agents match
   * @param {Object} options - Original query options
   * @returns {Object} No-match response with suggestions
   */
  buildNoMatchResponse(options) {
    const filters = this.getAvailableFilters();

    return {
      success: false,
      agents: [],
      count: 0,
      error: `No agents found matching: ${this.describeQuery(options)}`,
      suggestions: {
        message: 'Try domain filtering instead',
        alternatives: [{ domain: filters.domains[0] || 'code' }, { category: 'core' }],
      },
    };
  }

  /**
   * Generate cache key from query options
   * @param {Object} options - Query options
   * @returns {string} Cache key
   */
  getCacheKey(options) {
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
   * Clear cache (useful for testing and registry updates)
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimeouts.clear();
    this.registry = null;
  }

  /**
   * Helper: describe query in human-readable form
   * @param {Object} options - Query options
   * @returns {string} Human-readable description
   */
  describeQuery(options) {
    const parts = [];
    if (options.capability) parts.push(`capability='${options.capability}'`);
    if (options.domain) parts.push(`domain='${options.domain}'`);
    if (options.category) parts.push(`category='${options.category}'`);
    if (options.minSuccessRate) parts.push(`minSuccessRate=${options.minSuccessRate}`);
    return parts.join(' AND ') || 'all agents';
  }
}

// Singleton instance
const queryEngine = new AvailableAgentsQuery();

/**
 * Public API: AvailableAgents function
 * This is what agents/router calls at runtime
 *
 * @param {Object} options - Query options
 * @returns {Object} Query result with matching agents
 *
 * @example
 * // Find code review agents
 * AvailableAgents({ capability: 'code-review' })
 *
 * // Find testing agents with high success rate
 * AvailableAgents({ domain: 'testing', minSuccessRate: 0.8 })
 *
 * // Find healthy implementation agents
 * AvailableAgents({ capability: 'implementation', excludeFailed: true })
 *
 * // Get single best agent for security
 * AvailableAgents({ capability: 'security-review', limit: 1 })
 */
function AvailableAgents(options) {
  return queryEngine.query(options);
}

// Exports for testing and tool registration
module.exports = {
  AvailableAgents,
  AvailableAgentsQuery,
  getInstance: () => queryEngine,
};
