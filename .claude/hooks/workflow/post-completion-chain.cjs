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
const { parseHookInputAsync, formatResult } = require('../../lib/utils/hook-input.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { evaluateGate } = require('../../lib/workflow/quality-gates.cjs');

// Resolve project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKFLOW_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'workflow-state.json'
);
const PHASE_ADVANCE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'phase-advance.json'
);

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
 * Phase progression map
 */
const PHASE_PROGRESSION = {
  PHASE_1_DESIGN: 'PHASE_2_IMPLEMENT',
  PHASE_2_IMPLEMENT: 'PHASE_3_REVIEW',
  PHASE_3_REVIEW: 'PHASE_4_DEPLOY',
  PHASE_4_DEPLOY: 'PHASE_5_DOCUMENT',
  PHASE_5_DOCUMENT: 'PHASE_6_REFLECT',
  PHASE_6_REFLECT: 'COMPLETE',
};

/**
 * Process task completion and potentially advance workflow phase
 * @param {Object} hookData - Parsed hook input data
 * @returns {Promise<Object>} Result object
 */
async function processTaskCompletion(hookData) {
  const toolName = hookData?.toolUse?.tool;
  const toolInput = hookData?.toolUse?.input || {};
  const update = normalizeTaskUpdateFields(toolInput);

  // Only process TaskUpdate completions
  if (toolName !== 'TaskUpdate') {
    console.error('[post-completion-chain] Not a TaskUpdate, passing through');
    console.log(formatResult({}));
    return { result: {} };
  }

  if (update.status !== 'completed') {
    console.error('[post-completion-chain] Status not completed:', update.status);
    console.log(formatResult({}));
    return { result: {} };
  }

  // Read workflow state
  if (!fs.existsSync(WORKFLOW_STATE_FILE)) {
    // No active workflow
    console.error('[post-completion-chain] No workflow state file found');
    console.log(formatResult({}));
    return { result: {} };
  }

  console.error('[post-completion-chain] Processing completion for task:', update.taskId);

  const workflowState = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  const currentPhase = workflowState.currentPhase;

  if (!currentPhase || currentPhase === 'COMPLETE') {
    console.log(formatResult({}));
    return { result: {} };
  }

  // Find which agent this task belongs to
  const phaseData = workflowState.phases?.[currentPhase];
  if (!phaseData || !phaseData.agents) {
    console.log(formatResult({}));
    return { result: {} };
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
    // Task doesn't belong to current phase
    console.log(formatResult({}));
    return { result: {} };
  }

  // Mark agent as complete and store metadata
  phaseData.agents[matchedAgentName].status = 'completed';
  if (toolInput.metadata) {
    phaseData.agents[matchedAgentName].metadata = toolInput.metadata;
  }
  phaseData.agents[matchedAgentName].completedAt = new Date().toISOString();

  // Check if all agents in phase are complete
  const allAgentsComplete = Object.values(phaseData.agents).every(
    agent => agent.status === 'completed'
  );

  if (!allAgentsComplete) {
    // Still waiting for other agents
    atomicWriteJSONSync(WORKFLOW_STATE_FILE, workflowState);
    console.log(formatResult({}));
    return { result: {} };
  }

  // All agents complete - evaluate quality gate
  const gateResult = evaluateGate(currentPhase, workflowState);

  // Record gate result
  phaseData.gate = {
    passed: gateResult.passed,
    blocking: gateResult.blocking,
    warnings: gateResult.warnings,
    evaluatedAt: new Date().toISOString(),
  };

  // Update phase status
  phaseData.status = 'completed';

  // Save updated workflow state
  atomicWriteJSONSync(WORKFLOW_STATE_FILE, workflowState);

  if (!gateResult.passed) {
    // Gate failed - do not advance
    console.error('Quality gate failed:', JSON.stringify(gateResult, null, 2));
    console.log(formatResult({}));
    return { result: {} };
  }

  // Gate passed - determine next phase
  const nextPhase = PHASE_PROGRESSION[currentPhase];

  if (!nextPhase || nextPhase === 'COMPLETE') {
    // Workflow complete
    workflowState.currentPhase = 'COMPLETE';
    workflowState.completedAt = new Date().toISOString();
    atomicWriteJSONSync(WORKFLOW_STATE_FILE, workflowState);
    console.log(formatResult({}));
    return { result: {} };
  }

  // Write phase-advance signal for Router to read
  const phaseAdvanceSignal = {
    workflowId: workflowState.workflowId,
    advanceTo: nextPhase,
    previousPhase: currentPhase,
    gatePassed: true,
    gateResults: gateResult,
    timestamp: new Date().toISOString(),
  };

  atomicWriteJSONSync(PHASE_ADVANCE_FILE, phaseAdvanceSignal);

  // Pass through
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
  WORKFLOW_STATE_FILE,
  PHASE_ADVANCE_FILE,
};

// Run as script
if (require.main === module) {
  main();
}
