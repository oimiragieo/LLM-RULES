'use strict';

/**
 * Brand Compliance Skill — Pre-Execution Hook
 * Validates input against input.schema.json before skill execution.
 * Exit 0 = allow, Exit 2 = block.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function validateVoiceProfileDimension(voiceProfile, dim) {
  if (!(dim in voiceProfile)) return;
  const val = voiceProfile[dim];
  if (typeof val !== 'number' || val < 1 || val > 5 || !Number.isInteger(val)) {
    process.stderr.write(
      `[brand-compliance/pre-execute] voiceProfile.${dim} must be an integer 1–5, got: ${val}\n`
    );
    process.exit(2);
  }
}

function preExecute(input = {}) {
  try {
    const schemaPath = path.resolve(__dirname, '../schemas/input.schema.json');
    if (!fs.existsSync(schemaPath)) {
      process.stderr.write(
        '[brand-compliance/pre-execute] Schema file not found, skipping validation\n'
      );
      return { continue: true };
    }

    const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'));

    // Validate required fields manually (lightweight, no ajv dependency required)
    const required = schema.required || [];
    for (const field of required) {
      if (!(field in input)) {
        process.stderr.write(
          `[brand-compliance/pre-execute] Input schema validation failed: missing required field "${field}"\n`
        );
        process.exit(2);
      }
    }

    // Validate action enum
    if (input.action) {
      const allowedActions = [
        'audit',
        'tone-check',
        'visual-audit',
        'asset-check',
        'cross-channel',
      ];
      if (!allowedActions.includes(input.action)) {
        process.stderr.write(
          `[brand-compliance/pre-execute] Invalid action "${input.action}". Must be one of: ${allowedActions.join(', ')}\n`
        );
        process.exit(2);
      }
    }

    // Validate voiceProfile if provided
    if (input.voiceProfile) {
      const dimensions = ['formality', 'warmth', 'authority', 'energy'];
      for (const dim of dimensions) {
        validateVoiceProfileDimension(input.voiceProfile, dim);
      }
    }

    return { continue: true };
  } catch (err) {
    // Fail-open on unexpected errors (advisory hook)
    process.stderr.write(`[brand-compliance/pre-execute] Unexpected error: ${err.message}\n`);
    return { continue: true };
  }
}

// Support stdin-based protocol when run as hook
if (require.main === module) {
  let data = '';
  process.stdin.on('data', chunk => {
    data += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const input = data ? safeParseJSON(data) : {};
      preExecute(input);
      process.stdout.write(JSON.stringify({ allow: true }) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[brand-compliance/pre-execute] Parse error: ${err.message}\n`);
      process.exit(0); // fail-open
    }
  });
}

module.exports = { preExecute };
