#!/usr/bin/env node
/**
 * Step Validators
 * ===============
 *
 * Validation utilities for workflow steps in the EVOLVE system.
 * Provides various validator types including schema validation,
 * research validation, registration checks, and custom validators.
 *
 * Usage:
 *   const { StepValidator, VALIDATOR_TYPES, validateGates } = require('./step-validators.cjs');
 *
 *   const validator = new StepValidator();
 *   const result = await validator.validate(step, context);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Validator types supported by the system
 */
const VALIDATOR_TYPES = {
  SCHEMA: 'schema',
  ASSERTION: 'assertion',
  RESEARCH: 'research',
  FILE_EXISTS: 'file_exists',
  REGISTRATION: 'registration',
  CUSTOM: 'custom',
};

/**
 * Minimum research requirements
 */
const MIN_QUERIES = 3;
const MIN_SOURCES = 3;

// =============================================================================
// Safe Condition Evaluation (SEC-005 Fix)
// =============================================================================

/**
 * Predefined safe conditions for gate evaluation.
 * Only these conditions are allowed to prevent code injection via new Function().
 *
 * To add new conditions:
 * 1. Add the condition string as a key
 * 2. Implement the evaluation function
 * 3. Document what the condition checks
 */
const SAFE_CONDITIONS = {
  // Research step conditions
  'steps.research.passed': steps => steps?.research?.passed === true,
  'steps.research.passed === true': steps => steps?.research?.passed === true,

  // Validation step conditions
  'steps.validation.passed': steps => steps?.validation?.passed === true,
  'steps.validation.passed === true': steps => steps?.validation?.passed === true,

  // Combined conditions
  'steps.research.passed && steps.validation.passed': steps =>
    steps?.research?.passed === true && steps?.validation?.passed === true,

  // Step output success conditions (used in workflows and tests)
  'steps.step1.output.success === true': steps => steps?.step1?.output?.success === true,
  'steps.step2.output.count > 0': steps => (steps?.step2?.output?.count || 0) > 0,
  'steps.step2.output.count > 10': steps => (steps?.step2?.output?.count || 0) > 10,

  // EVOLVE workflow phase conditions
  'steps.confirm_need.output.confirmed === true': steps =>
    steps?.confirm_need?.output?.confirmed === true,
  'steps.check_conflicts.output.hasConflicts === false': steps =>
    steps?.check_conflicts?.output?.hasConflicts === false,

  // Context-based conditions (for assertion validators)
  'context.value > 0': (steps, context) => (context?.value || 0) > 0,
  'context.value > 10': (steps, context) => (context?.value || 0) > 10,
  'context.value === 42': (steps, context) => context?.value === 42,

  // Literal conditions
  true: () => true,
  false: () => false,
};

/**
 * Safely evaluate a condition string using predefined conditions only.
 * This prevents code injection attacks by not using new Function().
 *
 * @param {string} condition - The condition string to evaluate
 * @param {Object} context - The context object containing steps
 * @returns {{ passed: boolean, error?: string, blocked?: boolean }}
 */
function safeEvaluateCondition(condition, context) {
  // Handle null/undefined condition
  if (!condition || typeof condition !== 'string') {
    return {
      passed: false,
      error: 'Condition must be a non-empty string',
      blocked: true,
    };
  }

  const normalizedCondition = condition.trim();

  // Look up the condition in predefined safe conditions
  const evaluator = SAFE_CONDITIONS[normalizedCondition];

  if (!evaluator) {
    return {
      passed: false,
      error: `Unknown condition: "${normalizedCondition}". Use predefined conditions only.`,
      blocked: true,
    };
  }

  try {
    // Safely get steps from context, handling null/undefined
    const steps = context?.steps || {};
    // Pass both steps and full context to evaluator (for context.* conditions)
    const result = evaluator(steps, context);
    return { passed: Boolean(result) };
  } catch (e) {
    return {
      passed: false,
      error: `Evaluation error: ${e.message}`,
    };
  }
}

/**
 * Required sections in research reports
 */
const REQUIRED_REPORT_SECTIONS = ['Executive Summary', 'Summary', 'Sources', 'Recommendations'];

// =============================================================================
// Project Paths
// =============================================================================

/**
 * Get project root directory
 */
function getProjectRoot() {
  // Navigate up from .claude/lib/workflow to project root
  // __dirname is .claude/lib/workflow
  // ..  = .claude/lib
  // ..  = .claude
  // ..  = project root
  return path.resolve(__dirname, '..', '..', '..');
}

/**
 * Get CLAUDE.md path
 */
function getClaudeMdPath() {
  return path.join(getProjectRoot(), '.claude', 'CLAUDE.md');
}

/**
 * Get settings.json path
 */
