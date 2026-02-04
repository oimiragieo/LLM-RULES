#!/usr/bin/env node
/**
 * Tool Availability Validator Hook
 * =================================
 *
 * Validates that tools in agent's allowed_tools are actually available.
 * Blocks spawn if required tools are missing.
 * Warns if optional tools (MCP) are missing but allows spawn.
 *
 * Trigger: PreToolUse (Task tool)
 * Exit codes:
 *   0 - Allow (all tools available or optional tools missing)
 *   2 - Block (required tools missing)
 *
 * @module tool-availability-validator
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
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Core tools that are ALWAYS available
const CORE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'Skill',
  'MemoryRecord',
  'AskUserQuestion',
  'NotebookEdit',
  'WebSearch',
  'WebFetch',
];

/**
 * Check MCP server configuration
 * @returns {Object} Map of server names to configurations
 */
function checkMCPServers() {
  try {
    const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return settings.mcpServers || {};
  } catch (_e) {
    return {};
  }
}

/**
 * Validate tool availability
 * @param {string[]} allowedTools - List of tools the agent wants to use
 * @returns {Object} Validation result with unavailable tools
 */
function validateTools(allowedTools) {
  const mcpServers = checkMCPServers();
  const unavailableTools = [];
  const mcpToolsWithoutServer = [];

  for (const tool of allowedTools || []) {
    // Check if it's an MCP tool
    if (tool.startsWith('mcp__')) {
      // Extract server name from mcp__<server>__<tool>
      const parts = tool.split('__');
      if (parts.length >= 2) {
        const serverName = parts[1];
        if (!mcpServers[serverName]) {
          mcpToolsWithoutServer.push({ tool, server: serverName });
        }
      }
      continue;
    }

    // Check if it's a core tool
    if (!CORE_TOOLS.includes(tool)) {
      unavailableTools.push(tool);
    }
  }

  return {
    unavailableTools,
    mcpToolsWithoutServer,
    allAvailable: unavailableTools.length === 0,
  };
}

/**
 * Main entry point
 */
async function main() {
  try {
    const hookInput = await parseHookInputAsync();

    // Only validate Task tool (agent spawning)
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0); // Allow (not spawning agent)
    }

    const toolInput = getToolInput(hookInput);
    const allowedTools = toolInput.allowed_tools || [];

    // Validate tools
    const validation = validateTools(allowedTools);

    // Block if required tools unavailable
    if (!validation.allAvailable) {
      const message = `[TOOL-AVAILABILITY] Required tools unavailable: ${validation.unavailableTools.join(', ')}`;

      auditLog('tool-availability-validator', 'block', {
        tool: toolName,
        unavailableTools: validation.unavailableTools,
        reason: message,
      });

      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Task',
          reason: 'tool_availability_missing',
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(formatResult('block', message));
      process.exit(2);
    }

    // Warn if MCP tools requested without server
    if (validation.mcpToolsWithoutServer.length > 0) {
      const mcpWarnings = validation.mcpToolsWithoutServer.map(
        ({ tool, server }) => `${tool} (server: ${server})`
      );
      const warnMessage = `[TOOL-AVAILABILITY] MCP tools requested but servers not configured: ${mcpWarnings.join(', ')}. Suggestion: Use Skill() tool instead or configure MCP servers in settings.json`;

      auditLog('tool-availability-validator', 'warn', {
        tool: toolName,
        mcpToolsWithoutServer: validation.mcpToolsWithoutServer,
        reason: warnMessage,
      });

      // Log warning but allow spawn (MCP tools are optional)
      console.warn(warnMessage);
    }

    process.exit(0); // Allow
  } catch (err) {
    auditLog('tool-availability-validator', 'error', { error: err.message });
    // Fail open on error (don't block legitimate spawns due to hook errors)
    process.exit(0);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { main, validateTools, checkMCPServers, CORE_TOOLS };
