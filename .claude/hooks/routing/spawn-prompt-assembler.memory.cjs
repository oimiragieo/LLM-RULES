'use strict';

const path = require('path');

const {
  PROJECT_ROOT,
  libRequire,
  debugLog,
  capTierBSection,
} = require('./spawn-prompt-assembler.core.cjs');

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

  const section = capTierBSection(lines.join('\n').trimEnd() + '\n');
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

  const section = capTierBSection(lines.join('\n').trimEnd() + '\n');
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

  const section = capTierBSection(lines.join('\n').trimEnd() + '\n');
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
  const { analyzeIntent } = libRequire(path.join('memory', 'intent-analyzer.cjs'));
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
    const { getContextForSearch } = libRequire(
      path.join('memory', 'session-context-for-search.cjs')
    );
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

async function applySemanticMemoryToPrompt(assembled, toolInput, basePrompt, stderrLog) {
  if (process.env.SPAWN_PROMPT_SEMANTIC_MEMORY === 'off') return assembled;
  const memoryQueryEnabled =
    process.env.SPAWN_PROMPT_MEMORY_QUERY === '1' || process.env.SPAWN_PROMPT_MEMORY_QUERY === 'on';
  const memoryManager = libRequire(path.join('memory', 'memory-manager.cjs'));
  const query =
    (toolInput.description && String(toolInput.description).trim()) ||
    String(basePrompt).slice(0, 240);
  const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = libRequire(
    path.join('memory', 'memory-constants.cjs')
  );
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

async function applyEntityGraphToPrompt(assembled) {
  if (process.env.SPAWN_PROMPT_ENTITY_GRAPH === 'off') return assembled;
  try {
    const { ContextualMemory } = libRequire(path.join('memory', 'contextual-memory.cjs'));
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

module.exports = {
  appendSemanticMatches,
  appendQueryMemories,
  appendEntityGraph,
  insertContextModeSection,
  applySemanticMemoryToPrompt,
  applyEntityGraphToPrompt,
};
