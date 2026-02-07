#!/usr/bin/env node

/**
 * linear-pm - Pre-Execute Hook
 * Runs before the skill executes to validate input or prepare context.
 */

const fs = require('fs');
const path = require('path');

// Parse hook input
const input = JSON.parse(process.argv[2] || '{}');

console.log('🔍 [LINEAR-PM] Pre-execute validation...');

/**
 * Validate input before execution
 */
function validateInput(_input) {
  const errors = [];

  // TODO: Add your validation logic here

  return errors;
}

// Run validation
const errors = validateInput(input);

if (errors.length > 0) {
  console.error('❌ Validation failed:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

console.log('✅ [LINEAR-PM] Validation passed');
process.exit(0);
