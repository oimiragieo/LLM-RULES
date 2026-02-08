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

/**
 * Safe JSON parse with prototype pollution prevention
 * @param {string} str - JSON string
 * @returns {Object|null} Parsed object or null
 */
function safeParseJSON(str) {
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Prevent prototype pollution
      const clean = Object.create(null);
      for (const key of Object.keys(parsed)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        clean[key] = parsed[key];
      }
      return Object.assign({}, clean);
    }
    return parsed;
  } catch (_e) {
    return null;
  }
}

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
      failed.push('Missing provenance header (expected: <!-- Agent: {type} | Task: #{id} | Session: {date} -->)');
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
    const newContent = existing.endsWith('\n')
      ? existing + entry
      : existing + '\n' + entry;

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
  const queuePath = options.queuePath ||
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
    return { valid: true, errors: [], warnings: ['No schema mapping for artifact type: ' + artifactType] };
  }

  if (schemaFile === null) {
    // Artifact type explicitly has no schema - pass with warning
    return { valid: true, errors: [], warnings: ['No schema defined for artifact type: ' + artifactType] };
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
    if (fieldSchema.minLength && typeof value === 'string' && value.length < fieldSchema.minLength) {
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

module.exports = {
  validatePostCreation,
  updateCatalog,
  queueCrossCreatorReview,
  validateSchema,
  runIntegrationChecklist,
  // Internal exports for testing
  SCHEMA_MAP,
  PROVENANCE_REGEX,
  safeParseJSON,
};
