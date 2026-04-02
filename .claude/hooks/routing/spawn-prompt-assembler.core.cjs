'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');
const HOOKS_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

function hooksRequire(modulePath) {
  return require(path.join(HOOKS_DIR, modulePath));
}

const { parseHookInputAsync, getToolName, getToolInput, debugLog, formatResult } = libRequire(
  path.join('utils', 'hook-input.cjs')
);

const { validatePrompt } = hooksRequire(path.join('safety', 'spawn-prompt-validator.cjs'));

const MAX_SPAWN_PROMPT_CHARS = Number(process.env.SPAWN_PROMPT_MAX_CHARS || 40000);
const TRUNCATION_NOTICE = '\n\n[TRUNCATED FOR TOKEN BUDGET]';
const DEFAULT_TIER_B_MAX_TOKENS = 400;
const OBSERVATIONAL_TIER_B_KEYWORDS = [
  'investigate',
  'debug',
  'explore',
  'why',
  'root cause',
  'uncertain',
];
const SPAWN_CACHE_TTL_MS = Number(process.env.SPAWN_ASSEMBLY_CACHE_TTL_MS || 120000);
const SPAWN_CACHE_MAX_ENTRIES = Number(process.env.SPAWN_ASSEMBLY_CACHE_MAX_ENTRIES || 120);
const SPAWN_CACHE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'spawn-assembly-cache.json'
);

function isPerfHarnessEnabled() {
  return process.env.SPAWN_ASSEMBLY_PROFILING === 'true';
}

function isAdaptiveEnrichmentEnabled() {
  const value = String(process.env.SPAWN_ADAPTIVE_ENRICHMENT || '')
    .trim()
    .toLowerCase();
  return value === 'true' || value === '1' || value === 'on';
}

function isSpawnAssemblyCacheEnabled() {
  return process.env.SPAWN_ASSEMBLY_CACHE !== 'off';
}

function createPerfRecorder(enabled) {
  if (!enabled) {
    return {
      mark: () => {},
      done: () => ({ totalMs: 0, phases: {} }),
    };
  }

  const phases = {};
  let previous = process.hrtime.bigint();
  const started = previous;

  function mark(name) {
    const now = process.hrtime.bigint();
    const ms = Number(now - previous) / 1e6;
    phases[name] = Number(ms.toFixed(3));
    previous = now;
  }

  function done() {
    const ended = process.hrtime.bigint();
    const totalMs = Number(ended - started) / 1e6;
    return { totalMs: Number(totalMs.toFixed(3)), phases };
  }

  return { mark, done };
}

/**
 * Compute the full prompt fingerprint (includes per-spawn basePrompt).
 * Returns a single hash string for backward compatibility.
 */
function getPromptFingerprint(input) {
  const hash = crypto.createHash('sha1');
  hash.update(
    JSON.stringify({
      agentType: input.agentType || 'developer',
      presetId: input.presetId || null,
      allowedTools: Array.isArray(input.allowedTools) ? [...input.allowedTools].sort() : [],
      basePrompt: input.basePrompt || '',
      contextFragment: input.contextFragment || '',
      semanticEnabled: input.semanticEnabled !== false,
      entityGraphEnabled: input.entityGraphEnabled !== false,
      skillSectionMode: input.skillSectionMode || 'full',
      configModel: input.configModel || null,
    })
  );
  return hash.digest('hex');
}

/**
 * Compute envelope fingerprint: stable across spawns of same agent type.
 * Excludes basePrompt and contextFragment (per-spawn content).
 * Used for caching the stable prefix (tools, skills, safety) across spawns.
 * TTL: 5 minutes (vs 2 minutes for full fingerprint).
 */
function getEnvelopeFingerprint(input) {
  const hash = crypto.createHash('sha1');
  hash.update(
    JSON.stringify({
      agentType: input.agentType || 'developer',
      presetId: input.presetId || null,
      allowedTools: Array.isArray(input.allowedTools) ? [...input.allowedTools].sort() : [],
      semanticEnabled: input.semanticEnabled !== false,
      entityGraphEnabled: input.entityGraphEnabled !== false,
      skillSectionMode: input.skillSectionMode || 'full',
      configModel: input.configModel || null,
    })
  );
  return hash.digest('hex');
}

