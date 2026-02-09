'use strict';

const path = require('path');

/**
 * Path Helper Utilities
 * =====================
 *
 * Provides cross-platform path manipulation and validation utilities
 * with security hardening for the Interwoven Creator Ecosystem.
 *
 * Security features:
 * - SEC-ICE-001: Artifact name validation to prevent path traversal
 * - SEC-ICE-001: Path containment validation within project root
 * - Windows path normalization for cross-platform compatibility
 *
 * Usage:
 *   const { normalizePath, isValidArtifactName, isPathWithinProject } = require('./path-helpers.cjs');
 */

/**
 * Normalize path separators to forward slashes (cross-platform).
 * Critical for Windows compatibility -- see MEMORY.md learnings.
 *
 * @param {string} filePath - Path to normalize
 * @returns {string} Path with forward slashes
 */
function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  return filePath.replace(/\\/g, '/');
}

/**
 * Extract artifact name from path.
 * Handles skill files (SKILL.md -> parent dir name) and schema files (.schema suffix).
 *
 * @param {string} artifactPath - Path to artifact file
 * @returns {string} Lowercase artifact name
 */
function extractArtifactName(artifactPath) {
  if (!artifactPath || typeof artifactPath !== 'string') {
    return '';
  }

  const basename = path.basename(artifactPath, path.extname(artifactPath));

  // For SKILL.md files, use the parent directory name
  if (basename === 'SKILL') {
    return getParentDirName(artifactPath);
  }

  // Remove .schema suffix for schema files
  return basename.replace(/\.schema$/, '').toLowerCase();
}

/**
 * Get parent directory name (lowercase).
 * Used for skill lookups where the directory name IS the skill name.
 *
 * @param {string} filePath - File path
 * @returns {string} Parent directory name in lowercase
 */
function getParentDirName(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  return path.basename(path.dirname(filePath)).toLowerCase();
}

/**
 * Validate artifact name against safe pattern.
 * SEC-ICE-001: Prevents path traversal via artifact names.
 *
 * Pattern: lowercase alphanumeric with hyphens, no dots/slashes/spaces.
 * Valid examples: "agent-creator", "tdd", "a", "skill-abc-123"
 * Invalid examples: "../hack", "agent/creator", "agent.md", "Agent-Creator", "nul", "con"
 *
 * @param {string} name - Artifact name to validate
 * @returns {boolean} True if name is safe to use in path construction
 */
function isValidArtifactName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Windows reserved names (case-insensitive check)
  const WINDOWS_RESERVED = [
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9',
  ];

  if (WINDOWS_RESERVED.includes(name.toLowerCase())) {
    return false;
  }

  // Single lowercase alphanumeric character is valid
  if (/^[a-z0-9]$/.test(name)) {
    return true;
  }

  // Multi-character: must start and end with alphanumeric, can have hyphens in middle
  // This prevents: path traversal (../), absolute paths (/), Windows drives (C:), etc.
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name);
}

/**
 * Validate that a resolved path is within the project root.
 * SEC-ICE-001: Prevents path traversal attacks.
 *
 * This function:
 * 1. Resolves both paths to absolute paths
 * 2. Normalizes to forward slashes (Windows compat)
 * 3. Checks that resolvedPath starts with projectRoot
 *
 * @param {string} resolvedPath - Absolute path to validate
 * @param {string} projectRoot - Project root directory (absolute)
 * @returns {boolean} True if resolvedPath is within projectRoot
 */
function isPathWithinProject(resolvedPath, projectRoot) {
  if (!resolvedPath || typeof resolvedPath !== 'string') {
    return false;
  }
  if (!projectRoot || typeof projectRoot !== 'string') {
    return false;
  }

  try {
    const normalizedResolved = normalizePath(path.resolve(resolvedPath));
    const normalizedRoot = normalizePath(path.resolve(projectRoot));

    // Path must start with root + separator, OR be exactly root
    return (
      normalizedResolved.startsWith(normalizedRoot + '/') || normalizedResolved === normalizedRoot
    );
  } catch (_err) {
    // path.resolve can throw on invalid paths
    return false;
  }
}

/**
 * Interpolate artifact name into a target path template.
 * Used by companion-check.cjs to resolve check targets.
 *
 * Template uses {name} placeholder: ".claude/skills/{name}/SKILL.md"
 * SEC-ICE-001: Validates artifact name BEFORE interpolation.
 *
 * @param {string} template - Path template with {name} placeholder
 * @param {string} artifactName - Artifact name to interpolate
 * @returns {string|null} Interpolated path, or null if name is invalid
 */
function interpolateArtifactName(template, artifactName) {
  if (!template || typeof template !== 'string') {
    return null;
  }
  if (!isValidArtifactName(artifactName)) {
    // SEC-ICE-001: Block interpolation if name is unsafe
    return null;
  }

  return template.replace(/\{name\}/g, artifactName);
}

module.exports = {
  normalizePath,
  extractArtifactName,
  getParentDirName,
  isValidArtifactName,
  isPathWithinProject,
  interpolateArtifactName,
};
