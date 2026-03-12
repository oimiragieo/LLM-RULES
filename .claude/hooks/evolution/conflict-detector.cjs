#!/usr/bin/env node
/**
 * conflict-detector.cjs
 * PreToolUse hook for Write operations
 *
 * Enforces: No naming conflicts when creating new artifact files.
 * Checks agents, skills, and workflows directories for existing names.
 *
 * ENFORCEMENT MODES (CONFLICT_DETECTOR):
 * - block (default): Conflicts are blocked with error message
 * - warn: Conflicts produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   CONFLICT_DETECTOR=warn
 *   CONFLICT_DETECTOR=off
 *
 * Exit codes:
 * - 0: Allow operation (no conflict, or warn/off mode)
 * - 2: Block operation (naming conflict in block mode)
 *
 * The hook fails open (exits 0) on errors to avoid blocking legitimate work.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  extractFilePath,
  getToolInput,
  getEnforcementMode: getEnfMode,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Artifact categories to check
const ARTIFACT_CATEGORIES = ['agents', 'skills', 'workflows'];

// Valid artifact name pattern (kebab-case, lowercase, no leading numbers)
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Get enforcement mode from environment variable
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  return getEnfMode('CONFLICT_DETECTOR', 'block');
}

/**
 * Extract artifact name from file path
 * @param {string} filePath - The file path
 * @returns {string|null} The artifact name or null
 */
function extractArtifactName(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Agent: .claude/agents/<category>/<name>.md
  const agentMatch = normalizedPath.match(/\.claude\/agents\/[^/]+\/([^/]+)\.md$/);
  if (agentMatch) {
    return agentMatch[1];
  }

  // Skill: .claude/skills/<name>/SKILL.md
  const skillMatch = normalizedPath.match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/);
  if (skillMatch) {
    return skillMatch[1];
  }

  // Workflow: .claude/workflows/<category>/<name>.md
  const workflowMatch = normalizedPath.match(/\.claude\/workflows\/[^/]+\/([^/]+)\.md$/);
  if (workflowMatch) {
    return workflowMatch[1];
  }

  return null;
}

/**
 * Extract artifact category from file path
 * @param {string} filePath - The file path
 * @returns {string|null} The category (agents, skills, workflows) or null
 */
function extractArtifactCategory(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');

  if (normalizedPath.includes('.claude/agents/')) {
    return 'agents';
  }
  if (normalizedPath.includes('.claude/skills/')) {
    return 'skills';
  }
  if (normalizedPath.includes('.claude/workflows/')) {
    return 'workflows';
  }

  return null;
}

/**
 * Check if an artifact name follows naming conventions
 * @param {string} name - The artifact name
 * @returns {boolean}
 */
function isValidArtifactName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return NAME_PATTERN.test(name);
}

/**
 * Recursively find all files matching a pattern in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} names - Array to collect names
 */
function collectArtifactNames(dir, names) {
  try {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // For skills, the directory name is the skill name
        if (dir.includes('skills') && fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
          names.push(entry.name);
        }
        // Recurse into subdirectories
        collectArtifactNames(fullPath, names);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // For agents and workflows, extract name from filename
        const name = entry.name.replace(/\.md$/, '');
        if (name !== 'SKILL' && name !== 'README') {
          names.push(name);
        }
      }
    }
  } catch (_e) {
    // Ignore errors (permissions, etc.)
  }
}

/**
 * Check if a name conflicts with existing artifacts
 * @param {string} name - The artifact name to check
 * @param {string} category - The category (agents, skills, workflows)
 * @returns {{ hasConflict: boolean, category: string|null, existingPath: string|null }}
 */
function checkNameConflict(name, category) {
  if (!name || !category) {
    return { hasConflict: false, category: null, existingPath: null };
  }

  const categoryDir = path.join(PROJECT_ROOT, '.claude', category);

  // Collect all existing names in this category
  const existingNames = [];
  collectArtifactNames(categoryDir, existingNames);

  // Check for conflict
  if (existingNames.includes(name)) {
    return {
      hasConflict: true,
      category,
      existingPath: `${categoryDir}/**/${name}*`,
    };
  }

  return { hasConflict: false, category: null, existingPath: null };
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Format the violation message for output.
 * @param {string} name - The conflicting name
 * @param {string} category - The category
 * @returns {string} Formatted violation message
 */
function formatViolationMessage(name, category) {
  return `[NAMING CONFLICT] Artifact "${name}" already exists in ${category}.
Choose a unique name or enhance the existing artifact.
Run: Grep("${name}", ".claude/${category}/") to see existing artifact.`;
}

/**
 * Format naming convention violation message.
 * @param {string} name - The invalid name
 * @returns {string} Formatted violation message
 */
function formatNamingViolationMessage(name) {
  return `[NAMING CONVENTION VIOLATION] Invalid artifact name: "${name}"
Names must be kebab-case, lowercase, start with a letter: ^[a-z][a-z0-9-]*$
Examples: python-pro, mobile-ux-reviewer, c4-context`;
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // Check enforcement mode
    const enforcement = getEnforcementMode();
    if (enforcement === 'off') {
      process.exit(0);
    }

    // Parse the hook input using shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // PERF-006: Get the tool input using shared utilities
    const toolInput = getToolInput(hookInput);
    const filePath = extractFilePath(toolInput) || '';

    // Extract artifact name and category
    const name = extractArtifactName(filePath);
    const category = extractArtifactCategory(filePath);

    if (!name || !category) {
      // Not an artifact creation - allow
      process.exit(0);
    }

    // Check naming conventions
    if (!isValidArtifactName(name)) {
      const message = formatNamingViolationMessage(name);

      if (enforcement === 'block') {
        try {
          await eventBus.emit(EventTypes.TOOL_BLOCKED, {
            type: EventTypes.TOOL_BLOCKED,
            timestamp: new Date().toISOString(),
            toolName: 'Write',
            reason: 'artifact_name_invalid',
          });
        } catch (_err) {
          // Best-effort
        }
        console.log(JSON.stringify({ result: 'block', message }));
        process.exit(0);
      } else {
        console.log(JSON.stringify({ result: 'warn', message }));
        process.exit(0);
      }
    }

    // Check for naming conflicts
    const conflict = checkNameConflict(name, category);

    if (conflict.hasConflict) {
      const message = formatViolationMessage(name, category);

      if (enforcement === 'block') {
        try {
          await eventBus.emit(EventTypes.TOOL_BLOCKED, {
            type: EventTypes.TOOL_BLOCKED,
            timestamp: new Date().toISOString(),
            toolName: 'Write',
            reason: 'artifact_name_conflict',
          });
        } catch (_err) {
          // Best-effort
        }
        console.log(JSON.stringify({ result: 'block', message }));
        process.exit(0);
      } else {
        console.log(JSON.stringify({ result: 'warn', message }));
        process.exit(0);
      }
    }

    // No conflicts - allow
    process.exit(0);
  } catch (err) {
    // Fail CLOSED on errors (SEC-008 compliance for security hooks)
    if (process.env.DEBUG_HOOKS) {
      console.error('conflict-detector error:', err.message);
      console.error('Stack trace:', err.stack);
    }
    process.exit(2);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  getEnforcementMode,
  extractArtifactName,
  extractArtifactCategory,
  isValidArtifactName,
  checkNameConflict,
  ARTIFACT_CATEGORIES,
  NAME_PATTERN,
  PROJECT_ROOT,
};
