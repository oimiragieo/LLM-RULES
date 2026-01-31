#!/usr/bin/env node
/**
 * Pre-Spawn Tool Validator Hook
 * ==============================
 *
 * Phase 1B: Validates agent tool configurations BEFORE spawning via Task().
 * This hook PREVENTS "Invalid tool parameters" errors by catching configuration
 * issues before they cause runtime failures.
 *
 * Validation checks:
 * 1. Tool exists in manifest (core or MCP)
 * 2. Tool is available (or has working fallback)
 * 3. Tool count <= maxToolsPerAgent (15) or maxToolsPerOrchestrator (18)
 * 4. Reserved tools only assigned to allowed agents
 * 5. Mandatory tools present (TaskUpdate, Skill)
 *
 * Trigger: PreToolUse (Task tool)
 * Exit codes:
 *   0 - Allow (validation passed or warnings only)
 *   2 - Block (validation failed)
 *
 * Environment:
 *   PRE_SPAWN_VALIDATOR_MODE - 'block' (default), 'warn', 'off'
 *
 * @module pre-spawn-tool-validator
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  auditLog,
  getEnforcementMode,
} = require('../../lib/utils/hook-input.cjs');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// ============================================================================
// Configuration
// ============================================================================

const ENFORCEMENT_ENV = 'PRE_SPAWN_VALIDATOR_MODE';
const DEFAULT_MODE = 'block';

// Path to tool manifest (Phase 1A deliverable)
const MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-manifest.json');

// Cache manifest to avoid re-reading
let _manifestCache = null;

// ============================================================================
// Manifest Loading
// ============================================================================

/**
 * Load and cache the tool manifest
 * @returns {Object} Tool manifest or fallback structure
 */
function loadManifest() {
  if (_manifestCache) {
    return _manifestCache;
  }

  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      _manifestCache = JSON.parse(content);
      return _manifestCache;
    }
  } catch (e) {
    // Fallback to minimal manifest if load fails
    auditLog('pre-spawn-tool-validator', 'warn', {
      reason: 'Failed to load manifest, using fallback',
      error: e.message,
    });
  }

  // Fallback manifest with core tools
  _manifestCache = {
    tools: {
      core: [
        { name: 'Read', status: 'available' },
        { name: 'Write', status: 'available' },
        { name: 'Edit', status: 'available' },
        { name: 'Bash', status: 'available' },
        { name: 'Glob', status: 'available' },
        { name: 'Grep', status: 'available' },
        { name: 'Task', status: 'available' },
        { name: 'TaskCreate', status: 'available' },
        { name: 'TaskUpdate', status: 'available' },
        { name: 'TaskList', status: 'available' },
        { name: 'TaskGet', status: 'available' },
        { name: 'TaskOutput', status: 'available' },
        { name: 'TaskStop', status: 'available' },
        { name: 'Skill', status: 'available' },
        { name: 'AskUserQuestion', status: 'available' },
        { name: 'EnterPlanMode', status: 'available' },
        { name: 'ExitPlanMode', status: 'available' },
        { name: 'WebSearch', status: 'available' },
        { name: 'WebFetch', status: 'available' },
        { name: 'NotebookEdit', status: 'available' },
      ],
      mcp: [],
    },
    constraints: {
      maxToolsPerAgent: 15,
      maxToolsPerOrchestrator: 18,
    },
    validation: {
      reservedTools: {
        Task: [
          'router',
          'master-orchestrator',
          'evolution-orchestrator',
          'swarm-coordinator',
          'party-orchestrator',
        ],
        AskUserQuestion: ['router'],
      },
      mandatoryTools: ['TaskUpdate', 'Skill'],
    },
  };

  return _manifestCache;
}

/**
 * Get set of all known tool names from manifest
 * @param {Object} manifest
 * @returns {Set<string>}
 */
function getKnownTools(manifest) {
  const known = new Set();

  // Add core tools
  for (const tool of manifest.tools?.core || []) {
    known.add(tool.name);
  }

  // Add MCP tools
  for (const tool of manifest.tools?.mcp || []) {
    known.add(tool.name);
  }

  return known;
}

/**
 * Get MCP tool info from manifest
 * @param {string} toolName
 * @param {Object} manifest
 * @returns {Object|null}
 */
function getMcpToolInfo(toolName, manifest) {
  for (const tool of manifest.tools?.mcp || []) {
    if (tool.name === toolName) {
      return tool;
    }
  }
  return null;
}

// ============================================================================
// Agent Type Detection
// ============================================================================

/**
 * List of orchestrator agent types
 */
const ORCHESTRATOR_TYPES = [
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
];

/**
 * Check if agent type is an orchestrator
 * @param {string} agentType
 * @returns {boolean}
 */
