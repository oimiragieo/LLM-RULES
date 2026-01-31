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

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

function isDisabled() {
  return process.env.SPAWN_PROMPT_ASSEMBLER === 'off';
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
    const sim =
      typeof r?.similarity === 'number' ? ` ${(r.similarity * 100).toFixed(1)}%` : '';
    const metaPath = r?.metadata?.path || r?.metadata?.file || r?.metadata?.source || null;
    const where = metaPath ? ` (${metaPath})` : '';

    const snippet = String(r?.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
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

async function main() {
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
    const allowedTools = Array.isArray(toolInput.allowed_tools) ? toolInput.allowed_tools : [];

    let assembled = promptAssembler.assembleSpawnPrompt({
      agentType,
      allowedTools,
      basePrompt,
      includeMemory: true,
    });

  // Optional Phase 3 enhancement: ContextualMemory semantic search.
    // Enabled by default; set SPAWN_PROMPT_SEMANTIC_MEMORY=off to disable.
    if (process.env.SPAWN_PROMPT_SEMANTIC_MEMORY !== 'off') {
      try {
        const memoryManager = require('../../lib/memory/memory-manager.cjs');
        const query =
          (toolInput.description && String(toolInput.description).trim()) ||
          String(basePrompt).slice(0, 240);
        const results = await memoryManager.searchMemory(query, { limit: 3, threshold: 0.75 });
        assembled = appendSemanticMatches(assembled, results);
      } catch (err) {
        debugLog('spawn-prompt-assembler', 'Semantic memory retrieval failed (ignored)', err);
      }
    }

    const modifiedInput = { ...toolInput, prompt: assembled };

    // Claude Code hook protocol: output { tool_input: { ... } } to modify tool parameters.
    console.log(JSON.stringify({ tool_input: modifiedInput }));
    process.exit(0);
  } catch (err) {
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
  main,
};
