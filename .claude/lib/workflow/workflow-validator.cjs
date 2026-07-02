/**
 * SPEC-018: Workflow Validation
 *
 * WorkflowValidator validates workflow structure, dependencies, and constraints.
 */

const fs = require('fs');

function parseYamlScalar(rawValue) {
  const value = String(rawValue || '').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function splitYamlKeyValue(text) {
  const separatorIndex = text.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(`Invalid YAML line: ${text}`);
  }
  return {
    key: text.slice(0, separatorIndex).trim(),
    valueText: text.slice(separatorIndex + 1).trim(),
  };
}

function parseYamlObject(lines, startIndex, indent) {
  const objectValue = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || line.text.startsWith('- ')) break;
    if (line.indent > indent) {
      throw new Error(`Invalid YAML indentation near: ${line.text}`);
    }

    const { key, valueText } = splitYamlKeyValue(line.text);
    if (valueText) {
      objectValue[key] = parseYamlScalar(valueText);
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine || nextLine.indent <= indent) {
      objectValue[key] = null;
      index += 1;
      continue;
    }

    const nested = parseYamlBlock(lines, index + 1, nextLine.indent);
    objectValue[key] = nested.value;
    index = nested.nextIndex;
  }

  return { value: objectValue, nextIndex: index };
}

function parseYamlArray(lines, startIndex, indent) {
  const arrayValue = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || !line.text.startsWith('- ')) break;
    if (line.indent !== indent) {
      throw new Error(`Invalid YAML indentation near: ${line.text}`);
    }

    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const nextLine = lines[index + 1];
      if (!nextLine || nextLine.indent <= indent) {
        arrayValue.push(null);
        index += 1;
        continue;
      }
      const nested = parseYamlBlock(lines, index + 1, nextLine.indent);
      arrayValue.push(nested.value);
      index = nested.nextIndex;
      continue;
    }

    if (itemText.includes(':')) {
      const itemValue = {};
      const { key, valueText } = splitYamlKeyValue(itemText);
      itemValue[key] = valueText ? parseYamlScalar(valueText) : null;
      let nextIndex = index + 1;
      const continuation = lines[nextIndex];
      if (continuation && continuation.indent > indent) {
        const nested = parseYamlObject(lines, nextIndex, continuation.indent);
        Object.assign(itemValue, nested.value);
        nextIndex = nested.nextIndex;
      }
      arrayValue.push(itemValue);
      index = nextIndex;
      continue;
    }

    arrayValue.push(parseYamlScalar(itemText));
    index += 1;
  }

  return { value: arrayValue, nextIndex: index };
}

function parseYamlBlock(lines, startIndex, indent) {
  const current = lines[startIndex];
  if (!current) {
    return { value: {}, nextIndex: startIndex };
  }
  if (current.text.startsWith('- ')) {
    return parseYamlArray(lines, startIndex, indent);
  }
  return parseYamlObject(lines, startIndex, indent);
}

function parseYamlFallback(content) {
  const lines = String(content)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => ({
      indent: (line.match(/^ */) || [''])[0].length,
      text: line.trim(),
    }))
    .filter(line => line.text.length > 0 && !line.text.startsWith('#'));

  if (lines.length === 0) {
    return {};
  }

  return parseYamlBlock(lines, 0, lines[0].indent).value;
}

function parseWorkflowYaml(content) {
  try {
    return require('yaml').parse(content);
  } catch (_err) {
    return parseYamlFallback(content);
  }
}

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
        workflow = parseWorkflowYaml(content);
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
