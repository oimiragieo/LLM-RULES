#!/usr/bin/env node
/**
 * Self-Healing Validator Framework
 * =================================
 *
 * Validation utilities for the self-healing system.
 * Provides output schema validation, path validation, state validation, and memory validation.
 *
 * Usage:
 *   const { validateOutput, validatePath, validateState, validateMemory } = require('./validator.cjs');
 *
 *   const outputResult = validateOutput(data, schema);
 *   const pathResult = validatePath(filePath);
 *   const stateResult = validateState(stateFilePath);
 *   const memoryResult = validateMemory(memoryFilePath);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { validateData } = require('../utils/schema-validator.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid evolution state values (from evolution-state.schema.json)
 */
const VALID_STATES = [
  'idle',
  'evaluating',
  'validating',
  'obtaining',
  'locking',
  'verifying',
  'enabling',
  'blocked',
  'aborted',
];

/**
 * States that require a currentEvolution to be set
 */
const STATES_REQUIRING_EVOLUTION = [
  'evaluating',
  'validating',
  'obtaining',
  'locking',
  'verifying',
  'enabling',
];

/**
 * Corruption markers to detect in memory files
 */
const CORRUPTION_MARKERS = [
  /^<{7}\s/m, // Git merge conflict start <<<<<<<
  /^={7}$/m, // Git merge conflict separator =======
  /^>{7}\s/m, // Git merge conflict end >>>>>>>
  /\x00/, // Null bytes
  /\uFFFD/, // Unicode replacement character (indicates encoding issues)
];

/**
 * Default max file size for memory files (100KB)
 */
const DEFAULT_MAX_SIZE_KB = 100;

/**
 * Maximum reasonable timestamp offset (1 year in the future)
 */
const MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

// =============================================================================
// Project Paths
// =============================================================================

/**
 * Get project root directory
 * Navigates up from .claude/lib/self-healing to project root
 */
function getProjectRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

// =============================================================================
// validateOutput - JSON Schema Validation
// =============================================================================

/**
 * Validate output data against a JSON schema
 *
 * Supports:
 * - type validation (string, number, object, array, boolean)
 * - required properties
 * - property type validation
 *
 * @param {*} output - The data to validate
 * @param {Object} schema - JSON Schema to validate against
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOutput(output, schema) {
  const errors = [];

  // Handle null/undefined
  if (output === null || output === undefined) {
    errors.push(
      `Output is ${output === null ? 'null' : 'undefined'}, expected ${schema.type || 'value'}`
    );
    return { valid: false, errors };
  }

  // Type validation
  if (schema.type) {
    const actualType = getType(output);
    if (actualType !== schema.type) {
      errors.push(`Expected type '${schema.type}', got '${actualType}'`);
    }
  }

  // Required properties validation (only for objects)
  if (
    schema.required &&
    schema.type === 'object' &&
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output)
  ) {
    for (const field of schema.required) {
      if (!(field in output)) {
        errors.push(`Missing required field: '${field}'`);
      }
    }
  }

  // Property type validation
  if (
    schema.properties &&
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output)
  ) {
    for (const [prop, propSchema] of Object.entries(schema.properties)) {
      if (prop in output && propSchema.type) {
        const actualType = getType(output[prop]);
        if (actualType !== propSchema.type) {
          errors.push(
            `Property '${prop}' has wrong type: expected '${propSchema.type}', got '${actualType}'`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the JSON Schema type of a value
 *
 * @param {*} value - Value to check
 * @returns {string} - JSON Schema type
 */
function getType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

// =============================================================================
// validatePath - File Path Validation
// =============================================================================

