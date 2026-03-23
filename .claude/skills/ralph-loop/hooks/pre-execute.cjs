'use strict';

/**
 * ralph-loop pre-execute hook
 * Validates inputs against schemas/input.schema.json before execution.
 * Iron Law I: Enforcement Hooks (The Safety Valve)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function preExecute(input = {}) {
  const schemaPath = path.resolve(__dirname, '..', 'schemas', 'input.schema.json');

  // Validate schema file exists
  if (!fs.existsSync(schemaPath)) {
    process.stderr.write(
      '[ralph-loop:pre-execute] Warning: input.schema.json not found, skipping validation\n'
    );
    return { continue: true };
  }

  // Basic validation without Ajv dependency
  const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf-8'));
  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check maxIterations bounds
  if (input.maxIterations !== undefined) {
    if (
      typeof input.maxIterations !== 'number' ||
      input.maxIterations < 1 ||
      input.maxIterations > 100
    ) {
      errors.push('maxIterations must be a number between 1 and 100');
    }
  }

  // Check completionSignal is a non-empty string
  if (input.completionSignal !== undefined) {
    if (typeof input.completionSignal !== 'string' || input.completionSignal.trim() === '') {
      errors.push('completionSignal must be a non-empty string');
    }
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[ralph-loop:pre-execute] Input validation failed:\n${errors.join('\n')}\n`
    );
    process.exit(2); // block execution
  }

  return { continue: true };
}

module.exports = { preExecute };
