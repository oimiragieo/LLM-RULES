/**
 * SPEC-018: Workflow Validation
 *
 * WorkflowValidator validates workflow structure, dependencies, and constraints.
 */

const fs = require('fs');
const yaml = require('yaml');

class WorkflowValidator {
  /**
   * Validate complete workflow structure
   * @param {string|object} workflowOrPath - Workflow object or path to YAML file
   * @param {object} options - Validation options
   *   - maxNestingDepth: Maximum allowed nesting depth (default: 10)
   *   - returnErrors: If true, return {valid, errors} instead of throwing (default: false)
   * @returns {object|void} - Returns {valid, errors} if returnErrors=true, otherwise throws on error
   */
  async validate(workflowOrPath, options = {}) {
    const { maxNestingDepth = 10, returnErrors = false } = options;

    // Handle file path input
    let workflow = workflowOrPath;
    if (typeof workflowOrPath === 'string') {
      try {
        const content = fs.readFileSync(workflowOrPath, 'utf8');
        workflow = yaml.parse(content);
      } catch (err) {
        if (returnErrors) {
          return { valid: false, errors: [`Failed to read workflow file: ${err.message}`] };
        }
        throw err;
      }
    }

    if (returnErrors) {
      // Collect validation errors instead of throwing
      const errors = [];

      try {
        this._validateStructure(workflow);
      } catch (err) {
        errors.push(err.message);
      }

      try {
        this._validatePhases(workflow, maxNestingDepth);
      } catch (err) {
        errors.push(err.message);
      }

      try {
        this._validateVariables(workflow);
      } catch (err) {
        errors.push(err.message);
      }

      // Also validate step schema
      const stepResult = this.validateStepSchema(workflow);
      if (!stepResult.valid) {
        errors.push(...stepResult.errors);
      }

      // Workflow requirements (if not abstract and has phases)
      if (!workflow.abstract && workflow.phases) {
        if (Array.isArray(workflow.phases) && workflow.phases.length === 0) {
          errors.push('Workflow must have at least one phase');
        }

        if (Array.isArray(workflow.phases)) {
          for (const phase of workflow.phases) {
            if (!phase.subphases && (!phase.tasks || phase.tasks.length === 0)) {
              errors.push(`Phase '${phase.name}' must have at least one task`);
            }
          }
        }
      }

      return { valid: errors.length === 0, errors };
    }

    // Original throwing behavior (default)
    this._validateStructure(workflow);
    this._validatePhases(workflow, maxNestingDepth);
    this._validateVariables(workflow);

    // Workflow requirements
    if (!workflow.abstract) {
      if (!workflow.phases || workflow.phases.length === 0) {
        throw new Error('Workflow must have at least one phase');
      }

      for (const phase of workflow.phases) {
        if (!phase.subphases && (!phase.tasks || phase.tasks.length === 0)) {
          throw new Error(`Phase '${phase.name}' must have at least one task`);
        }
      }
    }
  }

  /**
   * Validate workflow structure
   */
  _validateStructure(workflow) {
    if (!workflow.name) {
      throw new Error("Workflow must have a name (missing 'name' field)");
    }

    if (!Array.isArray(workflow.phases) && !workflow.abstract) {
      throw new Error('Workflow must have a phases array (or be marked abstract)');
    }
  }

  /**
   * Validate phases
   */
  _validatePhases(workflow, maxNestingDepth = 10) {
    if (!workflow.phases) return;

    for (const phase of workflow.phases) {
      // All phases must have a name (includes are handled at composition time)
      if (!phase.name) {
        throw new Error('Phase is missing a name field');
      }

      // Validate subphase nesting depth (phase is at level 1, its subphases at level 2, etc.)
      if (phase.subphases) {
        this._validateNestingDepth(phase.subphases, 2, maxNestingDepth);
      }
    }
  }

  /**
   * Validate nesting depth
   */
  _validateNestingDepth(phases, currentDepth, maxDepth) {
    if (currentDepth > maxDepth) {
      throw new Error(`Nesting depth exceeded: maximum ${maxDepth} levels allowed`);
    }

    for (const phase of phases) {
      if (phase.subphases) {
        this._validateNestingDepth(phase.subphases, currentDepth + 1, maxDepth);
      }
    }
  }

