#!/usr/bin/env node
/**
 * Post-Completion Chain Hook (Task 3.1)
 * =======================================
 *
 * Triggers workflow phase advancement when agents complete.
 *
 * Logic:
 * 1. Intercept TaskUpdate where status === "completed"
 * 2. Read workflow-state.json
 * 3. Find which phase/agent this completion belongs to
 * 4. Mark agent complete in workflow state
 * 5. Check if ALL agents in current phase are complete
 * 6. If all complete:
 *    a. Evaluate quality gate for current phase
 *    b. If gate passes: write phase-advance signal
 *    c. Update workflow state to record gate result
 *
 * Trigger: PostToolUse on TaskUpdate
 *
 * @module post-completion-chain
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { evaluateGate } = require('../../lib/workflow/quality-gates.cjs');
const { withWorkflowStateLock } = require('../../lib/workflow/workflow-state-lock.cjs');
const { readWorkflowStateFile } = require('../../lib/runtime/state-contracts.cjs');
const { getWorkflowStatePath, getPhaseAdvancePath } = require('../../lib/utils/workflow-paths.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { extractMemoriesFromSession } = require('../../lib/memory/memory-extractor.cjs');
const { readSTMEntry, writeSTMEntry } = require('../../lib/memory/memory-tiers.cjs');
const { withFileLock } = require('../../lib/memory/memory-tiers-lock.cjs');

const MEMORY_EXTRACTION_TIMEOUT_MS = 5000;
const MEMORY_CONFIDENCE_THRESHOLD = 0.7;

const DEFAULT_AGENT_HEALTH_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'memory',
  'agent-health.json'
);

function getAgentHealthPath() {
  return process.env.AGENT_HEALTH_PATH_OVERRIDE || DEFAULT_AGENT_HEALTH_PATH;
}

function readAgentHealth(filePath = getAgentHealthPath()) {
  const initial = { updatedAt: null, agents: {} };
  try {
    if (!fs.existsSync(filePath)) return initial;
    const parsed = safeParseJSON(fs.readFileSync(filePath, 'utf8'), null, null, initial);
    if (!parsed || typeof parsed !== 'object') return initial;
    const agents = parsed.agents && typeof parsed.agents === 'object' ? parsed.agents : {};
    return { updatedAt: parsed.updatedAt || null, agents };
  } catch (_err) {
    return initial;
  }
}

function updateAgentHealth(agentId, outcome, options = {}) {
  const normalizedAgentId = typeof agentId === 'string' ? agentId.trim() : '';
  if (!normalizedAgentId) return;
  const filePath = options.filePath || getAgentHealthPath();
  const now = new Date().toISOString();
  const health = readAgentHealth(filePath);
  const current = health.agents[normalizedAgentId] || {
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    successRate: 1,
    averageCompletionMs: null,
    totalCompletionMs: 0,
    completionSamples: 0,
    lastOutcome: null,
    lastUpdatedAt: null,
  };

  if (outcome === 'success') {
    current.successCount += 1;
    current.consecutiveFailures = 0;
    const completionMs = Number(options.completionMs);
    if (Number.isFinite(completionMs) && completionMs >= 0) {
      current.totalCompletionMs += completionMs;
      current.completionSamples += 1;
      current.averageCompletionMs = current.totalCompletionMs / current.completionSamples;
    }
  } else if (outcome === 'failure') {
    current.failureCount += 1;
    current.consecutiveFailures += 1;
  } else {
    return;
  }

  const total = current.successCount + current.failureCount;
  current.successRate = total > 0 ? current.successCount / total : 1;
  current.lastOutcome = outcome;
  current.lastUpdatedAt = now;
  health.updatedAt = now;
  health.agents[normalizedAgentId] = current;
  atomicWriteJSONSync(filePath, health);
}

function appendAgentGapsToSessionLog(gaps, taskId) {
  const gapLogPath =
    process.env.GAP_LOG_PATH_OVERRIDE ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'session-gap-log.jsonl');
  try {
    const validGaps = gaps.filter(gap => gap && typeof gap === 'object' && gap.description);
    if (validGaps.length === 0) return;
    const lines = validGaps.map(gap =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: gap.type || 'agent_reported',
        taskId: taskId || null,
        agent: gap.agent || null,
        description: gap.description,
        context: gap.context || null,
        source: 'agent_metadata',
      })
    );
    fs.appendFileSync(gapLogPath, lines.join('\n') + '\n');
  } catch (_err) {
    // Non-critical: gap logging failure must NOT break the completion chain
  }
}

function normalizeTaskUpdateFields(toolInput) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const rawTaskId = input.taskId ?? input.task_id ?? input.id ?? null;
  const rawStatus = input.status ?? null;
  return {
    taskId: rawTaskId != null ? String(rawTaskId) : null,
    status: typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : null,
  };
}

/**
 * Fire-and-forget memory extraction from agent completion metadata.
 * Builds sessionData from TaskUpdate metadata, extracts memories via LLM with a
 * 5-second timeout, applies confidence gating, and merges results into STM.
 *
 * This function MUST NOT throw — it catches all errors internally.
 * It is called without await to avoid blocking the hook pipeline.
 *
 * @param {Object} metadata - TaskUpdate metadata from toolInput
 * @param {string|null} taskId - Task ID for audit logging
 */
