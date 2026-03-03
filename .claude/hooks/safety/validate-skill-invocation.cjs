'use strict';

/**
 * Skill Invocation Validation Hook
 *
 * Ensures agents properly use Skill() tool to invoke skills,
 * rather than just Read()ing the SKILL.md files.
 */

// PERF-006/PERF-007: Use shared hook-input.cjs utility
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
} = require('../../lib/utils/hook-input.cjs');

const SKILL_PATH_PATTERN = /\.claude[/\\]skills[/\\](?:[^/\\]+[/\\])+SKILL\.md/i;

/**
 * Check if a path is a skill file
 * @param {string} filePath - The file path to check
 * @returns {boolean}
 */
function isSkillFile(filePath) {
  return SKILL_PATH_PATTERN.test(filePath);
}

/**
 * Extract skill name from file path
 * @param {string} filePath - The file path to extract from
 * @returns {string|null}
 */
function extractSkillName(filePath) {
  const match = filePath.match(/[/\\]([^/\\]+)[/\\]SKILL\.md$/i);
  return match ? match[1] : null;
}

/**
 * Validate hook - called before Read operations
 * @param {Object} context - Hook context with tool info
 * @param {string} context.tool - The tool name being invoked
 * @param {Object} context.parameters - The tool parameters
 * @returns {{ valid: boolean, error: string, warning?: string }}
 */
function validate(context) {
  const { tool, parameters } = context;

  // Only check Read operations
  if (tool !== 'Read') {
    return { valid: true, error: '' };
  }

  const filePath = parameters?.file_path || '';

  // Check if reading a SKILL.md file
  if (!isSkillFile(filePath)) {
    return { valid: true, error: '' };
  }

  // Extract skill name from path
  const skillName = extractSkillName(filePath) || 'unknown';

  // Return warning (not blocking - reading is allowed but may indicate improper usage)
  return {
    valid: true,
    error: '',
    warning: `REMINDER: You are reading skill file directly. To properly invoke this skill, use: Skill({ skill: "${skillName}" }). Reading is allowed for reference, but Skill() tool applies the workflow.`,
  };
}

// parseHookInput removed - now using parseHookInputAsync from shared hook-input.cjs
// PERF-006/PERF-007: Eliminated ~55 lines of duplicated parsing code

/**
 * Main execution function.
 * Runs when hook is invoked by Claude Code.
 */
async function main() {
  try {
    // PERF: Fast pre-parse short-circuit for non-skill Read calls.
    // ~95% of Read operations do not target skill files. Check the raw
    // input string for "skills" before spending time on JSON parsing,
    // sanitization, and helper calls. This avoids parseHookInputAsync()
    // overhead (stdin read + safeParseJSON + sanitizeObject) for the
    // vast majority of Read invocations.
    const rawArg = process.argv[2] || '';
    if (rawArg && !rawArg.includes('skills')) {
      // argv input present but doesn't reference any skill path — fast exit
      process.exit(0);
    }

    // PERF-006/PERF-007: Use shared hook-input.cjs utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // Verify this is a Read tool call using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Read') {
      // Not a Read tool - allow
      process.exit(0);
    }

    // Extract file path using shared helpers
    const toolInput = getToolInput(hookInput);
    const filePath = extractFilePath(toolInput) || '';

    // Check if this is a skill file
    if (!isSkillFile(filePath)) {
      // Not a skill file - allow without warning
      process.exit(0);
    }

    // Extract skill name
    const skillName = extractSkillName(filePath) || 'unknown';

    // Emit plain-text warning only; never return JSON payload from this advisory hook.
    // JSON outputs can interfere with tool_input mutation hooks when multiple hooks match.
    console.error(
      `[SKILL-INVOCATION] Consider using Skill({ skill: "${skillName}" }) instead of reading SKILL.md directly. ` +
        'Reading is allowed for reference, but Skill() tool applies the workflow.'
    );
    process.exit(0);
  } catch (err) {
    // On any error, fail open to avoid blocking legitimate work
    if (process.env.DEBUG_HOOKS) {
      console.error('Skill invocation validator error:', err.message);
    }
    process.exit(0);
  }
}

// Run main function when executed directly
if (require.main === module) {
  main();
}

module.exports = {
  validate,
  isSkillFile,
  extractSkillName,
  main,
  SKILL_PATH_PATTERN,
};
