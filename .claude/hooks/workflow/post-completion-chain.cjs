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

  if (update.status !== 'completed') {
    return { result: {} };
  }

  // Extract agent-reported gaps and append to session gap log
  const metadata = toolInput.metadata || {};
  if (Array.isArray(metadata.gapLog) && metadata.gapLog.length > 0) {
    appendAgentGapsToSessionLog(metadata.gapLog, toolInput.taskId || null);
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

      const nextPhase = PHASE_PROGRESSION[currentPhase];
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
