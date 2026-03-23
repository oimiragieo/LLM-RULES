#!/usr/bin/env node
'use strict';

/**
 * outcome-reflection - Pre-Execute Hook
 * Validates inputs against input.schema.json before execution.
 * Iron Law I: All inputs validated before calibration logic runs.
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
      `[outcome-reflection/pre-execute] Could not load schema: ${err.message}\n`
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

function validateInput(input, _schema) {
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== 'object') {
    errors.push('Input must be a JSON object');
    return { errors, warnings };
  }

  // taskId is required
  if (!input.taskId) {
    errors.push('Missing required field: taskId');
  }

  // If predictions provided, check it's an object
  if (input.predictions !== undefined && typeof input.predictions !== 'object') {
    errors.push('predictions must be an object');
  }

  // If actuals provided, check it's an object
  if (input.actuals !== undefined && typeof input.actuals !== 'object') {
    errors.push('actuals must be an object');
  }

  // Warn if no predictions (calibration will be incomplete)
  if (!input.predictions || Object.keys(input.predictions).length === 0) {
    warnings.push(
      'No predictions provided. Calibration will be incomplete. Ensure planner recorded predictions at task creation.'
    );
  }

  // Warn if no actuals (cannot score)
  if (!input.actuals || Object.keys(input.actuals).length === 0) {
    warnings.push(
      'No actuals provided. Scores will be null. Provide actual outcomes for meaningful calibration.'
    );
  }

  // Validate reworkLoops if present
  if (input.actuals?.reworkLoops !== undefined) {
    const r = input.actuals.reworkLoops;
    if (!Number.isInteger(r) || r < 0) {
      errors.push('actuals.reworkLoops must be a non-negative integer');
    }
  }

  // Validate mode
  const validModes = ['reflect', 'analyze', 'trend'];
  if (input.mode && !validModes.includes(input.mode)) {
    errors.push(`mode must be one of: ${validModes.join(', ')}`);
  }

  return { errors, warnings };
}

function main() {
  const input = parseInput();
  const schema = loadSchema();
  const { errors, warnings } = validateInput(input, schema);

  if (warnings.length > 0) {
    warnings.forEach(w => process.stderr.write(`[outcome-reflection/pre-execute] WARNING: ${w}\n`));
  }

  if (errors.length > 0) {
    process.stderr.write('[outcome-reflection/pre-execute] Input validation FAILED:\n');
    errors.forEach(e => process.stderr.write(`  - ${e}\n`));
    console.log(JSON.stringify({ valid: false, errors }));
    process.exit(2);
  }

  console.log(JSON.stringify({ valid: true, taskId: input.taskId, mode: input.mode || 'reflect' }));
  process.exit(0);
}

main();

module.exports = { validateInput, parseInput };
