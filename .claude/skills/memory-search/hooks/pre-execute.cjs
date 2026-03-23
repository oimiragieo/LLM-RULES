#!/usr/bin/env node

'use strict';
const Ajv = require('ajv');
const schema = require('../schemas/input.schema.json');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

try {
  const rawContent = process.argv[2] || '{}';
  const input = safeParseJSON(rawContent);

  // memory-search natively expects args, but the tool invocation might pass { "query": "..." }
  // We just validate according to the schema.
  const valid = validate(input);
  if (!valid) {
    process.stderr.write(
      `[pre-execute] Input schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n`
    );
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(`[pre-execute] Failed to parse input: ${err.message}\n`);
  process.exit(2);
}

process.exit(0);
