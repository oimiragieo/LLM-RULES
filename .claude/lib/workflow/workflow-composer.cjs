/**
 * SPEC-018: Workflow Composition & Nesting
 *
 * WorkflowComposer handles workflow composition, inheritance, flattening,
 * and merging with support for includes, extends, overrides, and variable substitution.
 */

class WorkflowComposer {
  constructor() {
    this.cache = new Map();
    this.loadWorkflow = null; // Override this in tests/usage
  }

  /**
   * Compose multiple workflows into a single workflow
   */
  async compose(options) {
    const {
      strategy = 'sequential',
      workflows = [],
      parameters = {},
      context = {},
      mergeStrategy = 'combine',
      preserveMetadata = false,
      namespaceIsolation = false,
    } = options;

    let phases = [];
    const sources = [];

    if (strategy === 'sequential') {
      // Flatten each workflow and combine phases in order
      for (const wf of workflows) {
        const resolved = typeof wf === 'string' ? await this.loadWorkflow(wf) : wf;
        const flattened = await this.flatten(resolved, { parameters });
        sources.push(resolved.name);

        if (namespaceIsolation) {
          flattened.phases = flattened.phases.map(p => ({
            ...p,
            tasks: p.tasks.map(t => `${resolved.name}:${t}`),
          }));
        }

        phases = this._mergePhasesSequential(phases, flattened.phases, mergeStrategy);
      }
    } else if (strategy === 'parallel') {
      // Group all phases into a single parallel phase
      const allPhases = [];
      for (const wf of workflows) {
        const resolved = typeof wf === 'string' ? await this.loadWorkflow(wf) : wf;
        const flattened = await this.flatten(resolved, { parameters });
        sources.push(resolved.name);

        if (namespaceIsolation) {
          flattened.phases = flattened.phases.map(p => ({
            ...p,
            tasks: p.tasks.map(t => `${resolved.name}:${t}`),
          }));
        }
        allPhases.push(...flattened.phases);
      }
      phases = [{ parallel: allPhases }];
    } else if (strategy === 'conditional') {
      // Include workflows based on conditions
      for (const item of workflows) {
        const { workflow: wf, condition } = item;
        if (condition(context)) {
          const resolved = typeof wf === 'string' ? await this.loadWorkflow(wf) : wf;
          const flattened = await this.flatten(resolved, { parameters });
          sources.push(resolved.name);

          if (namespaceIsolation) {
            flattened.phases = flattened.phases.map(p => ({
              ...p,
              tasks: p.tasks.map(t => `${resolved.name}:${t}`),
            }));
          }
          phases = this._mergePhasesSequential(phases, flattened.phases, mergeStrategy);
        }
      }
    }

    const result = {
      name: `composed-${Date.now()}`,
      phases,
      metadata: preserveMetadata ? { sources } : {},
    };

    return result;
  }

