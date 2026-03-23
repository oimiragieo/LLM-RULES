#!/usr/bin/env node
// behavioral-loop-detection/hooks/pre-execute.cjs
'use strict';

const path = require('path');
const Ajv = require('ajv');
const { safeParseJSON } = require('../../../../lib/utils/safe-json.cjs');

const schemaPath = path.resolve(__dirname, '../schemas/input.schema.json');
let schema;
try {
  schema = require(schemaPath);
} catch {
  // Schema not found — fail open, log warning
  process.stderr.write(
    '[behavioral-loop-detection/pre-execute] Schema not found, skipping validation\n'
  );
  process.exit(0);
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

function preExecute(input = {}) {
  const valid = validate(input);
  if (!valid) {
    process.stderr.write(
      `[behavioral-loop-detection/pre-execute] Input validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n`
    );
    process.exit(2);
  }
  return { continue: true };
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    const { success, data } = safeParseJSON(raw, {});
    if (!success) {
      process.stderr.write('[behavioral-loop-detection/pre-execute] Invalid JSON input\n');
      process.exit(0);
    }
    try {
      preExecute(data.input || data || {});
      process.exit(0);
    } catch (err) {
      process.stderr.write(
        `[behavioral-loop-detection/pre-execute] Unexpected error: ${err.message}\n`
      );
      process.exit(0);
    }
  });
}

module.exports = { preExecute };
