#!/usr/bin/env node
'use strict';

/**
 * adversarial-debate - Pre-Execute Hook
 * Validates debate invocation inputs against input.schema.json before execution.
 * Iron Law I: All inputs validated before any debate logic runs.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'input.schema.json');

function loadSchema() {
  try {
    return safeParseJSON(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    process.stderr.write(
      `[adversarial-debate/pre-execute] Could not load schema: ${err.message}\n`
    );
    return null;
  }
}

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return safeParseJSON(raw);
  } catch (_err) {
    return {};
  }
}

function validateRequired(input, schema, errors) {
  const required = schema?.required || ['topic', 'proStance', 'conStance'];
  for (const field of required) {
    if (!(field in input) || input[field] === null || input[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }
}

function validateTopic(input, errors) {
  if (input.topic && typeof input.topic === 'string') {
    if (input.topic.length < 10) {
      errors.push('topic must be at least 10 characters — state the decision question clearly');
    }
    if (input.topic.length > 500) {
      errors.push('topic must be 500 characters or less');
    }
  }
}

function validateStances(input, errors) {
  for (const stance of ['proStance', 'conStance']) {
    if (input[stance] && typeof input[stance] === 'string') {
      if (input[stance].length < 5) {
        errors.push(`${stance} must be at least 5 characters`);
      }
      if (input[stance].length > 300) {
        errors.push(`${stance} must be 300 characters or less`);
      }
    }
  }
  if (input.proStance && input.conStance) {
    if (input.proStance.toLowerCase() === input.conStance.toLowerCase()) {
      errors.push('proStance and conStance must be different positions');
    }
  }
}

function validateRounds(input, errors, warnings) {
  if (!('rounds' in input)) return;
  const r = input.rounds;
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    errors.push('rounds must be an integer between 1 and 5 (default: 3)');
  }
  if (r > 3) {
    warnings.push(`rounds=${r} is high. Beyond 3 rounds, new arguments rarely emerge. Consider 3.`);
  }
}

function validateInput(input, schema) {
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== 'object') {
    errors.push('Input must be a JSON object');
    return { errors, warnings };
  }

  validateRequired(input, schema, errors);
  validateTopic(input, errors);
  validateStances(input, errors);
  validateRounds(input, errors, warnings);

  return { errors, warnings };
}

function main() {
  const input = parseInput();
  const schema = loadSchema();
  const { errors, warnings } = validateInput(input, schema);

  if (warnings.length > 0) {
    warnings.forEach(w => process.stderr.write(`[adversarial-debate/pre-execute] WARNING: ${w}\n`));
  }

  if (errors.length > 0) {
    process.stderr.write('[adversarial-debate/pre-execute] Input validation FAILED:\n');
    errors.forEach(e => process.stderr.write(`  - ${e}\n`));
    console.log(JSON.stringify({ valid: false, errors }));
    process.exit(2);
  }

  console.log(JSON.stringify({ valid: true, rounds: input.rounds || 3 }));
  process.exit(0);
}

main();

module.exports = { validateInput, parseInput };
