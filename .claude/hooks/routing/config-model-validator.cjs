#!/usr/bin/env node
/**
 * Config Model Validator Hook
 * ============================
 *
 * PreToolUse(Task) hook that validates spawn model matches config.yaml.
 *
 * ADR-075: Router Model Selection from Configuration
 *
 * ENFORCEMENT MODES:
 * - CONFIG_MODEL_VALIDATOR=block - Block spawn if model mismatch
 * - CONFIG_MODEL_VALIDATOR=warn  - Log warning but allow spawn (DEFAULT)
 * - CONFIG_MODEL_VALIDATOR=off   - Disable validation
 *
 * This hook does NOT modify the spawn - it only validates and logs.
 * To enforce config-based model selection, the Router must call
 * resolveAgentModel() before spawning.
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (only in block mode with mismatch)
 *
 * @module config-model-validator
 */

'use strict';

const path = require('path');
const { resolveAgentModel, getShorthand } = require('../../lib/utils/agent-config-reader.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// =============================================================================
// AGENT TYPE EXTRACTION
// =============================================================================

/**
 * Extract agent type from spawn prompt.
 * Supports multiple patterns used in Agent-Studio spawn templates.
 *
 * @param {string|null|undefined} prompt - Spawn prompt text
 * @returns {string|null} Agent type (lowercase) or null
 */
function extractAgentTypeFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }

  const promptLower = prompt.toLowerCase();

  // Pattern 1: "You are PLANNER" or "You are the PLANNER"
  // Matches: "You are PLANNER", "You are the developer", "you are security-architect"
  const youAreMatch = promptLower.match(/you are (?:the )?([a-z][-a-z0-9]*)/i);
  if (youAreMatch) {
    return youAreMatch[1].toLowerCase();
  }

  // Pattern 2: Agent file path reference
  // Matches: ".claude/agents/core/planner.md", ".claude/agents/specialized/security-architect.md"
  const pathMatch = prompt.match(
    /\.claude\/agents\/(?:core|specialized|domain|orchestrators)\/([^/.]+)\.md/i
  );
  if (pathMatch) {
    return pathMatch[1].toLowerCase();
  }

  // Pattern 3: subagent_type hint (used in Task() calls)
  // Matches: "[subagent_type: developer]", "subagent_type: planner"
  const subagentMatch = prompt.match(/\[?subagent_type:\s*([a-z][-a-z0-9]*)\]?/i);
  if (subagentMatch) {
    return subagentMatch[1].toLowerCase();
  }

  return null;
}

/**
 * Extract model from Task tool input.
 *
 * @param {Object|null|undefined} toolInput - Task tool input
 * @returns {string|null} Model string or null
 */
function extractModelFromToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  const model = toolInput.model;
  if (!model || typeof model !== 'string') {
    return null;
  }

  return model.trim();
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

/**
 * Validate that spawn model matches configuration.
 *
 * @param {Object} toolInput - Task tool input
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory
 * @returns {Object} Validation result with decision, mismatch flag, and audit info
 */
