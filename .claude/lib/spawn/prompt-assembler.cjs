#!/usr/bin/env node
/**
 * Prompt Assembler - Phase 1D Spawn Prompt Injection
 * ====================================================
 *
 * Assembles complete spawn prompts with tool/skill awareness sections.
 * Injects AVAILABLE_TOOLS and AVAILABLE_SKILLS sections into agent prompts
 * so agents know their capabilities before executing tasks.
 *
 * Phase 1D of the Tool/Skill Awareness architecture.
 *
 * @module prompt-assembler
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const {
  getSkillsByAgent,
  getSkillsByName,
  filterAndDescribeTools,
  loadPresets,
  getPresetSkillNames,
  getPresetRuleSnippet,
  clearCaches,
} = require('./prompt-assembler-data.cjs');
const {
  getMemoryMode,
  getMemorySectionBudgets,
  applySectionTokenCap,
  loadObservationalMemory,
  loadOpenFindings,
  getOpenFindingsMinSeverity,
  formatObservationalSection,
  formatOpenFindingsSection,
  estimateTokens,
  loadMemoryContext,
  formatMemorySection,
  formatRagMemorySection,
  queryMemoryForSpawn,
} = require('./prompt-assembler-memory.cjs');
const {
  normalizeSkillSectionMode,
  buildToolsSection: buildToolsSectionInternal,
  buildSkillsSection,
  buildDiscoverySection,
  injectSections,
} = require('./prompt-assembler-sections.cjs');
const {
  loadAgentPromptOverrides,
  loadBehaviourRules,
  formatBehaviourSection,
} = require('./prompt-assembler-agent.cjs');

const DEFAULT_SKILL_SECTION_MODE = 'full';

let _validateData = null;
try {
  _validateData = require('../utils/schema-validator.cjs').validateData;
} catch (_e) {
  // Schema validator not available -- skip schema validation
}

function buildToolsSection(tools) {
  const describedTools =
    Array.isArray(tools) && typeof tools[0] === 'string' ? filterAndDescribeTools(tools) : tools;
  return buildToolsSectionInternal(describedTools || []);
}

function buildPromptSections({
  agentType,
  allowedTools,
  maxToolsInPrompt,
  maxSkillsInPrompt,
  skillSectionMode,
  presetId,
  projectRoot,
}) {
  const toolsToShow = allowedTools.slice(0, maxToolsInPrompt);
  const describedTools = filterAndDescribeTools(toolsToShow);

  let skills = getSkillsByAgent(agentType, maxSkillsInPrompt);
  if (presetId) {
    const presetSkills = getPresetSkillNames(presetId, projectRoot);
    if (presetSkills.length > 0) {
      skills = getSkillsByName(presetSkills, maxSkillsInPrompt);
    }
  }

  const toolsSection = buildToolsSectionInternal(describedTools);
  const skillsSection = buildSkillsSection(skills, { skillSectionMode });
  const discoverySection = buildDiscoverySection();

  return { toolsSection, skillsSection, discoverySection };
}

function resolveMemorySection(projectRoot) {
  if (getMemoryMode() === 'observational') {
    const observational = loadObservationalMemory(projectRoot);
    const hasObservationalData =
      String(observational.summary || '').trim().length > 0 ||
      (Array.isArray(observational.recentObservations) &&
        observational.recentObservations.length > 0);
    if (hasObservationalData) {
      return formatObservationalSection(observational.summary, observational.recentObservations);
    }
  }

  return formatMemorySection(loadMemoryContext(projectRoot));
}

function appendOpenFindings(memorySection, projectRoot) {
  const openFindingsSection = formatOpenFindingsSection(loadOpenFindings(projectRoot));
  if (!openFindingsSection) return memorySection;
  return memorySection
    ? `${memorySection}\n\n${openFindingsSection.trim()}`
    : openFindingsSection.trim();
}

function buildBasePrompt(basePrompt, agentType, presetId, projectRoot) {
  const overrides = loadAgentPromptOverrides(agentType, projectRoot);
  const ruleSnippet = getPresetRuleSnippet(presetId, projectRoot);
  let mergedBasePrompt = overrides ? `${basePrompt}\n\n${overrides}` : basePrompt;
  if (ruleSnippet) {
    mergedBasePrompt = `## Preset Rules\n\n${ruleSnippet}\n\n${mergedBasePrompt}`;
  }
  return mergedBasePrompt;
}

function recordMemoryChurn(projectRoot, memorySection, includeMemory) {
  if (!includeMemory || !memorySection) return;
  try {
    const { recordMemoryBlockChurn } = require('../memory/observations.cjs');
    recordMemoryBlockChurn(projectRoot, memorySection);
  } catch (_err) {
    // Best-effort metric recording.
  }
}

function assembleSpawnPrompt({
  agentType = 'developer',
  allowedTools = [],
  basePrompt = '',
  maxToolsInPrompt = 15,
  maxSkillsInPrompt = 20,
  skillSectionMode = DEFAULT_SKILL_SECTION_MODE,
  includeMemory = true,
  presetId = null,
  projectRoot = PROJECT_ROOT,
} = {}) {
  const promptSections = buildPromptSections({
    agentType,
    allowedTools,
    maxToolsInPrompt,
    maxSkillsInPrompt,
    skillSectionMode,
    presetId,
    projectRoot,
  });

  let memorySection = '';
  if (includeMemory) {
    memorySection = appendOpenFindings(resolveMemorySection(projectRoot), projectRoot);
  }

  const behaviourSection = formatBehaviourSection(loadBehaviourRules(projectRoot));
  const mergedBasePrompt = buildBasePrompt(basePrompt, agentType, presetId, projectRoot);

  const enhancedPrompt = injectSections(mergedBasePrompt, {
    ...promptSections,
    memorySection,
    behaviourSection,
  });

  recordMemoryChurn(projectRoot, memorySection, includeMemory);
  return enhancedPrompt;
}

async function assembleSpawnPromptAsync(options = {}) {
  const {
    agentType = 'developer',
    allowedTools = [],
    basePrompt = '',
    maxToolsInPrompt = 15,
    maxSkillsInPrompt = 20,
    skillSectionMode = DEFAULT_SKILL_SECTION_MODE,
    includeMemory = true,
    presetId = null,
    projectRoot = PROJECT_ROOT,
    memoryQuery = '',
    ragLimit = null,
    ragThreshold = null,
    searchMemoryFn = null,
  } = options;

  const normalizedQuery = String(memoryQuery || '').trim();
  if (!normalizedQuery) {
    return assembleSpawnPrompt({
      agentType,
      allowedTools,
      basePrompt,
      maxToolsInPrompt,
      maxSkillsInPrompt,
      skillSectionMode,
      includeMemory,
      presetId,
      projectRoot,
    });
  }

  const promptSections = buildPromptSections({
    agentType,
    allowedTools,
    maxToolsInPrompt,
    maxSkillsInPrompt,
    skillSectionMode,
    presetId,
    projectRoot,
  });

  let memorySection = '';
  if (includeMemory) {
    memorySection = resolveMemorySection(projectRoot);

    const ragResults = await queryMemoryForSpawn(normalizedQuery, {
      ragLimit,
      ragThreshold,
      searchMemoryFn,
    });
    const ragSection = formatRagMemorySection(ragResults);
    if (ragSection) {
      memorySection = memorySection ? `${memorySection}\n\n${ragSection}` : ragSection;
    }

    memorySection = appendOpenFindings(memorySection, projectRoot);
  }

  const behaviourSection = formatBehaviourSection(loadBehaviourRules(projectRoot));
  const mergedBasePrompt = buildBasePrompt(basePrompt, agentType, presetId, projectRoot);

  const enhancedPrompt = injectSections(mergedBasePrompt, {
    ...promptSections,
    memorySection,
    behaviourSection,
  });

  recordMemoryChurn(projectRoot, memorySection, includeMemory);
  return enhancedPrompt;
}

function validatePresets(projectRoot = PROJECT_ROOT) {
  if (!_validateData) {
    return { valid: true, errors: null, skipped: true };
  }
  const presetsPath = path.join(projectRoot, '.claude', 'config', 'presets.json');
  try {
    if (!fs.existsSync(presetsPath)) {
      return { valid: true, errors: null, skipped: true };
    }
    const presetsData = safeParseJSON(fs.readFileSync(presetsPath, 'utf-8'), null) || {};
    const schemaPath = path.join(projectRoot, '.claude', 'schemas', 'presets.schema.json');
    return _validateData(presetsData, schemaPath);
  } catch (_e) {
    return { valid: true, errors: null, skipped: true };
  }
}

module.exports = {
  assembleSpawnPrompt,
  filterAndDescribeTools,
  getSkillsByAgent,
  getSkillsByName,
  buildToolsSection,
  buildSkillsSection,
  normalizeSkillSectionMode,
  buildDiscoverySection,
  injectSections,
  getMemoryMode,
  getMemorySectionBudgets,
  applySectionTokenCap,
  loadObservationalMemory,
  loadOpenFindings,
  getOpenFindingsMinSeverity,
  formatObservationalSection,
  formatOpenFindingsSection,
  estimateTokens,
  loadMemoryContext,
  loadBehaviourRules,
  loadPresets,
  getPresetSkillNames,
  getPresetRuleSnippet,
  loadAgentPromptOverrides,
  formatMemorySection,
  formatRagMemorySection,
  formatBehaviourSection,
  assembleSpawnPromptAsync,
  validatePresets,
  _clearCache: () => {
    clearCaches();
  },
};
