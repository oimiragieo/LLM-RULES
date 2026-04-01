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
  loadReflectionActionables,
  getOpenFindingsMinSeverity,
  formatObservationalSection,
  formatReflectionActionablesSection,
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
const { loadProjectContext } = require('./prompt-assembler-context.cjs');

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
  if (basePrompt === null || basePrompt === undefined) {
    basePrompt = '';
  }
  if (typeof basePrompt !== 'string') {
    throw new TypeError(`basePrompt must be a string, got ${typeof basePrompt}`);
  }
  const overrides = loadAgentPromptOverrides(agentType, projectRoot);
  const ruleSnippet = getPresetRuleSnippet(presetId, projectRoot);
  let mergedBasePrompt = overrides ? `${basePrompt}\n\n${overrides}` : basePrompt;
  if (ruleSnippet) {
    mergedBasePrompt = `## Preset Rules\n\n${ruleSnippet}\n\n${mergedBasePrompt}`;
  }

  // === DYNAMIC SAFETY PREAMBLE (Patch 3) ===
  // Inject forbidden commands block as suffix so all spawned agents receive it.
  // Guard clause prevents double-injection on pre-assembled prompts.
  // Kill switch: set SPAWN_SAFETY_PREAMBLE=off to disable (e.g. in test environments).
  const SAFETY_PREAMBLE_ENABLED =
    String(process.env.SPAWN_SAFETY_PREAMBLE || 'on').toLowerCase() !== 'off';
  if (SAFETY_PREAMBLE_ENABLED && !mergedBasePrompt.includes('FORBIDDEN COMMANDS')) {
    const safetyPreamble =
      `\n\n## FORBIDDEN COMMANDS (Hard Stop)\n` +
      `- NEVER run \`rm -rf\`, \`git clean -f\`, or bulk-delete without explicit user confirmation of the exact target\n` +
      `- NEVER run \`git push --force\` or \`git reset --hard\` without explicit user authorization\n` +
      `- NEVER use \`shell: true\` with child_process — always use \`shell: false\` with array args\n` +
      `- NEVER write to \`.claude/skills/**\`, \`.claude/agents/**\`, \`.claude/hooks/**\`, \`.claude/workflows/**\` directly — these are Gate 4 creator paths\n` +
      `- When in doubt about a destructive command, stop and ask the user first\n`;
    mergedBasePrompt = mergedBasePrompt + safetyPreamble;
  }
  // === END SAFETY PREAMBLE ===

  // === AGENT PROTOCOL ENFORCEMENT (Patch 4) ===
  // Inject protocol blocks so spawned agents know their role and required contracts.
  // Kill switch: set SPAWN_AGENT_PROTOCOL=off to disable.
  const AGENT_PROTOCOL_ENABLED =
    String(process.env.SPAWN_AGENT_PROTOCOL || 'on').toLowerCase() !== 'off';
  if (AGENT_PROTOCOL_ENABLED && !mergedBasePrompt.includes('SPAWNED AGENT PROTOCOL')) {
    const agentProtocol =
      `\n\n## SPAWNED AGENT PROTOCOL (Mandatory)\n` +
      `You are a **SPAWNED AGENT**, not the Router. You CAN and SHOULD use Write, Edit, Bash, Grep, Glob directly. You MUST use TaskUpdate to report progress.\n\n` +
      `### TaskList-First Rule\n` +
      `Before calling \`TaskCreate\`, you MUST call \`TaskList()\` first. This is enforced by \`routing-guard.cjs\` and will BLOCK your TaskCreate if skipped.\n`;
    mergedBasePrompt = mergedBasePrompt + agentProtocol;
  }
  // === END AGENT PROTOCOL ENFORCEMENT ===

  // === TOKEN REPORTING INJECTION (Patch 5) ===
  // Inject token reporting instruction for planner and orchestrator agents so they
  // report usage at the end of their task. Only these high-level agents get the
  // instruction to avoid noise from leaf agents.
  // Kill switch: set SPAWN_TOKEN_REPORTING=off to disable.
  const TOKEN_REPORTING_ENABLED =
    String(process.env.SPAWN_TOKEN_REPORTING || 'on').toLowerCase() !== 'off';
  const TOKEN_REPORTING_AGENTS = [
    'planner',
    'master-orchestrator',
    'evolution-orchestrator',
    'heartbeat-orchestrator',
    'devops',
  ];
  if (
    TOKEN_REPORTING_ENABLED &&
    TOKEN_REPORTING_AGENTS.includes(agentType) &&
    !mergedBasePrompt.includes('TOKEN USAGE REPORTING')
  ) {
    const tokenReportingBlock =
      `\n\n## TOKEN USAGE REPORTING (End-of-Task)\n` +
      `At the END of your task (before calling TaskUpdate(completed)), report token usage by running:\n` +
      '```\n' +
      'npx ccusage --today 2>&1 || echo "ccusage not available"\n' +
      '```\n' +
      `Include the output in your completion summary so the router can track session costs.\n`;
    mergedBasePrompt = mergedBasePrompt + tokenReportingBlock;
  }
  // === END TOKEN REPORTING INJECTION ===

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

  const projectContext = loadProjectContext({ projectRoot });

  const behaviourSection = formatBehaviourSection(loadBehaviourRules(projectRoot));
  const mergedBasePrompt = buildBasePrompt(basePrompt, agentType, presetId, projectRoot);

  const enhancedPrompt = injectSections(mergedBasePrompt, {
    ...promptSections,
    memorySection,
    projectContextSection: projectContext || '',
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

  const projectContext = loadProjectContext({ projectRoot });

  const behaviourSection = formatBehaviourSection(loadBehaviourRules(projectRoot));
  const mergedBasePrompt = buildBasePrompt(basePrompt, agentType, presetId, projectRoot);

  const enhancedPrompt = injectSections(mergedBasePrompt, {
    ...promptSections,
    memorySection,
    projectContextSection: projectContext || '',
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
  loadReflectionActionables,
  getOpenFindingsMinSeverity,
  formatObservationalSection,
  formatReflectionActionablesSection,
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
