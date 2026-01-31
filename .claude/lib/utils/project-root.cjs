#!/usr/bin/env node
/**
 * Project Root Finder Utility
 * ============================
 *
 * BUG-001 Fix: Prevents nested .claude folder creation by finding
 * the actual project root instead of relying on process.cwd().
 *
 * The bug occurs when:
 * 1. An agent runs from a directory different from project root
 * 2. Code uses process.cwd() as default for projectRoot parameter
 * 3. This causes .claude folders to be created in wrong locations
 *
 * Solution: Walk up the directory tree looking for .claude/CLAUDE.md
 * which is the canonical marker for the project root.
 */

'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Find the project root by looking for .claude/CLAUDE.md
 *
 * @param {string} startDir - Directory to start searching from (defaults to __dirname of caller)
 * @returns {string} - The project root path, or startDir if not found
 */
function findProjectRoot(startDir = __dirname) {
  let dir = startDir;

  // Walk up the directory tree
  while (dir !== path.parse(dir).root) {
    const claudeMdPath = path.join(dir, '.claude', 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Check the root as well
  const rootClaudeMdPath = path.join(dir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(rootClaudeMdPath)) {
    return dir;
  }

  // Fallback to startDir if not found (allows graceful degradation)
  return startDir;
}

// Pre-compute PROJECT_ROOT at module load time
// This finds the project root relative to this file's location
const PROJECT_ROOT = findProjectRoot(__dirname);

// =============================================================================
// CRITICAL-001 FIX: Path Traversal Prevention
// =============================================================================

/**
 * Patterns that indicate path traversal attempts
 * These are checked BEFORE path resolution to catch encoded attacks
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./, // Basic traversal
  /%2e%2e/i, // URL-encoded traversal
  /%252e%252e/i, // Double URL-encoded
  /\x00/, // Null bytes
];

/**
 * Validate that a path is safe and within the project root
 * CRITICAL-001 FIX: Prevents path traversal attacks in CLI tools
 *
 * @param {string} filePath - The path to validate
 * @param {string} projectRoot - The project root directory
 * @returns {{ safe: boolean, reason?: string, resolvedPath?: string }}
 */
function validatePathWithinProject(filePath, projectRoot = PROJECT_ROOT) {
  // Reject null/undefined/empty paths (fail-closed)
  if (!filePath || typeof filePath !== 'string') {
    return { safe: false, reason: 'Path is null, undefined, or not a string' };
  }

  if (filePath.trim() === '') {
    return { safe: false, reason: 'Path is empty' };
  }

  // Check for traversal patterns BEFORE resolution
  // This catches encoded attacks before they're decoded
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(filePath)) {
      return { safe: false, reason: 'Path contains traversal sequence or invalid characters' };
    }
  }

  // Normalize path separators (Windows/Unix compatibility)
  const normalizedInput = filePath.replace(/\\/g, '/');

  // Resolve to absolute path
  const resolvedPath = path.resolve(projectRoot, normalizedInput);
  const normalizedRoot = path.resolve(projectRoot);

  // Ensure resolved path is within project root
  // Use startsWith with separator to prevent prefix attacks
  // e.g., /project-root vs /project-root-evil
  // Windows paths are typically case-insensitive; compare accordingly to avoid false negatives.
  const isWin = process.platform === 'win32';
  const pathWithSep = (resolvedPath + path.sep).replace(/\\/g, '/');
  const rootWithSep = (normalizedRoot + path.sep).replace(/\\/g, '/');
  const pathCmp = isWin ? pathWithSep.toLowerCase() : pathWithSep;
  const rootCmp = isWin ? rootWithSep.toLowerCase() : rootWithSep;
  const resolvedCmp = isWin ? resolvedPath.toLowerCase() : resolvedPath;
  const rootExactCmp = isWin ? normalizedRoot.toLowerCase() : normalizedRoot;

  if (!pathCmp.startsWith(rootCmp) && resolvedCmp !== rootExactCmp) {
    return {
      safe: false,
      reason: 'Path resolves outside project root',
      resolvedPath,
    };
  }

  return { safe: true, resolvedPath };
}

/**
 * Sanitize a path for safe use - throws on unsafe paths
 * CRITICAL-001 FIX: Use this in CLI tools before file operations
 *
 * @param {string} filePath - The path to sanitize
 * @param {string} projectRoot - The project root directory
 * @returns {string} The resolved safe path
 * @throws {Error} If path is unsafe
 */
function sanitizePath(filePath, projectRoot = PROJECT_ROOT) {
  const result = validatePathWithinProject(filePath, projectRoot);
  if (!result.safe) {
    throw new Error(`Path validation failed: ${result.reason} (path: ${filePath})`);
  }
  return result.resolvedPath;
}

module.exports = {
  findProjectRoot,
  PROJECT_ROOT,
  // CRITICAL-001 FIX: Path traversal prevention
  validatePathWithinProject,
  sanitizePath,
  PATH_TRAVERSAL_PATTERNS,
};
