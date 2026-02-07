#!/usr/bin/env node
/**
 * Skill Invocation Tracker Hook
 * ==============================
 *
 * Tracks when creator skills are invoked via the Skill() tool.
 * When any creator skill is invoked, updates the unified state file
 * that unified-creator-guard.cjs checks.
 *
 * This provides a backup mechanism for state tracking in case
 * the skill's own pre-execute hook doesn't run or fails.
 *
 * Trigger: PreToolUse (matches: Skill)
 *
 * Exit codes:
 * - 0: Always allow (this is a tracking hook, not a guard)
 *
 * @module skill-invocation-tracker
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
// PROC-002: Use shared utility instead of duplicated findProjectRoot
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Unified state file to track all active creators
 * Used by unified-creator-guard.cjs
 */
const ACTIVE_CREATORS_STATE_FILE = '.claude/context/runtime/active-creators.json';

/**
 * Default TTL for creator active state (3 minutes)
 * SEC-REMEDIATION-001: Reduced from 10 to 3 minutes to minimize
 * state tampering window while still allowing creator workflow completion.
 */
const DEFAULT_TTL_MS = 3 * 60 * 1000;

/**
 * Creator skills that require state tracking
 * These are the skills that create artifacts protected by unified-creator-guard.cjs
 */
const TRACKED_CREATOR_SKILLS = [
  'skill-creator',
  'agent-creator',
  'hook-creator',
  'workflow-creator',
  'template-creator',
  'schema-creator',
];

/**
 * Mark a creator skill as active by updating unified state file.
 * @param {string} creatorName - Name of the creator skill being invoked
 */
function markCreatorActive(creatorName) {
  try {
    const statePath = path.join(PROJECT_ROOT, ACTIVE_CREATORS_STATE_FILE);
    const stateDir = path.dirname(statePath);

    // Ensure runtime directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // Load existing state or create new
    let state = {};
    if (fs.existsSync(statePath)) {
      try {
        state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (_e) {
        // Invalid state file, start fresh
        state = {};
      }
    }

    // Update the specific creator's state
    state[creatorName] = {
      active: true,
      invokedAt: new Date().toISOString(),
      artifactName: null, // Will be set during workflow when artifact name is determined
      ttl: DEFAULT_TTL_MS,
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    auditLog('skill-invocation-tracker', 'creator_activated', {
      creator: creatorName,
      statePath: statePath,
    });

    return true;
  } catch (err) {
    auditLog('skill-invocation-tracker', 'state_file_error', {
      creator: creatorName,
      error: err.message,
    });
    return false;
  }
}

/**
 * Extract skill name from Skill tool input
 * @param {Object} toolInput - Tool input object
 * @returns {string|null} Skill name or null
 */
function extractSkillName(toolInput) {
  if (!toolInput) return null;
  // Skill tool uses 'skill' parameter
  return toolInput.skill || toolInput.name || null;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main execution function
 */
async function main() {
  try {
    // Parse the hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow
      process.exit(0);
    }

    // Get tool name and input
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Only process Skill tool invocations
    if (toolName !== 'Skill') {
      process.exit(0);
    }

    // Extract the skill name being invoked
    const skillName = extractSkillName(toolInput);

    if (!skillName) {
      // No skill name found - allow but log
      auditLog('skill-invocation-tracker', 'no_skill_name', { input: toolInput });
      process.exit(0);
    }

    // Check if this is a tracked creator skill
    if (TRACKED_CREATOR_SKILLS.includes(skillName)) {
      markCreatorActive(skillName);
    }

    // Always allow - this is a tracking hook, not a guard
    process.exit(0);
  } catch (err) {
    // Log error but don't block - this is a tracking hook
    auditLog('skill-invocation-tracker', 'error', { error: err.message });
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  markCreatorActive,
  extractSkillName,
  TRACKED_CREATOR_SKILLS,
  ACTIVE_CREATORS_STATE_FILE,
  DEFAULT_TTL_MS,
  PROJECT_ROOT,
};
