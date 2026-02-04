'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-manifest.json');
const EXTRA_READONLY_EXCLUSIONS = new Set(['TaskStop']);

let manifestCache = null;

function getManifest() {
  if (manifestCache) return manifestCache;
  try {
    manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[tool-set] Failed to load tool manifest: ${err.message}`);
    manifestCache = {
      tools: { core: [], mcp: [], toolsets: {} },
      validation: { agentDefaults: {} },
    };
  }
  return manifestCache;
}

function getAllTools() {
  const manifest = getManifest();
  const core = manifest.tools?.core || [];
  const mcp = manifest.tools?.mcp || [];
  return [...core, ...mcp];
}

function getToolByName(toolName) {
  return getAllTools().find(tool => tool.name === toolName) || null;
}

function isToolOptional(toolName) {
  const tool = getToolByName(toolName);
  return tool ? tool.optional === true : false;
}

function isToolMandatory(toolName) {
  const tool = getToolByName(toolName);
  return tool ? tool.mandatory === true : false;
}

function isCanEdit(toolName) {
  const tool = getToolByName(toolName);
  return tool ? tool.canEdit === true : false;
}

function isValidToolName(toolName) {
  return Boolean(getToolByName(toolName));
}

function normalizeRole(role) {
  return String(role || 'router').trim().toLowerCase();
}

function getRoleToolDefaults(role) {
  const manifest = getManifest();
  const roleKey = normalizeRole(role);
  const agentDefaults = manifest.validation?.agentDefaults || {};
  const toolsets = manifest.tools?.toolsets || {};

  if (roleKey === 'router' && toolsets.ROUTER) {
    return toolsets.ROUTER;
  }
  if (roleKey === 'orchestrator' && toolsets.ORCHESTRATOR) {
    return toolsets.ORCHESTRATOR;
  }
  if (agentDefaults[roleKey]?.tools) {
    return agentDefaults[roleKey].tools;
  }
  const upperRole = roleKey.toUpperCase();
  if (toolsets[upperRole]) {
    return toolsets[upperRole];
  }

  console.warn(`[tool-set] Unknown role "${roleKey}". Falling back to ROUTER toolset.`);
  return toolsets.ROUTER || [];
}

function filterOptionalTools(toolNames) {
  return toolNames.filter(toolName => !isToolOptional(toolName) || isToolMandatory(toolName));
}

function validateToolNames(toolNames, contextLabel) {
  const valid = [];
  for (const toolName of toolNames) {
    if (!isValidToolName(toolName)) {
      console.warn(`[tool-set] Unknown tool "${toolName}" in ${contextLabel}. Ignoring.`);
      continue;
    }
    valid.push(toolName);
  }
  return valid;
}

class ToolSet {
  constructor(toolNames = []) {
    this._names = new Set(toolNames);
  }

  static default(role) {
    const base = filterOptionalTools(getRoleToolDefaults(role));
    const validated = validateToolNames(base, `default(${role})`);
    return new ToolSet(validated);
  }

  apply(...definitions) {
    let names = new Set(this._names);
    for (const def of definitions) {
      if (!def || typeof def !== 'object') continue;
      if (Array.isArray(def.fixed_tools) && def.fixed_tools.length > 0) {
        const validated = validateToolNames(def.fixed_tools, 'fixed_tools');
        names = new Set(validated);
        continue;
      }
      const excluded = validateToolNames(def.excluded_tools || [], 'excluded_tools');
      for (const toolName of excluded) names.delete(toolName);
      const included = validateToolNames(
        def.included_optional_tools || [],
        'included_optional_tools'
      );
      for (const toolName of included) names.add(toolName);
    }
    return new ToolSet([...names]);
  }

  withoutEditingTools() {
    const filtered = [...this._names].filter(
      toolName => !isCanEdit(toolName) && !EXTRA_READONLY_EXCLUSIONS.has(toolName)
    );
    return new ToolSet(filtered);
  }

  getToolNames() {
    return [...this._names];
  }

  includes(toolName) {
    return this._names.has(toolName);
  }
}

module.exports = {
  ToolSet,
  getManifest,
  getToolByName,
  isCanEdit,
  isToolOptional,
  isToolMandatory,
  isValidToolName,
};
