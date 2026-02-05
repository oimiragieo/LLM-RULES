#!/usr/bin/env node
/**
 * Spawn Prompt Assembler Hook
 * ===========================
 *
 * PreToolUse(Task) hook that assembles agent spawn prompts using
 * `.claude/lib/spawn/prompt-assembler.cjs`.
 *
 * Why this exists:
 * - The Router agent is a prompt file, not executable code.
 * - Without a hook, memory/tools/skills injection only happens if the Router
 *   manually calls assembleSpawnPrompt() (easy to forget).
 * - This hook makes prompt assembly automatic at spawn time.
 *
 * Behavior:
 * - If the Task prompt already contains injected sections, do nothing.
 * - Otherwise, replace `tool_input.prompt` with the assembled prompt.
 * - Optionally appends semantic (ContextualMemory) matches when enabled.
 *
 * Controls:
 * - SPAWN_PROMPT_ASSEMBLER=off  -> disable hook (no modifications)
 * - SPAWN_PROMPT_SEMANTIC_MEMORY=on -> include semantic matches (best-effort)
 *
 * Output (when modifying):
 * - JSON with `tool_input` containing the modified prompt (Claude Code hook protocol).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { buildContextModePrompt } = require('../../lib/spawn/prompt-factory.cjs');
const { getDefaultTools } = require('../../lib/agents/agent-config.cjs');
const { validatePrompt } = require('../safety/spawn-prompt-validator.cjs');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const TOOL_MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-manifest.json');
const _UNIVERSAL_SPAWN_TEMPLATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'templates',
  'spawn',
  'universal-agent-spawn.md'
);

const MAX_TOOLS_AGENT = 15;
const MAX_TOOLS_ORCHESTRATOR = 18;
const ORCHESTRATOR_IDS = new Set([
  'router',
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
]);

/** Log to stderr only (stdout is reserved for single JSON hook output). */
function stderrLog(message, meta = {}) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: message === 'hook_failed' ? 'error' : 'info',
      message,
      component: 'hook:spawn-prompt-assembler',
      tool: 'Task',
      ...meta,
    })
  );
}

/**
 * Generate the required prefix fragment (TaskUpdate Warning Box + PROJECT CONTEXT + Task ID)
 * that the spawn-prompt-validator expects.
 * @param {string|number|null} taskId - Task ID (numeric or string)
 * @param {string} description - Task description/subject
 * @returns {string} The required prefix fragment
 */
function generateRequiredPrefixFragment(taskId, description) {
  const taskIdValue = taskId != null ? String(taskId) : '0';
  const subject = (description || 'Task').slice(0, 80);

  return `+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: ${taskIdValue}                                                  |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "in_progress" });              |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "completed",                   |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: ${PROJECT_ROOT}

All file operations MUST use relative paths from PROJECT_ROOT.
- Agents: .claude/agents/
- Skills: .claude/skills/
- Context: .claude/context/

## Your Assigned Task
Task ID: ${taskIdValue}
Subject: ${subject}`;
}

/**
 * Check if prompt already contains the required TaskUpdate Warning Box
 * @param {string} prompt - The prompt to check
 * @returns {boolean} True if the warning box is present
 */
function hasRequiredWarningBox(prompt) {
  return prompt && typeof prompt === 'string' && prompt.includes('TASK TRACKING REQUIRED');
}

/**
 * Check if prompt already contains a Task ID reference
 * @param {string} prompt - The prompt to check
 * @returns {boolean} True if a Task ID reference is present
 */
