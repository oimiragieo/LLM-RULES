#!/usr/bin/env node
/**
 * @file duplicate-detector.cjs
 * @description Pre-commit hook to detect duplicate rules across skills
 * @version 1.0.0
 * @hookType PreToolUse
 * @triggers Write, Edit
 * @enforcementMode block
 */

const fs = require('fs');
const path = require('path');
const projectRootUtils = require('../../lib/utils/project-root.cjs');

const PROJECT_ROOT = projectRootUtils.PROJECT_ROOT;
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

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
 * Scan skills directory and build index
 * @param {string} skillsDir - Path to skills directory
 * @returns {object} Index of rules
 */
function scanSkillsDirectory(skillsDir) {
  const index = {
    rulesByTitle: {},
    rulesByFilename: {},
  };

  if (!fs.existsSync(skillsDir)) {
    return index;
  }

  const skills = fs.readdirSync(skillsDir);

  for (const skillName of skills) {
    const skillPath = path.join(skillsDir, skillName);
    const rulesDir = path.join(skillPath, 'rules');

    if (!fs.existsSync(rulesDir)) continue;

    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));

    for (const ruleFile of ruleFiles) {
      const rulePath = path.join(rulesDir, ruleFile);

      try {
        const content = fs.readFileSync(rulePath, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        if (frontmatter && frontmatter.title) {
          const title = frontmatter.title;

          // Track by title
          if (!index.rulesByTitle[title]) {
            index.rulesByTitle[title] = [];
          }
          index.rulesByTitle[title].push({
            skill: skillName,
            file: ruleFile,
            path: rulePath,
          });

          // Track by filename
          if (!index.rulesByFilename[ruleFile]) {
            index.rulesByFilename[ruleFile] = [];
          }
          index.rulesByFilename[ruleFile].push({
            skill: skillName,
            title: title,
            path: rulePath,
          });
        }
      } catch (_err) {
        // Skip unreadable files
      }
    }
  }

  return index;
}

/**
 * Detect duplicate rules
 * @param {string} skillsDir - Path to skills directory
 * @param {string} newTitle - Title of new rule
 * @param {string} newFilePath - Path of new rule file
 * @returns {object} Detection result { hasDuplicates: boolean, conflicts: string[] }
 */
function detectDuplicates(skillsDir, newTitle, newFilePath) {
  const conflicts = [];
  const index = scanSkillsDirectory(skillsDir);

  // Check for duplicate titles
  if (index.rulesByTitle[newTitle]) {
    const existingRules = index.rulesByTitle[newTitle];

    // Filter out the new file itself (when editing)
    const otherRules = existingRules.filter(
      r => path.normalize(r.path) !== path.normalize(newFilePath)
    );

    if (otherRules.length > 0) {
      const locations = otherRules.map(r => `${r.skill}/${r.file}`).join(', ');
      conflicts.push(`Duplicate title "${newTitle}" found in: ${locations}`);
    }
  }

  // Check for duplicate filenames
  const newFilename = path.basename(newFilePath);
  if (index.rulesByFilename[newFilename]) {
    const existingFiles = index.rulesByFilename[newFilename];

    // Filter out the new file itself
    const otherFiles = existingFiles.filter(
      f => path.normalize(f.path) !== path.normalize(newFilePath)
    );

    if (otherFiles.length > 0) {
      const locations = otherFiles.map(f => `${f.skill} (title: ${f.title})`).join(', ');
      conflicts.push(`Duplicate file name "${newFilename}" found in: ${locations}`);
    }
  }

  return {
    hasDuplicates: conflicts.length > 0,
    conflicts,
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

  // For Edit operations, get content
  const contentToValidate = params.content || params.new_string || '';

  if (!contentToValidate) {
    // Can't validate without content
    return { allowed: true };
  }

  // Extract title from frontmatter
  const frontmatter = parseFrontmatter(contentToValidate);
  if (!frontmatter || !frontmatter.title) {
    // No title to check for duplicates
    return { allowed: true };
  }

  // Detect duplicates
  try {
    const result = detectDuplicates(SKILLS_DIR, frontmatter.title, filePath);

    if (result.hasDuplicates) {
      return {
        allowed: false,
        reason: `Duplicate rule detected:\n${result.conflicts.map(c => `  - ${c}`).join('\n')}`,
      };
    }
  } catch (err) {
    // Don't block on detection errors, just warn
    console.warn(`[duplicate-detector] Detection error: ${err.message}`);
  }

  return { allowed: true };
}

module.exports = {
  preToolUse,
  detectDuplicates,
  scanSkillsDirectory,
};
