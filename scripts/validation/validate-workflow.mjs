#!/usr/bin/env node
/**
 * Workflow Validation Script
 *
 * Comprehensive validation of workflow YAML files:
 * - YAML structure and syntax
 * - Referenced agents exist (skipped for template workflows)
 * - Referenced schemas exist
 * - Step dependencies (artifacts from previous steps)
 * - Circular dependencies
 * - Step numbering (sequential or proper decimals)
 * - Optional artifact syntax consistency
 * - Template variable usage
 * - Template workflow mode detection
 *
 * Template Workflows:
 *   Workflows with `template: true` metadata or agent fields containing {{...}}
 *   placeholders skip agent file existence validation during dry-run.
 *
 * Usage:
 *   node scripts/validate-workflow.mjs [--workflow <path>] [--verbose]
 *
 * Exit codes:
 *   0: All validations passed
 *   1: One or more validations failed
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import js-yaml
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  console.error('❌ Error: js-yaml package is required for workflow validation.');
  console.error('   Please install it: pnpm add -D js-yaml');
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const workflowArg =
  args.find(arg => arg.startsWith('--workflow'))?.split('=')[1] ||
  (args.includes('--workflow') && args[args.indexOf('--workflow') + 1]) ||
  null;

const errors = [];
const warnings = [];

/**
 * Check if a value contains template placeholders
 * @param {string} value - Value to check
 * @returns {boolean} - True if value contains {{...}} placeholders
 */
function hasTemplatePlaceholder(value) {
  if (typeof value !== 'string') return false;
  return /\{\{[^}]+\}\}/.test(value);
}

/**
 * Check if workflow is a template workflow
 * @param {object} workflow - Parsed workflow object
 * @returns {boolean} - True if workflow is a template
 */
