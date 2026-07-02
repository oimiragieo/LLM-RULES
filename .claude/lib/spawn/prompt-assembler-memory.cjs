#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { loadLegacyFileBackedMemory } = require('./prompt-assembler-legacy-memory.cjs');

const logger = createLogger('prompt-assembler');

const MAX_MEMORY_ITEMS_PER_SECTION = 3;
const MAX_MEMORY_ITEM_CHARS = 220;
// Configurable via MEMORY_INJECTION_MAX_CHARS (default 3600, raise to 8000+ when context is cheap)
const MAX_MEMORY_SECTION_CHARS =
  parseInt(process.env.MEMORY_INJECTION_MAX_CHARS || '3600', 10) || 3600;
const DEFAULT_RAG_AT_SPAWN_LIMIT = 5;
const DEFAULT_RAG_AT_SPAWN_MAX_ITEMS = 5;
const DEFAULT_RAG_AT_SPAWN_MAX_CHARS = 1800;
const DEFAULT_RAG_AT_SPAWN_FALLBACK_THRESHOLD = 0.25;
const DEFAULT_MEMORY_MODE = 'hybrid';
const DEFAULT_SUMMARY_BLOCK_MAX_TOKENS = 400;
const DEFAULT_RECENT_OBSERVATIONS_MAX_TOKENS = 400;
const DEFAULT_TIER_B_MAX_TOKENS = 400;
const DEFAULT_OPEN_FINDINGS_MAX_ITEMS = 3;
const DEFAULT_OPEN_FINDINGS_MIN_SEVERITY = 'high';
const DEFAULT_REFLECTION_ACTIONABLE_MAX_ITEMS = 3;

function getTokenLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getNumericValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRagAtSpawnEnabled() {
  return (
    String(process.env.RAG_AT_SPAWN || 'on')
      .trim()
      .toLowerCase() !== 'off'
  );
}

function normalizeMemoryText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipMemoryText(value) {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return '';
  if (normalized.length <= MAX_MEMORY_ITEM_CHARS) return normalized;
  return normalized.slice(0, MAX_MEMORY_ITEM_CHARS - 3) + '...';
}