function isOrchestrator(agentType) {
  if (!agentType) return false;
  const lowerType = agentType.toLowerCase();
  return ORCHESTRATOR_TYPES.some(t => lowerType.includes(t) || lowerType.includes('orchestrator'));
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Validate tool configuration for an agent spawn
 *
 * @param {Object} options
 * @param {string[]|null|undefined} options.tools - Tools the agent wants to use
 * @param {string} options.agentType - Type of agent being spawned
 * @returns {Object} Validation result with valid, errors, warnings, suggestions
 */
function validateToolConfig({ tools, agentType }) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    suggestions: [],
  };

  // Backward compatible: no tools = allow
  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return result;
  }

  const manifest = loadManifest();
  const knownTools = getKnownTools(manifest);
  const constraints = manifest.constraints || {};
  const validation = manifest.validation || {};
  const reservedTools = validation.reservedTools || {};
  const mandatoryTools = validation.mandatoryTools || [];

  // Determine max tools limit
  const isOrch = isOrchestrator(agentType);
  const maxTools = isOrch
    ? constraints.maxToolsPerOrchestrator || 18
    : constraints.maxToolsPerAgent || 15;

  // 1. Check tool count
  if (tools.length > maxTools) {
    result.valid = false;
    result.errors.push(
      `Agent has ${tools.length} tools, maximum is ${maxTools} for ${isOrch ? 'orchestrator' : 'agent'}`
    );
  }

  // 2. Check each tool
  for (const tool of tools) {
    // Check if MCP tool
    if (tool.startsWith('mcp__')) {
      const mcpInfo = getMcpToolInfo(tool, manifest);

      if (!mcpInfo) {
        // Unknown MCP tool - block
        result.valid = false;
        result.errors.push(`Tool '${tool}' not found in manifest`);
      } else if (mcpInfo.status === 'unavailable') {
        // Known but unavailable MCP tool
        if (mcpInfo.fallback_status === 'available' || mcpInfo.fallback) {
          // Has fallback - warn
          result.warnings.push(
            `Tool '${tool}' unavailable (${mcpInfo.reason || 'MCP server not configured'}). ` +
              `Suggestion: Use ${mcpInfo.fallback || 'core tools'} instead`
          );
          result.suggestions.push(`Use ${mcpInfo.fallback} instead of ${tool}`);
        } else {
          // No fallback - block
          result.valid = false;
          result.errors.push(`Tool '${tool}' unavailable and no fallback available`);
        }
      }
      continue;
    }

    // Check if core tool exists
    if (!knownTools.has(tool)) {
      result.valid = false;
      result.errors.push(`Tool '${tool}' not found in manifest`);
      continue;
    }

    // 3. Check reserved tools
    if (reservedTools[tool]) {
      const allowedAgents = reservedTools[tool];
      const agentLower = (agentType || '').toLowerCase();

      // Check if this agent is allowed to use the reserved tool
      const isAllowed = allowedAgents.some(
        allowed =>
          agentLower.includes(allowed.toLowerCase()) || allowed.toLowerCase() === agentLower
      );

      if (!isAllowed) {
        result.valid = false;
        result.errors.push(
          `Tool '${tool}' is reserved for: ${allowedAgents.join(', ')}. ` +
            `Agent type '${agentType}' cannot use this tool.`
        );
      }
    }
  }

  // 4. Check mandatory tools
  for (const mandatory of mandatoryTools) {
    if (!tools.includes(mandatory)) {
      result.warnings.push(
        `Mandatory tool '${mandatory}' is missing from allowed_tools. ` +
          `Agents should include ${mandatory} for proper operation.`
      );
    }
  }

  return result;
}

/**
 * Extract agent configuration from spawn prompt
 *
 * Looks for subagent_type and allowed_tools in the Task parameters
 *
 * @param {string|Object} prompt - Spawn prompt or params object
 * @returns {Object} Extracted config with agentType and tools
 */