  /**
   * Flatten a workflow hierarchy into a single-level workflow
   */
  async flatten(workflow, options = {}) {
    const {
      parameters = {},
      deduplicatePhases = false,
      buildExecutionPlan = false,
      optimizeOrder = false,
      cache = false,
    } = options;

    const cacheKey = `${workflow.name}:${JSON.stringify(parameters)}`;
    if (cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let phases = [];
    let merged = { ...workflow };

    // Handle inline composition (compose property on workflow)
    if (workflow.compose) {
      const composed = await this.compose(workflow.compose);
      phases = composed.phases;
    } else {
      // First, resolve inheritance (extends) - gets parent phases first
      if (workflow.extends) {
        merged = await this._resolveInheritance(workflow);
      }

      // Resolve includes
      phases = await this._resolveIncludes(merged.phases || []);

      // Apply overrides
      if (merged.overrides) {
        phases = this._applyOverrides(phases, merged.overrides);
      }

      // Handle child phases for conflict resolution (child wins) and insertions
      // Only do this if we didn't inherit from parent (inheritance already merged phases)
      if (workflow.phases && workflow.phases.length > 0 && !workflow.extends) {
        const phaseMap = new Map();
        for (const phase of phases) {
          if (phase.name) {
            phaseMap.set(phase.name, phase);
          }
        }

        // Process child phases for insertions or conflicts
        const phasesToInsert = [];

        for (const childPhase of workflow.phases) {
          if (childPhase.insertBefore || childPhase.insertAfter) {
            // Queue for insertion
            phasesToInsert.push(childPhase);
          } else if (childPhase.name) {
            // Override parent phase or add new phase
            phaseMap.set(childPhase.name, childPhase);
          }
        }

        phases = Array.from(phaseMap.values());

        // Now apply insertions
        if (phasesToInsert.length > 0) {
          phases = this._insertPhases(phases, phasesToInsert);
        }
      } else if (workflow.extends && workflow.phases && workflow.phases.length > 0) {
        // For inherited workflows, handle insertions and conflict resolution
        // The phases variable already has merged parent + child phases from _resolveInheritance
        const phaseMap = new Map();
        const phasesToInsert = [];

        // Build map of all current phases
        for (const phase of phases) {
          if (phase.name) {
            phaseMap.set(phase.name, phase);
          }
        }

        // Process child phases to identify insertions and overrides
        for (const childPhase of workflow.phases) {
          if (childPhase.insertBefore || childPhase.insertAfter) {
            // This is a child phase with insertion directive
            phasesToInsert.push(childPhase);
            // Make sure it's in the map (for conflict resolution)
            if (childPhase.name) {
              phaseMap.set(childPhase.name, childPhase);
            }
          } else if (childPhase.name) {
            // Update existing phase or add new one
            phaseMap.set(childPhase.name, childPhase);
          }
        }

        // Build final phase list without duplicates and with insertions applied
        let finalPhases = Array.from(phaseMap.values()).filter(p => {
          // Don't include phases that have insertBefore/After (they'll be inserted)
          return !phasesToInsert.some(ip => ip.name === p.name);
        });

        // Now apply insertions
        if (phasesToInsert.length > 0) {
          finalPhases = this._insertPhases(finalPhases, phasesToInsert);
        }

        phases = finalPhases;
      }
    }

    // Flatten nested phases (subphases)
    phases = this._flattenSubphases(phases);

    // Resolve variables
    phases = this._resolveVariables(phases, merged.variables || parameters);

    // Deduplicate if requested
    if (deduplicatePhases) {
      phases = this._deduplicatePhases(phases);
    }

    // Build metadata
    const result = {
      name: merged.name,
      phases,
      metadata: this._mergeMetadata(merged.metadata, workflow.metadata),
      hooks:
        merged.hooks && Object.keys(merged.hooks).length > 0 ? merged.hooks : workflow.hooks || {},
      validation: merged.validation,
      abstract: merged.abstract,
      dependencies: [...(merged.dependencies || []), ...(workflow.dependencies || [])],
      variables: { ...merged.variables, ...workflow.variables },
      totalTasks: phases.reduce((sum, p) => sum + (p.tasks ? p.tasks.length : 0), 0),
    };

    // Build execution plan
    if (buildExecutionPlan) {
      result.executionPlan = this._buildExecutionPlan(phases);
    }

    // Optimize phase order
    if (optimizeOrder) {
      phases = this._optimizePhaseOrder(phases);
      result.phases = phases;
    }

    if (cache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Resolve inheritance chain (extends)
   */
  async _resolveInheritance(workflow, visited = new Set()) {
    const resolved = { ...workflow };
    const extendsArray = Array.isArray(resolved.extends) ? resolved.extends : [resolved.extends];

    const seenPhases = new Set();

    for (const parentName of extendsArray) {
      if (visited.has(parentName)) {
        continue; // Already processed (diamond pattern)
      }
      visited.add(parentName);

      const parent = await this.loadWorkflow(parentName);
      if (!parent) throw new Error(`Workflow not found: ${parentName}`);

      // Load parent's parents recursively
      if (parent.extends) {
        const resolvedParent = await this._resolveInheritance(parent, visited);
        // Add parent phases only if not seen before (for diamond inheritance)
        const parentPhasesToAdd = (resolvedParent.phases || []).filter(p => {
          const key = p.name;
          if (seenPhases.has(key)) {
            return false;
          }
          seenPhases.add(key);
          return true;
        });
        resolved.phases = [...parentPhasesToAdd, ...(resolved.phases || [])];
        resolved.dependencies = [
          ...(resolvedParent.dependencies || []),
          ...(resolved.dependencies || []),
        ];
        resolved.hooks = this._mergeHooks(resolvedParent.hooks, resolved.hooks);
        resolved.metadata = this._mergeMetadata(resolvedParent.metadata, resolved.metadata);
      } else {
        // Add parent phases only if not seen before
        const parentPhasesToAdd = (parent.phases || []).filter(p => {
          const key = p.name;
          if (seenPhases.has(key)) {
            return false;
          }
          seenPhases.add(key);
          return true;
        });
        resolved.phases = [...parentPhasesToAdd, ...(resolved.phases || [])];
        resolved.dependencies = [...(parent.dependencies || []), ...(resolved.dependencies || [])];
        resolved.hooks = this._mergeHooks(parent.hooks, resolved.hooks);
        resolved.metadata = this._mergeMetadata(parent.metadata, resolved.metadata);
      }
    }

    return resolved;
  }

  /**
   * Resolve includes in phases (recursive)
   */
  async _resolveIncludes(phases) {
    const resolved = [];

    for (const phase of phases) {
      if (phase.include) {
        const included = await this.loadWorkflow(phase.include);
        if (!included) throw new Error(`Workflow not found: ${phase.include}`);
        // Recursively resolve includes in the included workflow's phases
        const resolvedIncluded = await this._resolveIncludes(included.phases);
        resolved.push(...resolvedIncluded);
      } else {
        resolved.push(phase);
      }
    }

    return resolved;
  }

  /**
   * Apply overrides to phases
   */
  _applyOverrides(phases, overrides) {
    const result = [];
    const overrideMap = new Map(Object.entries(overrides));

    for (const phase of phases) {
      const override = overrideMap.get(phase.name);

      if (override && override.remove === true) {
        continue; // Skip this phase
      }

      if (override && override.replace) {
        // Replace entire phase with new one
        result.push(override.replace);
        continue;
      }

      let updated = { ...phase };

      if (override) {
        // Apply property overrides (but exclude special keys)
        const overrideProps = { ...override };
        delete overrideProps.add;
        delete overrideProps.remove;
        delete overrideProps.replace;
        delete overrideProps.after;
        delete overrideProps.before;

        updated = { ...updated, ...overrideProps };

        // Add tasks
        if (override.add) {
          const addTasks = Array.isArray(override.add) ? override.add : [override.add];
          updated.tasks = [...(updated.tasks || []), ...addTasks];
        }

        // Remove tasks
        if (override.remove && Array.isArray(override.remove)) {
          updated.tasks = (updated.tasks || []).filter(t => !override.remove.includes(t));
        }
      }

      result.push(updated);
    }

    // Add new phases from overrides
    for (const [_phaseName, override] of overrideMap) {
      if (override.add && override.after) {
        const newPhase = override.add;
        const afterIndex = result.findIndex(p => p.name === override.after);
        if (afterIndex >= 0) {
          result.splice(afterIndex + 1, 0, newPhase);
        }
      } else if (override.add && override.before) {
        const newPhase = override.add;
        const beforeIndex = result.findIndex(p => p.name === override.before);
        if (beforeIndex >= 0) {
          result.splice(beforeIndex, 0, newPhase);
        }
      }
    }

    return result;
  }

  /**
   * Insert phases with insertBefore and insertAfter attributes
   */
  _insertPhases(existingPhases, newPhases) {
    const result = [...existingPhases];

    // Apply insertion directives only - other phases were already added in flatten()
    for (const phase of newPhases) {
      if (phase.insertBefore) {
        const beforeIndex = result.findIndex(p => p.name === phase.insertBefore);
        if (beforeIndex >= 0) {
          result.splice(beforeIndex, 0, phase);
        } else {
          result.push(phase);
        }
      } else if (phase.insertAfter) {
        const afterIndex = result.findIndex(p => p.name === phase.insertAfter);
        if (afterIndex >= 0) {
          result.splice(afterIndex + 1, 0, phase);
        } else {
          result.push(phase);
        }
      }
    }

    return result;
  }

  /**
   * Flatten nested subphases
   */
  _flattenSubphases(phases) {
    const result = [];

    for (const phase of phases) {
      if (phase.subphases) {
        result.push(...phase.subphases);
      } else {
        result.push(phase);
      }
    }

    return result;
  }

  /**
   * Resolve variables in phases
   */
  _resolveVariables(phases, variables = {}) {
    return phases.map(phase => {
      const updated = { ...phase };
      if (updated.tasks) {
        updated.tasks = updated.tasks.map(task => {
          let resolved = task;
          for (const [key, value] of Object.entries(variables)) {
            resolved = resolved.replace(`{{${key}}}`, value);
          }
          return resolved;
        });
      }
      return updated;
    });
  }

  /**
   * Deduplicate phases by name and content
   */
  _deduplicatePhases(phases) {
    const seen = new Map();
    const result = [];

    for (const phase of phases) {
      const key = `${phase.name}:${JSON.stringify(phase.tasks)}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        result.push(phase);
      }
    }

    return result;
  }

  /**
   * Merge phases using strategy
   */
  _mergePhasesSequential(existing, incoming, strategy) {
    if (strategy === 'combine') {
      // Combine tasks with same phase name
      const phaseMap = new Map();

      for (const phase of existing) {
        phaseMap.set(phase.name, phase);
      }

      for (const phase of incoming) {
        if (phaseMap.has(phase.name)) {
          const existing = phaseMap.get(phase.name);
          phaseMap.set(phase.name, {
            ...existing,
            tasks: [...(existing.tasks || []), ...(phase.tasks || [])],
          });
        } else {
          phaseMap.set(phase.name, phase);
        }
      }

      return Array.from(phaseMap.values());
    } else if (strategy === 'last-wins') {
      // Last workflow wins for overlapping phases
      const phaseMap = new Map();

      for (const phase of existing) {
        phaseMap.set(phase.name, phase);
      }

      for (const phase of incoming) {
        phaseMap.set(phase.name, phase);
      }

      return Array.from(phaseMap.values());
    } else {
      // Default: sequential
      return [...existing, ...incoming];
    }
  }

  /**
   * Merge metadata from multiple sources
   */
  _mergeMetadata(...metadata) {
    const result = {};
    for (const data of metadata) {
      if (data) {
        Object.assign(result, data);
      }
    }
    return result;
  }

  /**
   * Merge hooks from multiple sources
   */
  _mergeHooks(...hooks) {
    const result = {};
    for (const hook of hooks) {
      if (hook) {
        for (const [key, value] of Object.entries(hook)) {
          if (!result[key]) {
            result[key] = [];
          }
          result[key] = [...result[key], ...(Array.isArray(value) ? value : [value])];
        }
      }
    }
    return result;
  }

  /**
   * Build execution plan from phases
   */
  _buildExecutionPlan(phases) {
    return phases.map(phase => ({
      name: phase.name,
      tasks: phase.tasks,
      dependsOn: phase.dependsOn || [],
    }));
  }

  /**
   * Optimize phase order for parallel execution
   */
  _optimizePhaseOrder(phases) {
    // Mark phases that have no dependencies as parallelizable
    return phases.map(phase => ({
      ...phase,
      parallel: !phase.dependsOn || phase.dependsOn.length === 0,
    }));
  }
}

module.exports = { WorkflowComposer };
