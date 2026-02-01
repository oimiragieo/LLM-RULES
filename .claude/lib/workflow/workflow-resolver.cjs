/**
 * SPEC-018: Workflow Resolver
 *
 * WorkflowResolver handles loading and caching of workflows.
 * getDependencies(workflow), cycle detection integration, max depth 10.
 */

const { CycleDetector } = require('./cycle-detector.cjs');

const MAX_DEPTH = 10;

class WorkflowResolver {
  constructor(options = {}) {
    this.cache = new Map();
    this.registry = options.registry || null;
    this.cycleDetector = options.cycleDetector || new CycleDetector();
  }

  /**
   * Set registry for resolve() when called without second argument
   */
  setRegistry(registry) {
    this.registry = registry;
  }

  async resolve(workflowName, registry) {
    const reg = registry ?? this.registry ?? new Map();
    if (this.cache.has(workflowName)) {
      return this.cache.get(workflowName);
    }

    if (!reg.has(workflowName)) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    const workflow = reg.get(workflowName);
    this.cache.set(workflowName, workflow);
    return workflow;
  }

  /**
   * Get dependency names from a workflow (extends, includes, compose)
   */
  getDependencies(workflow) {
    const deps = new Set();

    if (workflow.extends) {
      const arr = Array.isArray(workflow.extends) ? workflow.extends : [workflow.extends];
      arr.forEach(e => deps.add(e));
    }
    if (workflow.includes) {
      const arr = Array.isArray(workflow.includes) ? workflow.includes : [workflow.includes];
      arr.forEach(i => deps.add(i));
    }
    if (workflow.phases && Array.isArray(workflow.phases)) {
      for (const phase of workflow.phases) {
        if (phase && phase.include) deps.add(phase.include);
      }
    }
    if (workflow.compose && (workflow.compose.workflows || workflow._workflows)) {
      const list = workflow.compose.workflows || workflow._workflows || [];
      list.forEach(w => deps.add(typeof w === 'string' ? w : w.name || w.id));
    }

    return Array.from(deps);
  }

  /**
   * Resolve workflow with cycle detection; throws if circular dependency or depth exceeded
   */
  async resolveWithCycleCheck(workflowId, registry, options = {}) {
    const reg = registry ?? this.registry ?? new Map();
    if (!reg.has(workflowId)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }
    const workflow = reg.get(workflowId);
    await this.cycleDetector.detectCycles(workflow, reg, new Set(), {
      maxDepth: options.maxDepth ?? MAX_DEPTH,
    });
    return this.resolve(workflowId, reg);
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = { WorkflowResolver, MAX_DEPTH };
