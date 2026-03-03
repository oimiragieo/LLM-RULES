/**
 * SPEC-019: Task Routing
 *
 * Routes tasks between conductor-main and agent-studio for gradual migration.
 * Supports pattern matching, feature flags, sticky sessions, time-based routing,
 * weighted routing, and fallback strategies.
 */

const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

class TaskRouter {
  constructor(config = {}) {
    this.rules = config.rules || [];
    this.featureFlags = config.featureFlags || {};
    this.stickySessionStore = new Map(); // userId → system
    this.defaultSystem = config.defaultSystem || 'agent-studio';
    this.fallbackCount = 0;
    this.totalRoutes = 0;
    this.delegations = new Map(); // taskId -> delegation state
    const DelegationStore = require('./delegation-store.cjs');
    const sessionScope = (process.env.CLAUDE_SESSION_ID || `pid-${process.pid}`).replace(
      /[^a-zA-Z0-9._-]/g,
      '-'
    );
    const defaultDelegationsPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'context',
      'memory',
      `delegations.${sessionScope}.json`
    );
    this.store = new DelegationStore(config.delegationsPath || defaultDelegationsPath);
  }

  /**
   * Initialize router state from persistent storage
   */
  async initialize() {
    const persisted = await this.store.load();
    for (const [taskId, record] of Object.entries(persisted)) {
      this.delegations.set(taskId, record);
    }
  }

  /**
   * Route a task to the appropriate system
   * @param {Object} task - Task to route
   * @param {string} task.path - Task path for pattern matching
   * @param {string} [task.userId] - User ID for sticky sessions
   * @param {string} [task.featureFlag] - Feature flag name
   * @param {Object} [task.systemHealth] - Health status of systems
   * @param {string} [task.timestamp] - Override timestamp for time-based routing
   * @returns {Promise<Object>} Routing decision { system, reason, metadata }
   */
  async route(task) {
    this.totalRoutes++;
    const traceId = task?.traceId || null;

    // 1. Sticky session check (highest priority for non-feature flag rules)
    const stickyRule = this.rules.find(r => r.stickySession && r.featureFlag);
    if (!stickyRule && task.userId && this.stickySessionStore.has(task.userId)) {
      return this._attachTrace(
        {
          system: this.stickySessionStore.get(task.userId),
          reason: 'sticky_session',
          metadata: { userId: task.userId },
        },
        traceId
      );
    }

    // Sort rules by priority (higher priority first)
    const sortedRules = [...this.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 2. Evaluate rules (by priority, then order)
    for (const rule of sortedRules) {
      // Feature flag routing (percentage-based)
      if (rule.featureFlag) {
        // Check sticky session for this specific rule
        if (rule.stickySession && task.userId && this.stickySessionStore.has(task.userId)) {
          return this._attachTrace(
            {
              system: this.stickySessionStore.get(task.userId),
              reason: 'sticky_session',
              metadata: { userId: task.userId },
            },
            traceId
          );
        }

        const rand = Math.random();
        const system = rand < rule.percentage / 100 ? rule.system : rule.fallback;
        if (rule.stickySession) {
          return this._recordStickySession(task.userId, system, {
            reason: 'feature_flag',
            featureFlag: rule.featureFlag,
            percentage: rule.percentage,
          });
        }
        return this._attachTrace(
          {
            system,
            reason: 'feature_flag',
            featureFlag: rule.featureFlag,
            percentage: rule.percentage,
          },
          traceId
        );
      }

      // Pattern-based routing
      if (rule.pattern && this._matchesPattern(task.path, rule.pattern)) {
        // Check system health for fallback
        if (task.systemHealth && task.systemHealth[rule.system] === 'unhealthy') {
          if (rule.fallback) {
            this.fallbackCount++;
            return this._attachTrace(
              {
                system: rule.fallback,
                reason: 'fallback_on_error',
                metadata: {
                  originalSystem: rule.system,
                  fallbackReason: 'health_check_failed',
                },
              },
              traceId
            );
          }
        }

        // Handle time-based routing with schedule
        if (rule.schedule) {
          const isInWindow = this._isInTimeWindow(rule.schedule, task.timestamp);
          if (isInWindow) {
            return this._recordStickySession(task.userId, rule.system, {
              reason: 'time_match',
              pattern: rule.pattern,
              schedule: rule.schedule,
            });
          }
          // Outside time window, use fallback
          if (rule.fallback) {
            return this._attachTrace(
              {
                system: rule.fallback,
                reason: 'time_fallback',
                pattern: rule.pattern,
              },
              traceId
            );
          }
          continue; // Time window not active, try next rule
        }

        // Handle weighted routing with weights object
        if (rule.weights) {
          const system = this._selectByWeight(rule.weights);
          return this._recordStickySession(task.userId, system, {
            reason: 'weighted_routing',
            pattern: rule.pattern,
            weights: rule.weights,
          });
        }

        // Handle single weight (legacy)
        if (rule.weight) {
          const rand = Math.random();
          const decision = rand < rule.weight ? rule.system : rule.fallback;
          return this._recordStickySession(task.userId, decision, {
            reason: 'weighted_routing',
            pattern: rule.pattern,
            weight: rule.weight,
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
      return this._recordStickySession(
        task.userId,
        system,
        {
          reason: 'feature_flag',
          flag: task.featureFlag,
          percentage: flag.percentage,
        },
        traceId
      );
    }

    // 4. Default fallback
    return this._recordStickySession(
      task.userId,
      this.defaultSystem,
      {
        reason: 'default',
      },
      traceId
    );
  }

  /**
   * Check if current time is within schedule window
   */
  _isInTimeWindow(schedule, taskTimestamp) {
    // Parse timestamp or use current time
    const now = taskTimestamp ? new Date(taskTimestamp) : new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const currentTime = hours * 60 + minutes;

    // Parse schedule times (HH:MM format)
    const parseTime = timeStr => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const startTime = parseTime(schedule.start);
    const endTime = parseTime(schedule.end);

    // Handle wrap-around (e.g., 22:00 - 06:00)
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  /**
   * Select system based on weighted distribution
   */
  _selectByWeight(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const rand = Math.random() * total;
    let cumulative = 0;

    for (const [system, weight] of Object.entries(weights)) {
      cumulative += weight;
      if (rand < cumulative) {
        return system;
      }
    }

    // Fallback to first system
    return Object.keys(weights)[0];
  }

  /**
   * Record sticky session for user
   */
  _recordStickySession(userId, system, metadata, traceId = null) {
    if (userId) {
      this.stickySessionStore.set(userId, system);
    }
    return this._attachTrace({ system, ...metadata }, traceId);
  }

  _attachTrace(decision, traceId) {
    if (!traceId) return decision;
    const mergedMetadata = { ...(decision.metadata || {}), traceId };
    return { ...decision, traceId, metadata: mergedMetadata };
  }

  validateDelegationChain(chain = [], nextAgent) {
    const normalizedChain = Array.isArray(chain) ? chain.filter(Boolean) : [];
    const normalizedNext = String(nextAgent || '').trim();
    if (!normalizedNext) return;
    if (normalizedChain.includes(normalizedNext)) {
      const cycle = [...normalizedChain, normalizedNext].join(' -> ');
      throw new Error(`Circular Dependency Detected: ${cycle}`);
    }
  }

  async registerDelegation({
    taskId,
    parentAgent,
    targetAgent,
    chain = [],
    timeoutMs = 30000,
    traceId = null,
  }) {
    const id = String(taskId || '').trim();
    if (!id) {
      throw new Error('taskId is required for delegation registration');
    }
    this.validateDelegationChain(chain, targetAgent);
    const now = Date.now();
    const record = {
      taskId: id,
      parentAgent: parentAgent || null,
      targetAgent: targetAgent || null,
      chain: Array.isArray(chain) ? [...chain, targetAgent].filter(Boolean) : [targetAgent],
      timeoutMs,
      status: 'pending',
      traceId,
      createdAt: now,
      updatedAt: now,
    };
    this.delegations.set(id, record);
    await this.store.updateRecord(id, record);
    return record;
  }

  async applyDelegationUpdate(taskId, update = {}) {
    const id = String(taskId || '').trim();
    if (!id || !this.delegations.has(id)) return false;
    const status = String(update.status || '').trim();
    if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
      return false;
    }
    const record = this.delegations.get(id);
    const updated = {
      ...record,
      status,
      updatePayload: { ...update },
      updatedAt: Date.now(),
    };
    this.delegations.set(id, updated);
    await this.store.updateRecord(id, updated);
    return true;
  }

  async recoverOrphanedDelegations(now = Date.now()) {
    const recovered = [];
    for (const [taskId, record] of this.delegations.entries()) {
      if (
        record.status === 'completed' ||
        record.status === 'failed' ||
        record.status === 'reassigned'
      )
        continue;
      const deadline = record.updatedAt + (record.timeoutMs || 30000);
      if (now >= deadline) {
        const updated = {
          ...record,
          status: 'reassigned',
          recoveredAt: now,
          updatedAt: now,
        };
        this.delegations.set(taskId, updated);
        await this.store.updateRecord(taskId, updated);
        recovered.push(updated);
      }
    }
    return recovered;
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
    this.fallbackCount++;

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

  /**
   * Get routing metrics (includes fallback tracking)
   */
  getMetrics() {
    return {
      stickySessionCount: this.stickySessionStore.size,
      ruleCount: this.rules.length,
      featureFlagCount: Object.keys(this.featureFlags).length,
      fallbackCount: this.fallbackCount,
      totalRoutes: this.totalRoutes,
      fallbackRate: this.totalRoutes > 0 ? this.fallbackCount / this.totalRoutes : 0,
    };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics() {
    this.fallbackCount = 0;
    this.totalRoutes = 0;
  }
}

module.exports = TaskRouter;
