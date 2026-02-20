/**
 * Centralized Enforcement Mode Defaults
 *
 * This module provides a single source of truth for enforcement mode defaults
 * across all hooks and library files. Previously, these defaults were scattered
 * across individual files, leading to duplication and potential inconsistency.
 *
 * Usage:
 *   const { getEnforcementMode } = require('.claude/lib/utils/enforcement-defaults.cjs');
 *   const mode = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT');
 *
 * @module enforcement-defaults
 */

'use strict';

/**
 * Default enforcement modes for all enforcement variables.
 * These match the defaults that were previously hardcoded in individual hooks.
 *
 * Values:
 *   - 'block': Operation is blocked if condition fails
 *   - 'warn': Warning logged but operation proceeds
 *   - 'off': Enforcement disabled
 *   - 'on': Feature enabled (for boolean flags)
 */
const ENFORCEMENT_DEFAULTS = {
  // Routing enforcement
  PLANNER_FIRST_ENFORCEMENT: 'block',
  SECURITY_REVIEW_ENFORCEMENT: 'block',
  SPECIALIST_ROUTING_ENFORCEMENT: 'block',
  CREATOR_ROUTING_ENFORCEMENT: 'block',
  CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT: 'block',
  HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT: 'block',
  ROUTER_BASH_GUARD: 'block',
  INTENT_AGENT_MATCH: 'block',
  CONFIG_MODEL_VALIDATOR: 'block',
  ROUTER_SELF_CHECK: 'block',
  ROUTER_WRITE_GUARD: 'block',
  RESEARCH_ENFORCEMENT: 'block',

  // Reflection enforcement
  REFLECTION_STEP0_ENFORCEMENT: 'block',

  // Completion metadata (ADR-139)
  PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'block',

  // Task management enforcement
  TASKLIST_FIRST_ENFORCEMENT: 'block',
  TASKUPDATE_FIRST_ENFORCEMENT: 'block',

  // Agent guardrails
  AGENT_GUARDRAIL_ENFORCEMENT: 'block',
  AGENT_GIT_COMMIT_ENFORCEMENT: 'block',
  AGENT_FILE_ALLOWLIST_ENFORCEMENT: 'block',
  AGENT_EDIT_CHECKPOINT_ENFORCEMENT: 'block',

  // Creator and compliance
  CREATOR_COMPLIANCE_ENFORCEMENT: 'warn',

  // Safety and validation
  CONFLICT_DETECTOR: 'block',
  HYBRID_GREP_ENFORCEMENT: 'warn',
  READ_TOKEN_SAVER_ENFORCEMENT: 'on',

  // Memory and integration
  MEMORY_JSON_WRITE_ENFORCEMENT: 'block',
  CLAUDE_MD_ENFORCEMENT: 'warn',
  INTEGRATION_ENFORCEMENT: 'warn',
  NO_TRACK_ENFORCEMENT: 'off',
};

const VALID_ENFORCEMENT_MODES = new Set(['block', 'warn', 'off', 'on']);

/**
 * Get the enforcement mode for a given environment variable.
 *
 * Resolution order:
 *   1. Environment variable (if set)
 *   2. Default from ENFORCEMENT_DEFAULTS table
 *   3. Fallback to 'warn' if neither exists
 *
 * @param {string} key - Environment variable name (e.g., 'PLANNER_FIRST_ENFORCEMENT')
 * @returns {string} Enforcement mode ('block', 'warn', 'off', or 'on')
 *
 * @example
 *   const mode = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT');
 *   // Returns 'block' (from defaults) unless PLANNER_FIRST_ENFORCEMENT is set
 */
function getEnforcementMode(key, defaultMode = 'block') {
  const normalizedDefault = VALID_ENFORCEMENT_MODES.has(defaultMode) ? defaultMode : 'block';
  const envValue = process.env[key];
  if (VALID_ENFORCEMENT_MODES.has(envValue)) {
    return envValue;
  }
  const mappedDefault = ENFORCEMENT_DEFAULTS[key];
  if (VALID_ENFORCEMENT_MODES.has(mappedDefault)) {
    return mappedDefault;
  }
  return normalizedDefault;
}

/**
 * Get all enforcement variable names.
 *
 * @returns {string[]} Array of enforcement variable names
 */
function getEnforcementKeys() {
  return Object.keys(ENFORCEMENT_DEFAULTS);
}

/**
 * Check if an enforcement mode is set to 'block'.
 *
 * @param {string} key - Environment variable name
 * @returns {boolean} True if mode is 'block'
 */
function isBlocking(key) {
  return getEnforcementMode(key) === 'block';
}

/**
 * Check if an enforcement mode is set to 'warn'.
 *
 * @param {string} key - Environment variable name
 * @returns {boolean} True if mode is 'warn'
 */
function isWarning(key) {
  return getEnforcementMode(key) === 'warn';
}

/**
 * Check if an enforcement mode is disabled ('off').
 *
 * @param {string} key - Environment variable name
 * @returns {boolean} True if mode is 'off'
 */
function isDisabled(key) {
  return getEnforcementMode(key) === 'off';
}

module.exports = {
  ENFORCEMENT_DEFAULTS,
  getEnforcementMode,
  getEnforcementKeys,
  isBlocking,
  isWarning,
  isDisabled,
};