function buildEvidenceId(prefix, content) {
  const normalized = normalizeMemoryText(content);
  if (!normalized) return `${prefix}:unknown`;
  // M-03: non-security use (cache key / content addressing / UUID namespace); MD5/SHA-1 acceptable
  const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  return `${prefix}:${digest}`;
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function applySectionTokenCap(sectionMarkdown, maxTokens, strategy = 'truncate') {
  const text = String(sectionMarkdown || '');
  const maxChars = Math.max(1, Math.floor(maxTokens * 4));
  if (text.length <= maxChars) return text;
  if (strategy === 'summary' || strategy === 'tierB') {
    return text.slice(0, Math.max(0, maxChars - 3)) + '...';
  }
  return text.slice(0, Math.max(0, maxChars - 3)) + '...';
}

function getMemoryMode() {
  const observationalEnabled = String(
    process.env.OBSERVATIONAL_MEMORY_ENABLED || 'on'
  ).toLowerCase();
  if (observationalEnabled === 'off') {
    return DEFAULT_MEMORY_MODE;
  }

  const configured = String(process.env.MEMORY_MODE || DEFAULT_MEMORY_MODE)
    .trim()
    .toLowerCase();
  return configured === 'observational' ? 'observational' : DEFAULT_MEMORY_MODE;
}

function getMemorySectionBudgets() {
  return {
    summaryTokens: getTokenLimit(
      process.env.MEMORY_SUMMARY_BLOCK_MAX_TOKENS,
      DEFAULT_SUMMARY_BLOCK_MAX_TOKENS
    ),
    observationsTokens: getTokenLimit(
      process.env.MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS,
      DEFAULT_RECENT_OBSERVATIONS_MAX_TOKENS
    ),
    tierBTokens: getTokenLimit(process.env.MEMORY_TIER_B_MAX_TOKENS, DEFAULT_TIER_B_MAX_TOKENS),
  };
}

function formatObservationLine(observation) {
  const topic = String(observation?.topic || '').trim();
  const fact = String(observation?.fact || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!fact) return '';
  if (topic) return `- [${topic}] ${fact}`;
  return `- ${fact}`;
}

function sortObservationsForPrompt(observations) {
  return observations.slice().sort((a, b) => {
    const scoreDelta = Number(b?.score || 0) - Number(a?.score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const confidenceDelta = Number(b?.confidence || 0) - Number(a?.confidence || 0);
    if (confidenceDelta !== 0) return confidenceDelta;
    return Date.parse(String(b?.timestamp || 0)) - Date.parse(String(a?.timestamp || 0));
  });
}

function formatObservationalSection(summary, recentObservations = []) {
  const budgets = getMemorySectionBudgets();
  const normalizedSummary = String(summary || '').trim();
  const summaryText = normalizedSummary || 'No observational summary available yet.';
  const cappedSummary = applySectionTokenCap(summaryText, budgets.summaryTokens, 'summary');
  const sorted = sortObservationsForPrompt(
    Array.isArray(recentObservations) ? recentObservations : []
  );
  const observationLines = [];
  for (const observation of sorted) {
    const line = formatObservationLine(observation);
    if (!line) continue;
    const candidate = [...observationLines, line].join('\n');
    if (estimateTokens(candidate) > budgets.observationsTokens) break;
    observationLines.push(line);
  }

  const lines = [];
  lines.push('## Observational Memory Context');
  lines.push('_Stable summary + recent high-signal observations_');
  lines.push('');
  lines.push('### Observational summary');
  lines.push(cappedSummary);
  lines.push('');
  lines.push('### Recent observations');
  if (observationLines.length === 0) {
    lines.push('- No recent observations recorded.');
  } else {
    lines.push(...observationLines);
  }

  return lines.join('\n');
}

function loadMemoryContext(projectRoot = PROJECT_ROOT) {
  try {
    const memoryManager = require('../memory/memory-manager.cjs');
    if (!memoryManager || typeof memoryManager.loadMemoryForContext !== 'function') {
      throw new Error('memoryManager.loadMemoryForContext is not available');
    }
    const memory = memoryManager.loadMemoryForContext(projectRoot);
    return {
      ...(memory && typeof memory === 'object' ? memory : {}),
      reflection_actionables: loadReflectionActionables(projectRoot),
    };
  } catch (err) {
    logger.warn('memory_load_failed', { error: err?.message });
    try {
      const { logMemoryFailure } = require('../monitoring/spawn-log.cjs');
      logMemoryFailure({ error: err?.message || 'memory load failed' });
    } catch (_e) {
      // best-effort
    }

    const legacyMemory = loadLegacyFileBackedMemory(projectRoot, MAX_MEMORY_SECTION_CHARS);
    return {
      gotchas: legacyMemory.gotchas,
      patterns: legacyMemory.patterns,
      decisions: legacyMemory.decisions,
      discoveries: legacyMemory.discoveries,
      recent_sessions: legacyMemory.recent_sessions,
      legacy_summary: legacyMemory.legacy_summary,
      reflection_actionables: loadReflectionActionables(projectRoot),
    };
  }
}

function loadReflectionActionables(
  projectRoot = PROJECT_ROOT,
  limit = DEFAULT_REFLECTION_ACTIONABLE_MAX_ITEMS
) {
  const maxItems = getPositiveInt(limit, DEFAULT_REFLECTION_ACTIONABLE_MAX_ITEMS);
  const filePath = path.join(projectRoot, '.claude', 'context', 'memory', 'reflection-log.jsonl');
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const entries = content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => safeParseJSON(line, null))
      .filter(entry => entry && typeof entry === 'object');

    const actionables = [];
    const seen = new Set();
    for (const entry of entries.reverse()) {
      if (Array.isArray(entry.actionItems)) {
        for (const item of entry.actionItems) {
          const normalized = normalizeMemoryText(item);
          if (!normalized || seen.has(normalized)) continue;
          seen.add(normalized);
          actionables.push(normalized);
          if (actionables.length >= maxItems) return actionables;
        }
      }

      const summary = normalizeMemoryText(entry.summary || entry.error || '');
      if (summary && !seen.has(summary)) {
        seen.add(summary);
        actionables.push(summary);
        if (actionables.length >= maxItems) return actionables;
      }
    }

    return actionables;
  } catch (_err) {
    return [];
  }
}

