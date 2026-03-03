'use strict';

/**
 * cli-args.cjs
 *
 * Shared CLI argument parsing utilities for framework tools.
 * Provides validated numeric parsing to prevent NaN propagation bugs.
 */

/**
 * Parse a string as a positive (or zero) finite float.
 * Exits with a clear error message if the value is invalid.
 *
 * @param {string} str - The raw string value from process.argv
 * @param {string} argName - The argument name (without leading dashes) for error messages
 * @param {object} [opts]
 * @param {number} [opts.min=0] - Minimum allowed value (inclusive)
 * @param {number} [opts.max=Infinity] - Maximum allowed value (inclusive)
 * @returns {number} The parsed, validated number
 */
function parsePositiveFloat(str, argName, opts = {}) {
  const val = parseFloat(str);
  const min = opts.min ?? 0;
  const max = opts.max ?? Infinity;
  if (!Number.isFinite(val)) {
    process.stderr.write(`Error: --${argName} must be a finite number, got: ${String(str)}\n`);
    process.exit(1);
  }
  if (val < min || val > max) {
    process.stderr.write(
      `Error: --${argName} must be between ${min} and ${max}, got: ${val}\n`
    );
    process.exit(1);
  }
  return val;
}

module.exports = { parsePositiveFloat };
