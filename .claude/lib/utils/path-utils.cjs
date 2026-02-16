'use strict';

/**
 * Path normalization utility for cross-platform compatibility (win32/posix)
 * SEC-PATH-001: Ensures consistent forward-slash paths for glob/regex matching
 */

/**
 * Normalize a path to use forward slashes.
 * @param {string} p - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/\\/g, '/');
}

/**
 * Normalize a glob pattern to use forward slashes.
 * @param {string} pattern - Glob pattern to normalize
 * @returns {string} Normalized pattern
 */
function normalizeGlobPattern(pattern) {
  if (typeof pattern !== 'string') return pattern;
  return pattern.replace(/\\/g, '/');
}

/**
 * Escape a path for use in a regular expression.
 * @param {string} p - Path to escape
 * @returns {string} Escaped path string
 */
function escapePathForRegex(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  normalizePath,
  normalizeGlobPattern,
  escapePathForRegex,
};