function formatReflectionActionablesSection(actionables = []) {
  const items = Array.isArray(actionables) ? actionables : [];
  if (items.length === 0) return [];

  const lines = [];
  lines.push('### Reflection Learnings (Actionable)');
  for (const item of items.slice(0, DEFAULT_REFLECTION_ACTIONABLE_MAX_ITEMS)) {
    const clipped = clipMemoryText(item);
    if (!clipped) continue;
    lines.push(`- [${buildEvidenceId('mem', clipped)}] ${clipped}`);
  }
  lines.push('');
  return lines;
}

function loadObservationalMemory(projectRoot = PROJECT_ROOT) {
  const root = path.resolve(projectRoot || PROJECT_ROOT);
  const summaryPath = path.join(root, '.claude', 'context', 'memory', 'observations_summary.md');

  let summary = '';
  if (fs.existsSync(summaryPath)) {
    try {
      summary = fs.readFileSync(summaryPath, 'utf8').trim();
    } catch (_err) {
      summary = '';
    }
  }

  let recentObservations = [];
  try {
    const observations = require('../memory/observations.cjs');
    const raw = observations.readObservations(root, { limit: 10 });
    recentObservations = observations.scoreObservations(raw);
  } catch (_err) {
    recentObservations = [];
  }

  return { summary, recentObservations };
}

function getOpenFindingsMinSeverity() {
  const configured = String(
    process.env.OPEN_FINDINGS_MIN_SEVERITY || DEFAULT_OPEN_FINDINGS_MIN_SEVERITY
  )
    .trim()
    .toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'unknown'].includes(configured)) {
    return configured;
  }
  return DEFAULT_OPEN_FINDINGS_MIN_SEVERITY;
}

function loadOpenFindings(projectRoot = PROJECT_ROOT, limit = DEFAULT_OPEN_FINDINGS_MAX_ITEMS) {
  try {
    const findingsRegistry = require('../memory/findings-registry.cjs');
    if (!findingsRegistry || typeof findingsRegistry.getOpenFindings !== 'function') {
      return [];
    }
    return findingsRegistry.getOpenFindings(projectRoot, {
      limit,
      minSeverity: getOpenFindingsMinSeverity(),
    });
  } catch (_err) {
    return [];
  }
}