function getSettingsJsonPath() {
  return path.join(getProjectRoot(), '.claude', 'settings.json');
}

/**
 * Get skill catalog path
 */
function getSkillCatalogPath() {
  return path.join(getProjectRoot(), '.claude', 'context', 'artifacts', 'skill-catalog.md');
}

// =============================================================================
// Research Validator
// =============================================================================

/**
 * Validate research requirements for EVOLVE OBTAIN phase
 *
 * Requirements:
 * - Minimum 3 queries executed
 * - Minimum 3 unique sources
 * - Research report file exists
 * - Report has required sections
 *
 * @param {Object} context - Context containing research data
 * @param {Object} context.research - Research object
 * @param {string[]} context.research.queries - List of executed queries
 * @param {string[]} context.research.sources - List of sources consulted
 * @param {string} [context.research.reportFile] - Path to research report
 * @returns {{ passed: boolean, error?: string }}
 */
function validateResearch(context) {
  if (!context || !context.research) {
    return { passed: false, error: 'No research data in context' };
  }

  const { queries = [], sources = [], reportFile } = context.research;

  // Check minimum queries
  if (!queries || queries.length < MIN_QUERIES) {
    return {
      passed: false,
      error: `Minimum ${MIN_QUERIES} queries required, got ${queries ? queries.length : 0}`,
    };
  }

  // Check minimum sources
  if (!sources || sources.length < MIN_SOURCES) {
    return {
      passed: false,
      error: `Minimum ${MIN_SOURCES} sources required, got ${sources ? sources.length : 0}`,
    };
  }

  // Check report file exists
  if (!reportFile) {
    return { passed: false, error: 'No research report file specified' };
  }

  if (!fs.existsSync(reportFile)) {
    return { passed: false, error: `Research report file does not exist: ${reportFile}` };
  }

  // Check report has required sections
  try {
    const reportContent = fs.readFileSync(reportFile, 'utf-8');
    const hasRequiredSection = REQUIRED_REPORT_SECTIONS.some(section =>
      reportContent.toLowerCase().includes(section.toLowerCase())
    );

    if (!hasRequiredSection) {
      return {
        passed: false,
        error: `Research report missing required sections. Expected one of: ${REQUIRED_REPORT_SECTIONS.join(', ')}`,
      };
    }
  } catch (e) {
    return { passed: false, error: `Failed to read research report: ${e.message}` };
  }

  return { passed: true };
}

// =============================================================================
// File Exists Validator
// =============================================================================

/**
 * Validate that a file exists
 *
 * @param {string} filePath - Path to check
 * @returns {{ passed: boolean, error?: string }}
 */
function validateFileExists(filePath) {
  if (!filePath) {
    return { passed: false, error: 'No file path provided' };
  }

  if (fs.existsSync(filePath)) {
    return { passed: true };
  }

  return { passed: false, error: `File does not exist: ${filePath}` };
}

// =============================================================================
// Schema Validator
// =============================================================================

/**
 * Simple JSON Schema validator (subset of JSON Schema)
 *
 * Supports:
 * - type validation (string, number, object, array, boolean)
 * - required properties
 * - basic property validation
 *
 * @param {*} data - Data to validate
 * @param {Object} schema - JSON Schema
 * @returns {{ passed: boolean, error?: string }}
 */
function validateSchema(data, schema) {
  try {
    const errors = [];

    // Type validation
    if (schema.type) {
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      if (actualType !== schema.type) {
        errors.push(`Expected type '${schema.type}', got '${actualType}'`);
      }
    }

    // Required properties validation (only for objects)
    if (schema.required && schema.type === 'object' && typeof data === 'object' && data !== null) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: '${field}'`);
        }
      }
    }

    // Properties type validation
    if (schema.properties && typeof data === 'object' && data !== null) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in data && propSchema.type) {
          const actualType = Array.isArray(data[prop]) ? 'array' : typeof data[prop];
          if (actualType !== propSchema.type) {
            errors.push(
              `Property '${prop}' has wrong type: expected '${propSchema.type}', got '${actualType}'`
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      return { passed: false, error: errors.join('; ') };
    }

    return { passed: true };
  } catch (e) {
    return { passed: false, error: `Schema validation error: ${e.message}` };
  }
}

// =============================================================================
// Registration Validators
// =============================================================================

/**
 * Validate that an artifact is registered in CLAUDE.md
 *
 * @param {string} artifactName - Name of the artifact
 * @param {string} section - Section to check ('agents', 'skills', 'workflows')
 * @returns {{ passed: boolean, error?: string }}
 */
function validateClaudeMdRegistration(artifactName, section) {
  try {
    const claudeMdPath = getClaudeMdPath();

    if (!fs.existsSync(claudeMdPath)) {
      return { passed: false, error: 'CLAUDE.md not found' };
    }

    const content = fs.readFileSync(claudeMdPath, 'utf-8');

    // Search for the artifact name in the content
    // Use word boundaries to avoid partial matches
    const searchPattern = new RegExp(`\\b${artifactName}\\b`, 'i');
    if (searchPattern.test(content)) {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Artifact '${artifactName}' not found in CLAUDE.md ${section} section`,
    };
  } catch (e) {
    return { passed: false, error: `Failed to check CLAUDE.md: ${e.message}` };
  }
}

