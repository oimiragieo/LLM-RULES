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
 * - SPAWN_SKILL_SECTION_MODE=names_only|full -> skill metadata verbosity
 * - SPAWN_ASSEMBLY_PROFILING=true -> emit dev-only assembly/tokens metrics JSONL
 *
 * Output (when modifying):
 * - JSON with `tool_input` containing the modified prompt (Claude Code hook protocol).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Resolve project root for absolute path resolution
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');
const HOOKS_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks');

// Helper to require from lib directory
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

// Helper to require from hooks directory
function hooksRequire(modulePath) {
  return require(path.join(HOOKS_DIR, modulePath));
}

const { parseHookInputAsync, getToolName, getToolInput, debugLog } = libRequire(
  path.join('utils', 'hook-input.cjs')
);

const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));
const { buildContextModePrompt } = libRequire(path.join('spawn', 'prompt-factory.cjs'));
const { getDefaultTools } = libRequire(path.join('agents', 'agent-config.cjs'));
const { validatePrompt } = hooksRequire(path.join('safety', 'spawn-prompt-validator.cjs'));

// FIX HIGH-003: Spawn Prompt Injection Defense
/**
 * Sanitize task prompt to prevent prompt injection attacks.
 * Blocks instruction override patterns and escapes system-like markdown.
 * Security Control: SEC-004 (transparency markers), SEC-003 (input sanitization)
 * @param {string} prompt - The task prompt to sanitize
 * @returns {string} Sanitized prompt
 */
function sanitizeTaskPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  // Remove instruction override attempts (case-insensitive)
  const overridePatterns = [
    /IGNORE\s+(PREVIOUS|ALL\s+PRIOR|SYSTEM)\s+INSTRUCTIONS/gi,
    /DISREGARD\s+(EVERYTHING|ALL\s+PREVIOUS)/gi,
    /YOU\s+ARE\s+NOW\s+A\s+[A-Z\s]+AGENT/gi,
    /SYSTEM\s+PROMPT\s+OVERRIDE/gi,
    /FORGET\s+(EVERYTHING|ALL\s+PREVIOUS)/gi,
  ];

  let sanitized = prompt;
  for (const pattern of overridePatterns) {
    sanitized = sanitized.replace(pattern, '[BLOCKED: Injection Pattern]');
  }

  // Escape markdown that looks like system instructions
  // Pattern: # System: or ## Instruction: or ### Override:
  sanitized = sanitized.replace(
    /^(#{1,3}\s+)?(System|Instruction|Override|IMPORTANT|CRITICAL|MANDATORY):/gim,
    '\\$&'
  );

  return sanitized;
}

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
const ORCHESTRATOR_IDS = new Set([
  'router',
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
]);
const TASK_ID_REFERENCE_REGEX =
  /Task ID:\s{0,10}[<"']?[a-zA-Z0-9_-]{1,64}|taskId:\s{0,10}[<"']?[a-zA-Z0-9_-]{1,64}/i;

function isPerfHarnessEnabled() {
  return process.env.SPAWN_ASSEMBLY_PROFILING === 'true';
}

function isAdaptiveEnrichmentEnabled() {
  return process.env.SPAWN_ADAPTIVE_ENRICHMENT === 'true';
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
    const parsed = JSON.parse(fs.readFileSync(SPAWN_CACHE_PATH, 'utf8'));
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
        rows.push(JSON.parse(line));
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
  const complexity = classifyPromptComplexity(toolInput, basePrompt);
  if (complexity === 'high') return false;
  if (basePrompt.length > 20000) return true;

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
  const taskIdValue = taskId != null ? String(taskId) : 'MISSING_TASK_ID';
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
  return TASK_ID_REFERENCE_REGEX.test(prompt);
}

function normalizeTaskIdReferences(prompt, taskId) {
  if (!prompt || typeof prompt !== 'string') return prompt;
  if (taskId == null) return prompt;
  const normalizedTaskId = String(taskId);
  if (!normalizedTaskId) return prompt;

  return prompt
    .replace(/(\*\*Task ID\*\*:\s*)([a-zA-Z0-9_-]{1,64})/gi, `$1${normalizedTaskId}`)
    .replace(/(Task ID:\s*)([a-zA-Z0-9_-]{1,64})/gi, `$1${normalizedTaskId}`)
    .replace(/(taskId\s*:\s*['"])([^'"]+)(['"])/gi, `$1${normalizedTaskId}$3`)
    .replace(/(task_id\s*:\s*['"])([^'"]+)(['"])/gi, `$1${normalizedTaskId}$3`);
}

const STALE_PATH_REWRITES = Object.freeze({
  '.claude/lib/memory/memory-query.cjs': '.claude/lib/memory/core/memory-query.cjs',
  '.claude/lib/utils/safe-json-parse.cjs': '.claude/lib/utils/safe-json.cjs',
  'tests/metrics/metrics-schema-contract.test.cjs':
    'tests/lib/monitoring/metrics-schema-contract.test.cjs',
  'tests/metrics/metrics-reader-rollups.test.cjs':
    'tests/lib/monitoring/metrics-reader-rollups.test.cjs',
  '.claude/context/artifacts/research-reports/p0-fix-research-2026-02-13.md':
    '.claude/context/reports/p0-fix-research-2026-02-13.md',
  '.claude/context/artifacts/research-reports/implementation-patterns-research-2026-02-13.md':
    '.claude/context/reports/implementation-patterns-research-2026-02-13.md',
});

function normalizeStalePathReferences(prompt) {
  if (!prompt || typeof prompt !== 'string') return prompt;

  let normalized = prompt;
  for (const [oldPath, newPath] of Object.entries(STALE_PATH_REWRITES)) {
    normalized = normalized.replaceAll(oldPath, newPath);
  }
  return normalized;
}

function hasExplicitTaskId(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const taskId = toolInput.task_id || toolInput.id || null;
  return typeof taskId === 'string' || typeof taskId === 'number';
}

function generateFallbackTaskId(hookInput, toolInput) {
  const rawSessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'session';
  const sessionPart =
    String(rawSessionId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12) || 'session';
  const description =
    typeof toolInput?.description === 'string' ? toolInput.description.toLowerCase() : '';
  const hint =
    description
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'spawn';
  return `task-${sessionPart}-${hint}-${Date.now().toString(36)}`;
}

function ensureTaskId(toolInput, hookInput) {
  const currentTaskId = toolInput?.task_id || toolInput?.id || null;
  if (typeof currentTaskId === 'string' || typeof currentTaskId === 'number') {
    if (toolInput?.task_id != null) {
      return { toolInput, modified: false, taskId: currentTaskId };
    }
    return {
      toolInput: { ...toolInput, task_id: String(currentTaskId) },
      modified: true,
      taskId: String(currentTaskId),
    };
  }

  const generatedTaskId = generateFallbackTaskId(hookInput, toolInput);
  return {
    toolInput: { ...toolInput, task_id: generatedTaskId },
    modified: true,
    taskId: generatedTaskId,
  };
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

/**
 * Append config model section to assembled prompt (CONFIG-001). Returns assembled unchanged if disabled or on error.
 * @param {string} assembled - Current prompt text
 * @param {string} agentType - Agent type for config lookup
 * @returns {string} Assembled prompt, possibly with model section appended
 */
function appendConfigModelSection(assembled, configResult) {
  if (process.env.SPAWN_PROMPT_INJECT_CONFIG_MODEL === 'off') return assembled;
  if (assembled.includes('### Model (from config)')) return assembled;
  try {
    const { getShorthand } = libRequire(path.join('utils', 'agent-config-reader.cjs'));
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
    const { resolveAgentModel } = libRequire(path.join('utils', 'agent-config-reader.cjs'));
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

/**
 * Cache for constitution and behaviour content (loaded once per hook execution).
 */
let _constitutionCache = null;

/**
 * Load constitution.md and behaviour.md with graceful fallback if missing.
 * Content is cached for the hook run to avoid repeated file reads.
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ constitution: string, behaviour: string }}
 */
function loadConstitutionContext(projectRoot) {
  if (_constitutionCache) return _constitutionCache;

  const constitutionPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'memory',
    'constitution.md'
  );
  const behaviourPath = path.join(projectRoot, '.claude', 'context', 'memory', 'behaviour.md');

  let constitution = '';
  let behaviour = '';

  try {
    if (fs.existsSync(constitutionPath)) {
      constitution = fs.readFileSync(constitutionPath, 'utf8');
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load constitution.md (ignored)', e);
  }

  try {
    if (fs.existsSync(behaviourPath)) {
      behaviour = fs.readFileSync(behaviourPath, 'utf8');
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load behaviour.md (ignored)', e);
  }

  _constitutionCache = { constitution, behaviour };
  return _constitutionCache;
}

/**
 * Append Agent Constitution section to assembled prompt.
 * @param {string} assembled - Current assembled prompt
 * @param {{ constitution: string, behaviour: string }} context - Constitution context
 * @returns {string} Assembled prompt with constitution section appended
 */
function appendConstitutionSection(assembled, context) {
  const { constitution, behaviour } = context;

  // If both are empty, don't add section
  if (!constitution && !behaviour) return assembled;

  // Don't duplicate if section already exists
  if (assembled.includes('## Agent Constitution')) return assembled;

  const lines = [];
  lines.push('## Agent Constitution');
  lines.push('');
  lines.push('These principles guide all agent behavior in this framework:');
  lines.push('');

  const clip = (text, max) => {
    const normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return normalized.slice(0, max - 3) + '...';
  };

  if (constitution) {
    lines.push(clip(constitution, 1800));
  }

  if (behaviour) {
    if (constitution) lines.push(''); // Add spacing between sections
    lines.push(clip(behaviour, 1200));
  }

  const section = lines.join('\n') + '\n';

  // Insert before Memory Context if present, otherwise append at end
  const marker = '## Memory Context (Auto-Loaded)';
  if (assembled.includes(marker)) {
    const markerIdx = assembled.indexOf(marker);
    return assembled.slice(0, markerIdx) + `${section}\n` + assembled.slice(markerIdx);
  }

  return assembled + `\n${section}`;
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

function enforcePromptBudget(prompt) {
  if (!prompt || typeof prompt !== 'string') return prompt;
  if (!Number.isFinite(MAX_SPAWN_PROMPT_CHARS) || MAX_SPAWN_PROMPT_CHARS <= 0) {
    return prompt;
  }
  if (prompt.length <= MAX_SPAWN_PROMPT_CHARS) return prompt;

  let reduced = prompt;
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
    reduced =
      item.type === 'top'
        ? removeTopLevelSection(reduced, item.header)
        : removeSubSection(reduced, item.header);
  }

  if (reduced.length > MAX_SPAWN_PROMPT_CHARS) {
    const keep = Math.max(0, MAX_SPAWN_PROMPT_CHARS - TRUNCATION_NOTICE.length);
    reduced = reduced.slice(0, keep) + TRUNCATION_NOTICE;
  }

  return reduced;
}

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

function hasAnyTool(tools, candidates) {
  if (!Array.isArray(tools) || tools.length === 0) return false;
  const set = new Set(tools);
  return candidates.some(candidate => set.has(candidate));
}

function isUnderProvisionedExplicitTools(currentTools, prompt) {
  if (!Array.isArray(currentTools) || currentTools.length === 0) return false;

  const functionalTools = applyHybridFirstToolPolicy([
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebSearch',
    'WebFetch',
    'Skill',
  ]);
  const hasFunctionalTools = hasAnyTool(currentTools, functionalTools);
  if (!hasFunctionalTools) return true;

  const promptText = String(prompt || '');
  const requiresReportArtifact =
    /(?:^|[\s`'"])\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(promptText) ||
    /\b(?:write|create|save|output|generate)\b[\s\S]{0,100}\breport\b/i.test(promptText);
  const hasArtifactWriter = hasAnyTool(currentTools, ['Write', 'Edit']);

  return requiresReportArtifact && !hasArtifactWriter;
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
  const requiredCollaborationTools = ['TaskUpdate', 'TaskList'];
  const manifestMandatory = manifest.validation?.mandatoryTools || ['TaskUpdate', 'Skill'];
  const mandatoryTools = [...new Set([...manifestMandatory, ...requiredCollaborationTools])];

  let resolvedType = (agentType || '').toLowerCase();
  if (resolvedType === 'general-purpose' && prompt) {
    const inferred = inferAgentFromPrompt(prompt);
    if (inferred) resolvedType = inferred;
    else resolvedType = 'developer';
  }

  const explicitToolsProvided = Array.isArray(currentTools) && currentTools.length > 0;
  const explicitToolsNeedHydration =
    explicitToolsProvided &&
    !looksAssembled(prompt) &&
    isUnderProvisionedExplicitTools(currentTools, prompt);
  const agent = agents[resolvedType];
  const registryTools = agent?.capabilities?.[0]?.requiredTools;
  const toolsToUse =
    !explicitToolsProvided || explicitToolsNeedHydration
      ? Array.isArray(registryTools) && registryTools.length > 0
        ? registryTools
        : getDefaultTools(resolvedType)
      : [];
  const merged = new Set([
    ...(Array.isArray(currentTools) ? currentTools : []),
    ...(Array.isArray(toolsToUse) ? toolsToUse : []),
  ]);

  if (explicitToolsNeedHydration) {
    debugLog('spawn-prompt-assembler', 'Hydrating under-provisioned explicit allowed_tools', {
      agentType: resolvedType,
      explicitCount: currentTools.length,
      hydratedCount: toolsToUse.length,
    });
  }

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
  const result = applyHybridFirstToolPolicy([...mandatoryInList, ...cappedNonMandatory]);

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

/** Apply semantic memory and optional query memories to assembled prompt (reduces main complexity). */
async function applySemanticMemoryToPrompt(assembled, toolInput, basePrompt) {
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

/** Apply entity graph section to assembled prompt (reduces main complexity). */
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

function prepareTaskSpawnContext(hookInput, sessionId) {
  if (!hookInput) return null;

  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') return null;

  const rawToolInput = getToolInput(hookInput);
  if (!rawToolInput || typeof rawToolInput !== 'object') return null;

  const ensuredTask = ensureTaskId(rawToolInput, hookInput);
  const toolInput = ensuredTask.toolInput;
  if (ensuredTask.modified) {
    stderrLog('task_id_auto_injected', {
      task_id: ensuredTask.taskId,
    });
  }

  let basePrompt = toolInput.prompt;
  if (!basePrompt || typeof basePrompt !== 'string') return null;

  // FIX HIGH-003: Sanitize task prompt to prevent prompt injection
  basePrompt = sanitizeTaskPrompt(basePrompt);

  const explicitTaskId = toolInput.task_id || toolInput.id || null;
  basePrompt = normalizeTaskIdReferences(basePrompt, explicitTaskId);
  basePrompt = normalizeStalePathReferences(basePrompt);
  const inputPromptLength = basePrompt.length;

  if (!hasRequiredWarningBox(basePrompt) || !hasTaskIdReference(basePrompt)) {
    const description = toolInput.description || '';
    basePrompt = generateRequiredPrefixFragment(explicitTaskId, description) + '\n\n' + basePrompt;
    debugLog('spawn-prompt-assembler', 'Prepended required prefix fragment', {
      hasWarningBox: hasRequiredWarningBox(toolInput.prompt),
      hasTaskId: hasTaskIdReference(toolInput.prompt),
      taskId: explicitTaskId,
    });
  }

  const hookSessionId = hookInput.session_id || hookInput.sessionId || sessionId;
  stderrLog('hook_start', {
    session_id: hookSessionId,
    task_id: explicitTaskId,
  });

  return {
    toolInput,
    basePrompt,
    explicitTaskId,
    inputPromptLength,
    hookSessionId,
  };
}

async function main() {
  const startTime = Date.now();
  const perfEnabled = isPerfHarnessEnabled();
  const perf = createPerfRecorder(perfEnabled);
  const sessionId = process.env.CLAUDE_SESSION_ID || null;
  try {
    if (isDisabled()) process.exit(0);

    const hookInput = await parseHookInputAsync();
    const prepared = prepareTaskSpawnContext(hookInput, sessionId);
    if (!prepared) process.exit(0);

    const { toolInput, basePrompt, explicitTaskId, inputPromptLength, hookSessionId } = prepared;

    const alreadyAssembled = looksAssembled(basePrompt);
    perf.mark('prechecks_ms');

    const promptAssembler = libRequire(path.join('spawn', 'prompt-assembler.cjs'));
    const agentType = toolInput.subagent_type || toolInput.agent_type || 'developer';
    const presetId = toolInput.preset_id || toolInput.presetId || null;
    const rawAllowedTools = Array.isArray(toolInput.allowed_tools) ? toolInput.allowed_tools : [];
    const enrichedTools = enrichAllowedTools(agentType, rawAllowedTools, basePrompt);
    const contextMode = buildContextModePrompt({ role: agentType });
    const skillSectionMode = resolveSkillSectionMode();
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

    const throttleExpensive = shouldThrottleExpensiveEnrichment(toolInput, basePrompt);
    const cacheKey = getPromptFingerprint({
      agentType,
      presetId,
      allowedTools,
      basePrompt,
      contextFragment: contextMode.promptFragment || '',
      semanticEnabled: !throttleExpensive,
      entityGraphEnabled: !throttleExpensive,
      skillSectionMode,
      configModel: toolInput.model || null,
    });

    let assembled = basePrompt;
    let cacheHit = false;
    if (!alreadyAssembled) {
      assembled = getCachedAssembly(cacheKey);
      cacheHit = Boolean(assembled);
      if (assembled) {
        perf.mark('cache_hit_ms');
      } else {
        assembled = promptAssembler.assembleSpawnPrompt({
          agentType,
          allowedTools,
          basePrompt,
          skillSectionMode,
          includeMemory: true,
          presetId,
        });

        if (contextMode.hasContextOrMode && contextMode.promptFragment) {
          assembled = insertContextModeSection(assembled, contextMode.promptFragment);
        }

        const tierBAllowed =
          !throttleExpensive && (!isObservationalMode() || shouldUseTierB(toolInput, basePrompt));
        if (tierBAllowed) {
          assembled = await applySemanticMemoryToPrompt(assembled, toolInput, basePrompt);
        }
        if (tierBAllowed) {
          assembled = await applyEntityGraphToPrompt(assembled);
        }
      }
    }
    perf.mark('base_assembly_ms');
    perf.mark('semantic_memory_ms');
    perf.mark('entity_graph_ms');

    // Append constitution and behaviour principles to every spawned agent
    const constitutionContext = loadConstitutionContext(PROJECT_ROOT);
    assembled = appendConstitutionSection(assembled, constitutionContext);

    // PRESET-001: Inject preset skills when a preset is active
    const activePreset = getActivePreset();
    if (activePreset) {
      const presets = loadPresets();
      assembled = appendPresetSection(assembled, agentType, activePreset, presets);
    }
    perf.mark('context_enrichment_ms');

    // CONFIG-001: Inject configured model into spawn prompt so Router passes it into Task().
    const configModel = resolveConfigModel(agentType);
    assembled = appendConfigModelSection(assembled, configModel);
    assembled = enforcePromptBudget(assembled);
    putCachedAssembly(cacheKey, assembled);
    perf.mark('model_and_budget_ms');
    let selectedModel = toolInput.model || configModel?.model || toolInput.model;
    try {
      if (toolInput.model && configModel?.model) {
        const { getShorthand } = libRequire(path.join('utils', 'agent-config-reader.cjs'));
        const requested = getShorthand(toolInput.model);
        const configured = getShorthand(configModel.model);
        if (requested !== configured) {
          selectedModel = configModel.model;
          stderrLog('spawn_model_autocorrected', {
            task_id: explicitTaskId || null,
            agentType,
            fromModel: toolInput.model,
            toModel: configModel.model,
          });
        }
      }
    } catch (_e) {
      // Best-effort fallback: keep selectedModel as-is
    }

    const modifiedInput = {
      ...toolInput,
      prompt: assembled,
      allowed_tools: allowedTools,
      model: selectedModel,
    };
    // Preserve background task UX even when callers omit the flag.
    if (
      modifiedInput.run_in_background === undefined &&
      modifiedInput.runInBackground === undefined
    ) {
      modifiedInput.run_in_background = true;
    }

    try {
      const { logSpawnStart } = libRequire(path.join('monitoring', 'spawn-log.cjs'));
      const taskId = explicitTaskId;

      // Store task_id in router state so spawn_end can retrieve it
      const { setCurrentSpawnTaskId } = require('../../lib/routing/router-state.cjs');
      setCurrentSpawnTaskId(taskId);

      logSpawnStart({
        taskId,
        agentType,
        promptLength: assembled.length,
        sessionId: hookSessionId,
      });
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
    perf.mark('validation_ms');

    if (perfEnabled) {
      try {
        const { logSpawnAssemblyMetric, logTokenBurnMetric } = libRequire(
          path.join('monitoring', 'spawn-log.cjs')
        );
        const perfSummary = perf.done();
        logSpawnAssemblyMetric({
          taskId: explicitTaskId,
          agentType,
          sessionId: hookSessionId,
          totalMs: perfSummary.totalMs,
          phases: perfSummary.phases,
          inputChars: inputPromptLength,
          outputChars: assembled.length,
          compactnessScore: validation.compactness?.score,
        });
        logTokenBurnMetric({
          taskId: explicitTaskId,
          agentType,
          sessionId: hookSessionId,
          inputChars: inputPromptLength,
          outputChars: assembled.length,
          elapsedMs: perfSummary.totalMs,
        });
      } catch (perfErr) {
        debugLog('spawn-prompt-assembler', 'Perf harness logging failed (ignored)', perfErr);
      }
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
    try {
      const { logRuntimeHealth } = libRequire(path.join('monitoring', 'runtime-health-log.cjs'));
      logRuntimeHealth({
        component: 'spawn-prompt-assembler',
        status: 'ok',
        durationMs: Date.now() - startTime,
        sessionId: hookSessionId,
        extra: {
          task_id: explicitTaskId || null,
          cache_hit: cacheHit,
          adaptive_throttled: throttleExpensive,
        },
      });
    } catch (_err) {
      // best-effort
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
    stderrLog('hook_failed', { error: err?.message });
    try {
      const { logRuntimeHealth } = libRequire(path.join('monitoring', 'runtime-health-log.cjs'));
      logRuntimeHealth({
        component: 'spawn-prompt-assembler',
        status: 'error',
        durationMs: Date.now() - startTime,
        sessionId,
        extra: { error: err?.message || 'unknown' },
      });
    } catch (_err) {
      // best-effort
    }
    // Fail open: if we can't assemble, don't block spawns.
    debugLog('spawn-prompt-assembler', 'Hook error (fail open)', err);
    process.exit(0);
  }
}

// =============================================================================
// Preset Integration (PRESET-001)
// =============================================================================

/**
 * Cache for presets.json content (loaded once per hook execution).
 */
let _presetsCache = null;

/**
 * Load presets from .claude/config/presets.json with graceful fallback if missing.
 * Content is cached for the hook run to avoid repeated file reads.
 * @returns {{ presets: Object }} Presets configuration or empty object
 */
function loadPresets() {
  if (_presetsCache) return _presetsCache;

  const presetsPath = path.join(PROJECT_ROOT, '.claude', 'config', 'presets.json');

  try {
    if (fs.existsSync(presetsPath)) {
      _presetsCache = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
      return _presetsCache;
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load presets.json (ignored)', e);
  }

  _presetsCache = { presets: {} };
  return _presetsCache;
}

/**
 * Get the active preset name from environment or router state.
 * Precedence: AGENT_PRESET env var > router-state.json preset field > null
 * @returns {string|null} Preset name or null if no preset is active
 */
function getActivePreset() {
  // Check env var first (highest precedence)
  if (process.env.AGENT_PRESET) {
    return process.env.AGENT_PRESET;
  }

  // Check router-state.json
  const routerStatePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'router-state.json'
  );
  try {
    if (fs.existsSync(routerStatePath)) {
      const state = JSON.parse(fs.readFileSync(routerStatePath, 'utf8'));
      if (state.preset) {
        return state.preset;
      }
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to read router-state.json preset (ignored)', e);
  }

  return null;
}

/**
 * Append preset section to assembled prompt when agent matches preset.
 * @param {string} assembled - Current assembled prompt
 * @param {string} agentType - Agent type being spawned
 * @param {string|null} presetName - Active preset name (from getActivePreset)
 * @param {{ presets: Object }} presets - Presets configuration (from loadPresets)
 * @returns {string} Assembled prompt, possibly with preset section appended
 */
function appendPresetSection(assembled, agentType, presetName, presets) {
  // Skip if no preset active
  if (!presetName) return assembled;

  // Skip if preset doesn't exist
  const preset = presets?.presets?.[presetName];
  if (!preset) return assembled;

  // Skip if agent doesn't match preset agentId
  if (preset.agentId !== agentType) return assembled;

  // Skip if no skills to add
  if (!Array.isArray(preset.enabledSkills) || preset.enabledSkills.length === 0) {
    return assembled;
  }

  // Don't duplicate if section already exists
  if (assembled.includes('## Active Preset:')) return assembled;

  // Build preset section
  const lines = [];
  lines.push(`## Active Preset: ${presetName}`);
  lines.push('');
  lines.push('Invoke these skills for this task:');
  for (const skill of preset.enabledSkills) {
    lines.push(`- ${skill}`);
  }
  lines.push('');

  const section = lines.join('\n');

  // Insert before SKILL DISCOVERY PROTOCOL if present, otherwise append at end
  const marker = '## SKILL DISCOVERY PROTOCOL';
  if (assembled.includes(marker)) {
    const markerIdx = assembled.indexOf(marker);
    return assembled.slice(0, markerIdx) + `${section}\n` + assembled.slice(markerIdx);
  }

  return assembled + `\n${section}`;
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
  normalizeTaskIdReferences,
  normalizeStalePathReferences,
  hasExplicitTaskId,
  generateFallbackTaskId,
  ensureTaskId,
  loadConstitutionContext,
  appendConstitutionSection,
  loadPresets,
  getActivePreset,
  appendPresetSection,
  enforcePromptBudget,
  getPromptFingerprint,
  classifyPromptComplexity,
  shouldThrottleExpensiveEnrichment,
  getMemoryMode,
  isObservationalMode,
  shouldUseTierB,
  main,
};
