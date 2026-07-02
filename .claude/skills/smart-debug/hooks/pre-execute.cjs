#!/usr/bin/env node

/**
 * smart-debug - Pre-Execute Hook
 * Runs before the skill executes to validate input or prepare context.
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// Parse hook input
const input = safeParseJSON(process.argv[2] || '{}');

console.log('🔍 [SMART-DEBUG] Pre-execute validation...');

/**
 * Validate input before execution
 */
function validateInput(_input) {
  const errors = [];

  // No skill-specific validation is configured for this generated hook.

  return errors;
}

// Run validation
const errors = validateInput(input);

if (errors.length > 0) {
  console.error('❌ Validation failed:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

console.log('✅ [SMART-DEBUG] Validation passed');
process.exit(0);
