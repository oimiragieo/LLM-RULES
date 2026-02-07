'use strict';

const { loadContext, loadModes } = require('../config/context-mode-loader.cjs');
const {
  getCurrentContextName,
  getCurrentModeNames,
} = require('../config/resolve-runtime-context.cjs');
const { ToolSet } = require('../tools/tool-set.cjs');

/**
 * SEC-TMPL-004 FIX: Sanitize substitution values to prevent recursive placeholder injection
 * Replaces {{ with { { and }} with } } to prevent nested placeholder expansion
 * Uses loop to handle overlapping patterns (e.g., {{{{ → { { { {)
 * @param {string} value - Value to sanitize
 * @returns {string} Sanitized value
 */
function sanitizeSubstitutionValue(value) {
  if (!value || typeof value !== 'string') return value;

  let result = value;
  // Loop until no more {{ or }} patterns exist (handles overlapping)
  while (result.includes('{{') || result.includes('}}')) {
    const prev = result;
    result = result.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
    if (result === prev) break; // Safety: prevent infinite loop
  }

  return result;
}

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
    // SEC-TMPL-004 FIX: Sanitize values before substitution to prevent nested {{placeholder}} injection
    const sanitizedToolNames = sanitizeSubstitutionValue(activeToolNames.join(', '));
    const sanitizedContextPrompt = sanitizeSubstitutionValue(contextPrompt);
    const sanitizedModePrompts = sanitizeSubstitutionValue(modePrompts);

    fragmentBody = fragmentBody.replace(
      /\{\{\s*available_tools\s*\}\}/gi,
      sanitizedToolNames
    );
    fragmentBody = fragmentBody.replace(/\{\{\s*context_system_prompt\s*\}\}/gi, sanitizedContextPrompt);
    fragmentBody = fragmentBody.replace(/\{\{\s*mode_system_prompts\s*\}\}/gi, sanitizedModePrompts);
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
  sanitizeSubstitutionValue, // Export for testing (SEC-TMPL-004)
};
