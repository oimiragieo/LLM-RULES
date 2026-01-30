/**
 * SPEC-018: Workflow Resolver
 *
 * WorkflowResolver handles loading and caching of workflows.
 */

class WorkflowResolver {
  constructor() {
    this.cache = new Map();
  }

  async resolve(workflowName, registry = new Map()) {
    if (this.cache.has(workflowName)) {
      return this.cache.get(workflowName);
    }

    if (!registry.has(workflowName)) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    const workflow = registry.get(workflowName);
    this.cache.set(workflowName, workflow);
    return workflow;
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = { WorkflowResolver };
