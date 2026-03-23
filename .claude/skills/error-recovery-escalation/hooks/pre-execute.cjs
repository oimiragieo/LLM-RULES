#!/usr/bin/env node
// error-recovery-escalation/hooks/pre-execute.cjs
'use strict';

const path = require('path');
const Ajv = require('ajv');

let safeParseJSON;
try {
  safeParseJSON = require(
    path.resolve(__dirname, '../../../../lib/utils/safe-json.cjs')
  ).safeParseJSON;
} catch {
  safeParseJSON = (str, fallback = {}) => {
    try {
      const parsed = JSON.parse(str);
      // Strip prototype pollution keys when real safeParseJSON is unavailable
      if (parsed && typeof parsed === 'object') {
        delete parsed.__proto__;
        delete parsed.constructor;
        delete parsed.prototype;
      }
      return { success: true, data: parsed };
    } catch (e) {
      return { success: false, data: fallback, error: e.message };
    }
  };
}

const schemaPath = path.resolve(__dirname, '../schemas/input.schema.json');
let schema;
try {
  schema = require(schemaPath);
} catch {
  process.stderr.write(
    '[error-recovery-escalation/pre-execute] Schema not found, skipping validation\n'
  );
  process.exit(0);
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

function preExecute(input = {}) {
  const valid = validate(input);
  if (!valid) {
    process.stderr.write(
      `[error-recovery-escalation/pre-execute] Input validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n`
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
      process.stderr.write('[error-recovery-escalation/pre-execute] Invalid JSON input\n');
      process.exit(0);
    }
    try {
      preExecute(data.input || data || {});
      process.exit(0);
    } catch (err) {
      process.stderr.write(
        `[error-recovery-escalation/pre-execute] Unexpected error: ${err.message}\n`
      );
      process.exit(0);
    }
  });
}

module.exports = { preExecute };
