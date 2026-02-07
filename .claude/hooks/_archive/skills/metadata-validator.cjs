#!/usr/bin/env node
/**
 * @file metadata-validator.cjs
 * @description Pre-commit hook to validate skill metadata in SKILL.md files
 * @version 1.0.0
 * @hookType PreToolUse
 * @triggers Write, Edit
 * @enforcementMode block
 */

const fs = require('fs');
const path = require('path');
const projectRootUtils = require('../../lib/utils/project-root.cjs');

const PROJECT_ROOT = projectRootUtils.PROJECT_ROOT;
const _SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// Valid licenses (common open-source licenses)
const VALID_LICENSES = [
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-3-Clause',
  'GPL-3.0',
  'LGPL-3.0',
  'MPL-2.0',
];

/**
 * Parse frontmatter from markdown content
 * @param {string} content - Markdown content
 * @returns {object|null} Parsed frontmatter or null
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key && value) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

/**
 * Validate skill metadata
 * @param {string} filePath - Path to SKILL.md file
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
function validateSkillMetadata(filePath) {
  const errors = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check frontmatter exists
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      errors.push('Missing frontmatter (must start with --- and end with ---)');
      return { valid: false, errors };
    }

    // Required fields
    const requiredFields = ['name', 'description', 'author', 'version', 'license'];
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate license
    if (frontmatter.license && !VALID_LICENSES.includes(frontmatter.license)) {
      errors.push(
        `Invalid license: ${frontmatter.license}. Must be one of: ${VALID_LICENSES.join(', ')}`
      );
    }

    // Check for metadata section (nested YAML)
    if (!content.includes('metadata:')) {
      errors.push('Missing metadata section (should include author and version)');
    }
  } catch (err) {
    errors.push(`Failed to read file: ${err.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hook handler for PreToolUse
 * @param {object} hookInput - Hook input from Claude Code
 * @returns {object} Hook result { allowed: boolean, reason?: string }
 */
function preToolUse(hookInput) {
  const { tool, params } = hookInput;

  // Only validate Write/Edit operations
  if (tool !== 'Write' && tool !== 'Edit') {
    return { allowed: true };
  }

  const filePath = params.file_path;
  if (!filePath) {
    return { allowed: true };
  }

  // Only validate SKILL.md files in skills directories
  const normalizedPath = path.normalize(filePath);
  const basename = path.basename(filePath);

  if (basename !== 'SKILL.md' || !normalizedPath.includes(path.join('.claude', 'skills'))) {
    return { allowed: true };
  }

  // For Edit operations, we need the content
  const contentToValidate = params.content || params.new_string || '';

  if (tool === 'Edit' && !contentToValidate) {
    // Can't validate without content, allow for now
    return { allowed: true };
  }

  // Create temporary file for validation
  const tempFile = path.join(PROJECT_ROOT, '.tmp-metadata-validation.md');
  try {
    fs.writeFileSync(tempFile, contentToValidate);
    const result = validateSkillMetadata(tempFile);
    fs.unlinkSync(tempFile);

    if (!result.valid) {
      return {
        allowed: false,
        reason: `Skill metadata validation failed for ${path.basename(path.dirname(filePath))}:\n${result.errors.map(e => `  - ${e}`).join('\n')}`,
      };
    }
  } catch (err) {
    // Don't block on validation errors, just warn
    console.warn(`[metadata-validator] Validation error: ${err.message}`);
  }

  return { allowed: true };
}

module.exports = {
  preToolUse,
  validateSkillMetadata,
  parseFrontmatter,
};