function validateModelConfig(toolInput, projectRoot = PROJECT_ROOT) {
  const mode = getEnforcementMode('CONFIG_MODEL_VALIDATOR', 'warn');

  // Skip validation when disabled
  if (mode === 'off') {
    auditSecurityOverride(
      'config-model-validator',
      'CONFIG_MODEL_VALIDATOR',
      'off',
      'Model configuration validation disabled'
    );
    return {
      decision: 'allow',
      mismatch: false,
      skipped: true,
      reason: 'Validation disabled (CONFIG_MODEL_VALIDATOR=off)',
    };
  }

  // Extract agent type from prompt
  const prompt = toolInput?.prompt || '';
  const agentType = extractAgentTypeFromPrompt(prompt);

  if (!agentType) {
    // Cannot determine agent type - allow (no validation possible)
    return {
      decision: 'allow',
      mismatch: false,
      agentType: null,
      reason: 'Cannot determine agent type from prompt',
    };
  }

  // Extract spawn model
  const spawnModel = extractModelFromToolInput(toolInput);

  if (!spawnModel) {
    // No model specified in spawn - allow (Router should use config)
    return {
      decision: 'allow',
      mismatch: false,
      agentType,
      spawnModel: null,
      reason: 'No model specified in spawn (will use config or default)',
    };
  }

  // Resolve configured model
  const configResult = resolveAgentModel(agentType, projectRoot);
  const configuredModel = configResult.shorthand;
  const configSource = configResult.source;

  // Normalize spawn model for comparison
  const spawnShorthand = getShorthand(spawnModel);

  // Check for mismatch
  const mismatch = spawnShorthand !== configuredModel;

  if (mismatch) {
    const decision = mode === 'block' ? 'block' : 'warn';
    return {
      decision,
      mismatch: true,
      agentType,
      spawnModel: spawnShorthand,
      configuredModel,
      source: configSource,
      message: `Model mismatch for ${agentType}: spawn uses '${spawnShorthand}' but config specifies '${configuredModel}' (source: ${configSource})`,
    };
  }

  // Models match
  return {
    decision: 'allow',
    mismatch: false,
    agentType,
    spawnModel: spawnShorthand,
    configuredModel,
    source: configSource,
  };
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Format validation result as audit log entry.
 *
 * @param {Object} validation - Validation result from validateModelConfig
 * @returns {Object} Audit log entry
 */
function formatAuditEntry(validation) {
  return {
    hook: 'config-model-validator',
    event: validation.mismatch ? 'model_mismatch' : 'model_validated',
    timestamp: new Date().toISOString(),
    agentType: validation.agentType,
    spawnModel: validation.spawnModel,
    configuredModel: validation.configuredModel,
    source: validation.source,
    decision: validation.decision,
    mismatch: validation.mismatch,
  };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Main hook entry point.
 * Called by Claude Code as PreToolUse(Task) hook.
 */
async function main() {
  try {
    // Parse hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow
      process.exit(0);
    }

    // Only validate Task tool
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0);
    }

    // Get tool input
    const toolInput = getToolInput(hookInput);

    // Validate model configuration
    const result = validateModelConfig(toolInput, PROJECT_ROOT);

    // Log audit entry
    const auditEntry = formatAuditEntry(result);
    auditLog('config-model-validator', auditEntry.event, auditEntry);

    // Handle result
    if (result.mismatch) {
      const message = `
+======================================================================+
|  CONFIG MODEL VALIDATOR - MODEL MISMATCH DETECTED                    |
+======================================================================+
|  Agent Type:       ${(result.agentType || 'unknown').padEnd(45)}|
|  Spawn Model:      ${(result.spawnModel || 'none').padEnd(45)}|
|  Configured Model: ${(result.configuredModel || 'none').padEnd(45)}|
|  Config Source:    ${(result.source || 'unknown').padEnd(45)}|
|                                                                      |
|  The spawn model does not match the configured model.                |
|  To fix: Use resolveAgentModel() before spawning to get the correct  |
|  model from config.yaml.                                             |
|                                                                      |
|  Mode: ${getEnforcementMode('CONFIG_MODEL_VALIDATOR', 'warn').padEnd(58)}|
+======================================================================+
`;

      console.error(message);

      if (result.decision === 'block') {
        console.log(formatResult('block', result.message));
        process.exit(2);
      } else {
        // Warn mode - allow but log
        console.log(formatResult('allow', result.message));
        process.exit(0);
      }
    }

    // No mismatch - allow
    process.exit(0);
  } catch (err) {
    // Fail open on error (don't break spawning)
    auditLog('config-model-validator', 'error', { error: err.message });
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  // Main functions
  validateModelConfig,
  main,

  // Extraction functions
  extractAgentTypeFromPrompt,
  extractModelFromToolInput,

  // Audit functions
  formatAuditEntry,
};