function isTemplateWorkflow(workflow) {
  // Check for explicit template metadata
  if (workflow.template === true || workflow.metadata?.template === true) {
    return true;
  }

  // Check if any step has template placeholders in agent field
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
 * Find all workflow YAML files (recursively under .claude/workflows)
 */
function findWorkflowFiles() {
  const workflowsDir = resolve(rootDir, '.claude/workflows');
  if (!existsSync(workflowsDir)) {
    errors.push(`Workflows directory not found: .claude/workflows`);
    return [];
  }

  const entries = readdirSync(workflowsDir, { recursive: true });
  return entries
    .filter(f => typeof f === 'string' && (f.endsWith('.yaml') || f.endsWith('.yml')))
    .map(f => resolve(workflowsDir, f));
}

/**
 * Find step in workflow (handles both flat steps array and nested phases)
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
      // Check if_yes and if_no steps
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
      // Check epic_loop and story_loop
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
 * Get all step numbers from workflow
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
 * Validate template variable syntax (properly closed)
 */
function validateTemplateVariableSyntax(str) {
  if (typeof str !== 'string') return { valid: true, errors: [] };

  const errors = [];

  // Check for unclosed variables: {{variable without closing }}
  // Pattern: {{ followed by non-} chars until end of string
  const unclosedMatches = str.match(/\{\{[^}]*$/g);
  if (unclosedMatches) {
    errors.push(`Unclosed template variable: ${unclosedMatches[0]}`);
  }

  // Check for closing braces without opening: }} that aren't preceded by {{
  // Strategy: Remove all valid {{...}} patterns, then check for orphaned }}
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
 * Check if an output is a special type (non-JSON)
 * Special types: code-artifacts, reasoning files
 */
function isSpecialOutput(output) {
  if (typeof output === 'string') {
    // Check for reasoning file pattern
    if (output.startsWith('reasoning:')) {
      return { type: 'reasoning', isSpecial: true };
    }
    // Check for code-artifacts (not a JSON file)
    if (output === 'code-artifacts' || output === 'code-artifacts (from step') {
      return { type: 'code-artifacts', isSpecial: true };
    }
    // Check if it's a directory reference (no .json extension)
    if (!output.endsWith('.json') && !output.includes('{{') && !output.startsWith('reasoning:')) {
      return { type: 'directory', isSpecial: true };
    }
  }
  if (typeof output === 'object' && output.reasoning) {
    return { type: 'reasoning', isSpecial: true };
  }
  return { type: 'json', isSpecial: false };
}

/**
 * Parse artifact reference from input string
 * Handles patterns like: "artifact.json (from step X)" or "artifact.json (from step X, optional)" or "(optional, from step X)"
 * Also handles special outputs like "code-artifacts (from step X)"
 */
function parseArtifactReference(input) {
  if (typeof input !== 'string') {
    return null;
  }

  // Pattern 1: artifact.json (from step X) or artifact.json (from step X, optional)
  let match = input.match(/^(.+\.json)\s*\(from step (\d+(?:\.\d+)?)(?:,\s*optional)?\)$/);
  if (match) {
    return {
      artifact: match[1].trim(),
      fromStep: match[2],
      optional: input.includes('optional'),
      isSpecial: false,
    };
  }

  // Pattern 2: artifact.json (optional, from step X)
  match = input.match(/^(.+\.json)\s*\(optional,\s*from step (\d+(?:\.\d+)?)\)$/);
  if (match) {
    return {
      artifact: match[1].trim(),
      fromStep: match[2],
      optional: true,
      isSpecial: false,
    };
  }

  // Pattern 3: code-artifacts (from step X) or code-artifacts (from step X, optional)
  match = input.match(/^code-artifacts\s*\(from step (\d+(?:\.\d+)?)(?:,\s*optional)?\)$/);
  if (match) {
    return {
      artifact: 'code-artifacts',
      fromStep: match[1],
      optional: input.includes('optional'),
      isSpecial: true,
    };
  }

  // Pattern 4: code-artifacts (optional, from step X)
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

/**
 * Validate a single workflow file
 */
function validateWorkflow(workflowPath) {
  const workflowName = workflowPath.split(/[/\\]/).pop();
  const workflowErrors = [];
  const workflowWarnings = [];

  if (verbose) {
    console.log(`\n📋 Validating workflow: ${workflowName}`);
  }

  // 1. Load and parse YAML
  let workflow;
  try {
    const content = readFileSync(workflowPath, 'utf-8');
    workflow = yaml.load(content);
  } catch (error) {
    workflowErrors.push(`Invalid YAML syntax: ${error.message}`);
    return { errors: workflowErrors, warnings: workflowWarnings };
  }

  // 2. Check if this is a template workflow
  const isTemplate = isTemplateWorkflow(workflow);
  if (isTemplate && verbose) {
    console.log(
      `  ℹ️  Template workflow detected - skipping agent file validation for placeholder agents`
    );
  }

  // 3. Get all step numbers
  const stepNumbers = getAllStepNumbers(workflow);

  // 3. Check for duplicate step numbers
  const stepNumberCounts = {};
  stepNumbers.forEach(step => {
    stepNumberCounts[step] = (stepNumberCounts[step] || 0) + 1;
  });

  Object.entries(stepNumberCounts).forEach(([step, count]) => {
    if (count > 1) {
      workflowErrors.push(`Duplicate step number: ${step} (appears ${count} times)`);
    }
  });

  // 4. Validate step numbering (sequential or proper decimals)
  const sortedSteps = [...new Set(stepNumbers)].sort((a, b) => {
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    return aNum - bNum;
  });

  // Warn about non-sequential step numbers (but allow decimals for sub-steps)
  if (sortedSteps.length > 1) {
    for (let i = 1; i < sortedSteps.length; i++) {
      const prevNum = parseFloat(sortedSteps[i - 1]);
      const currNum = parseFloat(sortedSteps[i]);
      const diff = currNum - prevNum;

      // Warn if steps are not sequential (diff > 1) and not decimal sub-steps
      if (diff > 1 && !sortedSteps[i].includes('.')) {
        workflowWarnings.push(
          `Step numbering gap: Step ${sortedSteps[i - 1]} to ${sortedSteps[i]} (missing steps in between)`
        );
      }

      // Warn if step numbers decrease (shouldn't happen)
      if (diff < 0) {
        workflowWarnings.push(
          `Step numbering out of order: Step ${sortedSteps[i]} comes after ${sortedSteps[i - 1]}`
        );
      }
    }
  }

  // 5. Validate each step
  sortedSteps.forEach(stepNumber => {
    const step = findStepInWorkflow(workflow, stepNumber);
    if (!step) {
      workflowErrors.push(`Step ${stepNumber}: Step not found (internal error)`);
      return;
    }

    // Check agent exists (skip for template placeholders)
    if (step.agent) {
      const hasPlaceholder = hasTemplatePlaceholder(step.agent);

      if (hasPlaceholder) {
        // Template placeholder detected - skip agent file validation
        if (verbose) {
          console.log(
            `  ⚙️  Step ${stepNumber}: Template agent placeholder '${step.agent}' detected - skipping file validation`
          );
        }
      } else {
        // Regular agent - validate file exists
        const agentFile = resolve(rootDir, `.claude/agents/${step.agent}.md`);
        if (!existsSync(agentFile)) {
          workflowErrors.push(
            `Step ${stepNumber}: Agent file not found: .claude/agents/${step.agent}.md`
          );
        } else if (verbose) {
          console.log(`  ✓ Step ${stepNumber}: Agent ${step.agent} exists`);
        }
      }
    } else {
      workflowWarnings.push(`Step ${stepNumber}: No agent specified`);
    }

    // Check schema exists if specified
    if (step.validation?.schema) {
      const schemaPath = resolve(rootDir, step.validation.schema);
      if (!existsSync(schemaPath)) {
        workflowErrors.push(`Step ${stepNumber}: Schema file not found: ${step.validation.schema}`);
      } else if (verbose) {
        console.log(`  ✓ Step ${stepNumber}: Schema ${step.validation.schema} exists`);
      }
    }

    // Check gate exists if specified
    if (step.validation?.gate) {
      // Gate path may contain template variables, so we can't check existence
      // But we can validate the path format
      const gatePath = step.validation.gate;
      if (
        !gatePath.includes('{{workflow_id}}') &&
        !gatePath.includes('{{story_id}}') &&
        !gatePath.includes('{{epic_id}}')
      ) {
        workflowWarnings.push(
          `Step ${stepNumber}: Gate path doesn't contain template variables (may cause conflicts): ${gatePath}`
        );
      }
    }

    // Validate input dependencies
    if (step.inputs && Array.isArray(step.inputs)) {
      step.inputs.forEach(input => {
        const ref = parseArtifactReference(input);
        if (ref && ref.fromStep) {
          // Check if referenced step exists
          const sourceStep = findStepInWorkflow(workflow, ref.fromStep);
          if (!sourceStep) {
            workflowErrors.push(
              `Step ${stepNumber}: Input '${input}' references non-existent step ${ref.fromStep}`
            );
            return;
          }

          // Check if source step has matching output
          let outputFound = false;
          if (sourceStep.outputs && Array.isArray(sourceStep.outputs)) {
            for (const output of sourceStep.outputs) {
              let outputName = null;
              const outputSpecial = isSpecialOutput(output);

              if (typeof output === 'string') {
                outputName = output;
              } else if (typeof output === 'object' && output.reasoning) {
                // Skip reasoning outputs for artifact matching
                continue;
              }

              if (outputName) {
                // For special outputs like code-artifacts, check exact match
                if (ref.isSpecial && outputSpecial.isSpecial) {
                  if (ref.artifact === 'code-artifacts' && outputName === 'code-artifacts') {
                    outputFound = true;
                    break;
                  }
                }

                // For JSON artifacts, check if artifact names match (ignoring template variables and annotations)
                if (!ref.isSpecial && !outputSpecial.isSpecial) {
                  // Remove template variables for comparison
                  const outputBase = outputName.replace(/\{\{[^}]+\}\}/g, '{{*}}');
                  const artifactBase = ref.artifact.replace(/\{\{[^}]+\}\}/g, '{{*}}');

                  // Also remove annotations like (partial), (complete), etc.
                  const outputClean = outputBase.replace(/\s*\([^)]+\)\s*$/, '').trim();
                  const artifactClean = artifactBase.trim();

                  if (
                    outputClean === artifactClean ||
                    outputBase === artifactBase ||
                    outputName.includes(ref.artifact.replace(/\{\{[^}]+\}\}/g, ''))
                  ) {
                    outputFound = true;
                    break;
                  }
                }
              }
            }
          }

          if (!outputFound && !ref.optional) {
            // Only error if it's a required artifact
            workflowErrors.push(
              `Step ${stepNumber}: Input '${input}' references artifact '${ref.artifact}' from step ${ref.fromStep}, but that step doesn't produce it`
            );
          } else if (outputFound && verbose) {
            console.log(`  ✓ Step ${stepNumber}: Input dependency '${input}' validated`);
          } else if (!outputFound && ref.optional && verbose) {
            console.log(
              `  ⚠️  Step ${stepNumber}: Optional input '${input}' not found (this is OK for optional artifacts)`
            );
          }

          // Check for circular dependencies (step references itself or future steps)
          const stepNum = parseFloat(stepNumber);
          const refStepNum = parseFloat(ref.fromStep);
          if (refStepNum >= stepNum) {
            workflowErrors.push(
              `Step ${stepNumber}: Circular or forward dependency: references step ${ref.fromStep} (must reference previous steps only)`
            );
          }

          // Check optional syntax consistency
          if (ref.optional) {
            if (!input.includes('optional') && !input.includes('(optional)')) {
              workflowWarnings.push(
                `Step ${stepNumber}: Optional artifact '${input}' should use consistent syntax: 'artifact.json (from step X, optional)'`
              );
            }
          }
        }
      });
    }

    // Validate outputs
    if (step.outputs && Array.isArray(step.outputs)) {
      step.outputs.forEach(output => {
        if (typeof output === 'string') {
          // Skip validation for special outputs like code-artifacts
          if (output === 'code-artifacts') {
            if (verbose) {
              console.log(
                `  ✓ Step ${stepNumber}: Special output 'code-artifacts' (no schema validation needed)`
              );
            }
            return; // Skip further validation for special outputs
          }

          // Skip validation for reasoning files
          if (output.startsWith('reasoning:')) {
            if (verbose) {
              console.log(
                `  ✓ Step ${stepNumber}: Reasoning file output (no schema validation needed)`
              );
            }
            return; // Skip further validation for reasoning files
          }

          // Validate template variable syntax for JSON artifacts
          const syntaxCheck = validateTemplateVariableSyntax(output);
          if (!syntaxCheck.valid) {
            syntaxCheck.errors.forEach(err => {
              workflowErrors.push(
                `Step ${stepNumber}: Malformed template variable in output '${output}': ${err}`
              );
            });
          }

          // Check for template variables
          const templateVars = output.match(/\{\{([^}]+)\}\}/g);
          if (templateVars) {
            templateVars.forEach(varName => {
              const varKey = varName.replace(/\{\{|\}\}/g, '');
              // Allowed template variables: workflow_id, story_id, epic_id, run_id, plan_id, primary_agent, fallback_agent
              const allowedVars = [
                'workflow_id',
                'story_id',
                'epic_id',
                'run_id',
                'plan_id',
                'primary_agent',
                'fallback_agent',
              ];
              if (!allowedVars.includes(varKey)) {
                workflowWarnings.push(
                  `Step ${stepNumber}: Unknown template variable in output: ${varName}`
                );
              }
            });
          }
        } else if (typeof output === 'object' && output.reasoning) {
          // Reasoning file object format - validate path
          if (output.reasoning && typeof output.reasoning === 'string') {
            const syntaxCheck = validateTemplateVariableSyntax(output.reasoning);
            if (!syntaxCheck.valid) {
              syntaxCheck.errors.forEach(err => {
                workflowErrors.push(
                  `Step ${stepNumber}: Malformed template variable in reasoning path '${output.reasoning}': ${err}`
                );
              });
            }
          }
        }
      });
    }

    // Validate gate path template variables
    if (step.validation?.gate) {
      const gatePath = step.validation.gate;
      const gateSyntaxCheck = validateTemplateVariableSyntax(gatePath);
      if (!gateSyntaxCheck.valid) {
        gateSyntaxCheck.errors.forEach(err => {
          workflowErrors.push(
            `Step ${stepNumber}: Malformed template variable in gate path '${gatePath}': ${err}`
          );
        });
      }
    }
  });

  // 6. Check for circular dependencies (graph-based check)
  const dependencyGraph = new Map();
  sortedSteps.forEach(stepNumber => {
    const step = findStepInWorkflow(workflow, stepNumber);
    if (step && step.inputs && Array.isArray(step.inputs)) {
      const dependencies = [];
      step.inputs.forEach(input => {
        const ref = parseArtifactReference(input);
        if (ref && ref.fromStep) {
          dependencies.push(ref.fromStep);
        }
      });
      dependencyGraph.set(stepNumber, dependencies);
    } else {
      dependencyGraph.set(stepNumber, []);
    }
  });

  // Check for cycles using DFS
  const visited = new Set();
  const recStack = new Set();

  function hasCycle(node) {
    if (recStack.has(node)) {
      return true; // Cycle detected
    }
    if (visited.has(node)) {
      return false;
    }

    visited.add(node);
    recStack.add(node);

    const deps = dependencyGraph.get(node) || [];
    for (const dep of deps) {
      if (hasCycle(dep)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  sortedSteps.forEach(stepNumber => {
    if (!visited.has(stepNumber)) {
      if (hasCycle(stepNumber)) {
        workflowErrors.push(`Circular dependency detected involving step ${stepNumber}`);
      }
    }
  });

  return { errors: workflowErrors, warnings: workflowWarnings };
}

/**
 * Main validation function
 */
function main() {
  console.log('🔍 Workflow Validation\n');

  let workflowFiles = [];

  if (workflowArg) {
    const workflowPath = resolve(workflowArg);
    if (!existsSync(workflowPath)) {
      console.error(`❌ Error: Workflow file not found: ${workflowPath}`);
      process.exit(1);
    }
    workflowFiles = [workflowPath];
  } else {
    workflowFiles = findWorkflowFiles();
  }

  if (workflowFiles.length === 0) {
    console.error('❌ No workflow files found');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  workflowFiles.forEach(workflowPath => {
    const result = validateWorkflow(workflowPath);
    errors.push(...result.errors.map(e => `${workflowPath}: ${e}`));
    warnings.push(...result.warnings.map(w => `${workflowPath}: ${w}`));
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  });

  // Print results
  if (errors.length > 0) {
    console.error('\n❌ Validation Errors:');
    errors.forEach(error => {
      console.error(`  ${error}`);
    });
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Validation Warnings:');
    warnings.forEach(warning => {
      console.warn(`  ${warning}`);
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ All workflows validated successfully!');
    process.exit(0);
  } else {
    console.log(`\n📊 Summary: ${totalErrors} error(s), ${totalWarnings} warning(s)`);
    if (errors.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

main();
