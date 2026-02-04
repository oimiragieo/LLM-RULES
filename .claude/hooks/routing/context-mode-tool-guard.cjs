#!/usr/bin/env node
'use strict';

const { buildContextModePrompt } = require('../../lib/spawn/prompt-factory.cjs');
const {
  parseHookInputSync,
  getEnforcementMode,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

const ENFORCEMENT_ENV = 'CONTEXT_MODE_TOOL_GUARD';

function getToolNameFromInput(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.tool_name) return String(input.tool_name);
  if (input.tool) return String(input.tool);
  if (input.toolName) return String(input.toolName);
  if (input.tool_input && input.tool_input.tool_name) return String(input.tool_input.tool_name);
  if (input.parameters && input.parameters.tool_name) return String(input.parameters.tool_name);
  return null;
}

function evaluateToolGuard(toolName, activeToolNames, enforcementMode) {
  if (!toolName || !Array.isArray(activeToolNames)) {
    return { action: 'allow', message: null };
  }
  if (activeToolNames.includes(toolName)) {
    return { action: 'allow', message: null };
  }
  if (enforcementMode === 'block') {
    return {
      action: 'block',
      message: `Tool '${toolName}' is not allowed in the current context/mode.`,
    };
  }
  if (enforcementMode === 'warn') {
    return {
      action: 'warn',
      message: `Tool '${toolName}' is not allowed in the current context/mode (warn-only).`,
    };
  }
  return { action: 'allow', message: null };
}

function getRoleFromInput(input) {
  if (!input || typeof input !== 'object') return 'developer';
  if (input.subagent_type) return String(input.subagent_type);
  if (input.agent_type) return String(input.agent_type);
  return 'developer';
}

function main() {
  const input = parseHookInputSync();
  const toolName = getToolNameFromInput(input);
  const enforcementMode = getEnforcementMode(ENFORCEMENT_ENV, 'warn');

  if (enforcementMode === 'off') {
    process.exit(0);
  }

  const role = getRoleFromInput(input);
  const contextMode = buildContextModePrompt({ role });

  if (!contextMode || !contextMode.hasContextOrMode) {
    process.exit(0);
  }

  const decision = evaluateToolGuard(toolName, contextMode.activeToolNames || [], enforcementMode);

  if (decision.action === 'block') {
    auditLog('context-mode-tool-guard', 'block', {
      tool: toolName,
      context: contextMode.contextName,
      modes: contextMode.modeNames,
    });
    process.stderr.write(`${decision.message}\n`);
    process.exit(2);
  }

  if (decision.action === 'warn') {
    auditLog('context-mode-tool-guard', 'warn', {
      tool: toolName,
      context: contextMode.contextName,
      modes: contextMode.modeNames,
    });
    process.stderr.write(`${decision.message}\n`);
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  ENFORCEMENT_ENV,
  getToolNameFromInput,
  evaluateToolGuard,
  getRoleFromInput,
  main,
};