function resolveSkillSectionMode() {
  const raw = String(process.env.SPAWN_SKILL_SECTION_MODE || 'names_only')
    .trim()
    .toLowerCase();
  if (raw === 'full') return 'full';
  if (raw === 'names-only' || raw === 'names_only' || raw === 'compact') return 'names_only';
  return 'names_only';
}

function readAssemblyCache() {
  try {
    if (!fs.existsSync(SPAWN_CACHE_PATH)) return { entries: {} };
    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const parsed = safeParseJSON(fs.readFileSync(SPAWN_CACHE_PATH, 'utf8'), null);
    return parsed && typeof parsed === 'object' && parsed.entries ? parsed : { entries: {} };
  } catch (_err) {
    return { entries: {} };
  }
}

function writeAssemblyCache(cache) {
  try {
    const dir = path.dirname(SPAWN_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SPAWN_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_err) {
    // best-effort
  }
}

function pruneAssemblyCache(entries) {
  const now = Date.now();
  const rows = Object.entries(entries || {})
    .map(([key, value]) => ({ key, value }))
    .filter(
      row =>
        row.value &&
        typeof row.value === 'object' &&
        typeof row.value.prompt === 'string' &&
        Number(now - Number(row.value.createdAt || 0)) <= SPAWN_CACHE_TTL_MS
    )
    .sort((a, b) => Number(b.value.lastAccess || 0) - Number(a.value.lastAccess || 0));
  return Object.fromEntries(rows.slice(0, SPAWN_CACHE_MAX_ENTRIES).map(r => [r.key, r.value]));
}

function getCachedAssembly(fingerprint) {
  if (!isSpawnAssemblyCacheEnabled()) return null;
  const cache = readAssemblyCache();
  cache.entries = pruneAssemblyCache(cache.entries);
  const entry = cache.entries[fingerprint];
  if (!entry) {
    writeAssemblyCache(cache);
    return null;
  }
  entry.lastAccess = Date.now();
  cache.entries[fingerprint] = entry;
  writeAssemblyCache(cache);
  return entry.prompt;
}

function putCachedAssembly(fingerprint, prompt) {
  if (!isSpawnAssemblyCacheEnabled()) return;
  const cache = readAssemblyCache();
  const now = Date.now();
  cache.entries = pruneAssemblyCache(cache.entries);
  cache.entries[fingerprint] = {
    prompt,
    createdAt: now,
    lastAccess: now,
  };
  cache.entries = pruneAssemblyCache(cache.entries);
  writeAssemblyCache(cache);
}

function classifyPromptComplexity(toolInput, basePrompt) {
  const description = String(toolInput?.description || '').toLowerCase();
  const prompt = String(basePrompt || '').toLowerCase();
  const text = `${description}\n${prompt}`;
  const complexityKeywords = [
    'security',
    'architecture',
    'migration',
    'refactor',
    'incident',
    'production',
    'orchestrator',
    'multi-agent',
    'consensus',
    'database',
    'performance',
  ];
  const keywordHits = complexityKeywords.filter(k => text.includes(k)).length;
  if (basePrompt.length > 8000 || keywordHits >= 3) return 'high';
  if (basePrompt.length > 2500 || keywordHits >= 1) return 'medium';
  return 'low';
}

function readRecentJsonl(filePath, maxRows = 300) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    const rows = [];
    for (const line of lines.slice(-maxRows)) {
      try {
        const { safeParseJSON: parseJsonl } = require('../../lib/utils/safe-json.cjs');
        const row = parseJsonl(line, null);
        if (row) rows.push(row);
      } catch (_err) {
        // ignore malformed rows
      }
    }
    return rows;
  } catch (_err) {
    return [];
  }
}

