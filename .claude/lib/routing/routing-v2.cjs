'use strict';

/**
 * Unified Routing v2 Module
 *
 * Single routing decision function integrating:
 *   - Capability-based agent matching
 *   - Trust scoring (P0-08) influence on selection
 *   - Conditional execution (P1-04) evaluation
 *   - Previous task context (P0-09) awareness
 *
 * Backward compatible with routing-table-data.cjs.
 *
 * @module routing-v2
 */

const DEFAULT_TRUST_THRESHOLD = 0.3;
const FALLBACK_AGENT = 'developer';
const FALLBACK_MODEL = 'sonnet';

class RoutingDecision {
  /**
   * @param {{ agentId: string, model?: string, reason?: string, skipped?: boolean, skipReason?: string, previousContext?: Object, warnings?: string[] }} opts
   */
  constructor(opts = {}) {
    this.agentId = opts.agentId || FALLBACK_AGENT;
    this.model = opts.model || FALLBACK_MODEL;
    this.reason = opts.reason || '';
    this.skipped = Boolean(opts.skipped);
    this.skipReason = opts.skipReason || null;
    this.previousContext = opts.previousContext || null;
    this.warnings = opts.warnings || [];
  }
}

/**
 * Evaluate a simple condition against previous task context.
 * Inline version — avoids circular dependency on conditional-executor.
 *
 * @param {Object} condition
 * @param {Object|null} previousContext
 * @returns {{ execute: boolean, reason: string }}
 */
function evaluateSimpleCondition(condition, previousContext) {
  if (!condition) return { execute: true, reason: 'no condition' };

  const type = condition.type || 'always';

  switch (type) {
    case 'always':
      return { execute: true, reason: 'always' };

    case 'if_success': {
      if (!previousContext) return { execute: false, reason: 'no previous task' };
      return previousContext.status === 'completed'
        ? { execute: true, reason: 'previous completed' }
        : { execute: false, reason: `previous status: ${previousContext.status}` };
    }

    case 'if_failure': {
      if (!previousContext) return { execute: false, reason: 'no previous task' };
      return previousContext.status === 'failed'
        ? { execute: true, reason: 'previous failed' }
        : { execute: false, reason: `previous status: ${previousContext.status}` };
    }

    default:
      return { execute: true, reason: `unknown condition type: ${type}, defaulting to execute` };
  }
}

/**
 * Find agents matching a capability intent.
 *
 * @param {string} intent
 * @param {Object} agents - { agentId: { capabilities: string[], model?: string } }
 * @returns {Array<{ id: string, model: string, capabilities: string[] }>}
 */
function findCandidates(intent, agents) {
  const candidates = [];
  for (const [id, config] of Object.entries(agents)) {
    const caps = Array.isArray(config.capabilities) ? config.capabilities : [];
    if (caps.includes(intent)) {
      candidates.push({
        id,
        model: config.model || FALLBACK_MODEL,
        capabilities: caps,
      });
    }
  }
  return candidates;
}

/**
 * Route a task to the best agent using unified decision logic.
 *
 * @param {{ intent: string, description?: string, condition?: Object }} task
 * @param {{ agents: Object, trustScores?: Object, previousTaskContext?: Object }} config
 * @returns {RoutingDecision}
 */
function routeTask(task, config) {
  if (!task) {
    throw new Error('task is required for routeTask');
  }

  const agents = config.agents || {};
  const trustScores = config.trustScores || {};
  const previousContext = config.previousTaskContext || null;
  const warnings = [];

  // Step 1: Evaluate condition
  const condResult = evaluateSimpleCondition(task.condition, previousContext);
  if (!condResult.execute) {
    return new RoutingDecision({
      agentId: FALLBACK_AGENT,
      skipped: true,
      skipReason: condResult.reason,
      previousContext,
    });
  }

  // Step 2: Find candidates by capability
  const candidates = findCandidates(task.intent, agents);

  // Step 3: If no candidates, fallback
  if (candidates.length === 0) {
    return new RoutingDecision({
      agentId: FALLBACK_AGENT,
      model: FALLBACK_MODEL,
      reason: `fallback: no agent matches intent "${task.intent}"`,
      previousContext,
      warnings,
    });
  }

  // Step 4: Score candidates by trust
  const scored = candidates.map(c => {
    const trust = typeof trustScores[c.id] === 'number' ? trustScores[c.id] : 0.5;
    return { ...c, trust };
  });

  // Check for low-trust warnings
  for (const s of scored) {
    if (s.trust < DEFAULT_TRUST_THRESHOLD) {
      warnings.push(`agent ${s.id} has low trust score: ${s.trust}`);
    }
  }

  // Sort by trust descending
  scored.sort((a, b) => b.trust - a.trust);

  const best = scored[0];

  return new RoutingDecision({
    agentId: best.id,
    model: best.model,
    reason: `capability match: ${task.intent}, trust: ${best.trust}`,
    previousContext,
    warnings,
  });
}

module.exports = {
  routeTask,
  RoutingDecision,
  DEFAULT_TRUST_THRESHOLD,
};
