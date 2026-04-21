/* eslint max-lines: ["warn", 650] */
'use strict';

const path = require('path');
const fs = require('fs');

// Token governor — pre-spawn budget check (S3)
// Wrapped in try/catch so a missing module never blocks spawns (fail-open).
let _tokenGovernor = null;
try {
  _tokenGovernor = require('../../lib/routing/token-governor.cjs');
} catch (_e) {
  // Fail-open: governor unavailable should never block spawns
}

const core = require('./spawn-prompt-assembler.core.cjs');
const taskTools = require('./spawn-prompt-assembler.task-tools.cjs');
const memory = require('./spawn-prompt-assembler.memory.cjs');
const runtimeSupport = require('./spawn-prompt-assembler.runtime-support.cjs');

const {
  PROJECT_ROOT,
  libRequire,
  parseHookInputAsync,
  getToolName,
  getToolInput,
  debugLog,
  formatResult,
  isPerfHarnessEnabled,
  createPerfRecorder,
  resolveSkillSectionMode,
  getPromptFingerprint,
  shouldThrottleExpensiveEnrichment,
  getCachedAssembly,
  putCachedAssembly,
  isDisabled,
  isObservationalMode,
  shouldUseTierB,
  stderrLog,
  emitSpawnRagTelemetry,
  enforcePromptBudget,
  resolveTaskOutputReferences,
  checkDeveloperReadiness,
  looksAssembled,
  getMemoryMode,
  classifyPromptComplexity,
} = core;

const {
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
  loadAgentSoulContent,
  appendSoulSection,
  appendConfigModelSection,
  resolveConfigModel,
  extractRequiredOutputs,
  requiresArtifactWrite,
  hasArtifactWriterTools,
  buildMissingWriterToolsMessage,
  shouldOverrideWorktreeIsolation,
} = taskTools;

const {
  appendSemanticMatches,
  appendQueryMemories,
  appendEntityGraph,
  insertContextModeSection,
  applySemanticMemoryToPrompt,
  applyEntityGraphToPrompt,
  appendAgentTypedMemoryNotes,
} = memory;

const {
  resolveSelectedModel,
  buildModifiedInput,
  logSpawnStartSafe,
  validateAssembledPromptOrExit,
  logPerfMetricsSafe,
  logSpawnRagMetricSafe,
  emitHookSuccess,
  emitHookFailure,
  loadPresets,
  getActivePreset,
  appendPresetSection,
} = runtimeSupport;

const { buildContextModePrompt } = libRequire(path.join('spawn', 'prompt-factory.cjs'));
const { normalizeTaskSpawnInput } = libRequire(path.join('routing', 'task-spawn-builder.cjs'));
const TASK_OUTPUT_CONTRACTS_PATH =
  process.env.TASK_OUTPUT_CONTRACTS_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'task-output-contracts.json');
const TASK_OUTPUT_METRICS_PATH =
  process.env.TASK_OUTPUT_METRICS_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'task-output-enforcement-metrics.json');

function readTaskOutputContracts() {
  try {
    if (!fs.existsSync(TASK_OUTPUT_CONTRACTS_PATH)) return { tasks: {} };
    const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
    const parsed = safeParseJSON(fs.readFileSync(TASK_OUTPUT_CONTRACTS_PATH, 'utf8'), null);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object') {
      return { tasks: {} };
    }
    return { tasks: parsed.tasks };
  } catch (_err) {
    return { tasks: {} };
  }
}

