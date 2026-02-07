#!/usr/bin/env node
/**
 * @file rule-structure-validator.cjs
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

// Required sections in rule files
const REQUIRED_SECTIONS = ['Explanation'];
const _REQUIRED_EXAMPLES = ['Wrong', 'Right', 'Bad', 'Good', 'Incorrect', 'Correct'];

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
 * Extract section headings from markdown
 * @param {string} content - Markdown content
 * @returns {string[]} Array of section names
 */
function parseSections(content) {
  const sections = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    sections.push(match[1].trim());
  }

  return sections;
}

/**
 * Validate rule file structure
 * @param {string} filePath - Path to rule file
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
function validateRuleStructure(filePath) {
  const errors = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check frontmatter
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      errors.push('Missing frontmatter');
    } else {
      // Required frontmatter fields
      if (!frontmatter.title) errors.push('Missing required frontmatter field: title');
      if (!frontmatter.impact) errors.push('Missing required frontmatter field: impact');
    }

    // Check for title heading that matches frontmatter title
    if (frontmatter && frontmatter.title) {
      const titleHeadingRegex = new RegExp(`^##\\s+${frontmatter.title}`, 'm');
      if (!titleHeadingRegex.test(content)) {
        errors.push(`Missing or mismatched title heading (should be "## ${frontmatter.title}")`);
      }
    } else if (!content.match(/^##\s+.+/m)) {
      errors.push('Missing title heading (## Title)');
    }

    // Extract sections
    const sections = parseSections(content);

    // Check required sections
    for (const requiredSection of REQUIRED_SECTIONS) {
      if (!sections.some(s => s.toLowerCase().includes(requiredSection.toLowerCase()))) {
        errors.push(`Missing required section: ${requiredSection}`);
      }
    }

    // Check for Wrong/Bad example
    const hasWrongExample = sections.some(
      s =>
        s.toLowerCase().includes('wrong') ||
        s.toLowerCase().includes('bad') ||
        s.toLowerCase().includes('incorrect')
    );

    if (!hasWrongExample) {
      errors.push('Missing Wrong/Bad/Incorrect example section');
    }

    // Check for Right/Good example
    const hasRightExample = sections.some(
      s =>
        s.toLowerCase().includes('right') ||
        s.toLowerCase().includes('good') ||
        s.toLowerCase().includes('correct')
    );

    if (!hasRightExample) {
      errors.push('Missing Right/Good/Correct example section');
    }

    // Check for code examples (markdown fences)
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    if (codeBlocks.length < 2) {
      errors.push('Missing code examples (need at least 2 code blocks with ``` fences)');
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

  // Skip validation for _template.md and _sections.md files
  const basename = path.basename(filePath);
  if (basename.startsWith('_')) {
    return { allowed: true };
  }

  // For Edit operations, we need content
  const contentToValidate = params.content || params.new_string || '';

  if (tool === 'Edit' && !contentToValidate) {
    // Can't validate without content, allow for now
    return { allowed: true };
  }

  // Create temporary file for validation
  const tempFile = path.join(PROJECT_ROOT, '.tmp-rule-structure-validation.md');
  try {
    fs.writeFileSync(tempFile, contentToValidate);
    const result = validateRuleStructure(tempFile);
    fs.unlinkSync(tempFile);

    if (!result.valid) {
      return {
        allowed: false,
        reason: `Rule structure validation failed for ${path.basename(filePath)}:\n${result.errors.map(e => `  - ${e}`).join('\n')}`,
      };
    }
  } catch (err) {
    // Don't block on validation errors, just warn
    console.warn(`[rule-structure-validator] Validation error: ${err.message}`);
  }

  return { allowed: true };
}

module.exports = {
  preToolUse,
  validateRuleStructure,
  parseSections,
};