function shouldThrottleExpensiveEnrichment(toolInput, basePrompt) {
  if (!isAdaptiveEnrichmentEnabled()) return false;
  if (basePrompt.length > 20000) return true;
  const complexity = classifyPromptComplexity(toolInput, basePrompt);
  if (complexity === 'high') return false;

  const metricsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
  const assemblyRows = readRecentJsonl(path.join(metricsDir, 'spawn-assembly-metrics.jsonl'));
  const tokenRows = readRecentJsonl(path.join(metricsDir, 'token-burn-metrics.jsonl'));
  const recentAssembly = assemblyRows
    .map(r => Number(r.total_ms))
    .filter(Number.isFinite)
    .slice(-40);
  const recentBurn = tokenRows
    .map(r => Number(r.burn_rate_tokens_per_second))
    .filter(Number.isFinite)
    .slice(-40);

  const avg = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const avgAssemblyMs = avg(recentAssembly);
  const avgBurnRate = avg(recentBurn);
  const maxAssemblyMs = Number(process.env.SPAWN_ADAPTIVE_MAX_ASSEMBLY_MS || 220);
  const maxBurnRate = Number(process.env.SPAWN_ADAPTIVE_MAX_BURN_RATE || 650);

  return avgAssemblyMs > maxAssemblyMs || avgBurnRate > maxBurnRate;
}

function getMemoryMode() {
  if (String(process.env.OBSERVATIONAL_MEMORY_ENABLED || 'on').toLowerCase() === 'off') {
    return 'hybrid';
  }
  const mode = String(process.env.MEMORY_MODE || 'hybrid').toLowerCase();
  return mode === 'observational' ? 'observational' : 'hybrid';
}

function isObservationalMode() {
  return getMemoryMode() === 'observational';
}

function shouldUseTierB(toolInput, basePrompt) {
  if (
    toolInput?.memory_depth === true ||
    String(toolInput?.memory_depth || '').toLowerCase() === 'true'
  ) {
    return true;
  }

  const searchable = [toolInput?.description, toolInput?.prompt, toolInput?.user_prompt, basePrompt]
    .filter(value => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();

  if (!searchable) return false;
  return OBSERVATIONAL_TIER_B_KEYWORDS.some(keyword => searchable.includes(keyword));
}

function getTierBTokenBudget() {
  const parsed = Number(process.env.MEMORY_TIER_B_MAX_TOKENS || DEFAULT_TIER_B_MAX_TOKENS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIER_B_MAX_TOKENS;
  return Math.floor(parsed);
}

function capTierBSection(sectionMarkdown) {
  const text = String(sectionMarkdown || '');
  const maxChars = getTierBTokenBudget() * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 3)) + '...';
}

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

function isDisabled() {
  return process.env.SPAWN_PROMPT_ASSEMBLER === 'off';
}

function isEnricherDisabled() {
  return process.env.ALLOWED_TOOLS_ENRICHER === 'off';
}

function isHybridFirstEnabled() {
  return (
    String(process.env.SPAWN_HYBRID_FIRST || 'off')
      .trim()
      .toLowerCase() === 'on'
  );
}

function applyHybridFirstToolPolicy(tools) {
  if (!Array.isArray(tools)) return [];
  if (!isHybridFirstEnabled()) return tools;
  return tools.filter(tool => tool !== 'Grep');
}

function removeTopLevelSection(prompt, header) {
  if (!prompt.includes(header)) return prompt;
  const start = prompt.indexOf(header);
  const next = prompt.indexOf('\n## ', start + header.length);
  if (next === -1) {
    return prompt.slice(0, start).trimEnd();
  }
  return (prompt.slice(0, start) + '\n' + prompt.slice(next + 1)).trim();
}

function removeSubSection(prompt, header) {
  if (!prompt.includes(header)) return prompt;
  const start = prompt.indexOf(header);
  const nextTopLevel = prompt.indexOf('\n## ', start + header.length);
  const nextSameLevel = prompt.indexOf('\n### ', start + header.length);
  let end = -1;
  if (nextTopLevel !== -1 && nextSameLevel !== -1) {
    end = Math.min(nextTopLevel, nextSameLevel);
  } else {
    end = Math.max(nextTopLevel, nextSameLevel);
  }
  if (end === -1) {
    return prompt.slice(0, start).trimEnd();
  }
  return (prompt.slice(0, start) + '\n' + prompt.slice(end + 1)).trim();
}

