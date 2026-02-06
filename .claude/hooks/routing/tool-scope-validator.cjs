#!/usr/bin/env node
/**
 * Tool Scope Validator Hook
 * PreToolUse(*) - Ensure tool is in agent's allowed_tools list
 *
 * Purpose: Enforce that spawned agents only use tools in their allowed_tools
 * Trigger: PreToolUse(*) - ALL tools
 * Mode: block (default) | warn | off (TOOL_SCOPE_VALIDATOR env var)
 *
 * Logic:
 * 1. Get current agent's allowed_tools (from spawn context)
 * 2. Get current tool being called
 * 3. If tool not in allowed_tools, block/warn
 * 4. Exception: Allow read-only tools (Read, TaskList, TaskGet, AskUserQuestion) for agents with minimal tools
 */
'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getEnforcementMode,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

// Always allowed tools (safe read-only operations)
const ALWAYS_ALLOWED = ['Read', 'TaskList', 'TaskGet', 'AskUserQuestion'];

async function main() {
  const mode = getEnforcementMode('TOOL_SCOPE_VALIDATOR', 'warn');
  if (mode === 'off') process.exit(0);

  try {
    const hookInput = await parseHookInputAsync();
    const toolName = getToolName(hookInput);

    if (!toolName) process.exit(0);

    // Skip if no agent context (router running or no allowed_tools defined)
    const agentAllowedTools = hookInput.allowed_tools || [];
    if (agentAllowedTools.length === 0) {
      // No allowed_tools restriction - allow all tools
      process.exit(0);
    }

    // Check if tool is in allowed list or is always-allowed
    if (!agentAllowedTools.includes(toolName) && !ALWAYS_ALLOWED.includes(toolName)) {
      const message = `Tool ${toolName} not in allowed_tools: [${agentAllowedTools.join(', ')}]`;

      auditLog('tool-scope-validator', 'tool-out-of-scope', {
        tool: toolName,
        allowedTools: agentAllowedTools,
      });

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        console.warn(`[WARN] ${message}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Tool scope validator error:', err.message);
    process.exit(0);
  }
}

main();