function extractAgentConfig(prompt) {
  if (!prompt) {
    return { agentType: null, tools: null };
  }

  // If prompt is an object (Task params), extract directly
  if (typeof prompt === 'object') {
    return {
      agentType: prompt.subagent_type || prompt.agent_type || null,
      tools: prompt.allowed_tools || null,
    };
  }

  // If prompt is a string, try to extract from text
  const config = { agentType: null, tools: null };

  // Extract subagent_type
  const typeMatch = prompt.match(/subagent_type:\s*['"]?([a-zA-Z_-]+)['"]?/);
  if (typeMatch) {
    config.agentType = typeMatch[1];
  }

  // Try to extract from "You are DEVELOPER" pattern
  const roleMatch = prompt.match(/You are (?:the )?([A-Z_-]+)/);
  if (roleMatch && !config.agentType) {
    config.agentType = roleMatch[1].toLowerCase();
  }

  // Extract allowed_tools (basic parsing)
  const toolsMatch = prompt.match(/allowed_tools:\s*\[([^\]]+)\]/);
  if (toolsMatch) {
    try {
      // Try to parse as JSON-like array
      const toolsStr = '[' + toolsMatch[1].replace(/'/g, '"') + ']';
      config.tools = JSON.parse(toolsStr);
    } catch {
      // Fallback: split by comma
      config.tools = toolsMatch[1]
        .split(',')
        .map(t => t.trim().replace(/['"]/g, ''))
        .filter(t => t);
    }
  }

  return config;
}

/**
 * Generate actionable suggestions for validation errors
 *
 * @param {string[]} errors - List of error messages
 * @returns {string[]} Actionable suggestions
 */
function generateSuggestions(errors) {
  const manifest = loadManifest();
  const suggestions = [];

  for (const error of errors) {
    // MCP tool unavailable - suggest fallback
    if (error.includes('mcp__') && error.includes('unavailable')) {
      const toolMatch = error.match(/mcp__([^']+)/);
      if (toolMatch) {
        const mcpTool = 'mcp__' + toolMatch[1];
        const mcpInfo = getMcpToolInfo(mcpTool, manifest);

        if (mcpInfo?.fallback) {
          suggestions.push(mcpInfo.fallback);
        } else if (mcpTool.includes('sequential-thinking')) {
          suggestions.push("Use Skill({ skill: 'sequential-thinking' }) instead");
        } else if (mcpTool.includes('Exa')) {
          suggestions.push('Use WebSearch as fallback for Exa tools');
        }
      }
    }

    // Reserved tool - suggest using appropriate agent
    if (error.includes('reserved for')) {
      if (error.includes('Task')) {
        suggestions.push('Developers cannot spawn subagents. Use orchestrators instead.');
      }
      if (error.includes('AskUserQuestion')) {
        suggestions.push('Only the router can ask user questions.');
      }
    }

    // Too many tools - suggest removing optional tools
    if (error.includes('maximum')) {
      suggestions.push(
        'Remove optional tools like EnterPlanMode, ExitPlanMode, or WebSearch/WebFetch ' +
          'if not needed for this agent.'
      );
    }

    // Unknown tool - suggest checking spelling
    if (error.includes('not found')) {
      suggestions.push('Check tool name spelling. See CLAUDE.md section 1.4 for available tools.');
    }
  }

  return suggestions;
}

// ============================================================================
// Main Hook Entry Point
// ============================================================================

/**
 * Main entry point
 */
async function main() {
  try {
    const mode = getEnforcementMode(ENFORCEMENT_ENV, DEFAULT_MODE);

    // If hook is disabled, allow all
    if (mode === 'off') {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();

    // Only validate Task tool (agent spawning)
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0); // Allow (not spawning agent)
    }

    const toolInput = getToolInput(hookInput);

    // Extract agent configuration from Task parameters
    const allowedTools = toolInput.allowed_tools || null;
    const agentType = toolInput.subagent_type || toolInput.description || 'unknown';

    // If no tools specified, allow (backward compatible)
    if (!allowedTools) {
      process.exit(0);
    }

    // Validate tools
    const validation = validateToolConfig({
      tools: allowedTools,
      agentType: agentType,
    });

    // Handle validation result
    if (!validation.valid) {
      const suggestions = generateSuggestions(validation.errors);
      const message =
        `[PRE-SPAWN-VALIDATOR] Tool validation failed:\n` +
        `  Errors: ${validation.errors.join('; ')}\n` +
        `  Suggestions: ${suggestions.join('; ')}`;

      auditLog('pre-spawn-tool-validator', 'block', {
        tool: toolName,
        agentType,
        errors: validation.errors,
        suggestions,
      });

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        // warn mode
        console.warn(message);
      }
    }

    // Log warnings
    if (validation.warnings.length > 0) {
      auditLog('pre-spawn-tool-validator', 'warn', {
        tool: toolName,
        agentType,
        warnings: validation.warnings,
      });

      for (const warning of validation.warnings) {
        console.warn(`[PRE-SPAWN-VALIDATOR] Warning: ${warning}`);
      }
    }

    process.exit(0); // Allow
  } catch (err) {
    auditLog('pre-spawn-tool-validator', 'error', { error: err.message });
    // Fail open on error (don't block legitimate spawns due to hook errors)
    process.exit(0);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  validateToolConfig,
  extractAgentConfig,
  generateSuggestions,
  loadManifest,
  isOrchestrator,
  getKnownTools,
  getMcpToolInfo,
  ORCHESTRATOR_TYPES,
};
