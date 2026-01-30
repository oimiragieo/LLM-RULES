/**
 * SPEC-018: Cycle Detection
 *
 * CycleDetector identifies circular dependencies in workflow includes and extends.
 * Uses DFS with visited tracking for O(V+E) complexity.
 */

class CycleDetector {
  /**
   * Detect cycles in workflow dependencies
   * @param {Object} workflow - The workflow to check
   * @param {Map} registry - Map of all workflows by name
   * @param {Set} visited - Already validated workflows (optimization)
   */
  async detectCycles(workflow, registry, visited = new Set()) {
    const stack = new Set(); // Current path
    const allVisited = new Set(visited);

    await this._dfs(workflow.name, registry, stack, allVisited, []);
  }

  /**
   * Depth-first search to detect cycles
   */
  async _dfs(name, registry, stack, visited, path) {
    // Check if workflow exists
    if (!registry.has(name)) {
      throw new Error(`Workflow '${name}' not found in registry`);
    }

    // Already visited and validated - no cycle
    if (visited.has(name)) {
      return;
    }

    // Currently in path - cycle detected!
    if (stack.has(name)) {
      const cyclePath = [...path, name].join(' -> ');
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }

    // Add to current path
    stack.add(name);
    path.push(name);

    const workflow = registry.get(name);
    const dependencies = this._extractDependencies(workflow);

    // Visit each dependency
    for (const depName of dependencies) {
      await this._dfs(depName, registry, stack, visited, [...path]);
    }

    // Remove from path
    stack.delete(name);
    visited.add(name);
  }

  /**
   * Extract all workflow dependencies from a workflow
   */
  _extractDependencies(workflow) {
    const deps = new Set();

    // Handle extends
    if (workflow.extends) {
      const extendsArray = Array.isArray(workflow.extends) ? workflow.extends : [workflow.extends];
      extendsArray.forEach(e => deps.add(e));
    }

    // Handle includes
    if (workflow.includes) {
      const includesArray = Array.isArray(workflow.includes)
        ? workflow.includes
        : [workflow.includes];
      includesArray.forEach(i => deps.add(i));
    }

    // Handle includes in phases
    if (workflow.phases && Array.isArray(workflow.phases)) {
      for (const phase of workflow.phases) {
        if (phase.include) {
          deps.add(phase.include);
        }
      }
    }

    // Handle compose
    if (workflow.compose && workflow.compose.workflows) {
      const workflowsArray = Array.isArray(workflow.compose.workflows)
        ? workflow.compose.workflows
        : [workflow.compose.workflows];
      workflowsArray.forEach(w => {
        const name = typeof w === 'string' ? w : w.workflow;
        if (name) deps.add(name);
      });
    }

    return Array.from(deps);
  }
}

module.exports = { CycleDetector };