function formatOpenFindingsSection(findings = []) {
  const items = Array.isArray(findings) ? findings : [];
  if (items.length === 0) return '';

  const lines = [];
  lines.push('### Open Findings Carryover');
  for (const finding of items.slice(0, DEFAULT_OPEN_FINDINGS_MAX_ITEMS)) {
    const severity = String(finding?.severity || 'unknown').toUpperCase();
    const summary = String(finding?.summary || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!summary) continue;
    lines.push(`- [${severity}] ${summary}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatMemorySection(memory) {
  const safe = memory && typeof memory === 'object' ? memory : {};
  const gotchas = Array.isArray(safe.gotchas) ? safe.gotchas : [];
  const patterns = Array.isArray(safe.patterns) ? safe.patterns : [];
  const decisions = Array.isArray(safe.decisions) ? safe.decisions : [];
  const discoveries = Array.isArray(safe.discoveries) ? safe.discoveries : [];
  const recentSessions = Array.isArray(safe.recent_sessions) ? safe.recent_sessions : [];
  const reflectionActionables = Array.isArray(safe.reflection_actionables)
    ? safe.reflection_actionables
    : [];

  const lines = [];
  lines.push('## Memory Context (Auto-Loaded)');
  lines.push('_Recent learnings from past sessions_');
  lines.push('_When using these facts, cite the evidence id like [mem:xxxxxxxx]._');
  lines.push('');

  if (gotchas.length > 0) {
    lines.push('### Gotchas (Pitfalls to Avoid)');
    for (const g of gotchas.slice(0, MAX_MEMORY_ITEMS_PER_SECTION)) {
      const text = typeof g === 'string' ? g : g?.text;
      const clipped = clipMemoryText(text);
      if (clipped) lines.push(`- [${buildEvidenceId('mem', clipped)}] ${clipped}`);
    }
    lines.push('');
  }

  if (patterns.length > 0) {
    lines.push('### Patterns (Reusable Solutions)');
    for (const p of patterns.slice(0, MAX_MEMORY_ITEMS_PER_SECTION)) {
      const text = typeof p === 'string' ? p : p?.text;
      const clipped = clipMemoryText(text);
      if (clipped) lines.push(`- [${buildEvidenceId('mem', clipped)}] ${clipped}`);
    }
    lines.push('');
  }

  const reflectionSection = formatReflectionActionablesSection(reflectionActionables);
  if (reflectionSection.length > 0) {
    lines.push(...reflectionSection);
  }

  if (decisions.length > 0) {
    lines.push('### Decisions (ADRs)');
    for (const d of decisions.slice(0, MAX_MEMORY_ITEMS_PER_SECTION)) {
      const text = typeof d === 'string' ? d : d?.text;
      const clipped = clipMemoryText(text);
      if (clipped) lines.push(`- [${buildEvidenceId('mem', clipped)}] ${clipped}`);
    }
    lines.push('');
  }

  if (discoveries.length > 0) {
    lines.push('### Recent Discoveries');
    for (const d of discoveries.slice(0, MAX_MEMORY_ITEMS_PER_SECTION)) {
      const p = d?.path;
      const desc = d?.description;
      const clipped = clipMemoryText(desc);
      if (p && clipped) {
        lines.push(`- [${buildEvidenceId('mem', `${p}:${clipped}`)}] \`${p}\`: ${clipped}`);
      }
    }
    lines.push('');
  }

  if (recentSessions.length > 0) {
    lines.push('### Recent Sessions');
    for (const s of recentSessions.slice(0, MAX_MEMORY_ITEMS_PER_SECTION)) {
      const n = s?.session_number ?? s?.sessionNum;
      const summary = clipMemoryText(s?.summary || 'No summary');
      const evidenceId = buildEvidenceId('mem', `session:${n ?? 'unknown'}:${summary}`);
      if (n !== undefined && n !== null) {
        lines.push(`- [${evidenceId}] Session ${n}: ${summary}`);
      } else {
        lines.push(`- [${evidenceId}] ${summary}`);
      }
    }
    lines.push('');
  }

  const section = lines.join('\n').trimEnd();
  if (section.length <= MAX_MEMORY_SECTION_CHARS) {
    return section;
  }
  return section.slice(0, MAX_MEMORY_SECTION_CHARS - 3) + '...';
}

