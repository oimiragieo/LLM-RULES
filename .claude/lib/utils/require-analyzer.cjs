// CI Module-Resolution Static Analyzer
// Agent: developer | Task: #57 | Session: 2026-02-07
'use strict';

const fs = require('fs');
const path = require('path');

// SEC-CI-001: STATIC ANALYSIS ONLY. NO require() or require.resolve() on hook files.

// Regex patterns for require() extraction
const SIMPLE_REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const PATH_JOIN_REQUIRE =
  /require\(\s*path\.join\(\s*(['"][^'"]*['"](?:\s*,\s*['"][^'"]*['"])*)\s*\)\s*\)/g;
const IS_RELATIVE = /^\.\.?\//;

// Node.js built-in modules (don't need resolution)
const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'child_process',
  'util',
  'stream',
  'events',
  'http',
  'https',
  'url',
  'querystring',
  'net',
  'tls',
  'assert',
  'buffer',
  'console',
  'readline',
  'zlib',
  'dns',
  'node:test',
  'node:assert',
  'node:assert/strict',
]);

/**
 * Extract require() paths from a .cjs file using regex.
 *
 * Handles:
 *   require('./foo.cjs')
 *   require('../../lib/utils/bar.cjs')
 *   require(path.join('routing', 'router-state.cjs'))  -- literal path.join
 *
 * Does NOT handle:
 *   require(variable)          -- dynamic require
 *   require(`template-${x}`)   -- template literals
 *
 * @param {string} filePath - Absolute path to .cjs file
 * @returns {{ requires: RequirePath[], errors: string[] }}
 */
function extractRequires(filePath) {
  const requires = [];
  const errors = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Track comment state
    let inBlockComment = false;

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      let workingLine = line;

      // Handle block comments
      if (inBlockComment) {
        const endComment = workingLine.indexOf('*/');
        if (endComment !== -1) {
          workingLine = workingLine.slice(endComment + 2);
          inBlockComment = false;
        } else {
          return; // Skip entire line
        }
      }

      // Remove block comments from this line
      while (true) {
        const startComment = workingLine.indexOf('/*');
        if (startComment === -1) break;

        const endComment = workingLine.indexOf('*/', startComment);
        if (endComment !== -1) {
          // Single-line block comment
          workingLine = workingLine.slice(0, startComment) + workingLine.slice(endComment + 2);
        } else {
          // Multi-line block comment starts
          workingLine = workingLine.slice(0, startComment);
          inBlockComment = true;
          break;
        }
      }

      // Skip single-line comments
      const commentIdx = workingLine.indexOf('//');
      if (commentIdx !== -1) {
        workingLine = workingLine.slice(0, commentIdx);
      }

      // Extract simple require() calls
      const simpleMatches = [...workingLine.matchAll(SIMPLE_REQUIRE)];
      simpleMatches.forEach(match => {
        const requirePath = match[1];
        const isRelative = IS_RELATIVE.test(requirePath);

        requires.push({
          raw: requirePath,
          line: lineNum,
          isRelative,
          resolved: null, // Will be set by caller
          exists: false, // Will be set by caller
        });
      });

      // Extract path.join require() calls
      const pathJoinMatches = [...workingLine.matchAll(PATH_JOIN_REQUIRE)];
      pathJoinMatches.forEach(match => {
        // Parse path.join arguments
        const argsStr = match[1];
        const args = argsStr.split(',').map(arg => arg.trim().replace(/^['"]|['"]$/g, ''));

        const joinedPath = args.join('/');

        requires.push({
          raw: joinedPath,
          line: lineNum,
          isRelative: IS_RELATIVE.test(joinedPath),
          resolved: null,
          exists: false,
        });
      });
    });
  } catch (err) {
    errors.push(`Failed to read file: ${err.message}`);
  }

  return { requires, errors };
}

/**
 * Resolve a relative require path to an absolute path.
 *
 * @param {string} requirePath - The require argument (e.g., './error-tracker.cjs')
 * @param {string} fromFile    - Absolute path of the file containing the require
 * @returns {string|null} Resolved absolute path or null if cannot resolve
 */
function resolveRequirePath(requirePath, fromFile) {
  try {
    // Skip non-relative paths (built-ins and npm packages)
    if (!IS_RELATIVE.test(requirePath) && !NODE_BUILTINS.has(requirePath)) {
      // Not a relative path, not a built-in - assume npm package
      return null;
    }

    if (NODE_BUILTINS.has(requirePath) || requirePath.startsWith('node:')) {
      // Built-in module - no resolution needed
      return null;
    }

    // Resolve relative to the requiring file's directory
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, requirePath);

    // SEC-CI-002: Validate path stays within project root
    // Use real path to resolve symlinks
    const realResolved = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;

    // Get project root from fromFile (traverse up to find .claude directory)
    let projectRoot = fromDir;
    while (projectRoot && projectRoot !== path.parse(projectRoot).root) {
      if (fs.existsSync(path.join(projectRoot, '.claude'))) {
        break;
      }
      projectRoot = path.dirname(projectRoot);
    }

    // Validate resolved path is within project root
    const realProjectRoot = fs.existsSync(projectRoot) ? fs.realpathSync(projectRoot) : projectRoot;

    if (!realResolved.startsWith(realProjectRoot)) {
      // Path traversal attempt - reject
      return null;
    }

    return resolved;
  } catch (_err) {
    // Resolution failed
    return null;
  }
}

module.exports = { extractRequires, resolveRequirePath };
