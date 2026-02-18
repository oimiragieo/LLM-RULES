/**
 * Safe Path Validation Module
 *
 * Windows Path Traversal Hardening - CVE-2025-27210
 *
 * Provides utilities for validating and sanitizing file paths to prevent:
 * - Windows reserved name injection (CON, NUL, PRN, AUX, COM1-9, LPT1-9)
 * - Path traversal attacks (../, ..\)
 * - UNC path injection (\\server\share)
 * - Null byte injection
 *
 * ## Security Context
 *
 * CVE-2025-27210 describes a vulnerability where Windows reserved device names
 * in user-controllable paths can allow file creation at Windows device paths,
 * potentially leading to:
 * - Resource exhaustion (writing to CON/NUL)
 * - System hang (writing to COM/LPT ports)
 * - Privilege escalation through path traversal
 *
 * This module provides defense-in-depth validation to prevent these attacks.
 *
 * ## Usage
 *
 * ```javascript
 * const { validatePathSafe } = require('.claude/lib/utils/safe-path.cjs');
 *
 * // Validate user-provided paths before file operations
 * const result = validatePathSafe(userProvidedPath);
 * if (!result.safe) {
 *   throw new Error(`Unsafe path: ${result.reason}`);
 * }
 * ```
 *
 * @see https://docs.microsoft.com/en-us/windows/win32/fileio/naming-a-file
 * @see CVE-2025-27210
 * @module safe-path
 */

'use strict';

/**
 * Windows reserved device names (case-insensitive)
 * Matches: CON, PRN, AUX, NUL, COM1-9, LPT1-9
 * Also matches with file extensions: CON.txt, NUL.md, etc.
 */
const WINDOWS_RESERVED_NAME_REGEX = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

/**
 * Check if a filename is a Windows reserved device name
 *
 * @param {string} name - Filename to check (without path)
 * @returns {boolean} - True if reserved, false otherwise
 *
 * @example
 * isWindowsReservedName('CON') // true
 * isWindowsReservedName('CON.txt') // true
 * isWindowsReservedName('CONTROL') // false
 */
function isWindowsReservedName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  return WINDOWS_RESERVED_NAME_REGEX.test(name);
}

/**
 * Check if a path contains traversal sequences (../ or ..\)
 *
 * @param {string} pathStr - Path string to check
 * @returns {boolean} - True if traversal detected, false otherwise
 *
 * @example
 * hasPathTraversal('../etc/passwd') // true
 * hasPathTraversal('foo/../../bar') // true
 * hasPathTraversal('foo/bar') // false
 */
function hasPathTraversal(pathStr) {
  if (typeof pathStr !== 'string') {
    return false;
  }
  // Split on both forward and backward slashes, check if any segment is '..'
  const segments = pathStr.split(/[/\\]/);
  return segments.some((segment) => segment === '..');
}

/**
 * Check if a path is a UNC path (\\server\share or \\?\C:\)
 *
 * @param {string} pathStr - Path string to check
 * @returns {boolean} - True if UNC path detected, false otherwise
 *
 * @example
 * isUNCPath('\\\\server\\share') // true
 * isUNCPath('C:\\Users\\foo') // false
 */
function isUNCPath(pathStr) {
  if (typeof pathStr !== 'string' || pathStr.length < 2) {
    return false;
  }
  // UNC paths start with \\ or \\?
  return pathStr.startsWith('\\\\');
}

/**
 * Sanitize a path string by:
 * - Normalizing backslashes to forward slashes
 * - Removing null bytes
 * - Trimming leading/trailing whitespace
 *
 * @param {string} pathStr - Path string to sanitize
 * @returns {string} - Sanitized path string
 *
 * @example
 * sanitizePath('foo\\bar\\baz') // 'foo/bar/baz'
 * sanitizePath('foo\x00bar') // 'foobar'
 * sanitizePath('  foo/bar  ') // 'foo/bar'
 */
function sanitizePath(pathStr) {
  if (typeof pathStr !== 'string') {
    return '';
  }
  return pathStr
    .replace(/\\/g, '/') // Normalize backslashes to forward slashes
    .replace(/\x00/g, '') // Remove null bytes
    .trim(); // Trim whitespace
}

/**
 * Validate a path for security issues
 *
 * Returns an object with:
 * - safe: boolean (true if path is safe, false otherwise)
 * - reason?: string (description of why path is unsafe, if applicable)
 *
 * @param {string} pathStr - Path string to validate
 * @returns {{ safe: boolean, reason?: string }} - Validation result
 *
 * @example
 * validatePathSafe('.claude/lib/utils/safe-path.cjs') // { safe: true }
 * validatePathSafe('output/CON.txt') // { safe: false, reason: 'Path contains Windows reserved name: CON.txt' }
 * validatePathSafe('../../../etc/passwd') // { safe: false, reason: 'Path contains traversal sequence' }
 */
function validatePathSafe(pathStr) {
  if (typeof pathStr !== 'string') {
    return { safe: false, reason: 'Path must be a string' };
  }

  // Check for null bytes (before sanitization to detect the issue)
  if (pathStr.includes('\x00')) {
    return { safe: false, reason: 'Path contains null byte' };
  }

  // Check for UNC paths
  if (isUNCPath(pathStr)) {
    return { safe: false, reason: 'Path is a UNC path' };
  }

  // Check for path traversal
  if (hasPathTraversal(pathStr)) {
    return { safe: false, reason: 'Path contains traversal sequence' };
  }

  // Check each path segment for reserved names
  const segments = pathStr.split(/[/\\]/);
  for (const segment of segments) {
    if (segment && isWindowsReservedName(segment)) {
      return {
        safe: false,
        reason: `Path contains Windows reserved name: ${segment}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Validate each segment of a path for Windows reserved names
 *
 * This is similar to validatePathSafe but focuses specifically on
 * segment-level reserved name checking.
 *
 * @param {string} pathStr - Path string to validate
 * @returns {{ safe: boolean, reason?: string }} - Validation result
 *
 * @example
 * validatePathSegments('output/CON/file.txt') // { safe: false, reason: 'Path segment is Windows reserved name: CON' }
 * validatePathSegments('.claude/context/plans/my-plan.md') // { safe: true }
 */
function validatePathSegments(pathStr) {
  if (typeof pathStr !== 'string') {
    return { safe: false, reason: 'Path must be a string' };
  }

  const segments = pathStr.split(/[/\\]/);
  for (const segment of segments) {
    if (segment && isWindowsReservedName(segment)) {
      return {
        safe: false,
        reason: `Path segment is Windows reserved name: ${segment}`,
      };
    }
  }

  return { safe: true };
}

module.exports = {
  isWindowsReservedName,
  hasPathTraversal,
  isUNCPath,
  sanitizePath,
  validatePathSafe,
  validatePathSegments,
  // Export regex for testing purposes
  WINDOWS_RESERVED_NAME_REGEX,
};
