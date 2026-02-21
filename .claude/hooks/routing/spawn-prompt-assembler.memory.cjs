'use strict';

const path = require('path');

const {
  PROJECT_ROOT,
  libRequire,
  debugLog,
  capTierBSection,
  buildEvidenceId,
} = require('./spawn-prompt-assembler.core.cjs');

/**
 * Prompt injection blocklist patterns (case-insensitive line-level filter).
 * Any line matching one of these patterns is stripped from memory content
 * before injection into agent spawn prompts.
 */
const INJECTION_PATTERNS = [
  /ignore\s+previous/i,
  /ignore\s+all/i,
  /disregard\s+instructions/i,
  /system\s+prompt/i,
  /override/i,
  /you\s+are\s+now/i,
  /forget\s+everything/i,
  /new\s+instructions/i,
];

/**
 * Sanitize memory content by removing lines that match known prompt injection
 * patterns. Logs a warning to stderr when content is filtered.
 *
 * @param {string} content - Raw memory content to sanitize.
 * @param {string} [source] - Optional label for the source (used in warning).
 * @returns {string} Sanitized content with suspicious lines removed.
 */
function sanitizeMemoryContent(content, source) {
  if (typeof content !== 'string' || content.length === 0) return content;

  const lines = content.split('\n');
  const filtered = [];
  const stripped = [];

  for (const line of lines) {
    const matched = INJECTION_PATTERNS.some(pattern => pattern.test(line));
    if (matched) {
      stripped.push(line.trim().slice(0, 120));
    } else {
      filtered.push(line);
    }
  }

  if (stripped.length > 0) {
    const label = source ? ` [source: ${source}]` : '';
    process.stderr.write(
      `[spawn-prompt-assembler] WARN: memory sanitization stripped ${stripped.length} suspicious line(s)${label}: ${JSON.stringify(stripped)}\n`
    );
    return filtered.join('\n');
  }

  return content;
}

function appendSemanticMatches(prompt, results) {
  if (!Array.isArray(results) || results.length === 0) return prompt;

  const lines = [];
  lines.push('### Semantic Matches (ContextualMemory)');
  lines.push('_Best-effort semantic retrieval based on this task_');
  lines.push('_When using these facts, cite the evidence id like [mem:xxxxxxxx]._');
  lines.push('');

  for (const r of results.slice(0, 3)) {
    const src = r?.source || 'unknown';
    const sim = typeof r?.similarity === 'number' ? ` ${(r.similarity * 100).toFixed(1)}%` : '';
    const metaPath = r?.metadata?.path || r?.metadata?.file || r?.metadata?.source || null;
    const where = metaPath ? ` (${metaPath})` : '';

    const rawText = r?.metadata?.abstract || r?.metadata?.overview || String(r?.content || '');
    const sanitizedText = sanitizeMemoryContent(String(rawText || ''), src);
    const snippet = sanitizedText.replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!snippet) continue;
    const evidenceId = buildEvidenceId('mem', snippet);
    lines.push(
      `- [${evidenceId}] [${src}${sim}]${where}: ${snippet}${snippet.length >= 180 ? '...' : ''}`
    );
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
  lines.push('_When using these facts, cite the evidence id like [mem:xxxxxxxx]._');
  lines.push('');

  for (const r of results.slice(0, 5)) {
    const src = r?.source || 'unknown';
    const sim = typeof r?.similarity === 'number' ? ` ${(r.similarity * 100).toFixed(1)}%` : '';
    const metaPath = r?.metadata?.path || r?.metadata?.file || r?.metadata?.source || null;
    const where = metaPath ? ` (${metaPath})` : '';

    const rawText = r?.metadata?.abstract || r?.metadata?.overview || String(r?.content || '');
    const sanitizedText = sanitizeMemoryContent(String(rawText || ''), src);
    const snippet = sanitizedText.replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!snippet) continue;
    const evidenceId = buildEvidenceId('mem', snippet);
    lines.push(
      `- [${evidenceId}] [${src}${sim}]${where}: ${snippet}${snippet.length >= 180 ? '...' : ''}`
    );
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

function pushEntitySection(lines, entities, label, type) {
  if (entities.length === 0) return;
  lines.push(`**${label}**`);
  for (const e of entities.slice(0, 3)) {
    const name = sanitizeMemoryContent(String(e?.name || e?.id || type), `entity:${type}`);
    const raw = e?.content ? String(e.content) : '';
    const sanitized = raw ? sanitizeMemoryContent(raw, `entity:${type}`) : '';
    const suffix = sanitized ? `: ${sanitized.slice(0, 140)}` : '';
    lines.push(`- ${name}${suffix}${suffix.length >= 140 ? '...' : ''}`);
  }
  lines.push('');
}

function pushRelatedSection(lines, related) {
  if (related.length === 0) return;
  lines.push('**Related**');
  for (const r of related.slice(0, 4)) {
    const ent = r?.entity || r;
    const relType = r?.relationship_type ? ` (${r.relationship_type})` : '';
    lines.push(`- ${ent?.name || ent?.id || 'entity'}${relType}`);
  }
  lines.push('');
}

function insertSectionIntoPrompt(prompt, section) {
  const marker = '## Memory Context (Auto-Loaded)';
  if (!prompt.includes(marker)) return prompt + `\n\n${section}\n`;
  const nextHeaderIdx = prompt.indexOf('\n## ', prompt.indexOf(marker) + marker.length);
  if (nextHeaderIdx !== -1) {
    return prompt.slice(0, nextHeaderIdx) + `\n\n${section}\n` + prompt.slice(nextHeaderIdx);
  }
  return prompt + `\n\n${section}\n`;
}

function appendEntityGraph(prompt, data) {
  const decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const related = Array.isArray(data?.related) ? data.related : [];
  const patterns = Array.isArray(data?.patterns) ? data.patterns : [];
  const gotchas = Array.isArray(data?.gotchas) ? data.gotchas : [];

  if ([decisions, issues, related, patterns, gotchas].every(a => a.length === 0)) return prompt;

  const lines = [];
  lines.push('### Entity Graph (SQLite)');
  lines.push('_Best-effort structured memory from entities/relationships_');
  lines.push('');
  pushEntitySection(lines, decisions, 'Decisions', 'decision');
  pushEntitySection(lines, issues, 'Issues', 'issue');
  pushEntitySection(lines, patterns, 'Patterns', 'pattern');
  pushEntitySection(lines, gotchas, 'Gotchas', 'gotcha');
  pushRelatedSection(lines, related);

  const section = capTierBSection(lines.join('\n').trimEnd() + '\n');
  return insertSectionIntoPrompt(prompt, section);
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
    const patterns = await cm.findEntities('pattern', { limit: 3 });
    const gotchas = await cm.findEntities('gotcha', { limit: 3 });
    const related = [];
    for (const d of decisions.slice(0, 2)) {
      const rel = await cm.getRelated(d.id, { depth: 1 });
      if (Array.isArray(rel)) {
        related.push(...rel.slice(0, 2));
      }
    }
    cm.close();
    return appendEntityGraph(assembled, { decisions, issues, patterns, gotchas, related });
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
  sanitizeMemoryContent,
};
