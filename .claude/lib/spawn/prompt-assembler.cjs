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
const { createLogger } = require('../utils/logger.cjs');

// Load manifests lazily to improve startup time
let TOOL_MANIFEST = null;
let SKILL_INDEX = null;
let PRESETS = null;
const logger = createLogger('prompt-assembler');

/**
 * Load tool manifest (cached)
 */
function getToolManifest() {
  if (!TOOL_MANIFEST) {
    const manifestPath = path.join(PROJECT_ROOT, '.claude/config/tool-manifest.json');
    try {
      TOOL_MANIFEST = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (_e) {
      // Fallback to empty manifest
      TOOL_MANIFEST = {
        tools: { core: [], mcp: [] },
        validation: { agentDefaults: {} },
      };
    }
  }
  return TOOL_MANIFEST;
}

/**
 * Load skill index (cached)
 */
function getSkillIndex() {
  if (!SKILL_INDEX) {
    const indexPath = path.join(PROJECT_ROOT, '.claude/config/skill-index.json');
    try {
      SKILL_INDEX = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (_e) {
      // Fallback to empty index
      SKILL_INDEX = { skills: {} };
    }
  }
  return SKILL_INDEX;
}

/**
 * Load presets (cached)
 */
function loadPresets(projectRoot = PROJECT_ROOT) {
  if (!PRESETS) {
    const presetsPath = path.join(projectRoot, '.claude', 'config', 'presets.json');
    try {
      if (fs.existsSync(presetsPath)) {
        const parsed = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
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
    if (!fs.existsSync(snippetPath)) return '';
    return fs.readFileSync(snippetPath, 'utf-8').trim();
  } catch (_e) {
    return '';
  }
}

/**
 * Get skills by explicit name list.
 *
 * @param {string[]} skillNames
 * @param {number} maxSkills
 * @returns {Array<{name: string, description: string, category: string, requiredTools: string[]}>}
 */
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

/**
 * Load memory context for agent spawn.
 * Non-critical: failures should not prevent agent spawning.
 *
 * @returns {object} Memory context object
 */
function loadMemoryContext() {
  try {
    // Local require to keep prompt assembly fast when memory is unused.
    const memoryManager = require('../memory/memory-manager.cjs');

    // Null check: ensure memoryManager and function exist
    if (!memoryManager || typeof memoryManager.loadMemoryForContext !== 'function') {
      throw new Error('memoryManager.loadMemoryForContext is not available');
    }

    return memoryManager.loadMemoryForContext();
  } catch (err) {
    logger.warn('memory_load_failed', { error: err?.message });
    try {
      const { logMemoryFailure } = require('../monitoring/spawn-log.cjs');
      logMemoryFailure({ error: err?.message || 'memory load failed' });
    } catch (_e) {
      // best-effort
    }
    return {
      gotchas: [],
      patterns: [],
      discoveries: [],
      recent_sessions: [],
      legacy_summary: '',
    };
  }
}

/**
 * Load dynamic behaviour rules (optional).
 * Non-critical: failures should not prevent agent spawning.
 *
 * @param {string} projectRoot
 * @returns {string} Behaviour rules text (comments stripped)
 */
function loadBehaviourRules(projectRoot = PROJECT_ROOT) {
  try {
    const behaviourPath = path.join(projectRoot, '.claude', 'context', 'memory', 'behaviour.md');
    if (!fs.existsSync(behaviourPath)) return '';
    const raw = fs.readFileSync(behaviourPath, 'utf8');
    const lines = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    return lines.join('\n').trim();
  } catch (_e) {
    return '';
  }
}

/**
 * Format behaviour rules as a markdown section.
 *
 * @param {string} rules
 * @returns {string}
 */
function formatBehaviourSection(rules) {
  if (!rules) return '';
  return `## Dynamic behaviour rules\n\n${rules}\n`;
}

/**
 * Format memory context as a markdown section.
 *
 * @param {object} memory
 * @returns {string}
 */
function formatMemorySection(memory) {
  const safe = memory && typeof memory === 'object' ? memory : {};
  const gotchas = Array.isArray(safe.gotchas) ? safe.gotchas : [];
  const patterns = Array.isArray(safe.patterns) ? safe.patterns : [];
  const decisions = Array.isArray(safe.decisions) ? safe.decisions : [];
  const discoveries = Array.isArray(safe.discoveries) ? safe.discoveries : [];
  const recentSessions = Array.isArray(safe.recent_sessions) ? safe.recent_sessions : [];

  const lines = [];
  lines.push('## Memory Context (Auto-Loaded)');
  lines.push('_Recent learnings from past sessions_');
  lines.push('');

  if (gotchas.length > 0) {
    lines.push('### Gotchas (Pitfalls to Avoid)');
    for (const g of gotchas) {
      const text = typeof g === 'string' ? g : g?.text;
      if (text) lines.push(`- ${text}`);
    }
    lines.push('');
  }

  if (patterns.length > 0) {
    lines.push('### Patterns (Reusable Solutions)');
    for (const p of patterns) {
      const text = typeof p === 'string' ? p : p?.text;
      if (text) lines.push(`- ${text}`);
    }
    lines.push('');
  }

  if (decisions.length > 0) {
    lines.push('### Decisions (ADRs)');
    for (const d of decisions) {
      const text = typeof d === 'string' ? d : d?.text;
      if (text) lines.push(`- ${text}`);
    }
    lines.push('');
  }

  if (discoveries.length > 0) {
    lines.push('### Recent Discoveries');
    for (const d of discoveries) {
      const p = d?.path;
      const desc = d?.description;
      if (p && desc) lines.push(`- \`${p}\`: ${desc}`);
    }
    lines.push('');
  }

  if (recentSessions.length > 0) {
    lines.push('### Recent Sessions');
    for (const s of recentSessions.slice(0, 3)) {
      const n = s?.session_number ?? s?.sessionNum;
      const summary = s?.summary || 'No summary';
      if (n !== undefined && n !== null) {
        lines.push(`- Session ${n}: ${summary}`);
      } else {
        lines.push(`- ${summary}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function loadAgentRegistry(projectRoot = PROJECT_ROOT) {
  const registryPath = path.join(projectRoot, '.claude', 'context', 'agent-registry.json');
  if (!fs.existsSync(registryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function findAgentFilePath(agentType, projectRoot = PROJECT_ROOT) {
  const registry = loadAgentRegistry(projectRoot);
  const normalized = String(agentType || '')
    .trim()
    .toLowerCase();
  if (registry && registry.agents && registry.agents[normalized]?.filePath) {
    return registry.agents[normalized].filePath;
  }

  const agentsRoot = path.join(projectRoot, '.claude', 'agents');
  if (!fs.existsSync(agentsRoot)) return '';
  const target = `${normalized}.md`;

  const stack = [agentsRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === target) {
        return full;
      }
    }
  }

  return '';
}

/**
 * Load optional agent prompt overrides.
 *
 * Convention: .claude/agents/<category>/<agentId>/prompts/*.md
 *
 * @param {string} agentType
 * @param {string} projectRoot
 * @returns {string}
 */
function loadAgentPromptOverrides(agentType, projectRoot = PROJECT_ROOT) {
  const agentPath = findAgentFilePath(agentType, projectRoot);
  if (!agentPath) return '';
  const agentDir = path.join(path.dirname(agentPath), path.basename(agentPath, '.md'));
  const promptsDir = path.join(agentDir, 'prompts');
  if (!fs.existsSync(promptsDir)) return '';
  const files = fs
    .readdirSync(promptsDir)
    .filter(file => file.endsWith('.md'))
    .sort();
  if (files.length === 0) return '';
  const chunks = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(promptsDir, file), 'utf8').trim();
    if (content) chunks.push(content);
  }
  return chunks.join('\n\n').trim();
}

/**
 * Filter and describe tools from allowed list
 *
 * @param {string[]} allowedTools - List of tool names
 * @returns {Array<{name: string, description: string, status: string, fallback?: string}>}
 */
function filterAndDescribeTools(allowedTools) {
  const manifest = getToolManifest();
  const result = [];

  for (const toolName of allowedTools) {
    // Look up core tools first
    const coreTool = manifest.tools?.core?.find(t => t.name === toolName);
    if (coreTool) {
      result.push({
        name: coreTool.name,
        description: coreTool.description || `${coreTool.name} tool`,
        status: 'available',
        category: coreTool.category || 'General',
      });
      continue;
    }

    // Check MCP tools
    const mcpTool = manifest.tools?.mcp?.find(
      t => t.name === toolName || t.name.startsWith(toolName.split('__')[0] + '__')
    );
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

    // Unknown tool - still include it with warning
    result.push({
      name: toolName,
      description: `${toolName} tool`,
      status: 'unknown',
      category: 'Unknown',
    });
  }

  return result;
}

/**
 * Get skills recommended for a specific agent type
 *
 * @param {string} agentType - Agent type (developer, qa, planner, etc.)
 * @param {number} maxSkills - Maximum skills to return
 * @returns {Array<{name: string, description: string, category: string}>}
 */
function getSkillsByAgent(agentType, maxSkills = 20) {
  const skillIndex = getSkillIndex();
  const skills = skillIndex.skills || {};
  const result = [];

  // Normalize agent type
  const normalizedType = agentType?.toLowerCase() || 'developer';

  // First, find skills where this agent is primary
  for (const [skillName, skillData] of Object.entries(skills)) {
    if (result.length >= maxSkills) break;

    const isPrimary = skillData.agentPrimary?.some(
      a => a.toLowerCase() === normalizedType || normalizedType.includes(a.toLowerCase())
    );

    if (isPrimary) {
      result.push({
        name: skillName,
        description: skillData.description || `${skillData.displayName || skillName} skill`,
        category: skillData.category || 'General',
        requiredTools: skillData.requiredTools || [],
      });
    }
  }

  // If not enough skills, add supporting skills
  if (result.length < maxSkills) {
    for (const [skillName, skillData] of Object.entries(skills)) {
      if (result.length >= maxSkills) break;
      if (result.some(s => s.name === skillName)) continue; // Already added

      const isSupporting = skillData.agentSupporting?.some(
        a => a.toLowerCase() === normalizedType || normalizedType.includes(a.toLowerCase())
      );

      if (isSupporting) {
        result.push({
          name: skillName,
          description: skillData.description || `${skillData.displayName || skillName} skill`,
          category: skillData.category || 'General',
          requiredTools: skillData.requiredTools || [],
        });
      }
    }
  }

  // If still not enough, add generic high-priority skills
  if (result.length < maxSkills) {
    const genericSkills = [
      'tdd',
      'debugging',
      'code-quality-expert',
      'git-expert',
      'verification-before-completion',
    ];
    for (const skillName of genericSkills) {
      if (result.length >= maxSkills) break;
      if (result.some(s => s.name === skillName)) continue;

      const skillData = skills[skillName];
      if (skillData) {
        result.push({
          name: skillName,
          description: skillData.description || `${skillData.displayName || skillName} skill`,
          category: skillData.category || 'General',
          requiredTools: skillData.requiredTools || [],
        });
      }
    }
  }

  return result;
}

/**
 * Build the AVAILABLE_TOOLS section
 *
 * @param {string[]|Array<{name: string, description: string, status: string}>} tools
 * @returns {string} Markdown section
 */
function buildToolsSection(tools) {
  // If raw tool names, convert to described tools
  const describedTools =
    Array.isArray(tools) && typeof tools[0] === 'string' ? filterAndDescribeTools(tools) : tools;

  const totalTools = describedTools.length;
  const availableCount = describedTools.filter(t => t.status === 'available').length;

  let section = `## AVAILABLE_TOOLS (${availableCount}/${totalTools} tools available)\n\n`;
  section += `Tools your agent can use directly:\n\n`;

  for (const tool of describedTools) {
    const statusIcon =
      tool.status === 'available'
        ? 'Available'
        : tool.status === 'unavailable'
          ? 'Unavailable'
          : 'Unknown';
    section += `- **${tool.name}**: ${tool.description}\n`;
    section += `  Status: ${statusIcon}\n`;

    if (tool.status === 'unavailable' && tool.fallback) {
      section += `  Fallback: ${tool.fallback}\n`;
    }
  }

  // Add mandatory tools warning
  section += `\n**CRITICAL/MANDATORY:** Call TaskUpdate({ taskId, status: "in_progress" }) when starting work.\n`;
  section += `Call TaskUpdate({ taskId, status: "completed" }) when done.\n`;

  return section;
}

/**
 * Build the AVAILABLE_SKILLS section
 *
 * @param {Array<{name: string, description: string, category: string}>} skills
 * @returns {string} Markdown section
 */
function buildSkillsSection(skills) {
  let section = `## AVAILABLE_SKILLS\n\n`;
  section += `Available skills matched to your agent:\n\n`;

  for (const skill of skills) {
    section += `- **${skill.name}**: ${skill.description}`;
    if (skill.category) {
      section += ` (${skill.category})`;
    }
    section += `\n`;
    if (skill.requiredTools?.length > 0) {
      section += `  Required Tools: ${skill.requiredTools.join(', ')}\n`;
    }
    section += `  Usage: Skill({ skill: '${skill.name}' })\n\n`;
  }

  return section;
}

/**
 * Build the SKILL DISCOVERY PROTOCOL section
 *
 * @returns {string} Markdown section
 */
function buildDiscoverySection() {
  return `## SKILL DISCOVERY PROTOCOL

To use a skill, invoke via Skill() tool:

### Example Usage
\`\`\`javascript
Skill({ skill: 'tdd' });        // Invoke TDD workflow
Skill({ skill: 'debugging' });  // Invoke debugging skill
\`\`\`

### Fast Search Defaults (Use These First)
- Prefer ripgrep: \`rg -n "needle" path/\`
- List files quickly: \`rg --files\` (instead of slow directory walks)
- When you need AST-aware search/refactors, prefer hybrid search:
  \`node .claude/tools/cli/index-codebase.cjs search "query"\`
  (uses semantic index + structural refinement via ast-grep when available)
- For change awareness: \`git status --porcelain\` and \`git diff\`

### Finding Capabilities
For a full skill list: Read .claude/context/artifacts/skill-catalog.md
For skill search: Look for skills matching your task domain
For new skills: Domain experts (language-specific agents) have domain-focused skills
`;
}

/**
 * Inject sections into the base prompt at the appropriate location
 *
 * @param {string} basePrompt - Original agent prompt
 * @param {Object} sections - Sections to inject
 * @param {string} sections.toolsSection - AVAILABLE_TOOLS section
 * @param {string} sections.skillsSection - AVAILABLE_SKILLS section
 * @param {string} sections.discoverySection - SKILL DISCOVERY PROTOCOL section
 * @returns {string} Enhanced prompt
 */
function injectSections(basePrompt, sections) {
  if (!basePrompt) {
    // Return just the sections if no base prompt
    const parts = [sections.toolsSection, sections.skillsSection, sections.discoverySection];
    if (sections.memorySection) parts.push(sections.memorySection);
    if (sections.behaviourSection) parts.push(sections.behaviourSection);
    return parts.filter(Boolean).join('\n\n');
  }

  const { toolsSection, skillsSection, discoverySection, memorySection, behaviourSection } =
    sections;

  // Find the best injection point
  // Priority: After warning box, before PROJECT CONTEXT or INSTRUCTIONS

  // Look for PROJECT CONTEXT
  const projectContextMatch = basePrompt.match(/## PROJECT CONTEXT/i);
  const instructionsMatch = basePrompt.match(/## Instructions/i);

  // Find the warning box end (look for the closing line of the box)
  const warningBoxEnd = basePrompt.indexOf(
    '+======================================================================+'
  );
  let lastWarningBoxEnd = warningBoxEnd;
  if (warningBoxEnd !== -1) {
    // Find the second occurrence (end of box)
    const secondBox = basePrompt.indexOf(
      '+======================================================================+',
      warningBoxEnd + 1
    );
    if (secondBox !== -1) {
      lastWarningBoxEnd =
        secondBox +
        '+======================================================================+'.length;
    }
  }

  // Determine injection point
  let injectionPoint;
  let beforeContent = basePrompt;
  let afterContent = '';

  if (projectContextMatch) {
    injectionPoint = projectContextMatch.index;
    beforeContent = basePrompt.slice(0, injectionPoint);
    afterContent = basePrompt.slice(injectionPoint);
  } else if (instructionsMatch) {
    injectionPoint = instructionsMatch.index;
    beforeContent = basePrompt.slice(0, injectionPoint);
    afterContent = basePrompt.slice(injectionPoint);
  } else if (lastWarningBoxEnd > 0) {
    // After warning box
    beforeContent = basePrompt.slice(0, lastWarningBoxEnd);
    afterContent = basePrompt.slice(lastWarningBoxEnd);
  } else {
    // At the end
    beforeContent = basePrompt;
    afterContent = '';
  }

  // Build the enhanced prompt
  const injectedSections = `\n\n${toolsSection}\n\n${skillsSection}\n\n${discoverySection}\n\n`;

  let enhanced = beforeContent + injectedSections + afterContent;

  // Memory section is optional and should appear near the Memory Protocol if possible.
  if (memorySection && !enhanced.includes('## Memory Context (Auto-Loaded)')) {
    const header = '## Memory Protocol';
    const idx = enhanced.toLowerCase().indexOf(header.toLowerCase());
    if (idx !== -1) {
      // Insert after the Memory Protocol section block (until next ## heading).
      const afterHeaderIdx = enhanced.indexOf('\n', idx);
      const nextHeadingIdx = enhanced.indexOf(
        '\n## ',
        afterHeaderIdx === -1 ? idx : afterHeaderIdx
      );
      if (nextHeadingIdx !== -1) {
        enhanced =
          enhanced.slice(0, nextHeadingIdx) +
          `\n\n${memorySection}\n` +
          enhanced.slice(nextHeadingIdx);
      } else {
        enhanced = enhanced + `\n\n${memorySection}\n`;
      }
    } else {
      enhanced = enhanced + `\n\n${memorySection}\n`;
    }
  }

  // Behaviour section should appear after memory section when present.
  if (behaviourSection && !enhanced.includes('## Dynamic behaviour rules')) {
    const marker = '## Memory Context (Auto-Loaded)';
    if (enhanced.includes(marker)) {
      const nextHeaderIdx = enhanced.indexOf('\n## ', enhanced.indexOf(marker) + marker.length);
      if (nextHeaderIdx !== -1) {
        enhanced =
          enhanced.slice(0, nextHeaderIdx) +
          `\n\n${behaviourSection}\n` +
          enhanced.slice(nextHeaderIdx);
      } else {
        enhanced = enhanced + `\n\n${behaviourSection}\n`;
      }
    } else {
      enhanced = enhanced + `\n\n${behaviourSection}\n`;
    }
  }

  return enhanced;
}

/**
 * Assembles a complete spawn prompt with tool/skill awareness
 *
 * @param {Object} options
 *   - agentType: string (developer, qa, planner, etc.)
 *   - allowedTools: string[] (tools agent can use)
 *   - basePrompt: string (agent definition text)
 *   - maxToolsInPrompt: number (max tools to show, default 15)
 *   - maxSkillsInPrompt: number (max skills to show, default 20)
 *
 * @returns {string} Complete prompt ready for spawning
 */
function assembleSpawnPrompt({
  agentType = 'developer',
  allowedTools = [],
  basePrompt = '',
  maxToolsInPrompt = 15,
  maxSkillsInPrompt = 20,
  includeMemory = true,
  presetId = null,
} = {}) {
  // 1. Filter and describe tools (respecting limit)
  const toolsToShow = allowedTools.slice(0, maxToolsInPrompt);
  const describedTools = filterAndDescribeTools(toolsToShow);

  // 2. Get skills for this agent type
  let skills = getSkillsByAgent(agentType, maxSkillsInPrompt);
  if (presetId) {
    const presetSkills = getPresetSkillNames(presetId, PROJECT_ROOT);
    if (presetSkills.length > 0) {
      skills = getSkillsByName(presetSkills, maxSkillsInPrompt);
    }
  }

  // 3. Load memory context (optional)
  const memorySection = includeMemory ? formatMemorySection(loadMemoryContext()) : '';

  // 3b. Load behaviour rules (optional)
  const behaviourSection = formatBehaviourSection(loadBehaviourRules(PROJECT_ROOT));

  // 3c. Load agent prompt overrides (optional)
  const overrides = loadAgentPromptOverrides(agentType, PROJECT_ROOT);
  const ruleSnippet = getPresetRuleSnippet(presetId, PROJECT_ROOT);
  let mergedBasePrompt = overrides ? `${basePrompt}\n\n${overrides}` : basePrompt;
  if (ruleSnippet) {
    mergedBasePrompt = `## Preset Rules\n\n${ruleSnippet}\n\n${mergedBasePrompt}`;
  }

  // 4. Build sections
  const toolsSection = buildToolsSection(describedTools);
  const skillsSection = buildSkillsSection(skills);
  const discoverySection = buildDiscoverySection();

  // 5. Inject sections into prompt
  const enhancedPrompt = injectSections(mergedBasePrompt, {
    toolsSection,
    skillsSection,
    discoverySection,
    memorySection,
    behaviourSection,
  });

  return enhancedPrompt;
}

// Export all functions for testing
module.exports = {
  assembleSpawnPrompt,
  filterAndDescribeTools,
  getSkillsByAgent,
  getSkillsByName,
  buildToolsSection,
  buildSkillsSection,
  buildDiscoverySection,
  injectSections,
  loadMemoryContext,
  loadBehaviourRules,
  loadPresets,
  getPresetSkillNames,
  getPresetRuleSnippet,
  loadAgentPromptOverrides,
  formatMemorySection,
  formatBehaviourSection,
  // For testing cache invalidation
  _clearCache: () => {
    TOOL_MANIFEST = null;
    SKILL_INDEX = null;
    PRESETS = null;
  },
};
