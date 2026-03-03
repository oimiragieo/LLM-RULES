#!/usr/bin/env node
/**
 * Skill Tool Implementation
 * ========================
 *
 * Implements the Skill tool for invoking skill workflows.
 * Skills are defined in .claude/skills/<skill-name>/SKILL.md files.
 *
 * Usage: Skill({ skill: "tdd", args: "optional arguments" })
 *
 * @module skill-tool
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { runSetupCheck } = require('./setup-runner.cjs');

const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const SKILL_ALIASES = {
  'task-management': 'task-management-protocol',
};

function normalizeSkillName(skillName) {
  if (!skillName || typeof skillName !== 'string') return '';
  const normalized = skillName.toLowerCase().trim();
  return SKILL_ALIASES[normalized] || normalized;
}

/**
 * Load skill definition from SKILL.md file
 * @param {string} skillName - Name of the skill
 * @returns {Object|null} Skill definition or null if not found
 */
function loadSkill(skillName) {
  if (!skillName || typeof skillName !== 'string') {
    return null;
  }

  // Normalize skill name
  const normalized = normalizeSkillName(skillName);

  // Direct path
  const directPath = path.join(SKILLS_DIR, normalized, 'SKILL.md');
  if (fs.existsSync(directPath)) {
    return parseSkillFile(directPath, normalized);
  }

  // Search in subdirectories (for nested skills like scientific-skills)
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nestedPath = path.join(SKILLS_DIR, entry.name, 'skills', normalized, 'SKILL.md');
        if (fs.existsSync(nestedPath)) {
          return parseSkillFile(nestedPath, normalized);
        }
        // Also check one level deeper
        const deepPath = path.join(SKILLS_DIR, entry.name, normalized, 'SKILL.md');
        if (fs.existsSync(deepPath)) {
          return parseSkillFile(deepPath, normalized);
        }
      }
    }
  } catch (_err) {
    // Ignore read errors
  }

  return null;
}

/**
 * Get knowledge files for a skill
 * @param {string} skillFilePath - Absolute path to SKILL.md
 * @returns {string[]} Portable relative paths to knowledge/*.md files (empty if none)
 */
function getKnowledgeFiles(skillFilePath) {
  try {
    const knowledgeDir = path.join(path.dirname(skillFilePath), 'knowledge');
    if (!fs.existsSync(knowledgeDir)) return [];
    return fs
      .readdirSync(knowledgeDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => path.join('knowledge', f).replace(/\\/g, '/'));
  } catch (_err) {
    return [];
  }
}

/**
 * Parse SKILL.md file to extract skill definition
 * @param {string} filePath - Path to SKILL.md
 * @param {string} skillName - Normalized skill name
 * @returns {Object} Skill definition
 */
function parseSkillFile(filePath, skillName) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = frontmatterMatch ? parseYaml(frontmatterMatch[1]) : {};

    // Get body (content after frontmatter)
    const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trim() : content;

    const skillDir = path.dirname(filePath);
    const setupCjsPath = path.join(skillDir, 'setup.cjs');
    const hasSetup = fs.existsSync(setupCjsPath);

    return {
      name: skillName,
      displayName: frontmatter.name || skillName,
      description: frontmatter.description || `${skillName} skill`,
      category: frontmatter.category || 'General',
      domain: frontmatter.domain || 'general',
      content: body,
      filePath: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
      requiredTools: frontmatter.tools || frontmatter.requiredTools || ['Read', 'Write', 'Edit'],
      tags: frontmatter.tags || [],
      knowledgeFiles: getKnowledgeFiles(filePath),
      hasSetup,
      setupPath: hasSetup ? path.relative(PROJECT_ROOT, setupCjsPath).replace(/\\/g, '/') : null,
    };
  } catch (err) {
    return {
      name: skillName,
      displayName: skillName,
      description: `${skillName} skill`,
      category: 'General',
      domain: 'general',
      content: '',
      filePath: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
      knowledgeFiles: [],
      error: err.message,
    };
  }
}

/**
 * Simple YAML parser for frontmatter
 * @param {string} yamlText - YAML content
 * @returns {Object} Parsed object
 */
function parseYaml(yamlText) {
  const result = {};
  const lines = yamlText.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line ends array
    if (trimmed === '' && inArray) {
      inArray = false;
      continue;
    }

    // Array item
    if (trimmed.startsWith('- ')) {
      if (currentKey) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(trimmed.slice(2).trim());
      }
      continue;
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      currentKey = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else {
        // Remove quotes if present
        result[currentKey] = value.replace(/^["'](.*)["']$/, '$1');
        inArray = false;
      }
    }
  }

  return result;
}

/**
 * Main Skill tool function
 * @param {Object} options - Skill invocation options
 * @param {string} options.skill - Skill name (required)
 * @param {string} options.args - Optional arguments for the skill
 * @returns {Object} Skill invocation result
 */