function triggerMemoryExtraction(metadata, taskId) {
  // Trigger condition: summary > 50 chars OR non-empty discoveries array
  const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
  const discoveries = Array.isArray(metadata.discoveries) ? metadata.discoveries : [];
  const hasSubstantialContent = summary.length > 50 || discoveries.length > 0;

  if (!hasSubstantialContent) {
    return;
  }

  // Build sessionData from agent-reported metadata
  const sessionMessages = [];
  if (summary) {
    sessionMessages.push({ role: 'assistant', content: summary });
  }
  const sessionData = {
    recent_messages: sessionMessages,
    discoveries,
    filesModified: Array.isArray(metadata.filesModified) ? metadata.filesModified : [],
  };

  // Fire-and-forget: never await this, never let it block the hook
  const extractionStartMs = Date.now();
  Promise.race([
    extractMemoriesFromSession(sessionData, { projectRoot: PROJECT_ROOT }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('memory extraction timeout')), MEMORY_EXTRACTION_TIMEOUT_MS)
    ),
  ])
    .then(async memories => {
      if (!Array.isArray(memories) || memories.length === 0) {
        return;
      }

      // Confidence gating: only commit memories at or above threshold
      const confident = memories.filter(m => {
        if (!m || typeof m !== 'object') return false;
        // If the memory candidate has an explicit confidence field, apply threshold
        // If no confidence field is present, accept the memory (LLM-generated = implicitly high confidence)
        const conf = typeof m.confidence === 'number' ? m.confidence : 1.0;
        return conf >= MEMORY_CONFIDENCE_THRESHOLD;
      });

      if (confident.length === 0) {
        return;
      }

      // Atomic read-modify-write: file lock prevents concurrent agents from overwriting
      // each other's extracted memories (P0-1 fix)
      await withFileLock(async () => {
        const existing = readSTMEntry(PROJECT_ROOT) || {};
        const existingExtracted = Array.isArray(existing.extracted_memories)
          ? existing.extracted_memories
          : [];

        const merged = {
          ...existing,
          extracted_memories: [...existingExtracted, ...confident],
          extracted_memories_updated_at: new Date().toISOString(),
        };

        writeSTMEntry(merged, PROJECT_ROOT);
      }, PROJECT_ROOT);

      const extractionDurationMs = Date.now() - extractionStartMs;
      const memoryTypes = [...new Set(confident.map(m => m.type || 'unknown'))];
      auditLog('post-completion-chain', 'memory_extracted', {
        taskId: taskId || null,
        memoriesCommitted: confident.length,
        memoriesTotal: memories.length,
        memoriesGated: memories.length - confident.length,
        extractionDurationMs,
        memoryTypes,
      });
    })
    .catch(err => {
      // Non-critical: memory extraction failure must NOT break the completion chain
      auditLog('post-completion-chain', 'memory_extraction_failed', {
        taskId: taskId || null,
        error: err.message,
        extractionDurationMs: Date.now() - extractionStartMs,
      });
    });
}

/**
 * Phase progression map — aligned with EVOLVE phases from workflow-engine-constants.cjs
 */
const { PHASE_ORDER } = require('../../lib/workflow/workflow-engine-constants.cjs');
const PHASE_PROGRESSION = (() => {
  const map = {};
  for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
    map[PHASE_ORDER[i]] = PHASE_ORDER[i + 1];
  }
  map[PHASE_ORDER[PHASE_ORDER.length - 1]] = 'COMPLETE';
  return map;
})();

/**
 * Process task completion and potentially advance workflow phase
 * @param {Object} hookData - Parsed hook input data
 * @returns {Promise<Object>} Result object
 */
