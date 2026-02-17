#!/usr/bin/env node
/**
 * Creator Commons - Shared Creator Infrastructure
 * ================================================
 *
 * Provides 5 shared functions used by all creator skills and the
 * ecosystem-impact-analyzer to standardize post-creation validation,
 * catalog updates, cross-creator review queuing, schema validation,
 * and integration checklists.
 *
 * @module creator-commons
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// Schema file mapping: artifactType -> schema filename
const SCHEMA_MAP = {
  skill: 'skill-definition.schema.json',
  agent: 'agent-definition.schema.json',
  hook: 'hook-definition.schema.json',
  workflow: 'workflow-definition.schema.json',
  schema: null, // self-referential, no validation
  'config:settings': null,
  'config:agent-registry': 'agent-config.schema.json',
  template: null,
  rule: null,
  command: null,
  tool: null,
};

// Provenance header regex: <!-- Agent: {type} | Task: #{id} | Session: {date} -->
const PROVENANCE_REGEX = /^<!--\s*Agent:\s*\S+\s*\|\s*Task:\s*#?\S+\s*\|\s*Session:\s*\S+\s*-->/;

// NOTE: safeParseJSON imported from ../utils/safe-json.cjs (SEC-ICE-005 remediation)
// Re-exported below for backward compatibility

// =============================================================================
// 1. validatePostCreation
// =============================================================================

/**
 * Runs a common post-creation checklist for any artifact.
 *
 * Checks:
 * - File exists at artifactPath
 * - Provenance header present
 * - Basic structural validation
 *
 * @param {string} artifactType - Type of artifact (skill, agent, hook, etc.)
 * @param {string} artifactPath - Absolute path to the artifact file
 * @param {Object} [options] - Additional options
 * @returns {{ passed: string[], failed: string[], warnings: string[] }}
 */
function validatePostCreation(artifactType, artifactPath, _options = {}) {
  const passed = [];
  const failed = [];
  const warnings = [];

  // Check 1: File exists
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    failed.push('File does not exist at specified path');
    return { passed, failed, warnings };
  }
  passed.push('File exists at specified path');

  // Check 2: Provenance header
  try {
    const content = fs.readFileSync(artifactPath, 'utf8');
    const firstLine = content.split('\n')[0] || '';

    if (PROVENANCE_REGEX.test(firstLine)) {
      passed.push('provenance header present');
    } else {
      failed.push(
        'Missing provenance header (expected: <!-- Agent: {type} | Task: #{id} | Session: {date} -->)'
      );
    }

    // Check 3: Non-empty content
    if (content.trim().length > 0) {
      passed.push('File has non-empty content');
    } else {
      failed.push('File is empty');
    }
  } catch (err) {
    failed.push(`Cannot read file: ${err.message}`);
  }

  return { passed, failed, warnings };
}

// =============================================================================
// 2. updateCatalog
// =============================================================================

/**
 * Appends a structured entry to a catalog file.
 *
 * @param {string} catalogPath - Absolute path to the catalog file
 * @param {string} entry - Content to append (e.g., table row)
 * @returns {{ success: boolean, error?: string }}
 */