/**
 * Validate that a file path is valid and within PROJECT_ROOT
 *
 * Checks:
 * - Path is not empty/null/undefined
 * - Path does not contain path traversal (../)
 * - Path does not contain suspicious patterns (...)
 * - Normalized path is within PROJECT_ROOT
 * - Path does not contain invalid characters (null bytes)
 *
 * @param {string} filePath - Path to validate
 * @param {string} [baseDir] - Base directory for relative paths (defaults to PROJECT_ROOT)
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePath(filePath, baseDir = null) {
  // Handle null/undefined/empty
  if (filePath === null || filePath === undefined) {
    return { valid: false, reason: 'Path is null or undefined' };
  }

  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return { valid: false, reason: 'Path is empty or not a string' };
  }

  // Check for null bytes (security issue)
  if (filePath.includes('\x00')) {
    return { valid: false, reason: 'Path contains invalid character (null byte)' };
  }

  // Check for suspicious multiple consecutive dots (potential traversal attempt)
  if (/\.{3,}/.test(filePath)) {
    return { valid: false, reason: 'Path contains suspicious pattern (multiple consecutive dots)' };
  }

  // Get project root
  const projectRoot = baseDir || getProjectRoot();

  // Convert to absolute path if relative
  let absolutePath;
  if (path.isAbsolute(filePath)) {
    absolutePath = filePath;
  } else {
    absolutePath = path.join(projectRoot, filePath);
  }

  // Normalize path to resolve ../ and ./
  const normalizedPath = path.normalize(absolutePath);
  const normalizedProjectRoot = path.normalize(projectRoot);

  // Check for path traversal attempts
  // The original path should not contain .. sequences that escape the root
  if (filePath.includes('..')) {
    // After normalization, check if we're still inside project root
    if (!normalizedPath.startsWith(normalizedProjectRoot)) {
      return { valid: false, reason: 'Path traversal attempt detected - escapes PROJECT_ROOT' };
    }
  }

  // Final check: normalized path must be inside project root
  if (!normalizedPath.startsWith(normalizedProjectRoot)) {
    return { valid: false, reason: `Path is outside PROJECT_ROOT: ${normalizedPath}` };
  }

  return { valid: true };
}

// =============================================================================
// validateState - Evolution State Validation
// =============================================================================

/**
 * Validate evolution-state.json integrity
 *
 * Checks:
 * - File exists and is valid JSON
 * - Required fields are present (version, state, evolutions, patterns, suggestions)
 * - State value is valid enum
 * - State transitions are valid (non-idle states require currentEvolution)
 * - Timestamps are reasonable (not too far in the future)
 *
 * @param {string} stateFile - Path to evolution-state.json
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateState(stateFile) {
  const errors = [];

  // Check file exists
  if (!fs.existsSync(stateFile)) {
    return { valid: false, errors: ['State file not found: ' + stateFile] };
  }

  // Read and parse JSON
  let stateData;
  try {
    const content = fs.readFileSync(stateFile, 'utf-8');
    stateData = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: ['Failed to parse state file: ' + e.message] };
  }

  // Required fields check
  const requiredFields = ['version', 'state', 'evolutions', 'patterns', 'suggestions'];
  for (const field of requiredFields) {
    if (!(field in stateData)) {
      errors.push(`Missing required field: '${field}'`);
    }
  }

  // State enum validation
  if (stateData.state && !VALID_STATES.includes(stateData.state)) {
    errors.push(
      `Invalid state value: '${stateData.state}'. Valid values: ${VALID_STATES.join(', ')}`
    );
  }

  // State transition validation
  // States like 'evaluating', 'validating', etc. require currentEvolution to be set
  if (STATES_REQUIRING_EVOLUTION.includes(stateData.state) && !stateData.currentEvolution) {
    errors.push(`State '${stateData.state}' requires currentEvolution to be set`);
  }

  // Timestamp validation
  if (stateData.lastUpdated) {
    const timestamp = new Date(stateData.lastUpdated).getTime();
    const now = Date.now();
    if (timestamp > now + MAX_FUTURE_MS) {
      errors.push(`Timestamp is unreasonably in the future: ${stateData.lastUpdated}`);
    }
  }

  // Validate currentEvolution if present
  if (stateData.currentEvolution && typeof stateData.currentEvolution === 'object') {
    if (stateData.currentEvolution.startedAt) {
      const startedAt = new Date(stateData.currentEvolution.startedAt).getTime();
      const now = Date.now();
      if (startedAt > now + MAX_FUTURE_MS) {
        errors.push(`currentEvolution.startedAt is unreasonably in the future`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// validateMemory - Memory File Validation
// =============================================================================

/**
 * Validate memory file (markdown) for corruption
 *
 * Checks:
 * - File exists
 * - File size is reasonable
 * - No corruption markers (merge conflicts, null bytes)
 * - Markdown structure (headings if required)
 *
 * @param {string} memoryFile - Path to memory file (.md)
 * @param {Object} [options] - Validation options
 * @param {number} [options.maxSizeKB] - Maximum file size in KB (default: 100)
 * @param {boolean} [options.requireHeadings] - Whether to require markdown headings
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMemory(memoryFile, options = {}) {
  const errors = [];
  const maxSizeKB = options.maxSizeKB || DEFAULT_MAX_SIZE_KB;
  const requireHeadings = options.requireHeadings || false;

  // Check file exists
  if (!fs.existsSync(memoryFile)) {
    return { valid: false, errors: ['Memory file not found: ' + memoryFile] };
  }

  // Check file size
  const stats = fs.statSync(memoryFile);
  const sizeKB = stats.size / 1024;
  if (sizeKB > maxSizeKB) {
    errors.push(`File size (${Math.round(sizeKB)}KB) exceeds maximum allowed (${maxSizeKB}KB)`);
    return { valid: false, errors };
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(memoryFile, 'utf-8');
  } catch (e) {
    return { valid: false, errors: ['Failed to read memory file: ' + e.message] };
  }

  // Empty files are allowed but we skip further checks
  if (content.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check for corruption markers
  for (const marker of CORRUPTION_MARKERS) {
    if (marker.test(content)) {
      errors.push(
        `File contains corruption marker or invalid content (pattern: ${marker.toString()})`
      );
      return { valid: false, errors };
    }
  }

  // Check markdown structure if required
  if (requireHeadings) {
    const hasHeading = /^#+ /m.test(content);
    if (!hasHeading) {
      errors.push('Memory file missing markdown heading structure');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// validateStateWithSchema - Ajv Schema Validation for Evolution State
// =============================================================================

/**
 * Validate evolution state data against evolution-state.schema.json using Ajv.
 * Advisory only -- logs warnings but does not block operations.
 * Graceful degradation if Ajv or schema is unavailable.
 *
 * @param {Object|null} stateData - Parsed evolution state data (NOT a file path)
 * @returns {{ valid: boolean, errors: Array|null, skipped?: boolean }}
 */