  /**
   * Validate variables are defined
   */
  _validateVariables(workflow) {
    if (!workflow.phases) return;

    const variables = workflow.variables || {};
    const definedVars = new Set(Object.keys(variables));

    for (const phase of workflow.phases) {
      if (!phase.tasks) continue;

      for (const task of phase.tasks) {
        const matches = task.match(/{{(\w+)}}/g) || [];
        for (const match of matches) {
          const varName = match.replace(/[{}]/g, '');
          if (!definedVars.has(varName)) {
            throw new Error(
              `Phase '${phase.name}': undefined variable '{{${varName}}}' in task '${task}'`
            );
          }
        }
      }
    }
  }

  /**
   * Validate dependencies are satisfied
   */
  async validateDependencies(workflow) {
    if (!workflow.phases) return;

    const phaseNames = new Set();
    for (const phase of workflow.phases) {
      if (phase.name) {
        phaseNames.add(phase.name);
      }
    }

    // Check phase dependencies
    for (const phase of workflow.phases) {
      if (phase.dependsOn) {
        const deps = Array.isArray(phase.dependsOn) ? phase.dependsOn : [phase.dependsOn];
        for (const dep of deps) {
          if (!phaseNames.has(dep)) {
            throw new Error(`Phase '${phase.name}' dependency not found: '${dep}'`);
          }
        }
      }
    }

    // Check for circular phase dependencies
    this._validateNoCyclicDependencies(workflow.phases);
  }

  /**
   * Check for cycles in phase dependencies
   */
  _validateNoCyclicDependencies(phases) {
    const phaseMap = new Map();
    for (const phase of phases) {
      phaseMap.set(phase.name, phase);
    }

    const visited = new Set();
    const stack = new Set();

    for (const phase of phases) {
      if (!visited.has(phase.name)) {
        this._checkPhaseCycle(phase.name, phaseMap, visited, stack);
      }
    }
  }

  /**
   * DFS to check for cycles in phase dependencies
   */
  _checkPhaseCycle(phaseName, phaseMap, visited, stack) {
    if (stack.has(phaseName)) {
      throw new Error(`Circular dependency detected in phase: ${phaseName}`);
    }

    if (visited.has(phaseName)) {
      return;
    }

    stack.add(phaseName);
    const phase = phaseMap.get(phaseName);

    if (phase && phase.dependsOn) {
      const deps = Array.isArray(phase.dependsOn) ? phase.dependsOn : [phase.dependsOn];
      for (const dep of deps) {
        this._checkPhaseCycle(dep, phaseMap, visited, stack);
      }
    }

    stack.delete(phaseName);
    visited.add(phaseName);
  }

  /**
   * Validate workflow is executable (not abstract)
   */
  async validateForExecution(workflow) {
    if (workflow.abstract) {
      throw new Error(
        'Abstract workflows cannot be executed directly. Create a concrete child workflow.'
      );
    }
  }

  /**
   * Validate step schema in workflow
   * Checks that all steps have required fields: id, and either handler or action
   */
  validateStepSchema(workflow) {
    const errors = [];

    if (!workflow.phases) {
      return { valid: true, errors: [] };
    }

    // Iterate through all phases
    for (const [phaseName, phase] of Object.entries(workflow.phases)) {
      if (!phase.steps) continue;

      // Validate each step
      for (let i = 0; i < phase.steps.length; i++) {
        const step = phase.steps[i];
        const stepNum = i + 1; // Use 1-indexed step numbers for human-readable errors

        // Check for required 'id' field
        if (!step.id) {
          errors.push(`Phase '${phaseName}', Step ${stepNum}: missing 'id' field`);
        }

        // Check for either 'handler' or 'action' field
        if (!step.handler && !step.action) {
          errors.push(`Phase '${phaseName}', Step ${stepNum}: missing 'handler' or 'action' field`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = { WorkflowValidator };
