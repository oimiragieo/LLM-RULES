/**
 * Shared helpers for workflow validation.
 */

/**
 * Check if a value contains template placeholders.
 * @param {string} value
 * @returns {boolean}
 */
function hasTemplatePlaceholder(value) {
  if (typeof value !== 'string') return false;
  return /\{\{[^}]+\}\}/.test(value);
}

/**
 * Find step in workflow (handles both flat steps array and nested phases).
 * @param {object} workflow
 * @param {string|number} stepNumber
 * @returns {object|null}
 */
function findStepInWorkflow(workflow, stepNumber) {
  // Handle flat steps array
  if (workflow.steps && Array.isArray(workflow.steps)) {
    for (const step of workflow.steps) {
      if (String(step.step) === String(stepNumber)) {
        return step;
      }
    }
  }

  // Handle phase-based workflows (BMad format)
  if (workflow.phases && Array.isArray(workflow.phases)) {
    for (const phase of workflow.phases) {
      if (phase.steps && Array.isArray(phase.steps)) {
        for (const step of phase.steps) {
          if (String(step.step) === String(stepNumber)) {
            return step;
          }
        }
      }
      if (phase.decision) {
        if (phase.decision.if_yes && Array.isArray(phase.decision.if_yes)) {
          for (const step of phase.decision.if_yes) {
            if (String(step.step) === String(stepNumber)) {
              return step;
            }
          }
        }
        if (phase.decision.if_no && Array.isArray(phase.decision.if_no)) {
          for (const step of phase.decision.if_no) {
            if (String(step.step) === String(stepNumber)) {
              return step;
            }
          }
        }
      }
      if (
        phase.epic_loop &&
        phase.epic_loop.story_loop &&
        Array.isArray(phase.epic_loop.story_loop)
      ) {
        for (const step of phase.epic_loop.story_loop) {
          if (String(step.step) === String(stepNumber)) {
            return step;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get all step numbers from workflow.
 * @param {object} workflow
 * @returns {string[]}
 */
function getAllStepNumbers(workflow) {
  const steps = [];

  if (workflow.steps && Array.isArray(workflow.steps)) {
    workflow.steps.forEach(step => {
      if (step.step !== undefined) {
        steps.push(String(step.step));
      }
    });
  }

  if (workflow.phases && Array.isArray(workflow.phases)) {
    workflow.phases.forEach(phase => {
      if (phase.steps && Array.isArray(phase.steps)) {
        phase.steps.forEach(step => {
          if (step.step !== undefined) {
            steps.push(String(step.step));
          }
        });
      }
      if (phase.decision) {
        if (phase.decision.if_yes && Array.isArray(phase.decision.if_yes)) {
          phase.decision.if_yes.forEach(step => {
            if (step.step !== undefined) {
              steps.push(String(step.step));
            }
          });
        }
        if (phase.decision.if_no && Array.isArray(phase.decision.if_no)) {
          phase.decision.if_no.forEach(step => {
            if (step.step !== undefined) {
              steps.push(String(step.step));
            }
          });
        }
      }
      if (
        phase.epic_loop &&
        phase.epic_loop.story_loop &&
        Array.isArray(phase.epic_loop.story_loop)
      ) {
        phase.epic_loop.story_loop.forEach(step => {
          if (step.step !== undefined) {
            steps.push(String(step.step));
          }
        });
      }
    });
  }

  return steps;
}

/**
 * Check if workflow is a template workflow.
 * @param {object} workflow
 * @returns {boolean}
 */
function isTemplateWorkflow(workflow) {
  if (workflow.template === true || workflow.metadata?.template === true) {
    return true;
  }

  const stepNumbers = getAllStepNumbers(workflow);
  for (const stepNumber of stepNumbers) {
    const step = findStepInWorkflow(workflow, stepNumber);
    if (step && step.agent && hasTemplatePlaceholder(step.agent)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate template variable syntax.
 * @param {string} str
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTemplateVariableSyntax(str) {
  if (typeof str !== 'string') return { valid: true, errors: [] };

  const errors = [];
  const unclosedMatches = str.match(/\{\{[^}]*$/g);
  if (unclosedMatches) {
    errors.push(`Unclosed template variable: ${unclosedMatches[0]}`);
  }

  const withoutValidTemplates = str.replace(/\{\{[^}]+\}\}/g, '');
  if (withoutValidTemplates.includes('}}')) {
    errors.push(`Orphaned closing braces found`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if an output is a special type (non-JSON).
 * @param {unknown} output
 * @returns {{type: string, isSpecial: boolean}}
 */
function isSpecialOutput(output) {
  if (typeof output === 'string') {
    if (output.startsWith('reasoning:')) {
      return { type: 'reasoning', isSpecial: true };
    }
    if (output === 'code-artifacts' || output === 'code-artifacts (from step') {
      return { type: 'code-artifacts', isSpecial: true };
    }
    if (!output.endsWith('.json') && !output.includes('{{') && !output.startsWith('reasoning:')) {
      return { type: 'directory', isSpecial: true };
    }
  }

  if (typeof output === 'object' && output?.reasoning) {
    return { type: 'reasoning', isSpecial: true };
  }

  return { type: 'json', isSpecial: false };
}

/**
 * Parse artifact reference from input string.
 * @param {string} input
 * @returns {{artifact: string, fromStep: string, optional: boolean}|null}
 */
function parseArtifactReference(input) {
  if (typeof input !== 'string') {
    return null;
  }

  let match = input.match(/^(.+\.json)\s*\(from step (\d+(?:\.\d+)?)(?:,\s*optional)?\)$/);
  if (match) {
    return {
      artifact: match[1].trim(),
      fromStep: match[2],
      optional: input.includes('optional'),
      isSpecial: false,
    };
  }

  match = input.match(/^(.+\.json)\s*\(optional,\s*from step (\d+(?:\.\d+)?)\)$/);
  if (match) {
    return {
      artifact: match[1].trim(),
      fromStep: match[2],
      optional: true,
      isSpecial: false,
    };
  }

  match = input.match(/^code-artifacts\s*\(from step (\d+(?:\.\d+)?)(?:,\s*optional)?\)$/);
  if (match) {
    return {
      artifact: 'code-artifacts',
      fromStep: match[1],
      optional: input.includes('optional'),
      isSpecial: true,
    };
  }

  match = input.match(/^code-artifacts\s*\(optional,\s*from step (\d+(?:\.\d+)?)\)$/);
  if (match) {
    return {
      artifact: 'code-artifacts',
      fromStep: match[1],
      optional: true,
      isSpecial: true,
    };
  }

  return null;
}

export {
  findStepInWorkflow,
  getAllStepNumbers,
  hasTemplatePlaceholder,
  isSpecialOutput,
  isTemplateWorkflow,
  parseArtifactReference,
  validateTemplateVariableSyntax,
};
