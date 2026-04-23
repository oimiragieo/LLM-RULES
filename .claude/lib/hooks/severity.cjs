'use strict';

/**
 * severity.cjs — Hook severity tier helpers
 * ==========================================
 *
 * Provides structured result factory functions for the three-tier
 * hook guardrail severity model: error | warning | notice.
 *
 * Tier semantics:
 *   error   — Blocks or indicates hard failure (default; backward-compatible)
 *   warning — Advisory; the check failed but is non-blocking
 *   notice  — Informational; logged but does not indicate failure
 *
 * Each factory returns an object compatible with the guardrail-result
 * check item schema:
 *   { severity: string, message: string, ts: string }
 *
 * Usage:
 *   const { asWarning, asNotice, asError, formatForStderr } = require('./severity.cjs');
 *   const result = asWarning('Plan section missing');
 *   process.stderr.write(formatForStderr(result) + '\n');
 *
 * @module severity
 */

const VALID_SEVERITIES = ['error', 'warning', 'notice'];
const DEFAULT_SEVERITY = 'error';

/**
 * Build a structured severity result object.
 *
 * @param {string} severity - One of 'error'|'warning'|'notice'
 * @param {string} message  - Human-readable description
 * @returns {{ severity: string, message: string, ts: string }}
 */
function buildResult(severity, message) {
  const sev = VALID_SEVERITIES.includes(severity) ? severity : DEFAULT_SEVERITY;
  return {
    severity: sev,
    message: String(message || ''),
    ts: new Date().toISOString(),
  };
}

/**
 * Create a warning-severity result.
 * Advisory: the check condition is noteworthy but non-blocking.
 *
 * @param {string} message
 * @returns {{ severity: 'warning', message: string, ts: string }}
 */
function asWarning(message) {
  return buildResult('warning', message);
}

/**
 * Create a notice-severity result.
 * Informational: logged for observability, not a failure signal.
 *
 * @param {string} message
 * @returns {{ severity: 'notice', message: string, ts: string }}
 */
function asNotice(message) {
  return buildResult('notice', message);
}

/**
 * Create an error-severity result.
 * Hard failure: used as the default tier for backward compatibility.
 *
 * @param {string} message
 * @returns {{ severity: 'error', message: string, ts: string }}
 */
function asError(message) {
  return buildResult('error', message);
}

/**
 * Format a severity result for stderr output.
 * Prefixes the message with an uppercase severity label in brackets.
 *
 * Examples:
 *   asWarning('foo')  → '[WARNING] foo'
 *   asNotice('bar')   → '[NOTICE] bar'
 *   asError('baz')    → '[ERROR] baz'
 *
 * If the result object is missing a severity (old consumer passthrough),
 * falls back to '[ERROR]' for backward compatibility.
 *
 * @param {{ severity?: string, message?: string }} result
 * @returns {string}
 */
function formatForStderr(result) {
  const severity = (result && result.severity) || DEFAULT_SEVERITY;
  const message = (result && result.message) || '';
  const label = VALID_SEVERITIES.includes(severity) ? severity.toUpperCase() : 'ERROR';
  return `[${label}] ${message}`;
}

module.exports = {
  asWarning,
  asNotice,
  asError,
  formatForStderr,
  VALID_SEVERITIES,
  DEFAULT_SEVERITY,
};
