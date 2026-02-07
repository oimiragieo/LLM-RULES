/**
 * Skills Core Library
 *
 * Core utilities for skill discovery, loading, and management.
 * Adapted from Superpowers for the agent-studio framework.
 *
 * Features:
 * - Extract YAML frontmatter from SKILL.md files
 * - Find all skills in a directory tree
 * - Resolve skill paths with shadowing support
 * - Strip frontmatter from skill content
 * - Check for git updates (optional)
 *
 * Usage:
 *   import { findSkillsInDir, resolveSkillPath } from './skills-core.js';
 *
 *   // Find all skills
 *   const skills = findSkillsInDir('.claude/skills', 'framework');
 *
 *   // Resolve a skill by name
 *   const resolved = resolveSkillPath('tdd', frameworkSkillsDir, userSkillsDir);
 *
 * @module skills-core
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/**
 * Extract YAML frontmatter from a skill file.
 *
 * Expected format:
 * ---
 * name: skill-name
 * description: Use when [condition] - [what it does]
 * tools: [Read, Write, Edit]
 * model: sonnet
 * ---
 *
 * @param {string} filePath - Path to SKILL.md file
 * @returns {{name: string, description: string, tools?: string[], model?: string}}
 */
function extractFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let inFrontmatter = false;
    const result = {
      name: '',
      description: '',
    };

    for (const line of lines) {
      if (line.trim() === '---') {
        if (inFrontmatter) break;
        inFrontmatter = true;
        continue;
      }

      if (inFrontmatter) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const [, key, value] = match;
          const trimmedValue = value.trim();

          // Handle array values: [item1, item2, ...]
          if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
            result[key] = trimmedValue
              .slice(1, -1)
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
          } else {
            result[key] = trimmedValue;
          }
        }
      }
    }

    return result;
  } catch (_error) {
    return { name: '', description: '' };
  }
}

/**
 * Find all SKILL.md files in a directory recursively.
 *
 * @param {string} dir - Directory to search
 * @param {string} sourceType - Source identifier (e.g., 'framework', 'user')
 * @param {number} maxDepth - Maximum recursion depth (default: 3)
 * @returns {Array<{path: string, skillFile: string, name: string, description: string, sourceType: string}>}
 */
function findSkillsInDir(dir, sourceType, maxDepth = 3) {
  const skills = [];

  if (!fs.existsSync(dir)) return skills;

  function recurse(currentDir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Check for SKILL.md in this directory
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const frontmatter = extractFrontmatter(skillFile);
          skills.push({
            path: fullPath,
            skillFile: skillFile,
            name: frontmatter.name || entry.name,
            description: frontmatter.description || '',
            sourceType: sourceType,
            ...frontmatter,
          });
        }

        // Recurse into subdirectories
        recurse(fullPath, depth + 1);
      }
    }
  }

  recurse(dir, 0);
  return skills;
}

/**
 * Resolve a skill name to its file path, handling shadowing.
 * User skills override framework skills unless explicitly prefixed.
 *
 * @param {string} skillName - Name like "framework:tdd" or "my-skill"
 * @param {string} frameworkDir - Path to framework skills directory (.claude/skills)
 * @param {string} userDir - Path to user skills directory (~/.claude/skills or similar)
 * @returns {{skillFile: string, sourceType: string, skillPath: string} | null}
 */
function resolveSkillPath(skillName, frameworkDir, userDir) {
  // Strip framework: prefix if present
  const forceFramework = skillName.startsWith('framework:');
  const actualSkillName = forceFramework ? skillName.replace(/^framework:/, '') : skillName;

  // Try user skills first (unless explicitly framework:)
  if (!forceFramework && userDir) {
    const userPath = path.join(userDir, actualSkillName);
    const userSkillFile = path.join(userPath, 'SKILL.md');
    if (fs.existsSync(userSkillFile)) {
      return {
        skillFile: userSkillFile,
        sourceType: 'user',
        skillPath: actualSkillName,
      };
    }
  }

  // Try framework skills
  if (frameworkDir) {
    const frameworkPath = path.join(frameworkDir, actualSkillName);
    const frameworkSkillFile = path.join(frameworkPath, 'SKILL.md');
    if (fs.existsSync(frameworkSkillFile)) {
      return {
        skillFile: frameworkSkillFile,
        sourceType: 'framework',
        skillPath: actualSkillName,
      };
    }
  }

  return null;
}

/**
 * Check if a git repository has updates available.
 * Uses a quick timeout to avoid blocking if network is down.
 * SEC-009-SKILLS FIX: Use spawnSync with shell:false to prevent command injection
 *
 * @param {string} repoDir - Path to git repository
 * @returns {boolean} - True if updates are available
 */
function checkForUpdates(repoDir) {
  try {
    // SEC-009-SKILLS FIX: Split into two separate spawnSync calls with shell:false
    // First: fetch from origin
    const fetchResult = spawnSync('git', ['fetch', 'origin'], {
      cwd: repoDir,
      timeout: 3000,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    });

    if (fetchResult.status !== 0) {
      return false; // Fetch failed, assume up to date
    }

    // Second: check status
    const statusResult = spawnSync('git', ['status', '--porcelain=v1', '--branch'], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    });

    if (statusResult.status !== 0) {
      return false;
    }

    // Parse git status output to see if we're behind
    const output = statusResult.stdout || '';
    const statusLines = output.split('\n');
    for (const line of statusLines) {
      if (line.startsWith('## ') && line.includes('[behind ')) {
        return true; // We're behind remote
      }
    }
    return false; // Up to date
  } catch (_error) {
    // Network down, git error, timeout, etc. - don't block
    return false;
  }
}

/**
 * Strip YAML frontmatter from skill content, returning just the body.
 *
 * @param {string} content - Full content including frontmatter
 * @returns {string} - Content without frontmatter
 */
function stripFrontmatter(content) {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterEnded = false;
  const contentLines = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) {
        frontmatterEnded = true;
        continue;
      }
      inFrontmatter = true;
      continue;
    }

    if (frontmatterEnded || !inFrontmatter) {
      contentLines.push(line);
    }
  }

  return contentLines.join('\n').trim();
}

/**
 * Load a skill's content with frontmatter parsed and body separated.
 *
 * @param {string} skillFile - Path to SKILL.md file
 * @returns {{frontmatter: object, body: string} | null}
 */
function loadSkill(skillFile) {
  try {
    const content = fs.readFileSync(skillFile, 'utf8');
    const frontmatter = extractFrontmatter(skillFile);
    const body = stripFrontmatter(content);

    return {
      frontmatter,
      body,
    };
  } catch (_error) {
    return null;
  }
}

/**
 * Get the default skill directories for the framework.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {{framework: string, user: string | null}}
 */
function getDefaultSkillDirs(projectRoot) {
  const frameworkDir = path.join(projectRoot, '.claude', 'skills');

  // User skills directory (platform-specific)
  let userDir = null;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const userSkillsPath = path.join(homeDir, '.claude', 'skills');
    if (fs.existsSync(userSkillsPath)) {
      userDir = userSkillsPath;
    }
  }

  return {
    framework: frameworkDir,
    user: userDir,
  };
}

export {
  extractFrontmatter,
  findSkillsInDir,
  resolveSkillPath,
  checkForUpdates,
  stripFrontmatter,
  loadSkill,
  getDefaultSkillDirs,
};
