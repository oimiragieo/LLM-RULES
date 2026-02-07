#!/usr/bin/env node

/**
 * linear-pm - Post-Execute Hook
 * Runs after the skill executes for cleanup, logging, or follow-up actions.
 */

const fs = require('fs');
const path = require('path');

// Parse hook input
const result = JSON.parse(process.argv[2] || '{}');

console.log('📝 [LINEAR-PM] Post-execute processing...');

/**
 * Process execution result
 */
function processResult(_result) {
  // TODO: Add your post-processing logic here

  return { success: true };
}

// Run post-processing
const outcome = processResult(result);

if (outcome.success) {
  console.log('✅ [LINEAR-PM] Post-processing complete');
  process.exit(0);
} else {
  console.error('⚠️  [LINEAR-PM] Post-processing had issues');
  process.exit(0);
}