function isSpawnPromptBudgetLogEnabled() {
  const v = String(process.env.SPAWN_PROMPT_BUDGET_LOG || '')
    .trim()
    .toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

function enforcePromptBudget(prompt) {
  if (!prompt || typeof prompt !== 'string') return prompt;
  if (!Number.isFinite(MAX_SPAWN_PROMPT_CHARS) || MAX_SPAWN_PROMPT_CHARS <= 0) {
    return prompt;
  }
  if (prompt.length <= MAX_SPAWN_PROMPT_CHARS) return prompt;

  const beforeChars = prompt.length;
  let reduced = prompt;
  const removedHeaders = [];
  const removalOrder = [
    { type: 'top', header: '## Memory Context (Auto-Loaded)' },
    { type: 'sub', header: '### Entity Graph (SQLite)' },
    { type: 'sub', header: '### Relevant Memories (Query)' },
    { type: 'sub', header: '### Semantic Matches (ContextualMemory)' },
    { type: 'top', header: '## Agent Constitution' },
    { type: 'top', header: '## Dynamic behaviour rules' },
  ];

  for (const item of removalOrder) {
    if (reduced.length <= MAX_SPAWN_PROMPT_CHARS) break;
    const prev = reduced;
    reduced =
      item.type === 'top'
        ? removeTopLevelSection(reduced, item.header)
        : removeSubSection(reduced, item.header);
    if (reduced !== prev) {
      removedHeaders.push(item.header);
    }
  }

  let hardTruncated = false;
  if (reduced.length > MAX_SPAWN_PROMPT_CHARS) {
    hardTruncated = true;
    const keep = Math.max(0, MAX_SPAWN_PROMPT_CHARS - TRUNCATION_NOTICE.length);
    reduced = reduced.slice(0, keep) + TRUNCATION_NOTICE;
  }

  if (isSpawnPromptBudgetLogEnabled()) {
    stderrLog('spawn_prompt_budget', {
      event: 'spawn_prompt_budget',
      beforeChars,
      afterChars: reduced.length,
      maxChars: MAX_SPAWN_PROMPT_CHARS,
      removedHeaders,
      hardTruncated,
    });
  }

  return reduced;
}

function emitSpawnRagTelemetry(assembledPrompt, memoryQuery) {
  const enabled =
    String(process.env.RAG_AT_SPAWN || 'on')
      .trim()
      .toLowerCase() !== 'off';
  const sectionAdded =
    typeof assembledPrompt === 'string' &&
    assembledPrompt.includes('### Task-Relevant Memory (RAG)');
  const queryLength = String(memoryQuery || '').trim().length;
  const payload = {
    enabled,
    section_added: sectionAdded,
    memory_query_len: queryLength,
  };
  stderrLog('spawn_rag_status', payload);
  return payload;
}

function looksAssembled(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return (
    prompt.includes('## AVAILABLE_TOOLS') &&
    prompt.includes('## AVAILABLE_SKILLS') &&
    prompt.includes('## SKILL DISCOVERY PROTOCOL')
  );
}

function buildEvidenceId(prefix, content) {
  const normalized = String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return `${prefix}:unknown`;
  const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  return `${prefix}:${digest}`;
}

module.exports = {
  PROJECT_ROOT,
  LIB_DIR,
  HOOKS_DIR,
  libRequire,
  hooksRequire,
  parseHookInputAsync,
  getToolName,
  getToolInput,
  debugLog,
  formatResult,
  validatePrompt,
  isPerfHarnessEnabled,
  createPerfRecorder,
  getPromptFingerprint,
  getEnvelopeFingerprint,
  resolveSkillSectionMode,
  getCachedAssembly,
  putCachedAssembly,
  classifyPromptComplexity,
  shouldThrottleExpensiveEnrichment,
  getMemoryMode,
  isObservationalMode,
  shouldUseTierB,
  capTierBSection,
  stderrLog,
  isDisabled,
  isEnricherDisabled,
  applyHybridFirstToolPolicy,
  enforcePromptBudget,
  emitSpawnRagTelemetry,
  looksAssembled,
  buildEvidenceId,
};