function Skill(options = {}) {
  // Validate options
  if (!options || typeof options !== 'object') {
    return {
      success: false,
      error: 'Skill options must be an object',
      skill: null,
      content: null,
    };
  }

  const skillName = options.skill;
  if (!skillName || typeof skillName !== 'string') {
    return {
      success: false,
      error: 'Skill name is required (options.skill)',
      skill: null,
      content: null,
    };
  }

  // Load skill
  const normalizedRequested = normalizeSkillName(skillName);
  const skill = loadSkill(normalizedRequested);
  if (!skill) {
    return {
      success: false,
      error: `Skill "${skillName}" not found. Check .claude/skills/ directory.`,
      skill: skillName,
      content: null,
      availableSkills: listAvailableSkills(),
    };
  }

  // Run setup check if skill declares a setup.cjs
  const setupCheck = skill.hasSetup
    ? runSetupCheck(path.dirname(path.join(PROJECT_ROOT, skill.filePath)))
    : null;

  // Return skill content for agent to apply
  return {
    success: true,
    skill: skill.name,
    requestedSkill: skillName,
    displayName: skill.displayName,
    description: skill.description,
    category: skill.category,
    content: skill.content,
    filePath: skill.filePath,
    requiredTools: skill.requiredTools,
    tags: skill.tags,
    knowledgeFiles: skill.knowledgeFiles || [],
    hasSetup: skill.hasSetup || false,
    setupPath: skill.setupPath || null,
    setupCheck,
    args: options.args || null,
    message: `Skill "${skill.displayName}" loaded. Apply the workflow described in the skill content.`,
  };
}

/**
 * Load nested skills from a subdirectory into the skills array
 * @param {string} nestedDir - Path to the nested skills directory
 * @param {Array} skills - Array to push skill entries into
 */
function loadNestedSkills(nestedDir, skills) {
  try {
    const nestedEntries = fs.readdirSync(nestedDir, { withFileTypes: true });
    for (const nested of nestedEntries) {
      if (!nested.isDirectory()) continue;
      const nestedSkillPath = path.join(nestedDir, nested.name, 'SKILL.md');
      if (!fs.existsSync(nestedSkillPath)) continue;
      const skill = loadSkill(nested.name);
      if (skill) {
        skills.push({
          name: skill.name,
          description: skill.description,
          category: skill.category,
        });
      }
    }
  } catch (_err) {
    // Ignore nested read errors
  }
}

/**
 * List all available skills
 * @returns {Array<{name: string, description: string, category: string}>}
 */
function listAvailableSkills() {
  const skills = [];

  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check for SKILL.md directly
        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          const skill = loadSkill(entry.name);
          if (skill) {
            skills.push({
              name: skill.name,
              description: skill.description,
              category: skill.category,
            });
          }
        }

        // Check nested skills directory
        const nestedDir = path.join(SKILLS_DIR, entry.name, 'skills');
        if (fs.existsSync(nestedDir)) {
          loadNestedSkills(nestedDir, skills);
        }
      }
    }
  } catch (err) {
    return [{ name: 'error', description: err.message, category: 'Error' }];
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Search skills by keyword
 * @param {string} keyword - Search keyword
 * @returns {Array} Matching skills
 */
function searchSkills(keyword) {
  if (!keyword || typeof keyword !== 'string') {
    return [];
  }

  const allSkills = listAvailableSkills();
  const lowerKeyword = keyword.toLowerCase();

  return allSkills.filter(
    skill =>
      skill.name.toLowerCase().includes(lowerKeyword) ||
      skill.description.toLowerCase().includes(lowerKeyword) ||
      skill.category.toLowerCase().includes(lowerKeyword)
  );
}

// Export for use as a tool
module.exports = {
  Skill,
  loadSkill,
  listAvailableSkills,
  searchSkills,
  normalizeSkillName,
  SKILL_ALIASES,
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node skill-tool.cjs <skill-name> [args]');
    console.log('       node skill-tool.cjs --list');
    console.log('       node skill-tool.cjs --search <term>');
    process.exit(1);
  }

  if (args[0] === '--list') {
    const skills = listAvailableSkills();
    console.log(`\nAvailable Skills (${skills.length}):\n`);
    console.log(skills.map(s => `  - ${s.name}: ${s.description}`).join('\n'));
    process.exit(0);
  }

  if (args[0] === '--search' && args[1]) {
    const results = searchSkills(args[1]);
    console.log(`\nSkills matching "${args[1]}" (${results.length}):\n`);
    console.log(results.map(s => `  - ${s.name}: ${s.description}`).join('\n'));
    process.exit(0);
  }

  const result = Skill({ skill: args[0], args: args[1] });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
