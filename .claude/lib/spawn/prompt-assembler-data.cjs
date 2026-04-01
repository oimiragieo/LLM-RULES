#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

let TOOL_MANIFEST = null;
let SKILL_INDEX = null;
let PRESETS = null;
let TOOL_LOOKUP_CACHE = null;

const CORE_AGENT_SKILLS = Object.freeze({
  developer: ['tdd', 'debugging', 'code-quality-expert'],
  qa: ['verification-before-completion', 'tdd'],
});

function getToolManifest() {
  if (!TOOL_MANIFEST) {
    const manifestPath = path.join(PROJECT_ROOT, '.claude/config/tool-manifest.json');
    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      TOOL_MANIFEST = safeParseJSON(content, null) || {
        tools: { core: [], mcp: [] },
        validation: { agentDefaults: {} },
      };
    } catch (_e) {
      TOOL_MANIFEST = {
        tools: { core: [], mcp: [] },
        validation: { agentDefaults: {} },
      };
    }
    TOOL_LOOKUP_CACHE = null;
  }
  return TOOL_MANIFEST;
}

function getToolLookupCache() {
  if (TOOL_LOOKUP_CACHE) return TOOL_LOOKUP_CACHE;

  const manifest = getToolManifest();
  const coreMap = new Map();
  const mcpMap = new Map();

  for (const tool of manifest.tools?.core || []) {
    if (tool?.name) coreMap.set(tool.name, tool);
  }

  for (const tool of manifest.tools?.mcp || []) {
    if (!tool?.name) continue;
    mcpMap.set(tool.name, tool);
  }

  TOOL_LOOKUP_CACHE = { coreMap, mcpMap };
  return TOOL_LOOKUP_CACHE;
}

function getSkillIndex() {
  if (!SKILL_INDEX) {
    const indexPath = path.join(PROJECT_ROOT, '.claude/config/skill-index.json');
    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      SKILL_INDEX = safeParseJSON(content, null) || { skills: {} };
    } catch (_e) {
      SKILL_INDEX = { skills: {} };
    }
  }
  return SKILL_INDEX;
}

function loadPresets(projectRoot = PROJECT_ROOT) {
  if (!PRESETS) {
    const presetsPath = path.join(projectRoot, '.claude', 'config', 'presets.json');
    try {
      if (fs.existsSync(presetsPath)) {
        const parsed = safeParseJSON(fs.readFileSync(presetsPath, 'utf-8'), null) || {};
        PRESETS = parsed?.presets || {};
      } else {
        PRESETS = {};
      }
    } catch (_e) {
      PRESETS = {};
    }
  }
  return PRESETS;
}

function getPresetSkillNames(presetId, projectRoot = PROJECT_ROOT) {
  if (!presetId) return [];
  const presets = loadPresets(projectRoot);
  const preset = presets[presetId];
  return Array.isArray(preset?.enabledSkills) ? preset.enabledSkills : [];
}

function getPresetRuleSnippet(presetId, projectRoot = PROJECT_ROOT) {
  if (!presetId) return '';
  const presets = loadPresets(projectRoot);
  const preset = presets[presetId];
  if (!preset?.ruleSnippetPath) return '';
  try {
    const snippetPath = path.resolve(projectRoot, preset.ruleSnippetPath);
    const normalizedProjectRoot = path.normalize(projectRoot);
    const normalizedSnippetPath = path.normalize(snippetPath);

    if (
      !normalizedSnippetPath.startsWith(normalizedProjectRoot + path.sep) &&
      normalizedSnippetPath !== normalizedProjectRoot
    ) {
      return '';
    }

    if (!fs.existsSync(snippetPath)) return '';
    return fs.readFileSync(snippetPath, 'utf-8').trim();
  } catch (_e) {
    return '';
  }
}

function getSkillsByName(skillNames, maxSkills = 20) {
  const skillIndex = getSkillIndex();
  const skills = skillIndex.skills || {};
  const result = [];
  for (const name of skillNames || []) {
    if (result.length >= maxSkills) break;
    const skillData = skills[name];
    if (!skillData) continue;
    result.push({
      name,
      description: skillData.description || `${skillData.displayName || name} skill`,
      category: skillData.category || 'General',
      requiredTools: skillData.requiredTools || [],
    });
  }
  return result;
}

