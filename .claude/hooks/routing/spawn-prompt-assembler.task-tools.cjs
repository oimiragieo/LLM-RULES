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

function sanitizeTaskPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

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
|                                                                      |
|  PRE-FLIGHT (MANDATORY):                                             |
|  TaskList();                                                         |
|                                                                      |
|  FIRST ACTION (MANDATORY):                                           |
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
`;
  return `${preflightBlock}\n${prompt}`;
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

let _registryCache = null;
let _manifestCache = null;
let _constitutionCache = null;

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

function appendConstitutionSection(assembled, context) {
  const { constitution, behaviour } = context;

  if (!constitution && !behaviour) return assembled;
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
  loadConstitutionContext,
  appendConstitutionSection,
  appendConfigModelSection,
  resolveConfigModel,
};
