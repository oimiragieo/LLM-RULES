/* eslint-disable max-lines */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ROOT,
  libRequire,
  debugLog,
  isEnricherDisabled,
  applyHybridFirstToolPolicy,
  looksAssembled,
} = require('./spawn-prompt-assembler.core.cjs');

const { canonicalizePathMentionsInText } = libRequire(path.join('utils', 'path-canonicalizer.cjs'));
const { getDefaultTools } = libRequire(path.join('agents', 'agent-config.cjs'));

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
const TASK_ID_REFERENCE_REGEX =
  /Task ID:\s{0,10}[<"']?[a-zA-Z0-9_-]{1,64}|taskId:\s{0,10}[<"']?[a-zA-Z0-9_-]{1,64}/i;
const INVALID_SUBAGENT_TYPES = new Set([
  'bash',
  'read',
  'write',
  'edit',
  'multiedit',
  'glob',
  'grep',
  'websearch',
  'webfetch',
  'task',
  'tasklist',
  'taskget',
  'taskupdate',
  'taskcreate',
  'taskoutput',
  'skill',
]);

const STALE_PATH_REWRITES = Object.freeze({
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
const REPORT_PATH_IN_TEXT_REGEX =
  /(?:^|[\s"'`])(\.claude[\\/]+context[\\/]+reports[\\/][^\s"'`]+\.md)\b/gi;
const WINDOWS_REPORT_PATH_REGEX =
  /(?:^|[\s"'`])([a-zA-Z]:\\[^"'`\r\n]*?\.claude\\context\\reports\\[^"'`\r\n]+\.md)\b/g;
const BACKTICKED_PATH_REGEX = /`([^`\r\n]+)`/g;

function sanitizeTaskPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  // Normalize NFKC + confusable Cyrillic/Greek lookalikes before injection pattern matching.
  let normalizedPrompt = prompt;
  try {
    normalizedPrompt = prompt.normalize('NFKC');
  } catch (_e) {
    /* keep original */
  }
  normalizedPrompt = normalizedPrompt.replace(
    /[ІіӀΙιοΟаеорсх]/g,
    ch =>
      ({
        І: 'I',
        і: 'i',
        Ӏ: 'I',
        Ι: 'I',
        ι: 'i',
        ο: 'o',
        Ο: 'O',
        а: 'a',
        е: 'e',
        о: 'o',
        р: 'r',
        с: 'c',
        х: 'x',
      })[ch] || ch
  );
  const overridePatterns = [
    /IGNORE\s+(PREVIOUS|ALL\s+PRIOR|SYSTEM)\s+INSTRUCTIONS/gi,
    /DISREGARD\s+(EVERYTHING|ALL\s+PREVIOUS)/gi,
    /YOU\s+ARE\s+NOW\s+A\s+[A-Z\s]+AGENT/gi,
    /SYSTEM\s+PROMPT\s+OVERRIDE/gi,
    /FORGET\s+(EVERYTHING|ALL\s+PREVIOUS)/gi,
  ];

  let sanitized = normalizedPrompt;
  for (const pattern of overridePatterns) {
    sanitized = sanitized.replace(pattern, '[BLOCKED: Injection Pattern]');
  }

  sanitized = sanitized.replace(
    /^(#{1,3}\s+)?(System|Instruction|Override|IMPORTANT|CRITICAL|MANDATORY):/gim,
    '\\$&'
  );

  return sanitized;
}

function generateRequiredPrefixFragment(taskId, description) {
  const taskIdValue = taskId != null ? String(taskId) : 'MISSING_TASK_ID';
  const subject = (description || 'Task').slice(0, 80);

  return `+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: ${taskIdValue}                                                  |
|  IMPORTANT: Use this task_id for TaskUpdate/TaskGet/TaskOutput.      |
|  NEVER use session_id for task tools.                                 |
|                                                                      |
|  PRE-FLIGHT (MANDATORY):                                             |
|  TaskList();                                                         |
|                                                                      |
|  FIRST ACTION (MANDATORY):                                           |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "in_progress" });              |
|                                                                      |
|  BEFORE Edit/Write: Read the file first in this task context.        |
|  If you hit "File has not been read yet", stop after 3 retries       |
|  and switch strategy (re-read file, then edit).                      |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "completed",                   |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|  (CRITICAL: The metadata parameter MUST be a JSON object, NOT a string)|
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

function isInvalidSubagentType(agentType) {
  if (!agentType || typeof agentType !== 'string') return true;
  const normalized = agentType.trim().toLowerCase();
  if (!normalized) return true;
  return INVALID_SUBAGENT_TYPES.has(normalized);
}

function ensureMandatorySpawnPreflight(prompt, taskId) {
  if (!prompt || typeof prompt !== 'string') return prompt;
  const taskIdValue = taskId != null ? String(taskId) : 'MISSING_TASK_ID';
  const hasPreflightTaskList =
    /PRE-FLIGHT\s*\(MANDATORY\)[\s\S]{0,300}TaskList\(\)/i.test(prompt) ||
    /BEFORE doing ANY work[\s\S]{0,300}TaskList\(\)/i.test(prompt);
  const hasFirstTaskUpdate =
    /FIRST ACTION\s*\(MANDATORY\)[\s\S]{0,300}TaskUpdate\(\{[^}]{0,200}status:\s*"in_progress"/i.test(
      prompt
    ) || /TaskUpdate\(\{\s*taskId:\s*"[^"]+"\s*,\s*status:\s*"in_progress"/i.test(prompt);
  if (hasPreflightTaskList && hasFirstTaskUpdate) return prompt;

  const preflightBlock = `
## Spawn Preflight (Mandatory)
1) PRE-FLIGHT: TaskList()
2) FIRST ACTION: TaskUpdate({ taskId: "${taskIdValue}", status: "in_progress" })
3) Use task_id "${taskIdValue}" for TaskUpdate/TaskGet/TaskOutput (never session_id)
4) Read file before Edit/Write; max 3 retries on repeated "file not read" errors
`;
  return `${prompt}\n${preflightBlock}`;
}

function hasRequiredWarningBox(prompt) {
  return prompt && typeof prompt === 'string' && prompt.includes('TASK TRACKING REQUIRED');
}

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
    .replace(/\b(You are\s+)task\s*#\s*[0-9]{1,10}(\b)/gi, (_match, prefix, suffix) => {
      return `${prefix}${normalizedTaskId}${suffix}`;
    })
    .replace(
      /\b(You are\s+)(?:task-[a-zA-Z0-9_-]{1,64}|[0-9]{1,10})(\b)/gi,
      (_match, prefix, suffix) => {
        return `${prefix}${normalizedTaskId}${suffix}`;
      }
    )
    .replace(/(\*\*Task ID:\s*)([a-zA-Z0-9_-]{1,64})(\*\*)/gi, `$1${normalizedTaskId}$3`)
    .replace(/(\*\*Task ID\*\*:\s*)([a-zA-Z0-9_-]{1,64})/gi, `$1${normalizedTaskId}`)
    .replace(/(Task ID:\s*)([a-zA-Z0-9_-]{1,64})/gi, `$1${normalizedTaskId}`)
    .replace(/(taskId\s*:\s*)(['"]?)([^'",}\s]+)(\2)/gi, (_match, prefix, quote) => {
      const q = quote || '"';
      return `${prefix}${q}${normalizedTaskId}${q}`;
    })
    .replace(/(task_id\s*:\s*)(['"]?)([^'",}\s]+)(\2)/gi, (_match, prefix, quote) => {
      const q = quote || '"';
      return `${prefix}${q}${normalizedTaskId}${q}`;
    })
    .replace(
      /(Use\s+TaskUpdate\s+to\s+mark\s+task\s+)(?:id\s*)?(?:#\s*)?1(\s+as\s+in_progress\b)/gi,
      `$1${normalizedTaskId}$2`
    )
    .replace(
      /(Use\s+TaskUpdate\s+to\s+mark\s+task\s+)(?:id\s*)?(?:#\s*)?1(\s+as\s+completed\b)/gi,
      `$1${normalizedTaskId}$2`
    )
    .replace(
      /(Use\s+TaskUpdate\s+to\s+mark\s+task\s+)(?:id\s*)?(?:#\s*)?1(\s+as\s+completed\s+when\s+done\b)/gi,
      `$1${normalizedTaskId}$2`
    );
}

function normalizeStalePathReferences(prompt) {
  if (!prompt || typeof prompt !== 'string') return prompt;

  let normalized = prompt;
  for (const [oldPath, newPath] of Object.entries(STALE_PATH_REWRITES)) {
    normalized = normalized.replaceAll(oldPath, newPath);
  }

  normalized = canonicalizePathMentionsInText(normalized);
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

let _registryCache = { data: null, mtimeMs: 0 };
let _manifestCache = { data: null, mtimeMs: 0 };
let _constitutionCache = { data: null, mtimeMs: 0 };

function _getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function loadAgentRegistry() {
  const currentMtimeReg = _getMtimeMs(AGENT_REGISTRY_PATH);
  if (_registryCache.data !== null && currentMtimeReg === _registryCache.mtimeMs)
    return _registryCache.data;
  try {
    if (fs.existsSync(AGENT_REGISTRY_PATH)) {
      const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
      const parsed = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'), null);
      if (parsed) {
        _registryCache = { data: parsed, mtimeMs: currentMtimeReg };
        return _registryCache.data;
      }
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load agent-registry', e);
  }
  _registryCache = { data: { agents: {} }, mtimeMs: 0 };
  return _registryCache.data;
}

function loadToolManifest() {
  const currentMtimeMf = _getMtimeMs(TOOL_MANIFEST_PATH);
  if (_manifestCache.data !== null && currentMtimeMf === _manifestCache.mtimeMs)
    return _manifestCache.data;
  try {
    if (fs.existsSync(TOOL_MANIFEST_PATH)) {
      const { safeParseJSON: safeParseJSON2 } = require('../../lib/utils/safe-json.cjs');
      const parsed2 = safeParseJSON2(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf8'), null);
      if (parsed2) {
        _manifestCache = { data: parsed2, mtimeMs: currentMtimeMf };
        return _manifestCache.data;
      }
    }
  } catch (e) {
    debugLog('spawn-prompt-assembler', 'Failed to load tool-manifest', e);
  }
  _manifestCache = {
    data: {
      constraints: {
        maxToolsPerAgent: MAX_TOOLS_AGENT,
        maxToolsPerOrchestrator: MAX_TOOLS_ORCHESTRATOR,
      },
    },
    mtimeMs: 0,
  };
  return _manifestCache.data;
}

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

function normalizeOutputPathCandidate(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (!/\.md$/i.test(trimmed)) return null;
  if (!/(^|[\\/])\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(trimmed)) return null;
  return trimmed.replace(/\\/g, '/');
}

function collectOutputPath(paths, candidate) {
  const normalized = normalizeOutputPathCandidate(candidate);
  if (!normalized) return;
  paths.push(normalized);
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function extractRequiredOutputs(prompt, toolInput = {}) {
  const paths = [];
  const payload = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const declaredOutputs = payload.required_outputs || payload.requiredOutputs || [];
  if (Array.isArray(declaredOutputs)) {
    for (const output of declaredOutputs) {
      if (typeof output === 'string') {
        collectOutputPath(paths, output);
        continue;
      }
      if (output && typeof output === 'object') {
        collectOutputPath(paths, output.path || output.file_path || output.filePath || '');
      }
    }
  }

  const promptText = typeof prompt === 'string' ? prompt : '';
  if (!promptText) return uniquePaths(paths);

  for (const match of promptText.matchAll(REPORT_PATH_IN_TEXT_REGEX)) {
    collectOutputPath(paths, match[1]);
  }
  for (const match of promptText.matchAll(WINDOWS_REPORT_PATH_REGEX)) {
    collectOutputPath(paths, match[1]);
  }
  for (const match of promptText.matchAll(BACKTICKED_PATH_REGEX)) {
    collectOutputPath(paths, match[1]);
  }

  return uniquePaths(paths);
}

function requiresArtifactWrite(requiredOutputs) {
  return Array.isArray(requiredOutputs) && requiredOutputs.length > 0;
}

function hasArtifactWriterTools(tools) {
  return hasAnyTool(tools, ['Write', 'Edit']);
}

function buildMissingWriterToolsMessage(requiredOutputs) {
  const sample = requiredOutputs.slice(0, 3).join(', ');
  return (
    '[SPAWN-PROMPT-ASSEMBLER] Required output artifact(s) detected but allowed_tools is missing ' +
    'Write/Edit. Add Write or Edit before spawning this task. ' +
    `Required outputs: ${sample}${requiredOutputs.length > 3 ? ', ...' : ''}`
  );
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

function enrichAllowedTools(agentType, currentTools, prompt) {
  if (isEnricherDisabled()) return currentTools;

  const registry = loadAgentRegistry();
  const manifest = loadToolManifest();
  const agents = registry.agents || {};
  const maxTools = ORCHESTRATOR_IDS.has((agentType || '').toLowerCase())
    ? (manifest.constraints?.maxToolsPerOrchestrator ?? MAX_TOOLS_ORCHESTRATOR)
    : (manifest.constraints?.maxToolsPerAgent ?? MAX_TOOLS_AGENT);

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

  for (const mandatoryTool of mandatoryTools) {
    merged.add(mandatoryTool);
  }

  const allTools = [...merged];
  const mandatoryInList = allTools.filter(t => mandatoryTools.includes(t));
  const nonMandatory = allTools.filter(t => !mandatoryTools.includes(t));
  const maxNonMandatory = maxTools - mandatoryInList.length;
  const cappedNonMandatory = nonMandatory.slice(0, Math.max(0, maxNonMandatory));
  const result = applyHybridFirstToolPolicy([...mandatoryInList, ...cappedNonMandatory]);

  const missingMandatory = mandatoryTools.filter(t => !result.includes(t));
  if (missingMandatory.length > 0) {
    debugLog('spawn-prompt-assembler', 'WARNING: Mandatory tools missing after merge', {
      missing: missingMandatory,
      agentType: resolvedType,
      resultLength: result.length,
      maxTools,
    });
    for (const missing of missingMandatory) {
      if (result.length >= maxTools) {
        result.pop();
      }
      result.push(missing);
    }
  }

  return result;
}

function loadConstitutionContext(projectRoot) {
  const constitutionPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'memory',
    'constitution.md'
  );
  const behaviourPath = path.join(projectRoot, '.claude', 'context', 'memory', 'behaviour.md');

  const mtime1 = _getMtimeMs(constitutionPath);
  const mtime2 = _getMtimeMs(behaviourPath);
  const combinedMtime = mtime1 + mtime2;
  if (_constitutionCache.data !== null && combinedMtime === _constitutionCache.mtimeMs)
    return _constitutionCache.data;

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

  _constitutionCache = { data: { constitution, behaviour }, mtimeMs: combinedMtime };
  return _constitutionCache.data;
}

function appendConstitutionSection(assembled, context) {
  const { constitution, behaviour } = context;

  if (assembled.includes('## Agent Constitution')) return assembled;

  /** When injectSections already added ## Dynamic behaviour rules, do not clip behaviour again here (dedupe). */
  const hasDynamicBehaviourRules = assembled.includes('## Dynamic behaviour rules');

  if (hasDynamicBehaviourRules) {
    if (!constitution) return assembled;
  } else if (!constitution && !behaviour) {
    return assembled;
  }

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

  if (!hasDynamicBehaviourRules && behaviour) {
    if (constitution) lines.push('');
    lines.push(clip(behaviour, 1200));
  }

  const section = lines.join('\n') + '\n';
  const marker = '## Memory Context (Auto-Loaded)';
  if (assembled.includes(marker)) {
    const markerIdx = assembled.indexOf(marker);
    return assembled.slice(0, markerIdx) + `${section}\n` + assembled.slice(markerIdx);
  }

  return assembled + `\n${section}`;
}

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
 * Agent types that have worktree isolation enabled in their frontmatter.
 * When these agents work on framework paths (.claude/), the isolation must
 * be overridden to 'none' to prevent silent data loss during worktree cleanup.
 */
const WORKTREE_ISOLATED_AGENTS = new Set([
  'developer',
  'qa',
  'code-reviewer',
  'frontend-pro',
  'nextjs-pro',
  'medical-research-triage',
]);

/**
 * Determines if worktree isolation should be overridden for an agent task.
 * Framework paths (.claude/) should NOT use worktree isolation because changes
 * are silently discarded when the worktree is cleaned up.
 *
 * Applies to all agents that have `isolation: worktree` in their frontmatter:
 * developer, qa, code-reviewer, frontend-pro, nextjs-pro, medical-research-triage.
 *
 * @param {string} prompt - The task prompt text
 * @param {string} agentType - The agent type being spawned
 * @returns {boolean} true if isolation should be overridden to 'none'
 */
function shouldOverrideWorktreeIsolation(prompt, agentType) {
  if (!prompt || typeof prompt !== 'string') return false;
  if (!agentType || typeof agentType !== 'string') return false;

  const normalizedType = agentType.trim().toLowerCase();
  if (!WORKTREE_ISOLATED_AGENTS.has(normalizedType)) return false;

  // Normalize Windows backslashes to forward slashes for consistent matching (SE-01)
  const normalizedPrompt = prompt.replace(/\\/g, '/');

  const frameworkPaths = [
    '.claude/hooks/',
    '.claude/skills/',
    '.claude/agents/',
    '.claude/tools/',
    '.claude/workflows/',
    '.claude/templates/',
    '.claude/schemas/',
    '.claude/lib/',
    '.claude/commands/',
    '.claude/config/',
    '.claude/docs/',
    '.claude/rules/',
    '.claude/scripts/',
  ];

  const detectedPath = frameworkPaths.find(fp => normalizedPrompt.includes(fp));
  if (!detectedPath) return false;

  // Telemetry: emit to stderr when override fires (hooks use stderr per convention)
  const taskIdMatch = prompt.match(
    /Task ID:\s{0,10}[<"']?([a-zA-Z0-9_-]{1,64})|taskId:\s{0,10}[<"']?([a-zA-Z0-9_-]{1,64})/i
  );
  const taskId = taskIdMatch ? taskIdMatch[1] || taskIdMatch[2] || 'unknown' : 'unknown';
  const allDetected = frameworkPaths.filter(fp => normalizedPrompt.includes(fp)).join(', ');

  console.error(
    `[spawn-prompt-assembler] worktree-override: agentType=${normalizedType} taskId=${taskId} ` +
      `frameworkPaths=[${allDetected}] timestamp=${new Date().toISOString()}`
  );

  return true;
}

/**
 * parseAgentFrontmatterSimple - Extract YAML frontmatter from agent markdown file.
 * Returns a plain object of key/value pairs from the frontmatter block, or null if none.
 *
 * @param {string} content - Raw markdown file content
 * @returns {Object|null}
 */
function parseAgentFrontmatterSimple(content) {
  if (!content || typeof content !== 'string') return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const result = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key) result[key] = value;
  }
  return result;
}

/**
 * loadAgentSoulContent - Load the soul file referenced in agent frontmatter.
 * Returns soul file content if the agent has a `soul` frontmatter field pointing to
 * a readable file, or empty string if not applicable.
 *
 * @param {string} agentType - Agent type id (e.g. 'general-assistant')
 * @param {string} [projectRoot] - Project root path
 * @returns {string}
 */
function loadAgentSoulContent(agentType, projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  try {
    // Locate the agent file
    const agentsRoot = path.join(root, '.claude', 'agents');
    if (!fs.existsSync(agentsRoot)) return '';
    const normalized = String(agentType || '')
      .trim()
      .toLowerCase();
    const target = `${normalized}.md`;

    // Walk the agents directory to find the file
    let agentFilePath = '';
    const stack = [agentsRoot];
    while (stack.length > 0 && !agentFilePath) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.toLowerCase() === target) {
          agentFilePath = full;
          break;
        }
      }
    }

    if (!agentFilePath) return '';
    const content = fs.readFileSync(agentFilePath, 'utf8');
    const frontmatter = parseAgentFrontmatterSimple(content);
    if (!frontmatter || !frontmatter.soul) return '';

    // Resolve soul path relative to project root
    const soulPath = path.join(root, frontmatter.soul);
    if (!fs.existsSync(soulPath)) return '';
    return fs.readFileSync(soulPath, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

/**
 * appendSoulSection - Append soul personality content to a prompt.
 * Skips if soul content is empty or the prompt already contains a Soul section.
 *
 * @param {string} prompt - Base spawn prompt
 * @param {string} soulContent - Content from the soul file
 * @returns {string} Updated prompt
 */
function appendSoulSection(prompt, soulContent) {
  if (!soulContent || !soulContent.trim()) return prompt;
  if (prompt.includes('## Soul (Personality)')) return prompt;
  return `${prompt}\n\n## Soul (Personality)\n<soul-content>\n${soulContent.trim()}\n</soul-content>\n`;
}

/**
 * loadProjectContext - Load project-context.md from a given project root.
 * Returns the file contents as a string, or empty string if missing.
 *
 * @param {string} [projectRoot] - Optional override for project root path
 * @returns {string}
 */
function loadProjectContext(projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  const pcPath = path.join(root, '.claude', 'context', 'project-context.md');
  try {
    if (!fs.existsSync(pcPath)) return '';
    return fs.readFileSync(pcPath, 'utf8');
  } catch (_e) {
    return '';
  }
}

/**
 * appendProjectContextSection - Inject project-context.md content into a spawn prompt.
 * Skips injection if content is empty or if the prompt already has a ## Project Context section.
 *
 * @param {string} prompt - Base spawn prompt
 * @param {string} contextContent - Content from project-context.md
 * @returns {string} Updated prompt
 */
function appendProjectContextSection(prompt, contextContent) {
  if (!contextContent || !contextContent.trim()) return prompt;
  if (prompt.includes('## Project Context')) return prompt;
  return `${prompt}\n\n## Project Context\n\n${contextContent.trim()}`;
}

function _resetCaches() {
  _registryCache = { data: null, mtimeMs: 0 };
  _manifestCache = { data: null, mtimeMs: 0 };
  _constitutionCache = { data: null, mtimeMs: 0 };
}

module.exports = {
  sanitizeTaskPrompt,
  generateRequiredPrefixFragment,
  isInvalidSubagentType,
  ensureMandatorySpawnPreflight,
  hasRequiredWarningBox,
  hasTaskIdReference,
  normalizeTaskIdReferences,
  normalizeStalePathReferences,
  hasExplicitTaskId,
  generateFallbackTaskId,
  ensureTaskId,
  enrichAllowedTools,
  inferAgentFromPrompt,
  loadAgentRegistry,
  loadToolManifest,
  loadConstitutionContext,
  appendConstitutionSection,
  appendConfigModelSection,
  resolveConfigModel,
  extractRequiredOutputs,
  requiresArtifactWrite,
  hasArtifactWriterTools,
  buildMissingWriterToolsMessage,
  shouldOverrideWorktreeIsolation,
  loadAgentSoulContent,
  appendSoulSection,
  loadProjectContext,
  appendProjectContextSection,
  _resetCaches,
};