function formatRagMemorySection(ragResults, options = {}) {
  const items = Array.isArray(ragResults) ? ragResults : [];
  if (items.length === 0) return '';

  const maxItems = getPositiveInt(
    options.maxItems ?? process.env.RAG_AT_SPAWN_MAX_ITEMS,
    DEFAULT_RAG_AT_SPAWN_MAX_ITEMS
  );
  const maxChars = getPositiveInt(
    options.maxChars ?? process.env.RAG_AT_SPAWN_MAX_CHARS,
    DEFAULT_RAG_AT_SPAWN_MAX_CHARS
  );

  const lines = [];
  lines.push('### Task-Relevant Memory (RAG)');
  lines.push('_Semantically matched memory for this task_');
  lines.push('_When using these facts, cite the evidence id like [rag:xxxxxxxx]._');
  lines.push('');

  for (const item of items.slice(0, maxItems)) {
    const content = clipMemoryText(item?.content || item?.text || item?.summary);
    if (!content) continue;
    const similarity = Number(item?.similarity);
    const similarityTag = Number.isFinite(similarity) ? ` (sim: ${similarity.toFixed(2)})` : '';
    lines.push(`- [${buildEvidenceId('rag', content)}] ${content}${similarityTag}`);
  }

  if (lines.length <= 3) return '';

  const section = lines.join('\n');
  if (section.length <= maxChars) return section;
  return section.slice(0, Math.max(0, maxChars - 3)) + '...';
}

async function queryMemoryForSpawn(memoryQuery, { ragLimit, ragThreshold, searchMemoryFn } = {}) {
  if (!isRagAtSpawnEnabled()) return [];

  const query = String(memoryQuery || '').trim();
  if (!query) return [];

  const limit = getPositiveInt(
    ragLimit ?? process.env.RAG_AT_SPAWN_LIMIT,
    DEFAULT_RAG_AT_SPAWN_LIMIT
  );
  const thresholdFromOption = getNumericValue(ragThreshold);
  const thresholdFromEnv = getNumericValue(process.env.RAG_AT_SPAWN_THRESHOLD);
  const adaptiveFallbackEnabled =
    String(process.env.RAG_AT_SPAWN_ADAPTIVE_FALLBACK || 'on')
      .trim()
      .toLowerCase() !== 'off';
  const searchOptions = { limit };
  if (thresholdFromOption !== null) {
    searchOptions.threshold = thresholdFromOption;
  } else if (thresholdFromEnv !== null) {
    searchOptions.threshold = thresholdFromEnv;
  }

  try {
    let searchFn = searchMemoryFn;
    if (typeof searchFn !== 'function') {
      const memoryManager = require('../memory/memory-manager.cjs');
      searchFn = memoryManager?.searchMemory;
    }
    if (typeof searchFn !== 'function') return [];
    const initialResults = await searchFn(query, searchOptions);
    const normalizedInitial = Array.isArray(initialResults) ? initialResults : [];
    if (normalizedInitial.length > 0) return normalizedInitial;

    const hasExplicitThreshold = thresholdFromOption !== null || thresholdFromEnv !== null;
    if (!adaptiveFallbackEnabled || hasExplicitThreshold) {
      return normalizedInitial;
    }

    const fallbackThreshold = getNumericValue(process.env.RAG_AT_SPAWN_FALLBACK_THRESHOLD);
    const fallbackOptions = {
      ...searchOptions,
      threshold:
        fallbackThreshold !== null ? fallbackThreshold : DEFAULT_RAG_AT_SPAWN_FALLBACK_THRESHOLD,
    };
    const fallbackResults = await searchFn(query, fallbackOptions);
    const normalizedFallback = Array.isArray(fallbackResults) ? fallbackResults : [];
    if (normalizedFallback.length > 0) {
      logger.info('spawn_rag_adaptive_fallback_hit', {
        fallback_threshold: fallbackOptions.threshold,
        result_count: normalizedFallback.length,
      });
    }
    return normalizedFallback;
  } catch (err) {
    logger.warn('spawn_rag_memory_search_failed', { error: err?.message });
    return [];
  }
}

function formatAgentTypedMemorySection(agentType, options = {}) {
  try {
    const {
      generateMemorySection,
      getSupportedAgentTypes,
    } = require('../memory/identity-memory-section.cjs');
    const supported = getSupportedAgentTypes();
    if (!supported.includes(agentType)) return '';
    return generateMemorySection(agentType, options);
  } catch (_err) {
    return '';
  }
}

module.exports = {
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
  loadReflectionActionables,
  formatReflectionActionablesSection,
  formatAgentTypedMemorySection,
};
