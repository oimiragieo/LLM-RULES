'use strict';
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// Pre-execution hook for feedback-analysis skill
// Validates input against schemas/input.schema.json before execution
// Iron Law I: validate inputs before any code runs

function preExecute(input = {}) {
  try {
    const Ajv = (() => {
      try {
        return require('ajv');
      } catch {
        return null;
      }
    })();

    if (Ajv) {
      const schemaPath = path.resolve(__dirname, '../schemas/input.schema.json');
      let schema;
      try {
        schema = require(schemaPath);
      } catch {
        process.stderr.write(
          '[feedback-analysis/pre-execute] Schema not found, skipping validation\n'
        );
        return { continue: true };
      }

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const valid = validate(input);

      if (!valid) {
        process.stderr.write(
          `[feedback-analysis/pre-execute] Input schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n`
        );
        process.exit(2);
      }
    }

    // Additional domain-specific checks
    if (input.feedbackItems && input.feedbackItems.length === 0) {
      process.stderr.write(
        '[feedback-analysis/pre-execute] Warning: feedbackItems array is empty\n'
      );
    }

    if (
      input.action === 'full-analysis' &&
      (!input.feedbackItems || input.feedbackItems.length < 10)
    ) {
      process.stderr.write(
        '[feedback-analysis/pre-execute] Warning: full-analysis with <10 items may produce low-confidence results\n'
      );
    }

    return { continue: true };
  } catch (err) {
    process.stderr.write(`[feedback-analysis/pre-execute] Unexpected error: ${err.message}\n`);
    // Fail open for unexpected errors (non-security hook)
    return { continue: true };
  }
}

module.exports = { preExecute };

// CLI support
if (require.main === module) {
  let inputData = '';
  process.stdin.on('data', chunk => {
    inputData += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const input = inputData.trim() ? safeParseJSON(inputData) : {};
      const result = preExecute(input);
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (e) {
      process.stderr.write(`[feedback-analysis/pre-execute] Failed to parse stdin: ${e.message}\n`);
      process.exit(0);
    }
  });
}