function hasTaskIdReference(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  // Match patterns like "Task ID: 123" or "taskId: 123" or "taskId: \"123\""
  return /Task ID:\s{0,10}[<"']?\d{1,20}|taskId:\s{0,10}[<"']?\d{1,20}/i.test(prompt);
}

function isDisabled() {
  return process.env.SPAWN_PROMPT_ASSEMBLER === 'off';
}

function isEnricherDisabled() {
  return process.env.ALLOWED_TOOLS_ENRICHER === 'off';
}

/**
 * Append config model section to assembled prompt (CONFIG-001). Returns assembled unchanged if disabled or on error.
 * @param {string} assembled - Current prompt text
 * @param {string} agentType - Agent type for config lookup
 * @returns {string} Assembled prompt, possibly with model section appended
 */
function appendConfigModelSection(assembled, agentType) {
  if (process.env.SPAWN_PROMPT_INJECT_CONFIG_MODEL === 'off') return assembled;
  try {
    const { getShorthand } = require('../../lib/utils/agent-config-reader.cjs');
    const configResult = resolveConfigModel(agentType);
    const shorthand = configResult && getShorthand(configResult.model);
    if (configResult && configResult.model) {
      const modelSection = [
        '',
        '### Model (from config)',
        `Use model: **${configResult.model}** for this spawn. Invoke Task with \`model: "${configResult.model}"\` (or shorthand \`${shorthand || configResult.model}\`).`,
      ].join('\n');
      return assembled + modelSection;
    }
  } catch (err) {
    debugLog('spawn-prompt-assembler', 'Config model injection failed (ignored)', err);
  }
  return assembled;
}

function resolveConfigModel(agentType) {
  try {
    const { resolveAgentModel } = require('../../lib/utils/agent-config-reader.cjs');
    return resolveAgentModel(agentType, PROJECT_ROOT);
  } catch (err) {
    debugLog('spawn-prompt-assembler', 'Config model resolution failed (ignored)', err);
    return null;
  }
}

/**
 * Load agent-registry and tool-manifest (cached for the hook run).
 */
let _registryCache = null;
let _manifestCache = null;

function loadAgentRegistry() {
  if (_registryCache) return _registryCache;
  try {
    if (fs.existsSync(AGENT_REGISTRY_PATH)) {
      _registryCache = JSON.parse(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
      return _registryCache;
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load agent-registry', e);
  }
  _registryCache = { agents: {} };
  return _registryCache;
}

function loadToolManifest() {
  if (_manifestCache) return _manifestCache;
  try {
    if (fs.existsSync(TOOL_MANIFEST_PATH)) {
      _manifestCache = JSON.parse(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf8'));
      return _manifestCache;
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load tool-manifest', e);
  }
  _manifestCache = {
    constraints: {
      maxToolsPerAgent: MAX_TOOLS_AGENT,
      maxToolsPerOrchestrator: MAX_TOOLS_ORCHESTRATOR,
    },
  };
  return _manifestCache;
}

/**
 * Infer agent type from prompt text (e.g. "You are DEVELOPER" -> developer).
 */
function inferAgentFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const m = prompt.match(/\bYou are (?:the )?([A-Z][A-Za-z_-]+)/);
  if (m) {
    return m[1].toLowerCase().replace(/\s+/g, '-');
  }
  return null;
}

/**
 * Enrich allowed_tools from agent-registry when missing or partial.
 * @param {string} agentType - subagent_type or agent_type
 * @param {string[]} currentTools - existing allowed_tools from Task()
 * @param {string} prompt - prompt text (for inferring agent when agentType is general-purpose)
 * @returns {string[]} Enriched allowed_tools (deduplicated, capped)
 */
function enrichAllowedTools(agentType, currentTools, prompt) {
  if (isEnricherDisabled()) return currentTools;

  const registry = loadAgentRegistry();
  const manifest = loadToolManifest();
  const agents = registry.agents || {};
  const maxTools = ORCHESTRATOR_IDS.has((agentType || '').toLowerCase())
    ? (manifest.constraints?.maxToolsPerOrchestrator ?? MAX_TOOLS_ORCHESTRATOR)
    : (manifest.constraints?.maxToolsPerAgent ?? MAX_TOOLS_AGENT);

  // Extract mandatory tools from manifest (defensive fallback)
  const mandatoryTools = manifest.validation?.mandatoryTools || ['TaskUpdate', 'Skill'];

  let resolvedType = (agentType || '').toLowerCase();
  if (resolvedType === 'general-purpose' && prompt) {
    const inferred = inferAgentFromPrompt(prompt);
    if (inferred) resolvedType = inferred;
    else resolvedType = 'developer';
  }

  const agent = agents[resolvedType];
  const registryTools = agent?.capabilities?.[0]?.requiredTools;
  const toolsToUse =
    Array.isArray(registryTools) && registryTools.length > 0
      ? registryTools
      : getDefaultTools(resolvedType);

  // Merge current tools and registry/config tools
  const merged = new Set([
    ...(Array.isArray(currentTools) ? currentTools : []),
    ...(Array.isArray(toolsToUse) ? toolsToUse : []),
  ]);

  // CRITICAL: Always add mandatory tools (defensive fallback)
  for (const mandatoryTool of mandatoryTools) {
    merged.add(mandatoryTool);
  }

  // Convert to array
  const allTools = [...merged];

  // Separate mandatory tools from other tools to ensure they're always included
  const mandatoryInList = allTools.filter(t => mandatoryTools.includes(t));
  const nonMandatory = allTools.filter(t => !mandatoryTools.includes(t));

  // Cap non-mandatory tools to leave room for mandatory tools
  const maxNonMandatory = maxTools - mandatoryInList.length;
  const cappedNonMandatory = nonMandatory.slice(0, Math.max(0, maxNonMandatory));

  // Combine: mandatory tools first (guaranteed), then non-mandatory up to limit
  const result = [...mandatoryInList, ...cappedNonMandatory];

  // Final safety check: if missing mandatory tools, log warning
  const missingMandatory = mandatoryTools.filter(t => !result.includes(t));
  if (missingMandatory.length > 0) {
    debugLog('spawn-prompt-assembler', 'WARNING: Mandatory tools missing after merge', {
      missing: missingMandatory,
      agentType: resolvedType,
      resultLength: result.length,
      maxTools,
    });
    // Force-add missing tools (this should not happen with the above logic, but defensive)
    for (const missing of missingMandatory) {
      if (result.length >= maxTools) {
        result.pop();
      }
      result.push(missing);
    }
  }

  return result;
}

function looksAssembled(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return (
    prompt.includes('## AVAILABLE_TOOLS') &&
    prompt.includes('## AVAILABLE_SKILLS') &&
    prompt.includes('## SKILL DISCOVERY PROTOCOL')
  );
}

function appendSemanticMatches(prompt, results) {
  if (!Array.isArray(results) || results.length === 0) return prompt;

  const lines = [];
  lines.push('### Semantic Matches (ContextualMemory)');
  lines.push('_Best-effort semantic retrieval based on this task_');
  lines.push('');

  for (const r of results.slice(0, 3)) {
    const src = r?.source || 'unknown';
    const sim = typeof r?.similarity === 'number' ? ` ${(r.similarity * 100).toFixed(1)}%` : '';
    const metaPath = r?.metadata?.path || r?.metadata?.file || r?.metadata?.source || null;
    const where = metaPath ? ` (${metaPath})` : '';

    const displayText = r?.metadata?.abstract || r?.metadata?.overview || String(r?.content || '');
    const snippet = String(displayText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    if (!snippet) continue;
    lines.push(`- [${src}${sim}]${where}: ${snippet}${snippet.length >= 180 ? '...' : ''}`);
  }

  const section = lines.join('\n').trimEnd() + '\n';

  // Prefer to insert inside Memory Context if present, otherwise append at end.
  const marker = '## Memory Context (Auto-Loaded)';
  if (prompt.includes(marker)) {
    const nextHeaderIdx = prompt.indexOf('\n## ', prompt.indexOf(marker) + marker.length);
    if (nextHeaderIdx !== -1) {
      return prompt.slice(0, nextHeaderIdx) + `\n\n${section}\n` + prompt.slice(nextHeaderIdx);
    }
    return prompt + `\n\n${section}\n`;
  }

  return prompt + `\n\n${section}\n`;
}

function appendQueryMemories(prompt, results) {
  if (!Array.isArray(results) || results.length === 0) return prompt;

  const lines = [];
  lines.push('### Relevant Memories (Query)');
  lines.push('_Best-effort retrieval based on the current task_');
  lines.push('');

  for (const r of results.slice(0, 5)) {
    const src = r?.source || 'unknown';
    const sim = typeof r?.similarity === 'number' ? ` ${(r.similarity * 100).toFixed(1)}%` : '';
    const metaPath = r?.metadata?.path || r?.metadata?.file || r?.metadata?.source || null;
    const where = metaPath ? ` (${metaPath})` : '';

    const displayText = r?.metadata?.abstract || r?.metadata?.overview || String(r?.content || '');
    const snippet = String(displayText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    if (!snippet) continue;
    lines.push(`- [${src}${sim}]${where}: ${snippet}${snippet.length >= 180 ? '...' : ''}`);
  }

  const section = lines.join('\n').trimEnd() + '\n';

  const marker = '## Memory Context (Auto-Loaded)';
  if (prompt.includes(marker)) {
    const nextHeaderIdx = prompt.indexOf('\n## ', prompt.indexOf(marker) + marker.length);
    if (nextHeaderIdx !== -1) {
      return prompt.slice(0, nextHeaderIdx) + `\n\n${section}\n` + prompt.slice(nextHeaderIdx);
    }
    return prompt + `\n\n${section}\n`;
  }

  return prompt + `\n\n${section}\n`;
}

function appendEntityGraph(prompt, data) {
  const decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const related = Array.isArray(data?.related) ? data.related : [];

  if (decisions.length === 0 && issues.length === 0 && related.length === 0) {
    return prompt;
  }

  const lines = [];
  lines.push('### Entity Graph (SQLite)');
  lines.push('_Best-effort structured memory from entities/relationships_');
  lines.push('');

  if (decisions.length > 0) {
    lines.push('**Decisions**');
    for (const d of decisions.slice(0, 3)) {
      const name = d?.name || d?.id || 'decision';
      const content = d?.content ? `: ${String(d.content).slice(0, 140)}` : '';
      lines.push(`- ${name}${content}${content.length >= 140 ? '...' : ''}`);
    }
    lines.push('');
  }

  if (issues.length > 0) {
    lines.push('**Issues**');
    for (const i of issues.slice(0, 3)) {
      const name = i?.name || i?.id || 'issue';
      const content = i?.content ? `: ${String(i.content).slice(0, 140)}` : '';
      lines.push(`- ${name}${content}${content.length >= 140 ? '...' : ''}`);
    }
    lines.push('');
  }

  if (related.length > 0) {
    lines.push('**Related**');
    for (const r of related.slice(0, 4)) {
      const ent = r?.entity || r;
      const name = ent?.name || ent?.id || 'entity';
      const relType = r?.relationship_type ? ` (${r.relationship_type})` : '';
      lines.push(`- ${name}${relType}`);
    }
    lines.push('');
  }

  const section = lines.join('\n').trimEnd() + '\n';

  const marker = '## Memory Context (Auto-Loaded)';
  if (prompt.includes(marker)) {
    const nextHeaderIdx = prompt.indexOf('\n## ', prompt.indexOf(marker) + marker.length);
    if (nextHeaderIdx !== -1) {
      return prompt.slice(0, nextHeaderIdx) + `\n\n${section}\n` + prompt.slice(nextHeaderIdx);
    }
    return prompt + `\n\n${section}\n`;
  }

  return prompt + `\n\n${section}\n`;
}

function insertContextModeSection(prompt, fragment) {
  if (!fragment || typeof fragment !== 'string') return prompt;
  if (prompt.includes('## Context / Mode')) return prompt;

  const marker = '## SKILL DISCOVERY PROTOCOL';
  const markerIdx = prompt.indexOf(marker);
  if (markerIdx !== -1) {
    const nextHeaderIdx = prompt.indexOf('\n## ', markerIdx + marker.length);
    if (nextHeaderIdx !== -1) {
      return prompt.slice(0, nextHeaderIdx) + `\n\n${fragment}\n` + prompt.slice(nextHeaderIdx);
    }
    return prompt + `\n\n${fragment}\n`;
  }

  return prompt + `\n\n${fragment}\n`;
}

async function runIntentAnalysis({ memoryManager, query, threshold, projectRoot }) {
  const { analyzeIntent } = require('../../lib/memory/intent-analyzer.cjs');
  const context = await memoryManager.loadMemoryForContextAsync(projectRoot);
  const recentSessions = Array.isArray(context?.recent_sessions) ? context.recent_sessions : [];
  let compressionSummary = recentSessions
    .map(session => `- ${session.summary || ''}`.trim())
    .filter(Boolean)
    .join('\n');
  let recentMessages = recentSessions
    .map(
      session => `[${session.source || 'mtm'}] ${session.timestamp || ''} ${session.summary || ''}`
    )
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  try {
    const { getContextForSearch } = require('../../lib/memory/session-context-for-search.cjs');
    const searchContext = getContextForSearch(query, {
      projectRoot,
      maxArchives: 3,
      maxMessages: 20,
    });
    if (searchContext.summaries.length > 0) {
      compressionSummary = searchContext.summaries
        .map(summary => `- ${summary}`.trim())
        .filter(Boolean)
        .join('\n');
    }
    if (searchContext.recentMessages.length > 0) {
      recentMessages = searchContext.recentMessages.map(line => line.trim()).join('\n');
    }
  } catch (err) {
    debugLog('spawn-prompt-assembler', 'Context for search failed (ignored)', err);
  }

  const analysis = await analyzeIntent(
    {
      compressionSummary,
      recentMessages,
      currentMessage: query,
    },
    {}
  );

  const plannedQueries = Array.isArray(analysis.queries)
    ? analysis.queries
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 5)
    : [];

  const results = [];
  const seen = new Set();
  for (const planned of plannedQueries) {
    if (!planned?.query) continue;
    try {
      const plannedOptions = {
        limit: 2,
        threshold,
        filters: `metadata NOT LIKE '%"source":"ltm_archive"%'`,
      };
      if (planned.context_type === 'memory') {
        plannedOptions.contextType = 'memory';
        if (planned.category) {
          plannedOptions.category = planned.category;
        }
      }
      const plannedResults = await memoryManager.searchMemory(planned.query, plannedOptions);
      for (const r of plannedResults || []) {
        const key = `${r?.source || ''}:${r?.content || ''}`.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        results.push(r);
      }
    } catch (plannedErr) {
      debugLog('spawn-prompt-assembler', 'Intent analysis query failed (ignored)', plannedErr);
    }
  }

  return results;
}

/** Apply semantic memory and optional query memories to assembled prompt (reduces main complexity). */
async function applySemanticMemoryToPrompt(assembled, toolInput, basePrompt) {
  if (process.env.SPAWN_PROMPT_SEMANTIC_MEMORY === 'off') return assembled;
  const memoryQueryEnabled =
    process.env.SPAWN_PROMPT_MEMORY_QUERY === '1' || process.env.SPAWN_PROMPT_MEMORY_QUERY === 'on';
  const memoryManager = require('../../lib/memory/memory-manager.cjs');
  const query =
    (toolInput.description && String(toolInput.description).trim()) ||
    String(basePrompt).slice(0, 240);
  const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = require('../../lib/memory/memory-constants.cjs');
  const intentAnalysisEnabled =
    process.env.MEMORY_INTENT_ANALYSIS === '1' || process.env.MEMORY_INTENT_ANALYSIS === 'on';
  let results = [];

  if (intentAnalysisEnabled) {
    try {
      results = await runIntentAnalysis({
        memoryManager,
        query,
        threshold: SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
        projectRoot: PROJECT_ROOT,
      });
    } catch (err) {
      debugLog('spawn-prompt-assembler', 'Intent analysis failed (ignored)', err);
      stderrLog('hook_failed', { error: err?.message, reason: 'intent_analysis' });
    }
  }

  if (results.length === 0) {
    try {
      results = await memoryManager.searchMemory(query, {
        limit: 3,
        threshold: SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
        filters: `metadata NOT LIKE '%"source":"ltm_archive"%'`,
      });
    } catch (err) {
      debugLog('spawn-prompt-assembler', 'Hot-only filter failed, using unfiltered search', err);
      try {
        results = await memoryManager.searchMemory(query, {
          limit: 3,
          threshold: SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
        });
      } catch (fallbackErr) {
        debugLog(
          'spawn-prompt-assembler',
          'Semantic memory retrieval failed (ignored)',
          fallbackErr
        );
        stderrLog('hook_failed', {
          error: fallbackErr?.message,
          reason: 'memory_or_semantic_load',
        });
      }
    }
  }

  if (memoryQueryEnabled) {
    try {
      const queryResults = await memoryManager.searchMemory(query, {
        limit: 5,
        threshold: SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
      });
      if (queryResults.length > 0) {
        assembled = appendQueryMemories(assembled, queryResults);
      }
    } catch (queryErr) {
      debugLog('spawn-prompt-assembler', 'Memory query retrieval failed (ignored)', queryErr);
    }
  }

  if (!memoryQueryEnabled && results.length > 0) {
    assembled = appendSemanticMatches(assembled, results);
  }
  return assembled;
}

/** Apply entity graph section to assembled prompt (reduces main complexity). */
async function applyEntityGraphToPrompt(assembled) {
  if (process.env.SPAWN_PROMPT_ENTITY_GRAPH === 'off') return assembled;
  try {
    const { ContextualMemory } = require('../../lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory();
    const decisions = await cm.findEntities('decision', { limit: 3 });
    const issues = await cm.findEntities('issue', { limit: 3 });
    const related = [];
    for (const d of decisions.slice(0, 2)) {
      const rel = await cm.getRelated(d.id, { depth: 1 });
      if (Array.isArray(rel)) {
        related.push(...rel.slice(0, 2));
      }
    }
    cm.close();
    return appendEntityGraph(assembled, { decisions, issues, related });
  } catch (err) {
    debugLog('spawn-prompt-assembler', 'Entity graph retrieval failed (ignored)', err);
    return assembled;
  }
}

async function main() {
  const startTime = Date.now();
  try {
    if (isDisabled()) process.exit(0);

    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') process.exit(0);

    const toolInput = getToolInput(hookInput);
    if (!toolInput || typeof toolInput !== 'object') process.exit(0);

    let basePrompt = toolInput.prompt;
    if (!basePrompt || typeof basePrompt !== 'string') process.exit(0);

    if (!hasRequiredWarningBox(basePrompt) || !hasTaskIdReference(basePrompt)) {
      const taskId = toolInput.task_id || toolInput.id || null;
      const description = toolInput.description || '';
      basePrompt = generateRequiredPrefixFragment(taskId, description) + '\n\n' + basePrompt;
      debugLog('spawn-prompt-assembler', 'Prepended required prefix fragment', {
        hasWarningBox: hasRequiredWarningBox(toolInput.prompt),
        hasTaskId: hasTaskIdReference(toolInput.prompt),
        taskId,
      });
    }

    const sessionId = hookInput.session_id || hookInput.sessionId || null;
    stderrLog('hook_start', {
      session_id: sessionId,
      task_id: toolInput.task_id || toolInput.id || null,
    });

    if (looksAssembled(basePrompt)) {
      stderrLog('hook_end', { status: 'already_assembled' });
      process.exit(0);
    }

    const promptAssembler = require('../../lib/spawn/prompt-assembler.cjs');
    const agentType = toolInput.subagent_type || toolInput.agent_type || 'developer';
    const presetId = toolInput.preset_id || toolInput.presetId || null;
    const rawAllowedTools = Array.isArray(toolInput.allowed_tools) ? toolInput.allowed_tools : [];
    const enrichedTools = enrichAllowedTools(agentType, rawAllowedTools, basePrompt);
    const contextMode = buildContextModePrompt({ role: agentType });
    let allowedTools = enrichedTools;
    if (contextMode.hasContextOrMode) {
      const activeSet = new Set(contextMode.activeToolNames);
      const removed = enrichedTools.filter(t => !activeSet.has(t));
      allowedTools = enrichedTools.filter(t => activeSet.has(t));
      if (removed.length > 0) {
        debugLog('spawn-prompt-assembler', 'Context/mode removed tools', {
          removed,
          context: contextMode.contextName,
          modes: contextMode.modeNames,
        });
      }
    }

    let assembled = promptAssembler.assembleSpawnPrompt({
      agentType,
      allowedTools,
      basePrompt,
      includeMemory: true,
      presetId,
    });

    if (contextMode.hasContextOrMode && contextMode.promptFragment) {
      assembled = insertContextModeSection(assembled, contextMode.promptFragment);
    }

    assembled = await applySemanticMemoryToPrompt(assembled, toolInput, basePrompt);
    assembled = await applyEntityGraphToPrompt(assembled);

    // CONFIG-001: Inject configured model into spawn prompt so Router passes it into Task().
    assembled = appendConfigModelSection(assembled, agentType);

    const configModel = resolveConfigModel(agentType);
    const modifiedInput = {
      ...toolInput,
      prompt: assembled,
      allowed_tools: allowedTools,
      model: toolInput.model || configModel?.model || toolInput.model,
    };

    try {
      const { logSpawnStart } = require('../../lib/monitoring/spawn-log.cjs');
      // Generate fallback task_id if not provided (for legacy spawns)
      const taskId =
        toolInput.task_id ||
        toolInput.id ||
        `spawn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Store task_id in router state so spawn_end can retrieve it
      const { setCurrentSpawnTaskId } = require('./router-state.cjs');
      setCurrentSpawnTaskId(taskId);

      logSpawnStart({
        taskId,
        agentType,
        promptLength: assembled.length,
        sessionId,
      });
      // Warn if task_id was not provided (should be required)
      if (!toolInput.task_id && !toolInput.id) {
        stderrLog('missing_task_id', {
          generated: taskId,
          message: 'Task() call missing task_id parameter - generated fallback for traceability',
        });
      }
    } catch (_e) {
      // best-effort
    }

    const validation = validatePrompt(assembled);
    if (
      !validation.isValid ||
      (validation.missingRequired && validation.missingRequired.length > 0)
    ) {
      stderrLog('hook_validation_failed', {
        missingRequired: validation.missingRequired,
        failed: validation.failed,
      });
      process.exit(2);
    }

    // Claude Code hook protocol: output { tool_input: { ... } } to modify tool parameters.
    console.log(JSON.stringify({ tool_input: modifiedInput }));
    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'Task',
        duration: Date.now() - startTime,
        output: {
          status: 'ok',
          modified: true,
        },
      });
    } catch (_err) {
      // Best-effort
    }
    stderrLog('hook_end', { duration_ms: Date.now() - startTime });
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'spawn-prompt-assembler',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    stderrLog('hook_failed', { error: err?.message });
    // Fail open: if we can't assemble, don't block spawns.
    debugLog('spawn-prompt-assembler', 'Hook error (fail open)', err);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  looksAssembled,
  appendSemanticMatches,
  appendQueryMemories,
  appendEntityGraph,
  insertContextModeSection,
  enrichAllowedTools,
  inferAgentFromPrompt,
  generateRequiredPrefixFragment,
  hasRequiredWarningBox,
  hasTaskIdReference,
  main,
};