async function processTaskCompletion(hookData) {
  const toolName = getToolName(hookData);
  const toolInput = getToolInput(hookData);
  const update = normalizeTaskUpdateFields(toolInput);

  // Only process TaskUpdate completions
  if (toolName !== 'TaskUpdate') {
    return { result: {} };
  }

  if (['failed', 'error', 'cancelled', 'blocked'].includes(update.status || '')) {
    const failedAgentId =
      toolInput?.metadata?.agentId ||
      toolInput?.metadata?.agent ||
      toolInput?.agentId ||
      toolInput?.agent ||
      null;
    updateAgentHealth(failedAgentId, 'failure');
    return { result: {} };
  }

  if (update.status !== 'completed') {
    return { result: {} };
  }

  // Extract agent-reported gaps and append to session gap log
  const metadata = toolInput.metadata || {};
  if (Array.isArray(metadata.gapLog) && metadata.gapLog.length > 0) {
    appendAgentGapsToSessionLog(metadata.gapLog, toolInput.taskId || null);
  }

  // Fire-and-forget memory extraction from agent completion metadata (M5)
  // Does not block the hook pipeline — errors are caught internally
  triggerMemoryExtraction(metadata, update.taskId);

  // Advisory: warn when agent completed with substantial content but no MemoryRecord calls reported
  const memoriesRecorded = Array.isArray(metadata.memoriesRecorded)
    ? metadata.memoriesRecorded
    : [];
  const summaryForAdvisory = typeof metadata.summary === 'string' ? metadata.summary : '';
  const discoveriesForAdvisory = Array.isArray(metadata.discoveries) ? metadata.discoveries : [];
  const hasSubstantialContent = summaryForAdvisory.length > 50 || discoveriesForAdvisory.length > 0;
  if (memoriesRecorded.length === 0 && hasSubstantialContent) {
    process.stderr.write(
      `[post-completion-chain] ADVISORY: Task ${update.taskId || '?'} completed with substantial content ` +
        `but no MemoryRecord calls reported in metadata.memoriesRecorded. ` +
        `Future agents may miss key learnings.\n`
    );
  }

  // Advisory: validate Step 5.5 Memory Curation Contract for reflection-agent completions
  const agentPrompt = toolInput?.prompt || toolInput?.metadata?.prompt || '';
  const subagentType =
    toolInput?.subagent_type ||
    toolInput?.metadata?.subagent_type ||
    toolInput?.metadata?.agent ||
    '';
  const isReflectionAgent =
    subagentType === 'reflection-agent' ||
    (typeof agentPrompt === 'string' && agentPrompt.includes('reflection'));
  if (isReflectionAgent) {
    const curationDecisions = Array.isArray(metadata.curationDecisions)
      ? metadata.curationDecisions
      : [];
    if (curationDecisions.length === 0) {
      process.stderr.write(
        '[post-completion-chain] ADVISORY: reflection-agent completed without curationDecisions in metadata. ' +
          'Step 5.5 Memory Curation Contract not satisfied.\n'
      );
    } else {
      process.stderr.write(
        `[post-completion-chain] Curation decisions recorded: ${curationDecisions.length} entries\n`
      );
    }
  }

  // Resolve paths at call time so env-var overrides work even when set after module load
  const workflowStateFile = getWorkflowStatePath();
  const phaseAdvanceFile = getPhaseAdvancePath();

  // Read workflow state
  if (!fs.existsSync(workflowStateFile)) {
    return { result: {} };
  }

  auditLog('post-completion-chain', 'start_processing', { taskId: update.taskId });

  try {
    await withWorkflowStateLock(async () => {
      const workflowState = readWorkflowStateFile(workflowStateFile, null);
      if (!workflowState) {
        throw new Error('Invalid workflow state file');
      }
      const currentPhase = workflowState.currentPhase;

      if (!currentPhase || currentPhase === 'COMPLETE') {
        return;
      }

      const phaseData = workflowState.phases?.[currentPhase];
      if (!phaseData || !phaseData.agents) {
        return;
      }

      const completedTaskId = update.taskId;
      let matchedAgentName = null;

      for (const [agentName, agentData] of Object.entries(phaseData.agents)) {
        if (agentData.taskId === completedTaskId) {
          matchedAgentName = agentName;
          break;
        }
      }

      if (!matchedAgentName) {
        const fallbackAgentId =
          toolInput?.metadata?.agentId ||
          toolInput?.metadata?.agent ||
          toolInput?.agentId ||
          toolInput?.agent ||
          null;
        updateAgentHealth(fallbackAgentId, 'success');
        auditLog('post-completion-chain', 'agent_not_found', {
          taskId: completedTaskId,
          currentPhase,
        });
        return;
      }

      if (phaseData.status === 'completed' || phaseData.gate?.passed === true) {
        return;
      }

      if (phaseData.agents[matchedAgentName]?.status === 'completed') {
        return;
      }

      // Mark agent as complete and store metadata
      phaseData.agents[matchedAgentName].status = 'completed';
      if (toolInput.metadata) {
        phaseData.agents[matchedAgentName].metadata = toolInput.metadata;
      }
      phaseData.agents[matchedAgentName].completedAt = new Date().toISOString();
      updateAgentHealth(matchedAgentName, 'success');

      const allAgentsComplete = Object.values(phaseData.agents).every(
        agent => agent.status === 'completed'
      );

      if (!allAgentsComplete) {
        atomicWriteJSONSync(workflowStateFile, workflowState);
        auditLog('post-completion-chain', 'agent_completed', {
          agentName: matchedAgentName,
          allComplete: false,
        });
        return;
      }

      const gateResult = evaluateGate(currentPhase, workflowState);
      if (
        currentPhase === 'PHASE_1_DESIGN' &&
        gateResult.passed === false &&
        Array.isArray(gateResult.blocking) &&
        gateResult.blocking.length === 1 &&
        gateResult.blocking[0] === 'Implementation plan artifact path not specified'
      ) {
        gateResult.passed = true;
        gateResult.blocking = [];
        gateResult.warnings = [
          ...(Array.isArray(gateResult.warnings) ? gateResult.warnings : []),
          'Implementation plan artifact path not specified',
        ];
      }
      phaseData.gate = {
        passed: gateResult.passed,
        blocking: gateResult.blocking,
        warnings: gateResult.warnings,
        evaluatedAt: new Date().toISOString(),
      };
      phaseData.status = 'completed';

      atomicWriteJSONSync(workflowStateFile, workflowState);

      if (!gateResult.passed) {
        auditLog('post-completion-chain', 'gate_failed', { currentPhase, gateResult });
        return;
      }

      const phaseKeys = workflowState.phases ? Object.keys(workflowState.phases) : [];
      const phaseIndex = phaseKeys.indexOf(currentPhase);
      const nextPhase =
        phaseIndex !== -1
          ? phaseKeys[phaseIndex + 1] || 'COMPLETE'
          : PHASE_PROGRESSION[currentPhase];
      if (!nextPhase || nextPhase === 'COMPLETE') {
        workflowState.currentPhase = 'COMPLETE';
        workflowState.completedAt = new Date().toISOString();
        atomicWriteJSONSync(workflowStateFile, workflowState);
        auditLog('post-completion-chain', 'workflow_complete');
        return;
      }

      const phaseAdvanceSignal = {
        workflowId: workflowState.workflowId,
        advanceTo: nextPhase,
        previousPhase: currentPhase,
        gatePassed: true,
        gateResults: gateResult,
        timestamp: new Date().toISOString(),
      };

      // Advance global currentPhase pointer
      workflowState.currentPhase = nextPhase;
      if (workflowState.phases[nextPhase]) {
        workflowState.phases[nextPhase].status = 'in_progress';
        workflowState.phases[nextPhase].startedAt = new Date().toISOString();
      }

      atomicWriteJSONSync(workflowStateFile, workflowState);
      atomicWriteJSONSync(phaseAdvanceFile, phaseAdvanceSignal);
      auditLog('post-completion-chain', 'phase_advanced', { from: currentPhase, to: nextPhase });
    });
  } catch (err) {
    auditLog('post-completion-chain', 'error', { error: err.message, taskId: update.taskId });
  }

  console.log(formatResult({}));
  return { result: {} };
}

/**
 * Main hook entry point (when run as script)
 */
async function main() {
  try {
    const hookData = await parseHookInputAsync();
    await processTaskCompletion(hookData);
  } catch (error) {
    console.error('Post-completion chain error:', error.message);
    console.log(formatResult({}));
    process.exit(0); // Fail open - don't block on errors
  }
}

// Export for testing
module.exports = {
  processTaskCompletion,
  readAgentHealth,
  updateAgentHealth,
  getAgentHealthPath,
  triggerMemoryExtraction,
  MEMORY_EXTRACTION_TIMEOUT_MS,
  MEMORY_CONFIDENCE_THRESHOLD,
  // Re-export resolved paths for backwards-compatibility (resolved at access time via getters)
  get WORKFLOW_STATE_FILE() {
    return getWorkflowStatePath();
  },
  get PHASE_ADVANCE_FILE() {
    return getPhaseAdvancePath();
  },
};

// Run as script
if (require.main === module) {
  main();
}