/**
 * Validate that an agent is registered in routing-table.cjs
 *
 * @param {string} agentName - Name of the agent
 * @returns {{ passed: boolean, error?: string }}
 */
function validateRouterEnforcerRegistration(agentName) {
  try {
    const routerEnforcerPath = path.join(
      getProjectRoot(),
      '.claude',
      'lib',
      'routing',
      'routing-table.cjs'
    );

    if (!fs.existsSync(routerEnforcerPath)) {
      return { passed: false, error: 'routing-table.cjs not found' };
    }

    const content = fs.readFileSync(routerEnforcerPath, 'utf-8');

    // Check if agent is in INTENT_TO_AGENT mapping or intentKeywords
    const searchPattern = new RegExp(`['"]${agentName}['"]`, 'i');
    if (searchPattern.test(content)) {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Agent '${agentName}' not found in routing-table.cjs`,
    };
  } catch (e) {
    return { passed: false, error: `Failed to check routing-table.cjs: ${e.message}` };
  }
}

/**
 * Validate that a hook is registered in settings.json
 *
 * @param {string} hookName - Name of the hook (without .cjs extension)
 * @returns {{ passed: boolean, error?: string }}
 */
function validateSettingsJsonRegistration(hookName) {
  try {
    const settingsPath = getSettingsJsonPath();

    if (!fs.existsSync(settingsPath)) {
      return { passed: false, error: 'settings.json not found' };
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings = safeParseJSON(content, null);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { passed: false, error: 'Failed to check settings.json: invalid JSON' };
    }

    // Check if hook is in hooks array
    if (settings.hooks && Array.isArray(settings.hooks)) {
      const found = settings.hooks.some(hook => {
        const hookPath = hook.path || hook;
        return hookPath.includes(hookName);
      });

      if (found) {
        return { passed: true };
      }
    }

    return {
      passed: false,
      error: `Hook '${hookName}' not found in settings.json`,
    };
  } catch (e) {
    return { passed: false, error: `Failed to check settings.json: ${e.message}` };
  }
}

/**
 * Validate that a skill is registered in the skill catalog
 *
 * @param {string} skillName - Name of the skill
 * @returns {{ passed: boolean, error?: string }}
 */
function validateSkillCatalogRegistration(skillName) {
  try {
    const catalogPath = getSkillCatalogPath();

    if (!fs.existsSync(catalogPath)) {
      return { passed: false, error: 'skill-catalog.md not found' };
    }

    const content = fs.readFileSync(catalogPath, 'utf-8');

    // Search for the skill name
    const searchPattern = new RegExp(`\\b${skillName}\\b`, 'i');
    if (searchPattern.test(content)) {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Skill '${skillName}' not found in skill-catalog.md`,
    };
  } catch (e) {
    return { passed: false, error: `Failed to check skill-catalog.md: ${e.message}` };
  }
}

// =============================================================================
// Gate Validation
// =============================================================================

/**
 * Evaluate a gate condition
 *
 * SEC-005 FIX: Now uses safeEvaluateCondition with predefined conditions
 * instead of new Function() to prevent code injection.
 *
 * @param {Object} gate - Gate configuration
 * @param {string} gate.condition - Predefined condition to evaluate
 * @param {Object} context - Context with step results
 * @returns {{ passed: boolean, error?: string, blocked?: boolean }}
 */
function evaluateGate(gate, context) {
  return safeEvaluateCondition(gate.condition, context);
}

/**
 * Validate multiple gates
 *
 * @param {Object[]} gates - Array of gate configurations
 * @param {Object} context - Context with step results
 * @returns {{ passed: boolean, failures: Array<{ gate: Object, error?: string }> }}
 */