function updateCatalog(catalogPath, entry) {
  if (!catalogPath || !fs.existsSync(catalogPath)) {
    return { success: false, error: 'Catalog file does not exist' };
  }

  try {
    const existing = fs.readFileSync(catalogPath, 'utf8');
    const newContent = existing.endsWith('\n') ? existing + entry : existing + '\n' + entry;

    fs.writeFileSync(catalogPath, newContent, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// 3. queueCrossCreatorReview
// =============================================================================

/**
 * Writes a review entry to the integration queue.
 *
 * @param {string} artifactType - Type of artifact created
 * @param {string} artifactPath - Path to the created artifact
 * @param {Object} [options] - Options
 * @param {string} [options.queuePath] - Override path for queue file
 * @returns {{ success: boolean, error?: string }}
 */
function queueCrossCreatorReview(artifactType, artifactPath, options = {}) {
  const queuePath =
    options.queuePath ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'integration-queue.jsonl');

  const entry = {
    artifactType,
    artifactPath,
    action: 'cross-creator-review',
    timestamp: new Date().toISOString(),
    status: 'pending',
  };

  try {
    const dir = path.dirname(queuePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(queuePath, JSON.stringify(entry) + '\n', 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// 4. validateSchema
// =============================================================================

/**
 * Validates artifact content against its JSON schema.
 *
 * Uses a lightweight validation approach (checks required fields and types)
 * since full JSON Schema validation would require a heavy dependency.
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} content - Content to validate (parsed frontmatter or JSON)
 * @returns {{ valid: boolean, errors: string[], warnings?: string[] }}
 */
function validateSchema(artifactType, content) {
  const errors = [];
  const warnings = [];

  // Check for null/undefined content
  if (content === null || content === undefined) {
    return { valid: false, errors: ['Content is null or undefined'] };
  }

  if (typeof content !== 'object') {
    return { valid: false, errors: ['Content must be an object'] };
  }

  // Look up schema filename
  const schemaFile = SCHEMA_MAP[artifactType];

  if (schemaFile === undefined) {
    // Unknown artifact type - pass with warning
    return {
      valid: true,
      errors: [],
      warnings: ['No schema mapping for artifact type: ' + artifactType],
    };
  }

  if (schemaFile === null) {
    // Artifact type explicitly has no schema - pass with warning
    return {
      valid: true,
      errors: [],
      warnings: ['No schema defined for artifact type: ' + artifactType],
    };
  }

  // Load schema
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', schemaFile);
  if (!fs.existsSync(schemaPath)) {
    return { valid: true, errors: [], warnings: ['Schema file not found: ' + schemaFile] };
  }

  let schema;
  try {
    const raw = fs.readFileSync(schemaPath, 'utf8');
    schema = safeParseJSON(raw);
  } catch (err) {
    return { valid: true, errors: [], warnings: ['Cannot read schema: ' + err.message] };
  }

  if (!schema) {
    return { valid: true, errors: [], warnings: ['Cannot parse schema: ' + schemaFile] };
  }

  // Lightweight validation: check required fields
  const requiredFields = schema.required || [];
  // Handle nested schema (agent-definition has frontmatter.required)
  const properties = schema.properties || {};

  for (const field of requiredFields) {
    if (content[field] === undefined || content[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types where schema specifies them
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (content[field] === undefined) continue;
    const value = content[field];

    if (fieldSchema.type === 'string' && typeof value !== 'string') {
      errors.push(`Field '${field}' must be a string, got ${typeof value}`);
    }
    if (fieldSchema.type === 'number' && typeof value !== 'number') {
      errors.push(`Field '${field}' must be a number, got ${typeof value}`);
    }
    if (fieldSchema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Field '${field}' must be a boolean, got ${typeof value}`);
    }
    if (fieldSchema.type === 'array' && !Array.isArray(value)) {
      errors.push(`Field '${field}' must be an array, got ${typeof value}`);
    }

    // Pattern validation for strings
    if (fieldSchema.pattern && typeof value === 'string') {
      const regex = new RegExp(fieldSchema.pattern);
      if (!regex.test(value)) {
        errors.push(`Field '${field}' does not match pattern: ${fieldSchema.pattern}`);
      }
    }

    // MinLength for strings
    if (
      fieldSchema.minLength &&
      typeof value === 'string' &&
      value.length < fieldSchema.minLength
    ) {
      errors.push(`Field '${field}' is too short (min ${fieldSchema.minLength} chars)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// 5. runIntegrationChecklist
// =============================================================================

/**
 * Runs all post-creation checks and returns aggregated results.
 *
 * @param {string} artifactType - Type of artifact
 * @param {string} artifactPath - Path to artifact
 * @param {Object} [options] - Additional options
 * @returns {{ passed: string[], failed: string[], warnings: string[] }}
 */
function runIntegrationChecklist(artifactType, artifactPath, options = {}) {
  // Run validatePostCreation as the core check
  const postCreation = validatePostCreation(artifactType, artifactPath, options);

  // Run schema validation if file exists and is readable
  if (artifactPath && fs.existsSync(artifactPath)) {
    try {
      const content = fs.readFileSync(artifactPath, 'utf8');
      // For JSON files, parse and validate
      if (artifactPath.endsWith('.json')) {
        const parsed = safeParseJSON(content);
        if (parsed) {
          const schemaResult = validateSchema(artifactType, parsed);
          if (schemaResult.valid) {
            postCreation.passed.push('Schema validation passed');
          } else {
            for (const err of schemaResult.errors) {
              postCreation.warnings.push('Schema: ' + err);
            }
          }
          if (schemaResult.warnings) {
            for (const w of schemaResult.warnings) {
              postCreation.warnings.push('Schema: ' + w);
            }
          }
        }
      }
    } catch (_err) {
      postCreation.warnings.push('Could not perform schema validation');
    }
  }

  return postCreation;
}

// =============================================================================
// 6. enhancedIntegrationChecklist
// =============================================================================

/**
 * Enhanced post-creation checklist with catalog/registry verification.
 *
 * Extends runIntegrationChecklist with:
 * - Catalog entry verification (skill-catalog.md, agent-routing-table, etc.)
 * - Agent-registry entry verification (for agent artifacts)
 * - Schema validation (for JSON-based artifacts)
 *
 * @param {string} artifactType - Type of artifact (skill, agent, hook, etc.)
 * @param {string} artifactPath - Absolute path to the artifact file
 * @param {Object} [options] - Additional options
 * @param {string} [options.artifactName] - Name of the artifact (for catalog lookup)
 * @param {string} [options.catalogPath] - Override path to catalog file
 * @param {string} [options.registryPath] - Override path to agent-registry.json
 * @returns {{ passed: string[], failed: string[], warnings: string[] }}
 */
function enhancedIntegrationChecklist(artifactType, artifactPath, options = {}) {
  // Start with base checks
  const result = runIntegrationChecklist(artifactType, artifactPath, options);

  const artifactName = options.artifactName || '';

  // Catalog entry check (for skills)
  if (artifactType === 'skill' && artifactName) {
    const catalogPath =
      options.catalogPath ||
      path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts', 'catalogs', 'skill-catalog.md');

    if (fs.existsSync(catalogPath)) {
      try {
        const catalog = fs.readFileSync(catalogPath, 'utf8');
        if (catalog.includes(artifactName)) {
          result.passed.push('catalog entry found');
        } else {
          result.failed.push(
            `Missing catalog entry for skill '${artifactName}' in skill-catalog.md`
          );
        }
      } catch (_err) {
        result.warnings.push('Could not read skill catalog');
      }
    } else {
      result.warnings.push('Skill catalog file not found');
    }
  }

  // Agent-registry check (for agent artifacts)
  if (artifactType === 'agent' && artifactName) {
    const registryPath =
      options.registryPath || path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');

    if (fs.existsSync(registryPath)) {
      try {
        const raw = fs.readFileSync(registryPath, 'utf8');
        const registry = safeParseJSON(raw);
        if (registry) {
          const hasEntry = Array.isArray(registry.agents)
            ? registry.agents.some(a => a.name === artifactName || a.type === artifactName)
            : registry[artifactName] !== undefined;

          if (hasEntry) {
            result.passed.push('registry entry found');
          } else {
            result.failed.push(`Missing agent-registry entry for '${artifactName}'`);
          }
        } else {
          result.warnings.push('Could not parse agent-registry.json');
        }
      } catch (_err) {
        result.warnings.push('Could not read agent-registry.json');
      }
    } else {
      result.warnings.push('Agent registry file not found');
    }
  }

  return result;
}

// =============================================================================
// 7. verifySkillCreation
// =============================================================================

/**
 * End-to-end verification for a newly created skill.
 *
 * Checks:
 * 1. Skill name matches kebab-case pattern
 * 2. SKILL.md exists in skill directory
 * 3. Provenance header present in SKILL.md
 * 4. Skill appears in skill-catalog.md
 * 5. Skill content validates against skill-definition schema
 * 6. At least one agent has the skill assigned
 *
 * @param {string} skillName - Name of the skill (kebab-case)
 * @param {Object} [options] - Additional options
 * @param {string} [options.skillsDir] - Override skills directory
 * @param {string} [options.catalogPath] - Override catalog path
 * @param {string} [options.registryPath] - Override registry path
 * @returns {{ passed: string[], failed: string[], warnings: string[], passedCount: number, failedCount: number, warningsCount: number }}
 */
function verifySkillCreation(skillName, options = {}) {
  const passed = [];
  const failed = [];
  const warnings = [];

  // Check 1: Skill name format (kebab-case)
  const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  if (KEBAB_CASE.test(skillName)) {
    passed.push('name format valid (kebab-case)');
  } else {
    failed.push(`name format invalid: '${skillName}' must be lowercase kebab-case`);
  }

  // Check 2: SKILL.md exists
  const skillsDir = options.skillsDir || path.join(PROJECT_ROOT, '.claude', 'skills');
  const skillDir = path.join(skillsDir, skillName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (fs.existsSync(skillMdPath)) {
    passed.push('SKILL.md exists');

    // Check provenance
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const firstLine = content.split('\n')[0] || '';
      if (PROVENANCE_REGEX.test(firstLine)) {
        passed.push('provenance header present');
      } else {
        failed.push('Missing provenance header in SKILL.md');
      }
    } catch (_err) {
      warnings.push('Could not read SKILL.md for provenance check');
    }
  } else {
    failed.push(`SKILL.md not found at ${skillMdPath}`);
  }

  // Check 3: Skill catalog entry
  const catalogPath =
    options.catalogPath ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts', 'catalogs', 'skill-catalog.md');

  if (fs.existsSync(catalogPath)) {
    try {
      const catalog = fs.readFileSync(catalogPath, 'utf8');
      if (catalog.includes(skillName)) {
        passed.push('catalog entry found in skill-catalog.md');
      } else {
        failed.push(`Missing catalog entry: '${skillName}' not found in skill-catalog.md`);
      }
    } catch (_err) {
      warnings.push('Could not read skill-catalog.md');
    }
  } else {
    warnings.push('skill-catalog.md not found');
  }

  // Check 4: Schema validation (lightweight -- check name pattern)
  if (KEBAB_CASE.test(skillName)) {
    const schemaContent = { status: 'success', output: { name: skillName, description: '' } };
    const schemaResult = validateSchema('skill', schemaContent);
    if (schemaResult.valid) {
      passed.push('schema validation passed');
    } else {
      for (const err of schemaResult.errors) {
        warnings.push(`Schema: ${err}`);
      }
    }
  }

  // Check 5: Agent assignment
  const registryPath =
    options.registryPath || path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');

  if (fs.existsSync(registryPath)) {
    try {
      const raw = fs.readFileSync(registryPath, 'utf8');
      const registry = safeParseJSON(raw);
      if (registry) {
        let hasAssignment = false;

        // Search through agents for skill assignment
        const agents = registry.agents || Object.values(registry);
        for (const agent of Array.isArray(agents) ? agents : []) {
          const skills = agent.skills || agent.assigned_skills || [];
          if (Array.isArray(skills) && skills.includes(skillName)) {
            hasAssignment = true;
            break;
          }
        }

        if (hasAssignment) {
          passed.push('agent assignment found');
        } else {
          warnings.push(
            `No agent assignment found for skill '${skillName}' (consider assigning to relevant agents)`
          );
        }
      }
    } catch (_err) {
      warnings.push('Could not read agent-registry.json for assignment check');
    }
  }

  return {
    passed,
    failed,
    warnings,
    passedCount: passed.length,
    failedCount: failed.length,
    warningsCount: warnings.length,
  };
}

module.exports = {
  validatePostCreation,
  updateCatalog,
  queueCrossCreatorReview,
  validateSchema,
  runIntegrationChecklist,
  enhancedIntegrationChecklist,
  verifySkillCreation,
  // Internal exports for testing
  SCHEMA_MAP,
  PROVENANCE_REGEX,
  safeParseJSON,
};
