'use strict';

/**
 * pre-execute.cjs — marketing-content skill input validation
 * Validates inputs against schemas/input.schema.json before execution.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const SKILL_DIR = path.resolve(__dirname, '..');

function preExecute(input = {}) {
  try {
    // Load schema
    const schemaPath = path.join(SKILL_DIR, 'schemas', 'input.schema.json');
    if (!fs.existsSync(schemaPath)) {
      process.stderr.write(
        '[marketing-content/pre-execute] Schema not found; skipping validation\n'
      );
      return { continue: true };
    }

    const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'));

    // Validate required fields
    const required = schema.required || [];
    for (const field of required) {
      if (!(field in input)) {
        process.stderr.write(`[marketing-content/pre-execute] Missing required field: ${field}\n`);
        process.exit(2);
      }
    }

    // Validate action enum
    if (input.action && schema.properties?.action?.enum) {
      const validActions = schema.properties.action.enum;
      if (!validActions.includes(input.action)) {
        process.stderr.write(
          `[marketing-content/pre-execute] Invalid action: "${input.action}". Valid: ${validActions.join(', ')}\n`
        );
        process.exit(2);
      }
    }

    // Validate platform enum
    if (input.platform && schema.properties?.platform?.enum) {
      const validPlatforms = schema.properties.platform.enum;
      if (!validPlatforms.includes(input.platform)) {
        process.stderr.write(
          `[marketing-content/pre-execute] Invalid platform: "${input.platform}". Valid: ${validPlatforms.join(', ')}\n`
        );
        process.exit(2);
      }
    }

    return { continue: true };
  } catch (err) {
    // Fail-open for unexpected errors (non-security hook)
    process.stderr.write(
      `[marketing-content/pre-execute] Error during validation: ${err.message}\n`
    );
    return { continue: true };
  }
}

module.exports = { preExecute };

// CLI support
if (require.main === module) {
  let input = {};
  try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8');
    input = safeParseJSON(raw);
  } catch (_) {
    // No stdin input; proceed with empty
  }
  preExecute(input);
}
