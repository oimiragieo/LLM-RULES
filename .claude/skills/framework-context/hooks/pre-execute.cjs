#!/usr/bin/env node

/**
 * Framework Context - Pre-Execute Hook
 * Runs before the skill executes to validate input or prepare context.
 *
 * This hook receives the skill invocation context as JSON in process.argv[2]
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// Parse hook input
const input = safeParseJSON(process.argv[2] || '{}');

console.log('🔍 [FRAMEWORK-CONTEXT] Pre-execute validation...');

/**
 * Validate input before execution
 */
function validateInput(_input) {
  const errors = [];

  // TODO: Add your validation logic here
  // Example:
  // if (!input.requiredField) {
  //   errors.push('Missing required field: requiredField');
  // }

  return errors;
}

// Run validation
const errors = validateInput(input);

if (errors.length > 0) {
  console.error('❌ Validation failed:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

console.log('✅ [FRAMEWORK-CONTEXT] Validation passed');
process.exit(0);
