'use strict';

const { loadContext, loadModes } = require('../config/context-mode-loader.cjs');
const {
  getCurrentContextName,
  getCurrentModeNames,
} = require('../config/resolve-runtime-context.cjs');
const { ToolSet } = require('../tools/tool-set.cjs');

function normalizeModeNames(modeNames) {
  if (!Array.isArray(modeNames)) return [];
  return modeNames.map(mode => String(mode).trim()).filter(Boolean);
}

function buildContextModePrompt(options = {}) {
  const contextName = options.contextName ?? getCurrentContextName();
  const modeNames = normalizeModeNames(options.modeNames ?? getCurrentModeNames());
  const role = options.role || 'developer';
  const readOnly = options.readOnly === true;

  const context = contextName ? loadContext(contextName) : null;
  const modes = modeNames.length > 0 ? loadModes(modeNames) : [];
  const hasContextOrMode = Boolean(context) || modes.length > 0;

  let toolSet = ToolSet.default(role);
  if (context) {
    toolSet = toolSet.apply({
      excluded_tools: context.excluded_tools || [],
      included_optional_tools: context.included_optional_tools || [],
    });
  }
  for (const mode of modes) {
    toolSet = toolSet.apply({
      excluded_tools: mode.excluded_tools || [],
      included_optional_tools: mode.included_optional_tools || [],
    });
  }
  if (readOnly) {
    toolSet = toolSet.withoutEditingTools();
  }

  const activeToolNames = toolSet.getToolNames();
  const contextPrompt = context?.prompt ? String(context.prompt).trim() : '';
  const modePrompts = modes
    .map(mode => (mode?.prompt ? String(mode.prompt).trim() : ''))
    .filter(Boolean)
    .join('\n\n');

  let fragmentBody = [contextPrompt, modePrompts].filter(Boolean).join('\n\n').trim();

  if (fragmentBody) {
    fragmentBody = fragmentBody.replace(
      /\{\{\s*available_tools\s*\}\}/gi,
      activeToolNames.join(', ')
    );
    fragmentBody = fragmentBody.replace(/\{\{\s*context_system_prompt\s*\}\}/gi, contextPrompt);
    fragmentBody = fragmentBody.replace(/\{\{\s*mode_system_prompts\s*\}\}/gi, modePrompts);
  }

  const promptFragment = fragmentBody ? `## Context / Mode\n\n${fragmentBody}` : '';
  const resolvedModeNames = modes.map(mode => mode?.name).filter(Boolean);

  return {
    promptFragment,
    activeToolNames,
    hasContextOrMode,
    contextName: context?.name || contextName || null,
    modeNames: resolvedModeNames.length > 0 ? resolvedModeNames : modeNames,
  };
}

module.exports = {
  buildContextModePrompt,
};
