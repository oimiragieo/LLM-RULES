/**
 * SPEC-019: Task Routing
 *
 * Routes tasks between conductor-main and agent-studio for gradual migration.
 * Supports pattern matching, feature flags, sticky sessions, time-based routing,
 * weighted routing, and fallback strategies.
 */

class TaskRouter {
  constructor(config = {}) {
    this.rules = config.rules || [];
    this.featureFlags = config.featureFlags || {};
    this.stickySessionStore = new Map(); // userId → system
    this.defaultSystem = config.defaultSystem || 'agent-studio';
  }

  /**
   * Route a task to the appropriate system
   * @param {Object} task - Task to route
   * @param {string} task.path - Task path for pattern matching
   * @param {string} [task.userId] - User ID for sticky sessions
   * @param {string} [task.featureFlag] - Feature flag name
   * @returns {Promise<Object>} Routing decision { system, reason, metadata }
   */
  async route(task) {
    // 1. Sticky session check (highest priority)
    if (task.userId && this.stickySessionStore.has(task.userId)) {
      return {
        system: this.stickySessionStore.get(task.userId),
        reason: 'sticky_session',
        metadata: { userId: task.userId },
      };
    }

    // 2. Evaluate rules (in order, first match wins)
    for (const rule of this.rules) {
      // Feature flag routing (percentage-based)
      if (rule.featureFlag) {
        const rand = Math.random();
        const system = rand < rule.percentage / 100 ? rule.system : rule.fallback;
        return this._recordStickySession(task.userId, system, {
          reason: 'feature_flag',
          featureFlag: rule.featureFlag,
          percentage: rule.percentage,
          rand,
        });
      }

      // Pattern-based routing
      if (rule.pattern && this._matchesPattern(task.path, rule.pattern)) {
        // Handle time-based routing
        if (rule.time) {
          const now = Date.now();
          if (now >= rule.time.start && now <= rule.time.end) {
            return this._recordStickySession(task.userId, rule.system, {
              reason: 'time_match',
              pattern: rule.pattern,
              time: rule.time,
            });
          }
          continue; // Time window not active, try next rule
        }

        // Handle weighted routing
        if (rule.weight) {
          const rand = Math.random();
          const decision = rand < rule.weight ? rule.system : rule.fallback;
          return this._recordStickySession(task.userId, decision, {
            reason: 'weighted_routing',
            pattern: rule.pattern,
            weight: rule.weight,
            rand,
          });
        }

        // Simple pattern match
        return this._recordStickySession(task.userId, rule.system, {
          reason: 'pattern_match',
          pattern: rule.pattern,
        });
      }
    }

    // 3. Feature flags from config (deprecated pattern)
    if (task.featureFlag && this.featureFlags[task.featureFlag]) {
      const flag = this.featureFlags[task.featureFlag];
      const rand = Math.random();
      const system = rand < flag.percentage / 100 ? 'agent-studio' : 'conductor-main';
      return this._recordStickySession(task.userId, system, {
        reason: 'feature_flag',
        flag: task.featureFlag,
        percentage: flag.percentage,
        rand,
      });
    }

    // 4. Default fallback
    return this._recordStickySession(task.userId, this.defaultSystem, {
      reason: 'default',
    });
  }

  /**
   * Record sticky session for user
   */
  _recordStickySession(userId, system, metadata) {
    if (userId) {
      this.stickySessionStore.set(userId, system);
    }
    return { system, ...metadata };
  }

  /**
   * Match path against pattern (supports wildcards)
   */
  _matchesPattern(path, pattern) {
    if (!path || !pattern) return false;

    // Convert wildcard pattern to regex
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Fallback to alternate system on error
   * @param {Object} task - Task that failed
   * @param {string} primarySystem - System that failed
   * @returns {Promise<Object>} Fallback routing decision
   */
  async routeWithFallback(task, primarySystem) {
    const fallbackSystem = primarySystem === 'agent-studio' ? 'conductor-main' : 'agent-studio';

    return {
      system: fallbackSystem,
      reason: 'fallback',
      metadata: {
        primarySystem,
        fallbackReason: 'health_check_failed',
      },
    };
  }

  /**
   * Clear sticky session for a user
   */
  clearStickySession(userId) {
    this.stickySessionStore.delete(userId);
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return {
      stickySessionCount: this.stickySessionStore.size,
      ruleCount: this.rules.length,
      featureFlagCount: Object.keys(this.featureFlags).length,
    };
  }
}

module.exports = TaskRouter;