function validateGates(gates, context) {
  const failures = [];

  if (!gates || gates.length === 0) {
    return { passed: true, failures: [] };
  }

  for (const gate of gates) {
    const result = evaluateGate(gate, context);
    if (!result.passed) {
      failures.push({ gate, error: result.error });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// =============================================================================
// StepValidator Class
// =============================================================================

/**
 * Step validator for workflow steps
 */
class StepValidator {
  /**
   * Create a new StepValidator instance
   *
   * @param {Object} options - Validator options
   */
  constructor(options = {}) {
    this.options = options;
    this.customValidators = new Map();
    this.lastResult = null;
  }

  /**
   * Register a custom validator
   *
   * @param {string} name - Validator name
   * @param {Function} fn - Validator function (step, context) => { passed, error? }
   */
  registerValidator(name, fn) {
    this.customValidators.set(name, fn);
  }

  /**
   * Validate a step
   *
   * @param {Object} step - Step configuration
   * @param {string} step.id - Step ID
   * @param {Object} step.validation - Validation configuration
   * @param {string} step.validation.type - Validator type
   * @param {Object} context - Execution context
   * @returns {Promise<{ passed: boolean, error?: string, stepId: string }>}
   */
  async validate(step, context) {
    if (!step.validation) {
      // No validation defined, pass by default
      this.lastResult = { passed: true, stepId: step.id };
      return this.lastResult;
    }

    const { type } = step.validation;
    let result;

    switch (type) {
      case VALIDATOR_TYPES.ASSERTION:
        result = this.validateAssertion(step, context);
        break;

      case VALIDATOR_TYPES.SCHEMA:
        result = validateSchema(context.data, step.validation.schema);
        break;

      case VALIDATOR_TYPES.RESEARCH:
        result = validateResearch(context);
        break;

      case VALIDATOR_TYPES.FILE_EXISTS:
        result = validateFileExists(step.validation.filePath);
        break;

      case VALIDATOR_TYPES.REGISTRATION:
        result = this.validateRegistration(step);
        break;

      case VALIDATOR_TYPES.CUSTOM:
        result = await this.validateCustom(step, context);
        break;

      default:
        result = { passed: false, error: `Unknown validator type: ${type}` };
    }

    this.lastResult = { ...result, stepId: step.id };
    return this.lastResult;
  }

  /**
   * Validate assertion condition
   *
   * SEC-005 FIX: Now uses safeEvaluateCondition with predefined conditions
   * instead of new Function() to prevent code injection.
   *
   * @param {Object} step - Step configuration
   * @param {Object} context - Execution context
   * @returns {{ passed: boolean, error?: string, blocked?: boolean }}
   */
  validateAssertion(step, context) {
    // Use the safe evaluator instead of new Function()
    const result = safeEvaluateCondition(step.validation.condition, context);
    if (result.error && !result.blocked) {
      // Reformat non-blocked errors as assertion errors
      return { passed: false, error: `Assertion error: ${result.error}` };
    }
    return result;
  }

  /**
   * Validate registration
   *
   * @param {Object} step - Step configuration
   * @returns {{ passed: boolean, error?: string }}
   */
  validateRegistration(step) {
    const { target, artifactName, artifactType } = step.validation;

    switch (target) {
      case 'claude-md':
        return validateClaudeMdRegistration(artifactName, artifactType);

      case 'router-enforcer':
      case 'routing-table':
        return validateRouterEnforcerRegistration(artifactName);

      case 'settings-json':
        return validateSettingsJsonRegistration(artifactName);

      case 'skill-catalog':
        return validateSkillCatalogRegistration(artifactName);

      default:
        return { passed: false, error: `Unknown registration target: ${target}` };
    }
  }

  /**
   * Validate using custom validator
   *
   * @param {Object} step - Step configuration
   * @param {Object} context - Execution context
   * @returns {Promise<{ passed: boolean, error?: string }>}
   */
  async validateCustom(step, context) {
    const { validatorName } = step.validation;

    if (!this.customValidators.has(validatorName)) {
      return { passed: false, error: `Custom validator not found: ${validatorName}` };
    }

    const validator = this.customValidators.get(validatorName);
    try {
      const result = await validator(step, context);
      return result;
    } catch (e) {
      return { passed: false, error: `Custom validator error: ${e.message}` };
    }
  }

  /**
   * Validate a gate condition
   *
   * @param {Object} gate - Gate configuration
   * @param {Object} context - Context with step results
   * @returns {{ passed: boolean, error?: string }}
   */
  validateGate(gate, context) {
    return evaluateGate(gate, context);
  }

  /**
   * Get the last validation result
   *
   * @returns {{ passed: boolean, error?: string, stepId: string } | null}
   */
  getValidationResult() {
    return this.lastResult;
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  StepValidator,
  VALIDATOR_TYPES,
  validateGates,
  validateResearch,
  validateClaudeMdRegistration,
  validateRouterEnforcerRegistration,
  validateSettingsJsonRegistration,
  validateSkillCatalogRegistration,
  validateFileExists,
  validateSchema,
  // SEC-005: Safe condition evaluation (replaces new Function())
  safeEvaluateCondition,
  SAFE_CONDITIONS,
};
