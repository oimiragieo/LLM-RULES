/**
 * Lazy Loader - On-demand workflow phase loading
 *
 * Loads workflow phases on demand rather than upfront, reducing memory
 * consumption by only loading what's needed for execution.
 *
 * Features:
 * - Dependency graph resolution
 * - Minimal dependency tree loading
 * - Cycle detection
 * - Memory savings calculation
 * - Dynamic phase addition
 *
 * @module lazy-loader
 */

class LazyLoader {
  constructor(workflow) {
    this.workflow = workflow;
    this.loadedPhases = new Set();
    this.dependencyGraph = null;
    this.dependencyGraphBuilt = false;
  }

  /**
   * Load a specific phase and its dependencies
   */
  loadPhase(phaseName) {
    // Build dependency graph if not already built
    if (!this.dependencyGraphBuilt) {
      this.buildDependencyGraph();
    }

    // Check for circular dependencies
    const visited = new Set();
    const stack = new Set();
    if (this._hasCycle(phaseName, visited, stack)) {
      throw new Error(`Circular dependency detected involving phase: ${phaseName}`);
    }

    // Load phase and all its dependencies
    this._loadPhaseRecursive(phaseName);
  }

  /**
   * Recursively load phase and its dependencies
   */
  _loadPhaseRecursive(phaseName) {
    if (this.loadedPhases.has(phaseName)) {
      return; // Already loaded
    }

    const phase = this.workflow.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseName}`);
    }

    // Load dependencies first
    if (phase.dependsOn) {
      const deps = Array.isArray(phase.dependsOn) ? phase.dependsOn : [phase.dependsOn];
      for (const dep of deps) {
        this._loadPhaseRecursive(dep);
      }
    }

    // Load this phase
    this.loadedPhases.add(phaseName);
  }

  /**
   * Detect cycles using DFS
   */
  _hasCycle(phaseName, visited, stack) {
    if (stack.has(phaseName)) {
      return true; // Cycle detected
    }

    if (visited.has(phaseName)) {
      return false; // Already checked, no cycle
    }

    visited.add(phaseName);
    stack.add(phaseName);

    const phase = this.workflow.phases.find(p => p.name === phaseName);
    if (phase && phase.dependsOn) {
      const deps = Array.isArray(phase.dependsOn) ? phase.dependsOn : [phase.dependsOn];
      for (const dep of deps) {
        if (this._hasCycle(dep, visited, stack)) {
          return true;
        }
      }
    }

    stack.delete(phaseName);
    return false;
  }

  /**
   * Unload a phase to free memory
   */
  unloadPhase(phaseName) {
    this.loadedPhases.delete(phaseName);
  }

  /**
   * Build dependency graph (O(V+E) complexity)
   */
  buildDependencyGraph() {
    if (this.dependencyGraphBuilt) {
      return this.dependencyGraph; // Return cached
    }

    this.dependencyGraph = new Map();

    for (const phase of this.workflow.phases) {
      const deps = phase.dependsOn
        ? Array.isArray(phase.dependsOn)
          ? phase.dependsOn
          : [phase.dependsOn]
        : [];
      this.dependencyGraph.set(phase.name, deps);
    }

    this.dependencyGraphBuilt = true;
    return this.dependencyGraph;
  }

  /**
   * Get dependency graph (cached)
   */
  getDependencyGraph() {
    if (!this.dependencyGraphBuilt) {
      this.buildDependencyGraph();
    }
    return this.dependencyGraph;
  }

  /**
   * Add phase dynamically
   */
  addPhase(phase) {
    this.workflow.phases.push(phase);
    // Invalidate dependency graph cache
    this.dependencyGraphBuilt = false;
    this.dependencyGraph = null;
  }

  /**
   * Get all phases (both loaded and unloaded)
   */
  getAllPhases() {
    return this.workflow.phases;
  }

  /**
   * Get loaded phases
   */
  getLoadedPhases() {
    return Array.from(this.loadedPhases);
  }

  /**
   * Get count of loaded phases
   */
  getLoadedPhasesCount() {
    return this.loadedPhases.size;
  }

  /**
   * Get total phases count
   */
  getTotalPhasesCount() {
    return this.workflow.phases.length;
  }

  /**
   * Calculate memory savings from lazy loading
   *
   * Returns: percentage of memory saved (0-1)
   */
  calculateMemorySavings() {
    const totalPhases = this.getTotalPhasesCount();
    const loadedPhases = this.getLoadedPhasesCount();

    if (totalPhases === 0) return 0;

    return (totalPhases - loadedPhases) / totalPhases;
  }
}

module.exports = LazyLoader;