function filterAndDescribeTools(allowedTools) {
  const { coreMap, mcpMap } = getToolLookupCache();
  const result = [];

  for (const toolName of allowedTools) {
    const coreTool = coreMap.get(toolName);
    if (coreTool) {
      result.push({
        name: coreTool.name,
        description: coreTool.description || `${coreTool.name} tool`,
        status: 'available',
        category: coreTool.category || 'General',
      });
      continue;
    }

    const mcpToolExact = mcpMap.get(toolName);
    let mcpTool = mcpToolExact || null;
    if (!mcpTool) {
      const namespacePrefix = `${toolName.split('__')[0]}__`;
      for (const [name, candidate] of mcpMap.entries()) {
        if (name.startsWith(namespacePrefix)) {
          mcpTool = candidate;
          break;
        }
      }
    }
    if (mcpTool) {
      result.push({
        name: toolName,
        description: mcpTool.description || `${toolName} MCP tool`,
        status: mcpTool.status || 'unavailable',
        fallback: mcpTool.fallback || null,
        category: mcpTool.category || 'MCP',
      });
      continue;
    }

    result.push({
      name: toolName,
      description: `${toolName} tool`,
      status: 'unknown',
      category: 'Unknown',
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function getSkillsByAgent(agentType, maxSkills = 20) {
  const skillIndex = getSkillIndex();
  const skills = skillIndex.skills || {};

  const normalizedType = agentType?.toLowerCase() || 'developer';

  // === Tier 1: Primary skills (sorted alphabetically) ===
  const primarySkills = [];
  for (const [skillName, skillData] of Object.entries(skills)) {
    const isPrimary = skillData.agentPrimary?.some(
      a => a.toLowerCase() === normalizedType || normalizedType.includes(a.toLowerCase())
    );
    if (!isPrimary) continue;
    primarySkills.push({
      name: skillName,
      description: skillData.description || `${skillData.displayName || skillName} skill`,
      category: skillData.category || 'General',
      requiredTools: skillData.requiredTools || [],
    });
  }
  primarySkills.sort((a, b) => a.name.localeCompare(b.name));

  // === Tier 2: Supporting skills (sorted alphabetically, excluding primary) ===
  const primaryNames = new Set(primarySkills.map(s => s.name));
  const supportingSkills = [];
  for (const [skillName, skillData] of Object.entries(skills)) {
    if (primaryNames.has(skillName)) continue;
    const isSupporting = skillData.agentSupporting?.some(
      a => a.toLowerCase() === normalizedType || normalizedType.includes(a.toLowerCase())
    );
    if (!isSupporting) continue;
    supportingSkills.push({
      name: skillName,
      description: skillData.description || `${skillData.displayName || skillName} skill`,
      category: skillData.category || 'General',
      requiredTools: skillData.requiredTools || [],
    });
  }
  supportingSkills.sort((a, b) => a.name.localeCompare(b.name));

  // === Tier 3: Generic fallback skills (sorted alphabetically) ===
  const seenNames = new Set([...primaryNames, ...supportingSkills.map(s => s.name)]);
  const genericSkillNames = [
    'tdd',
    'debugging',
    'code-quality-expert',
    'git-expert',
    'verification-before-completion',
  ];
  const genericSkills = [];
  for (const skillName of genericSkillNames) {
    if (seenNames.has(skillName)) continue;
    const skillData = skills[skillName];
    if (!skillData) continue;
    genericSkills.push({
      name: skillName,
      description: skillData.description || `${skillData.displayName || skillName} skill`,
      category: skillData.category || 'General',
      requiredTools: skillData.requiredTools || [],
    });
  }
  genericSkills.sort((a, b) => a.name.localeCompare(b.name));

  // Combine tiers in priority order
  const result = [...primarySkills, ...supportingSkills, ...genericSkills];

  const coreSkills = CORE_AGENT_SKILLS[normalizedType] || [];
  if (coreSkills.length > 0) {
    const prioritized = [];
    for (const coreName of coreSkills) {
      const existing = result.find(s => s.name === coreName);
      if (existing) {
        prioritized.push(existing);
        continue;
      }
      const skillData = skills[coreName];
      if (!skillData) continue;
      prioritized.push({
        name: coreName,
        description: skillData.description || `${skillData.displayName || coreName} skill`,
        category: skillData.category || 'General',
        requiredTools: skillData.requiredTools || [],
      });
    }
    const deduped = [...prioritized, ...result].filter(
      (skill, idx, arr) => arr.findIndex(s => s.name === skill.name) === idx
    );
    return deduped.slice(0, maxSkills);
  }

  return result.slice(0, maxSkills);
}

function clearCaches() {
  TOOL_MANIFEST = null;
  SKILL_INDEX = null;
  PRESETS = null;
}

module.exports = {
  getSkillsByAgent,
  getSkillsByName,
  filterAndDescribeTools,
  loadPresets,
  getPresetSkillNames,
  getPresetRuleSnippet,
  clearCaches,
};
