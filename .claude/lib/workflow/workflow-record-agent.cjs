'use strict';

/**
 * Workflow Record Agent Helper
 * ============================
 *
 * Provides a safe, fire-and-forget helper to record an agent spawn in the
 * current active workflow phase.  Designed to be called from PreToolUse(Task)
 * hooks; errors are swallowed so bad workflow state never blocks spawning.
 *
 * API:
 *   recordAgentForCurrentPhaseIfActive(projectRoot, { taskId, agentType }, stateFilePath?)
 */

const path = require('path');
const { getActiveWorkflow } = require('./workflow-state-manager.cjs');
const { withWorkflowStateLock } = require('./workflow-state-lock.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

/**
 * Phases where agent recording is skipped (not meaningful to track).
 */
const SKIP_PHASES = new Set(['PHASE_0_TRIAGE', 'COMPLETE']);

/**
 * Record an agent spawn in the current active workflow phase, if one is active
 * and the current phase is meaningful to track.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {{ taskId: string, agentType: string }} agentInfo
 * @param {string} [stateFilePath] - Optional override for workflow state file path
 */
function recordAgentForCurrentPhaseIfActive(projectRoot, agentInfo, stateFilePath) {
  try {
    const { taskId, agentType } = agentInfo || {};

    if (!taskId || !agentType) {
      return;
    }

    // Resolve default state file path
    if (!stateFilePath) {
      stateFilePath = path.join(
        projectRoot,
        '.claude',
        'context',
        'runtime',
        'workflow-state.json'
      );
    }

    // getActiveWorkflow returns null when file missing, invalid, or phase COMPLETE
    const workflow = getActiveWorkflow(stateFilePath);
    if (!workflow) {
      return;
    }

    const { currentPhase, workflowId } = workflow;

    // Skip triage phase and completed workflows
    if (!currentPhase || SKIP_PHASES.has(currentPhase)) {
      return;
    }

    // Ensure the phase exists in the state
    if (!workflow.phases || !workflow.phases[currentPhase]) {
      return;
    }

    // Perform the write under the workflow state lock for concurrency safety
    withWorkflowStateLock(async () => {
      const { readWorkflowStateFile } = require('../runtime/state-contracts.cjs');
      const state = readWorkflowStateFile(stateFilePath, null);
      if (!state || state.workflowId !== workflowId) {
        return;
      }

      const phase = state.phases[currentPhase];
      if (!phase) {
        return;
      }

      // Only set if not already recorded (avoid clobbering existing entry)
      if (phase.agents && phase.agents[agentType]) {
        return;
      }

      if (!phase.agents) {
        phase.agents = {};
      }

      phase.agents[agentType] = {
        taskId,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        completedAt: null,
        artifacts: [],
        metadata: {},
      };

      state.updatedAt = new Date().toISOString();
      atomicWriteJSONSync(stateFilePath, state);
    }).catch(err => {
      // Swallow: workflow state errors must never block agent spawning
      if (process.env.WORKFLOW_RECORD_AGENT_DEBUG === 'true') {
        process.stderr.write(
          `[workflow-record-agent] lock error: ${err && err.message}\n`
        );
      }
    });
  } catch (err) {
    // Swallow all errors — bad workflow state must never block spawning
    if (process.env.WORKFLOW_RECORD_AGENT_DEBUG === 'true') {
      process.stderr.write(
        `[workflow-record-agent] error: ${err && err.message}\n`
      );
    }
  }
}

module.exports = {
  recordAgentForCurrentPhaseIfActive,
};
