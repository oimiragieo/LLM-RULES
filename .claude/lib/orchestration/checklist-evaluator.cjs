#!/usr/bin/env node
'use strict';

/**
 * Checklist Evaluator with Halt Conditions (Feature C7)
 * =====================================================
 * Evaluates structured checklists where each item can specify a halt
 * condition that stops pipeline execution if not met.
 *
 * Usage:
 *   const { evaluateChecklist } = require('./checklist-evaluator.cjs');
 *
 *   const result = await evaluateChecklist([
 *     { id: 'tests', description: 'Tests pass', check_type: 'file_exists',
 *       check_value: 'tests/output.json', halt_on_fail: true, severity: 'critical' },
 *     { id: 'lint', description: 'Lint clean', check_type: 'grep_match',
 *       check_value: 'src/index.js:TODO', severity: 'warning' }
 *   ]);
 */

const fs = require('fs');
const { execSync } = require('child_process');

/**
 * @typedef {Object} ChecklistItem
 * @property {string} id - Unique identifier for this check
 * @property {string} description - Human-readable description
 * @property {boolean} [halt_on_fail=false] - If true, stops evaluation on failure
 * @property {'file_exists'|'test_passes'|'grep_match'|'custom'} check_type
 * @property {string} check_value - Value to check (path, command, pattern:file, expression)
 * @property {'info'|'warning'|'error'|'critical'} [severity='error']
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} id - Check ID
 * @property {boolean} passed - Whether the check passed
 * @property {string} [message] - Failure message if any
 * @property {'info'|'warning'|'error'|'critical'} severity
 */

/**
 * @typedef {Object} ChecklistResult
 * @property {CheckResult[]} passed - Checks that passed
 * @property {CheckResult[]} failed - Checks that failed
 * @property {boolean} halted - Whether evaluation was halted by a halt_on_fail item
 * @property {string|null} halted_at - ID of the check that caused the halt
 * @property {number} total - Total checks evaluated
 * @property {number} skipped - Number of checks skipped due to halt
 */

/**
 * Check if a file exists.
 * @param {string} filePath
 * @returns {CheckResult}
 */
function checkFileExists(id, filePath, severity) {
  const exists = fs.existsSync(filePath);
  return {
    id,
    passed: exists,
    message: exists ? undefined : `File not found: ${filePath}`,
    severity,
  };
}

/**
 * Run a command and check if it exits with code 0.
 * @param {string} id
 * @param {string} command
 * @param {string} severity
 * @returns {CheckResult}
 */
function checkTestPasses(id, command, severity) {
  try {
    execSync(command, { stdio: 'pipe', timeout: 30000, shell: false });
    return { id, passed: true, severity };
  } catch (err) {
    return {
      id,
      passed: false,
      message: `Command failed (exit ${err.status}): ${command}`,
      severity,
    };
  }
}

/**
 * Check if a grep pattern matches in a file.
 * Format: "file_path:pattern" or "pattern" (searches current directory)
 * @param {string} id
 * @param {string} value - "file_path:pattern" format
 * @param {string} severity
 * @returns {CheckResult}
 */
function checkGrepMatch(id, value, severity) {
  // Use LAST colon as separator to handle Windows drive letters (C:\path:pattern)
  const colonIdx = value.lastIndexOf(':');
  if (colonIdx === -1 || colonIdx === 0) {
    return {
      id,
      passed: false,
      message: `Invalid grep_match format. Expected "file_path:pattern", got: ${value}`,
      severity,
    };
  }

  const filePath = value.substring(0, colonIdx);
  const pattern = value.substring(colonIdx + 1);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const found = content.includes(pattern);
    return {
      id,
      passed: found,
      message: found
        ? undefined
        : `Pattern "${pattern}" not found in ${filePath}`,
      severity,
    };
  } catch (err) {
    return {
      id,
      passed: false,
      message: `Cannot read file ${filePath}: ${err.message}`,
      severity,
    };
  }
}

/**
 * Evaluate a custom expression (returns truthy/falsy).
 * Only allows simple property checks — NOT arbitrary code execution.
 * @param {string} id
 * @param {string} expression
 * @param {string} severity
 * @returns {CheckResult}
 */
function checkCustom(id, expression, severity) {
  const trimmed = expression.trim();

  // Only allow a strict set of safe expressions — no dynamic code execution
  if (trimmed === 'true') {
    return { id, passed: true, severity };
  }
  if (trimmed === 'false') {
    return { id, passed: false, message: 'Expression evaluated to false', severity };
  }

  // Allow process.env.VAR checks
  const envMatch = trimmed.match(/^process\.env\.(\w+)$/);
  if (envMatch) {
    const val = process.env[envMatch[1]];
    return {
      id,
      passed: Boolean(val),
      message: val ? undefined : `Environment variable ${envMatch[1]} is not set`,
      severity,
    };
  }

  // Allow process.env.VAR === 'value' / !== 'value' comparisons
  const envCmpMatch = trimmed.match(/^process\.env\.(\w+)\s*(===|!==)\s*['"]([^'"]*)['"]\s*$/);
  if (envCmpMatch) {
    const val = process.env[envCmpMatch[1]];
    const op = envCmpMatch[2];
    const expected = envCmpMatch[3];
    const result = op === '===' ? val === expected : val !== expected;
    return {
      id,
      passed: result,
      message: result ? undefined : `${envCmpMatch[1]} ${op} '${expected}' is false (actual: '${val}')`,
      severity,
    };
  }

  return {
    id,
    passed: false,
    message: `Custom expression not allowed (security restriction): ${expression}`,
    severity,
  };
}

/**
 * Evaluate a checklist of items, stopping on halt conditions.
 * @param {ChecklistItem[]} items
 * @returns {ChecklistResult}
 */
function evaluateChecklist(items) {
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  const passed = [];
  const failed = [];
  let halted = false;
  let halted_at = null;
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    if (halted) {
      skipped++;
      continue;
    }

    const item = items[i];
    const severity = item.severity || 'error';
    let result;

    switch (item.check_type) {
      case 'file_exists':
        result = checkFileExists(item.id, item.check_value, severity);
        break;
      case 'test_passes':
        result = checkTestPasses(item.id, item.check_value, severity);
        break;
      case 'grep_match':
        result = checkGrepMatch(item.id, item.check_value, severity);
        break;
      case 'custom':
        result = checkCustom(item.id, item.check_value, severity);
        break;
      default:
        result = {
          id: item.id,
          passed: false,
          message: `Unknown check_type: ${item.check_type}`,
          severity,
        };
    }

    if (result.passed) {
      passed.push(result);
    } else {
      failed.push(result);
      if (item.halt_on_fail) {
        halted = true;
        halted_at = item.id;
      }
    }
  }

  return {
    passed,
    failed,
    halted,
    halted_at,
    total: items.length - skipped,
    skipped,
  };
}

module.exports = {
  evaluateChecklist,
};
