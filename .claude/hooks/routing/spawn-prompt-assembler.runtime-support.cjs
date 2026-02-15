'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ROOT,
  libRequire,
  debugLog,
  validatePrompt,
  stderrLog,
} = require('./spawn-prompt-assembler.core.cjs');

const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));

function resolveSelectedModel(toolInput, configModel, explicitTaskId, agentType) {
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
  return selectedModel;
}

function buildModifiedInput(toolInput, assembled, allowedTools, selectedModel) {
  const modifiedInput = {
    ...toolInput,
    prompt: assembled,
    allowed_tools: allowedTools,
    model: selectedModel,
  };
  if (
    modifiedInput.run_in_background === undefined &&
    modifiedInput.runInBackground === undefined
  ) {
    modifiedInput.run_in_background = true;
  }
  return modifiedInput;
}

function logSpawnStartSafe({ explicitTaskId, agentType, assembled, hookSessionId }) {
  try {
    const { logSpawnStart } = libRequire(path.join('monitoring', 'spawn-log.cjs'));
    const taskId = explicitTaskId;
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
}

function validateAssembledPromptOrExit(assembled) {
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
  return validation;
}

function logPerfMetricsSafe({
  perfEnabled,
  perf,
  explicitTaskId,
  agentType,
  hookSessionId,
  inputPromptLength,
  assembled,
  validation,
  ragTelemetry,
}) {
  if (!perfEnabled) return;
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
      ragEnabled: ragTelemetry?.enabled ?? null,
      ragSectionAdded: ragTelemetry?.section_added ?? null,
      ragMemoryQueryLen: ragTelemetry?.memory_query_len ?? null,
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

function logSpawnRagMetricSafe({ explicitTaskId, hookSessionId, ragTelemetry }) {
  try {
    const { logSpawnRagMetric } = libRequire(path.join('monitoring', 'spawn-log.cjs'));
    logSpawnRagMetric({
      taskId: explicitTaskId,
      sessionId: hookSessionId,
      ragEnabled: ragTelemetry?.enabled ?? false,
      ragSectionAdded: ragTelemetry?.section_added ?? false,
      ragMemoryQueryLen: ragTelemetry?.memory_query_len ?? 0,
    });
  } catch (_err) {
    // best-effort
  }
}

async function emitHookSuccess({
  modifiedInput,
  startTime,
  explicitTaskId,
  hookSessionId,
  cacheHit,
  throttleExpensive,
  ragTelemetry,
}) {
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
        rag_enabled: ragTelemetry?.enabled ?? null,
        rag_section_added: ragTelemetry?.section_added ?? null,
        rag_memory_query_len: ragTelemetry?.memory_query_len ?? null,
      },
    });
  } catch (_err) {
    // best-effort
  }
}

async function emitHookFailure({ err, startTime, sessionId }) {
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
  debugLog('spawn-prompt-assembler', 'Hook error (fail open)', err);
}

let _presetsCache = null;

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

function getActivePreset() {
  if (process.env.AGENT_PRESET) {
    return process.env.AGENT_PRESET;
  }

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

function appendPresetSection(assembled, agentType, presetName, presets) {
  if (!presetName) return assembled;

  const preset = presets?.presets?.[presetName];
  if (!preset) return assembled;
  if (preset.agentId !== agentType) return assembled;
  if (!Array.isArray(preset.enabledSkills) || preset.enabledSkills.length === 0) {
    return assembled;
  }
  if (assembled.includes('## Active Preset:')) return assembled;

  const lines = [];
  lines.push(`## Active Preset: ${presetName}`);
  lines.push('');
  lines.push('Invoke these skills for this task:');
  for (const skill of preset.enabledSkills) {
    lines.push(`- ${skill}`);
  }
  lines.push('');

  const section = lines.join('\n');
  const marker = '## SKILL DISCOVERY PROTOCOL';
  if (assembled.includes(marker)) {
    const markerIdx = assembled.indexOf(marker);
    return assembled.slice(0, markerIdx) + `${section}\n` + assembled.slice(markerIdx);
  }

  return assembled + `\n${section}`;
}

module.exports = {
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
};
