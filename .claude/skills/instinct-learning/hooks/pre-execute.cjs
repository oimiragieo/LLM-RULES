'use strict';

/**
 * instinct-learning — pre-execute hook
 * Validates action and confidence inputs before execution.
 */

const path = require('path');
const { safeParseJSON } = require(path.resolve(__dirname, '../../../../lib/utils/safe-json.cjs'));

const VALID_ACTIONS = ['record', 'update', 'query', 'list'];
const CONFIDENCE_MIN = 0.3;
const CONFIDENCE_MAX = 0.9;

function preExecute(input = {}) {
  const errors = [];

  if (input.action && !VALID_ACTIONS.includes(input.action)) {
    errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  if (input.confidence !== undefined) {
    const conf = parseFloat(input.confidence);
    if (isNaN(conf) || conf < CONFIDENCE_MIN || conf > CONFIDENCE_MAX) {
      errors.push(`confidence must be between ${CONFIDENCE_MIN} and ${CONFIDENCE_MAX}`);
    }
  }

  if (input.action === 'record') {
    if (!input.text || typeof input.text !== 'string' || input.text.trim().length === 0) {
      errors.push('text is required for record action');
    } else if (input.text.length > 200) {
      errors.push('text must be ≤200 characters (keep instincts atomic)');
    }
    if (input.confidence === undefined) {
      errors.push('confidence is required for record action');
    }
  }

  if (input.action === 'update') {
    if (!input.id) errors.push('id is required for update action');
    if (input.confidence === undefined) errors.push('confidence is required for update action');
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[instinct-learning/pre-execute] Validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n`
    );
    process.exit(2);
  }

  return { continue: true };
}

// stdin hook protocol
let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});
process.stdin.on('end', () => {
  const { success, data } = safeParseJSON(inputData, {});
  if (!success) {
    process.exit(0); // fail-open for non-parseable input
  }
  try {
    preExecute(data);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[instinct-learning/pre-execute] Unexpected error: ${err.message}\n`);
    process.exit(0); // fail-open on unexpected errors
  }
});

module.exports = { preExecute };
