'use strict';

/**
 * gap-detection/hooks/pre-execute.cjs
 * Validates input schema before gap-detection skill execution.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function preExecute(input = {}) {
  const schemaPath = path.resolve(__dirname, '../schemas/input.schema.json');
  if (!fs.existsSync(schemaPath)) {
    process.stderr.write(
      '[gap-detection/pre-execute] Schema file not found, skipping validation\n'
    );
    return { continue: true };
  }

  const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'));
  const errors = [];

  // Validate targetDir if provided
  if (input.targetDir !== undefined && typeof input.targetDir !== 'string') {
    errors.push('targetDir must be a string');
  }

  // Validate checks array if provided
  if (input.checks !== undefined) {
    if (!Array.isArray(input.checks)) {
      errors.push('checks must be an array');
    } else {
      const validChecks = schema.properties.checks.items.enum;
      for (const c of input.checks) {
        if (!validChecks.includes(c)) {
          errors.push(`Invalid check: "${c}". Valid: ${validChecks.join(', ')}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[gap-detection/pre-execute] Input validation failed:\n${errors.join('\n')}\n`
    );
    process.exit(2);
  }

  return { continue: true };
}

module.exports = { preExecute };

// CLI usage
if (require.main === module) {
  let input = {};
  let raw = '';
  process.stdin.on('data', d => (raw += d));
  process.stdin.on('end', () => {
    try {
      input = safeParseJSON(raw);
    } catch (_) {
      // empty input is fine
    }
    preExecute(input);
    process.exit(0);
  });
}
