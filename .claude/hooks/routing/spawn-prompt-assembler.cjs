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

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const TOOL_MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-manifest.json');

const MAX_TOOLS_AGENT = 15;
const MAX_TOOLS_ORCHESTRATOR = 18;
const ORCHESTRATOR_IDS = new Set([
  'router',
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
]);

function isDisabled() {
  return process.env.SPAWN_PROMPT_ASSEMBLER === 'off';
}

function isEnricherDisabled() {
  return process.env.ALLOWED_TOOLS_ENRICHER === 'off';
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

  let resolvedType = (agentType || '').toLowerCase();
  if (resolvedType === 'general-purpose' && prompt) {
    const inferred = inferAgentFromPrompt(prompt);
    if (inferred) resolvedType = inferred;
    else resolvedType = 'developer';
  }

  const agent = agents[resolvedType];
  const registryTools = agent?.capabilities?.[0]?.requiredTools;
  if (!Array.isArray(registryTools) || registryTools.length === 0) {
    return currentTools;
  }

  const merged = new Set([...(Array.isArray(currentTools) ? currentTools : []), ...registryTools]);
  const result = [...merged].slice(0, maxTools);
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

    const snippet = String(r?.content || '')
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

async function main() {
  const startTime = Date.now();
  try {
    if (isDisabled()) {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') process.exit(0);

    const toolInput = getToolInput(hookInput);
    if (!toolInput || typeof toolInput !== 'object') process.exit(0);

    const basePrompt = toolInput.prompt;
    if (!basePrompt || typeof basePrompt !== 'string') process.exit(0);

    // Avoid double-injection (can bloat prompts).
    if (looksAssembled(basePrompt)) {
      process.exit(0);
    }

    const promptAssembler = require('../../lib/spawn/prompt-assembler.cjs');

    const agentType = toolInput.subagent_type || toolInput.agent_type || 'developer';
    const rawAllowedTools = Array.isArray(toolInput.allowed_tools) ? toolInput.allowed_tools : [];
    const allowedTools = enrichAllowedTools(agentType, rawAllowedTools, basePrompt);

    let assembled = promptAssembler.assembleSpawnPrompt({
      agentType,
      allowedTools,
      basePrompt,
      includeMemory: true,
    });

    // Optional Phase 3 enhancement: ContextualMemory semantic search.
    // Enabled by default; set SPAWN_PROMPT_SEMANTIC_MEMORY=off to disable.
    if (process.env.SPAWN_PROMPT_SEMANTIC_MEMORY !== 'off') {
      const memoryManager = require('../../lib/memory/memory-manager.cjs');
      const query =
        (toolInput.description && String(toolInput.description).trim()) ||
        String(basePrompt).slice(0, 240);
      const {
        SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
      } = require('../../lib/memory/memory-constants.cjs');
      let results = [];
      try {
        // Hot-only by default: exclude cold-archived LTM summaries from the prompt path.
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
        }
      }
      if (results.length > 0) {
        assembled = appendSemanticMatches(assembled, results);
      }
    }

    if (process.env.SPAWN_PROMPT_ENTITY_GRAPH !== 'off') {
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
        assembled = appendEntityGraph(assembled, { decisions, issues, related });
      } catch (err) {
        debugLog('spawn-prompt-assembler', 'Entity graph retrieval failed (ignored)', err);
      }
    }

    const modifiedInput = { ...toolInput, prompt: assembled, allowed_tools: allowedTools };

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
  appendEntityGraph,
  enrichAllowedTools,
  inferAgentFromPrompt,
  main,
};
