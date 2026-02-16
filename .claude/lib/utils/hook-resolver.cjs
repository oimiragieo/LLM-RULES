#!/usr/bin/env node
/**
 * Hook Module Resolver
 * ====================
 *
 * Cross-platform module resolution for hooks.
 * Works on Windows, macOS, Linux.
 * Detects paths dynamically - no hardcoded paths.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Get the project root directory
 * Detects based on presence of .claude directory or package.json
 */
function getProjectRoot() {
  // Check environment variable first
  if (process.env.PROJECT_ROOT && fs.existsSync(process.env.PROJECT_ROOT)) {
    return process.env.PROJECT_ROOT;
  }

  // Start from current working directory and walk up
  let currentDir = process.cwd();

  while (currentDir !== path.parse(currentDir).root) {
    // Check for .claude directory (most reliable indicator)
    if (fs.existsSync(path.join(currentDir, '.claude'))) {
      return currentDir;
    }

    // Check for package.json as fallback
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      // Verify it has our scripts or name
      try {
        const pkg = safeParseJSON(fs.readFileSync(path.join(currentDir, 'package.json'), 'utf-8'));
        if (pkg.name === 'agent-studio' || (pkg.scripts && pkg.scripts['agent:worker'])) {
          return currentDir;
        }
      } catch (_e) {
        // Continue searching
      }
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // Fallback to NODE_PATH if set
  if (process.env.NODE_PATH) {
    // NODE_PATH might be .claude/lib, so go up two levels
    const nodePath = process.env.NODE_PATH;
    if (nodePath.includes('.claude')) {
      return path.resolve(nodePath, '..', '..');
    }
    return path.resolve(nodePath, '..');
  }

  // Last resort: use current working directory
  return process.cwd();
}

/**
 * Get the .claude/lib directory path
 */
function getLibDir() {
  // Check NODE_PATH first
  if (process.env.NODE_PATH && fs.existsSync(process.env.NODE_PATH)) {
    return process.env.NODE_PATH;
  }

  return path.join(getProjectRoot(), '.claude', 'lib');
}

/**
 * Get the .claude/hooks directory path
 */
function getHooksDir() {
  return path.join(getProjectRoot(), '.claude', 'hooks');
}

/**
 * Require a module from the lib directory
 * @param {string} modulePath - Path relative to .claude/lib (e.g., 'utils/hook-input')
 */
function libRequire(modulePath) {
  const libDir = getLibDir();
  const fullPath = path.join(libDir, modulePath);

  // Try with .cjs extension if no extension provided
  if (!path.extname(fullPath)) {
    try {
      return require(fullPath + '.cjs');
    } catch (_e) {
      // Fall through to try without extension
    }
  }

  return require(fullPath);
}

/**
 * Require a module from the hooks directory
 * @param {string} modulePath - Path relative to .claude/hooks (e.g., 'routing/router-state')
 */
function hooksRequire(modulePath) {
  const hooksDir = getHooksDir();
  const fullPath = path.join(hooksDir, modulePath);

  // Try with .cjs extension if no extension provided
  if (!path.extname(fullPath)) {
    try {
      return require(fullPath + '.cjs');
    } catch (_e) {
      // Fall through to try without extension
    }
  }

  return require(fullPath);
}

/**
 * Require a module using relative path from hooks directory
 * Resolves ../../lib/ style paths correctly.
 *
 * Note: ../ paths are evaluated relative to this module location
 * (.claude/lib/utils), not the caller file path.
 */
function resolveHookRequire(relativePath) {
  // Handle ../../lib/... paths
  if (relativePath.startsWith('../../lib/')) {
    const subPath = relativePath.replace('../../lib/', '');
    return libRequire(subPath);
  }

  // Handle ../... paths (relative to this resolver module path)
  if (relativePath.startsWith('../')) {
    // Already relative to hooks, use normal require
    return require(relativePath);
  }

  // Default: treat as lib path
  return libRequire(relativePath);
}

// Export functions
module.exports = {
  getProjectRoot,
  getLibDir,
  getHooksDir,
  libRequire,
  hooksRequire,
  resolveHookRequire,
};

// If run directly, print detected paths
if (require.main === module) {
  console.log('Hook Resolver Detection:');
  console.log('  PROJECT_ROOT:', getProjectRoot());
  console.log('  LIB_DIR:', getLibDir());
  console.log('  HOOKS_DIR:', getHooksDir());
  console.log('  NODE_PATH:', process.env.NODE_PATH || '(not set)');
  console.log('  CWD:', process.cwd());
}
