#!/usr/bin/env node
/**
 * @file rule-validator.cjs
 * @description Pre-commit hook to validate skill rule structure
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
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      frontmatter[key.trim()] = value;
    }
  }

  return frontmatter;
}

/**
 * Validate rule file structure
 * @param {string} filePath - Path to rule file
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
function validateRuleFile(filePath) {
  const errors = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check frontmatter
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      errors.push('Missing frontmatter');
    } else {
      // Required fields
      if (!frontmatter.title) errors.push('Missing required field: title');
      if (!frontmatter.impact) errors.push('Missing required field: impact');

      // Validate impact level
      const validImpacts = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      if (frontmatter.impact && !validImpacts.includes(frontmatter.impact.toUpperCase())) {
        errors.push(
          `Invalid impact level: ${frontmatter.impact}. Must be one of: ${validImpacts.join(', ')}`
        );
      }
    }

    // Check for title heading
    if (!content.match(/^##\s+.+/m)) {
      errors.push('Missing title heading (## Title)');
    }

    // Check for explanation section
    if (!content.match(/##\s+Explanation/i)) {
      errors.push('Missing Explanation section');
    }

    // Check for examples
    const hasBadExample = content.includes('**Bad:**') || content.includes('**Incorrect:**');
    const hasGoodExample = content.includes('**Good:**') || content.includes('**Correct:**');

    if (!hasBadExample) {
      errors.push('Missing bad/incorrect example');
    }
    if (!hasGoodExample) {
      errors.push('Missing good/correct example');
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

  // Only validate files in skills/*/rules/ directories
  const normalizedPath = path.normalize(filePath);
  if (
    !normalizedPath.includes(path.join('.claude', 'skills')) ||
    !normalizedPath.includes(path.join('rules'))
  ) {
    return { allowed: true };
  }

  // Skip validation for _template.md files
  if (path.basename(filePath) === '_template.md') {
    return { allowed: true };
  }

  // For Edit operations, we need to read the existing content first
  const contentToValidate = params.content || params.new_string || '';

  if (tool === 'Edit' && !contentToValidate) {
    // Can't validate without content, allow for now
    return { allowed: true };
  }

  // Create temporary file for validation
  const tempFile = path.join(PROJECT_ROOT, '.tmp-rule-validation.md');
  try {
    fs.writeFileSync(tempFile, contentToValidate);
    const result = validateRuleFile(tempFile);
    fs.unlinkSync(tempFile);

    if (!result.valid) {
      return {
        allowed: false,
        reason: `Rule validation failed for ${path.basename(filePath)}:\n${result.errors.map(e => `  - ${e}`).join('\n')}`,
      };
    }
  } catch (err) {
    // Don't block on validation errors, just warn
    console.warn(`[rule-validator] Validation error: ${err.message}`);
  }

  return { allowed: true };
}

module.exports = {
  preToolUse,
  validateRuleFile,
  parseFrontmatter,
};