function validateStateWithSchema(stateData) {
  const schemaPath = path.join(
    getProjectRoot(),
    '.claude',
    'schemas',
    'evolution-state.schema.json'
  );
  return validateData(stateData, schemaPath);
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Self-Healing Validator Framework');
    console.log('================================\n');
    console.log('Usage:');
    console.log('  node validator.cjs output <json-data> <schema-file>');
    console.log('  node validator.cjs path <file-path>');
    console.log('  node validator.cjs state <state-file>');
    console.log('  node validator.cjs memory <memory-file> [--max-size=100]');
    console.log('\nExamples:');
    console.log('  node validator.cjs path .claude/agents/test.md');
    console.log('  node validator.cjs state .claude/context/evolution-state.json');
    console.log('  node validator.cjs memory .claude/context/memory/learnings.md');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'output': {
      if (args.length < 3) {
        console.error('Usage: node validator.cjs output <json-data> <schema-file>');
        process.exit(1);
      }
      const data = JSON.parse(args[1]);
      const schemaContent = fs.readFileSync(args[2], 'utf-8');
      const schema = JSON.parse(schemaContent);
      const result = validateOutput(data, schema);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    case 'path': {
      if (args.length < 2) {
        console.error('Usage: node validator.cjs path <file-path>');
        process.exit(1);
      }
      const result = validatePath(args[1]);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    case 'state': {
      if (args.length < 2) {
        console.error('Usage: node validator.cjs state <state-file>');
        process.exit(1);
      }
      const result = validateState(args[1]);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    case 'memory': {
      if (args.length < 2) {
        console.error('Usage: node validator.cjs memory <memory-file>');
        process.exit(1);
      }
      const options = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i].startsWith('--max-size=')) {
          options.maxSizeKB = parseInt(args[i].split('=')[1], 10);
        }
        if (args[i] === '--require-headings') {
          options.requireHeadings = true;
        }
      }
      const result = validateMemory(args[1], options);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Valid commands: output, path, state, memory');
      process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  validateOutput,
  validatePath,
  validateState,
  validateMemory,
  validateStateWithSchema,
  // Constants for external use
  VALID_STATES,
  STATES_REQUIRING_EVOLUTION,
  CORRUPTION_MARKERS,
  DEFAULT_MAX_SIZE_KB,
  // Internal helpers (for testing)
  getType,
  getProjectRoot,
};