function writeTaskOutputContracts(state) {
  try {
    fs.mkdirSync(path.dirname(TASK_OUTPUT_CONTRACTS_PATH), { recursive: true });
    fs.writeFileSync(TASK_OUTPUT_CONTRACTS_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (_err) {
    // Best-effort persistence.
  }
}

function persistTaskOutputContract(taskId, requiredOutputs, agentType) {
  if (!taskId || !requiresArtifactWrite(requiredOutputs)) return;
  const now = new Date().toISOString();
  const state = readTaskOutputContracts();
  state.tasks[String(taskId)] = {
    requiredOutputs: requiredOutputs.map(output => String(output)),
    updatedAt: now,
    createdAt: state.tasks?.[String(taskId)]?.createdAt || now,
    agentType: String(agentType || ''),
  };
  writeTaskOutputContracts(state);
}

function incrementTaskOutputMetric(counterName) {
  try {
    const now = new Date().toISOString();
    let state = { counters: {}, updatedAt: now };
    if (fs.existsSync(TASK_OUTPUT_METRICS_PATH)) {
      try {
        const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
        const parsed = safeParseJSON(fs.readFileSync(TASK_OUTPUT_METRICS_PATH, 'utf8'), null);
        if (parsed && typeof parsed === 'object') {
          state = {
            counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
            updatedAt: parsed.updatedAt || now,
          };
        }
      } catch (_err) {
        // Reset invalid metrics state.
      }
    }
    const key = String(counterName || '').trim();
    if (!key) return;
    state.counters[key] = Number(state.counters[key] || 0) + 1;
    state.updatedAt = now;
    fs.mkdirSync(path.dirname(TASK_OUTPUT_METRICS_PATH), { recursive: true });
    fs.writeFileSync(TASK_OUTPUT_METRICS_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (_err) {
    // Metrics are best-effort only.
  }
}

function prepareTaskSpawnContext(hookInput, sessionId) {
  if (!hookInput) return null;

  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') return null;

  const rawToolInput = getToolInput(hookInput);
  if (!rawToolInput || typeof rawToolInput !== 'object') return null;

  const ensuredTask = normalizeTaskSpawnInput(rawToolInput, hookInput);
  const toolInput = ensuredTask.toolInput;
  if (ensuredTask.modified) {
    stderrLog('task_payload_auto_normalized', {
      task_id: ensuredTask.taskId,
      description: toolInput.description,
    });
  }

  let basePrompt = toolInput.prompt;
  if (!basePrompt || typeof basePrompt !== 'string') return null;
  const spawnAgentType = String(toolInput.subagent_type || toolInput.agent_type || '').trim();
  if (isInvalidSubagentType(spawnAgentType)) {
    return {
      blockMessage:
        `[SPAWN-PROMPT-ASSEMBLER] Invalid subagent_type "${spawnAgentType || '(missing)'}". ` +
        'subagent_type must be an agent id (e.g., developer, qa, architect), not a tool name.',
    };
  }

  basePrompt = sanitizeTaskPrompt(basePrompt);

  // === TOKEN GOVERNOR: pre-spawn budget check (S3) ===
  if (_tokenGovernor) {
    try {
      const governorSessionId =
        process.env.CLAUDE_SESSION_ID ||
        process.env.SESSION_ID ||
        hookInput.session_id ||
        'unknown';
      const budgetResult = _tokenGovernor.checkSpawnBudget(spawnAgentType, governorSessionId);
      if (!budgetResult.allowed) {
        return {
          blockMessage:
            `[TOKEN-GOVERNOR] Spawn blocked: agent "${spawnAgentType}" has exceeded its token budget ` +
            `(TOKEN_GOVERNOR_HARD=on). Remaining: ${budgetResult.remaining}. ` +
            'Reduce scope or disable TOKEN_GOVERNOR_HARD to override.',
        };
      }
      if (budgetResult.warning) {
        const warningTag =
          budgetResult.warning === 'approaching_budget'
            ? '[TOKEN-GOVERNOR WARNING] This agent is approaching its token budget. ' +
              `Remaining: ${budgetResult.remaining} tokens. Be concise and efficient.`
            : '[TOKEN-GOVERNOR WARNING] This agent has exceeded its token budget. ' +
              `Remaining: ${budgetResult.remaining} tokens. TOKEN_GOVERNOR_HARD is off — spawn allowed.`;
        basePrompt = `${warningTag}\n\n${basePrompt}`;
      }
    } catch (_govErr) {
      // Fail-open: governor errors must never block spawns
    }
  }
  // === END TOKEN GOVERNOR ===

  const explicitTaskId = toolInput.task_id || toolInput.id || null;
  basePrompt = normalizeTaskIdReferences(basePrompt, explicitTaskId);
  basePrompt = normalizeStalePathReferences(basePrompt);
  basePrompt = ensureMandatorySpawnPreflight(basePrompt, explicitTaskId);
  const inputPromptLength = basePrompt.length;

  if (!hasRequiredWarningBox(basePrompt) || !hasTaskIdReference(basePrompt)) {
    debugLog('spawn-prompt-assembler', 'Task warning missing from basePrompt, will append later', {
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

function deriveSpawnContext(toolInput, basePrompt) {
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
  return { agentType, presetId, allowedTools, contextMode, skillSectionMode };
}

function computeSpawnCacheContext({
  toolInput,
  basePrompt,
  agentType,
  presetId,
  allowedTools,
  contextMode,
  skillSectionMode,
}) {
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
  return { throttleExpensive, cacheKey };
}

function computeMemoryQuery(toolInput, basePrompt) {
  return String(toolInput.description || basePrompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function assemblePromptWithCache({
  alreadyAssembled,
  cacheKey,
  perf,
  toolInput,
  basePrompt,
  agentType,
  allowedTools,
  skillSectionMode,
  presetId,
  contextMode,
  throttleExpensive,
}) {
  const promptAssembler = libRequire(path.join('spawn', 'prompt-assembler.cjs'));
  let assembled = basePrompt;
  let memoryQuery = '';
  let cacheHit = false;

  if (!alreadyAssembled) {
    assembled = getCachedAssembly(cacheKey);
    cacheHit = Boolean(assembled);
    if (assembled) {
      perf.mark('cache_hit_ms');
    } else {
      memoryQuery = computeMemoryQuery(toolInput, basePrompt);
      assembled = await promptAssembler.assembleSpawnPromptAsync({
        agentType,
        allowedTools,
        basePrompt,
        skillSectionMode,
        includeMemory: true,
        presetId,
        memoryQuery,
      });

      if (contextMode.hasContextOrMode && contextMode.promptFragment) {
        assembled = insertContextModeSection(assembled, contextMode.promptFragment);
      }

      const tierBAllowed =
        !throttleExpensive && (!isObservationalMode() || shouldUseTierB(toolInput, basePrompt));
      if (tierBAllowed) {
        assembled = await applySemanticMemoryToPrompt(assembled, toolInput, basePrompt, stderrLog);
        if (
          String(process.env.AGENT_TYPED_MEMORY_INJECTION || 'on')
            .trim()
            .toLowerCase() !== 'off'
        ) {
          try {
            assembled = appendAgentTypedMemoryNotes(assembled, agentType);
          } catch (_atmiErr) {
            // fail-open
          }
        }
        assembled = await applyEntityGraphToPrompt(assembled);
      }
    }
  }

  return { assembled, memoryQuery, cacheHit };
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
    if (prepared.blockMessage) {
      console.log(formatResult('block', prepared.blockMessage));
      process.exit(0);
    }

    const { toolInput, basePrompt, explicitTaskId, inputPromptLength, hookSessionId } = prepared;

    const requiredOutputs = extractRequiredOutputs(basePrompt, toolInput);
    const explicitAllowedTools = Array.isArray(toolInput.allowed_tools)
      ? toolInput.allowed_tools
      : [];
    const hasExplicitAllowedTools = explicitAllowedTools.length > 0;
    if (
      hasExplicitAllowedTools &&
      requiresArtifactWrite(requiredOutputs) &&
      !hasArtifactWriterTools(explicitAllowedTools)
    ) {
      incrementTaskOutputMetric('artifact_contract_missing_tools');
      console.log(formatResult('block', buildMissingWriterToolsMessage(requiredOutputs)));
      process.exit(0);
      return;
    }

    const alreadyAssembled = looksAssembled(basePrompt);
    perf.mark('prechecks_ms');

    const { agentType, presetId, allowedTools, contextMode, skillSectionMode } = deriveSpawnContext(
      toolInput,
      basePrompt
    );
    if (requiresArtifactWrite(requiredOutputs) && !hasArtifactWriterTools(allowedTools)) {
      incrementTaskOutputMetric('artifact_contract_missing_tools');
      console.log(formatResult('block', buildMissingWriterToolsMessage(requiredOutputs)));
      process.exit(0);
      return;
    }
    persistTaskOutputContract(explicitTaskId, requiredOutputs, agentType);
    const { throttleExpensive, cacheKey } = computeSpawnCacheContext({
      toolInput,
      basePrompt,
      agentType,
      presetId,
      allowedTools,
      contextMode,
      skillSectionMode,
    });
    const assemblyResult = await assemblePromptWithCache({
      alreadyAssembled,
      cacheKey,
      perf,
      toolInput,
      basePrompt,
      agentType,
      allowedTools,
      skillSectionMode,
      presetId,
      contextMode,
      throttleExpensive,
    });
    let assembled = assemblyResult.assembled;
    const memoryQuery = assemblyResult.memoryQuery;
    const cacheHit = assemblyResult.cacheHit;
    perf.mark('base_assembly_ms');
    perf.mark('semantic_memory_ms');
    perf.mark('entity_graph_ms');
    const ragTelemetry = emitSpawnRagTelemetry(assembled, memoryQuery);

    const constitutionContext = loadConstitutionContext(PROJECT_ROOT);
    assembled = appendConstitutionSection(assembled, constitutionContext);

    // Soul personality injection (general-assistant soul.md)
    const soulContent = loadAgentSoulContent(agentType, PROJECT_ROOT);
    assembled = appendSoulSection(assembled, soulContent);

    const activePreset = getActivePreset();
    if (activePreset) {
      const presets = loadPresets();
      assembled = appendPresetSection(assembled, agentType, activePreset, presets);
    }
    perf.mark('context_enrichment_ms');

    const configModel = resolveConfigModel(agentType);
    assembled = appendConfigModelSection(assembled, configModel);

    // PLATFORM AWARENESS INJECTION
    const routerState = libRequire(path.join('routing', 'router-state.cjs'));
    const state = routerState.getState();
    if (state.platformAwarenessRule) {
      assembled += state.platformAwarenessRule;
    }

    // WORKTREE CONTEXT INJECTION
    // When the spawned agent runs in an isolated git worktree, inject the
    // working environment block so the agent knows its isolation context.
    // This block is added ONLY when:
    //   1. The agent definition declares isolation: worktree, AND
    //   2. The AGENT_WORKTREE_PATH env var is set (injected by the worktree spawn machinery)
    //   3. The task does NOT target framework paths (.claude/hooks/, .claude/skills/, etc.)
    //      because framework changes are silently discarded when the worktree is cleaned up
    const worktreePath = process.env.AGENT_WORKTREE_PATH || '';
    if (agentType && worktreePath) {
      // Check if this is a developer task targeting framework paths — skip worktree injection
      if (shouldOverrideWorktreeIsolation(assembled, agentType)) {
        process.stderr.write(
          '[worktree-override] Skipping worktree isolation for developer task targeting framework paths\n'
        );
      } else {
        // Load the agent registry to check isolation setting
        let agentIsolation = null;
        try {
          const agentRegistry = libRequire(path.join('routing', 'agent-registry-loader.cjs'));
          const agentConfig = agentRegistry.getAgent(agentType);
          if (agentConfig) {
            agentIsolation = agentConfig.isolation || null;
          }
        } catch (_regErr) {
          // Agent registry lookup is best-effort; skip injection if unavailable
        }

        if (agentIsolation === 'worktree') {
          const worktreeBranch = process.env.AGENT_WORKTREE_BRANCH || 'unknown';
          // SE-01: normalize backslashes in path for display
          const displayPath = worktreePath.replace(/\\/g, '/');
          assembled +=
            '\n\n## Your Working Environment\n' +
            'You are running in an ISOLATED GIT WORKTREE.\n' +
            `Working directory: ${displayPath}\n` +
            `Branch: ${worktreeBranch}\n` +
            'DO NOT write files outside your working directory.\n' +
            'All file paths must use this working directory as the root.\n';
        }
      }
    }

    assembled = normalizeTaskIdReferences(assembled, explicitTaskId);
    assembled = ensureMandatorySpawnPreflight(assembled, explicitTaskId);
    checkDeveloperReadiness(agentType, assembled);
    assembled = resolveTaskOutputReferences(assembled);
    assembled = enforcePromptBudget(assembled);

    // === NEW DYNAMIC METADATA BLOCK APPENDED END ===
    if (!hasRequiredWarningBox(assembled) || !hasTaskIdReference(assembled)) {
      const description = toolInput.description || '';
      const warningSuffix = generateRequiredPrefixFragment(explicitTaskId, description);
      assembled = assembled + `\n\n${warningSuffix}`;
    }
    // ===============================================

    putCachedAssembly(cacheKey, assembled);
    perf.mark('model_and_budget_ms');
    const selectedModel = resolveSelectedModel(toolInput, configModel, explicitTaskId, agentType);
    const modifiedInput = buildModifiedInput(
      toolInput,
      assembled,
      allowedTools,
      selectedModel,
      agentType
    );
    logSpawnStartSafe({ explicitTaskId, agentType, assembled, hookSessionId });

    const validation = validateAssembledPromptOrExit(assembled);
    perf.mark('validation_ms');

    logPerfMetricsSafe({
      perfEnabled,
      perf,
      explicitTaskId,
      agentType,
      hookSessionId,
      inputPromptLength,
      assembled,
      validation,
      ragTelemetry,
    });
    logSpawnRagMetricSafe({ explicitTaskId, hookSessionId, ragTelemetry });
    await emitHookSuccess({
      modifiedInput,
      startTime,
      explicitTaskId,
      hookSessionId,
      cacheHit,
      throttleExpensive,
      ragTelemetry,
    });
    process.exit(0);
  } catch (err) {
    await emitHookFailure({ err, startTime, sessionId });
    process.exit(0);
  }
}

module.exports = {
  looksAssembled,
  emitSpawnRagTelemetry,
  appendSemanticMatches,
  appendQueryMemories,
  appendEntityGraph,
  insertContextModeSection,
  enrichAllowedTools,
  inferAgentFromPrompt,
  generateRequiredPrefixFragment,
  ensureMandatorySpawnPreflight,
  isInvalidSubagentType,
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
