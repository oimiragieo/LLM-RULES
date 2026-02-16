/**
 * Workflow State Manager
 * ======================
 *
 * Manages workflow state files for enterprise orchestration.
 * Part of enterprise orchestration workflow (Task 2.1).
 *
 * API:
 * - createWorkflow(requestSummary, complexity, stateFilePath?) - Create new workflow
 * - getActiveWorkflow(stateFilePath?) - Get active workflow or null
 * - advancePhase(workflowId, nextPhase, stateFilePath?) - Advance to next phase
 * - recordAgent(workflowId, phase, agentType, taskId, stateFilePath?) - Register agent
 * - markAgentComplete(workflowId, phase, agentType, metadata, stateFilePath?) - Mark agent done
 * - evaluateGate(workflowId, phase, stateFilePath?) - Check if gate passes
 * - completeWorkflow(workflowId, stateFilePath?) - Mark workflow complete
 * - getPhaseArtifacts(workflowId, phase, stateFilePath?) - Get artifacts for handoff
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readWorkflowStateFile } = require('../runtime/state-contracts.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const eventBus = require('../events/event-bus.cjs');

/**
 * Default state file path
 */
const DEFAULT_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'workflow-state.json'
);

/**
 * All possible phases
 */
const ALL_PHASES = [
  'PHASE_0_TRIAGE',
  'PHASE_1_DESIGN',
  'PHASE_2_IMPLEMENT',
  'PHASE_3_REVIEW',
  'PHASE_4_DEPLOY',
  'PHASE_5_DOCUMENT',
  'PHASE_6_REFLECT',
];

/**
 * Generate a unique workflow ID
 * @returns {string} workflowId like "wf-2026-02-06-abc123"
 */
function generateWorkflowId() {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const random = Math.random().toString(36).substring(2, 8); // 6 random chars
  return `wf-${date}-${random}`;
}

/**
 * Initialize a phase object
 * @returns {{ status: string, agents: {}, gate: null }}
 */
function initializePhase() {
  return {
    status: 'pending',
    agents: {},
    gate: null,
  };
}

/**
 * Read state file safely
 * @param {string} stateFilePath
 * @returns {object|null}
 */
function readState(stateFilePath) {
  try {
    return readWorkflowStateFile(stateFilePath, null);
  } catch (_err) {
    // Corrupted file or invalid JSON
    return null;
  }
}

/**
 * Write state file
 * @param {string} stateFilePath
 * @param {object} state
 */
function writeState(stateFilePath, state) {
  // Ensure directory exists
  const dir = path.dirname(stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Update updatedAt timestamp
  state.updatedAt = new Date().toISOString();

  // Write file atomically (temp + rename) to avoid partial/truncated state.
  atomicWriteJSONSync(stateFilePath, state);
}

/**
 * Create a new workflow
 * @param {string} requestSummary - User's request summary
 * @param {string} complexity - TRIVIAL | LOW | MEDIUM | HIGH | EPIC
 * @param {string} stateFilePath - Optional custom state file path
 * @returns {string} workflowId
 */
function createWorkflow(requestSummary, complexity, stateFilePath = DEFAULT_STATE_FILE) {
  const workflowId = generateWorkflowId();
  const now = new Date().toISOString();

  // Initialize all phases
  const phases = {};
  ALL_PHASES.forEach(phase => {
    phases[phase] = initializePhase();
  });

  // Set PHASE_0_TRIAGE as completed (Router does triage)
  phases.PHASE_0_TRIAGE.status = 'completed';
  phases.PHASE_0_TRIAGE.completedAt = now;

  const state = {
    workflowId,
    traceId: eventBus.getContext().traceId,
    requestSummary,
    complexity,
    currentPhase: 'PHASE_0_TRIAGE',
    phases,
    artifacts: {},
    skippedPhases: [],
    createdAt: now,
    updatedAt: now,
  };

  writeState(stateFilePath, state);
  return workflowId;
}

/**
 * Get the active workflow (or null if none active or completed)
 * @param {string} stateFilePath
 * @returns {object|null}
 */
function getActiveWorkflow(stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state) {
    return null;
  }

  // Check if workflow is completed
  if (state.currentPhase === 'COMPLETE') {
    return null;
  }

  return state;
}

/**
 * Advance workflow to next phase
 * @param {string} workflowId
 * @param {string} nextPhase
 * @param {string} stateFilePath
 */
function advancePhase(workflowId, nextPhase, stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const now = new Date().toISOString();
  const contextTraceId = eventBus.getContext().traceId;
  if (!state.traceId && contextTraceId) {
    state.traceId = contextTraceId;
  }

  // Mark current phase as completed
  if (state.currentPhase !== 'PHASE_0_TRIAGE') {
    state.phases[state.currentPhase].status = 'completed';
    state.phases[state.currentPhase].completedAt = now;
  }

  // Advance to next phase
  state.currentPhase = nextPhase;
  state.phases[nextPhase].status = 'in_progress';
  state.phases[nextPhase].startedAt = now;

  writeState(stateFilePath, state);
}

/**
 * Record an agent starting work in a phase
 * @param {string} workflowId
 * @param {string} phase
 * @param {string} agentType
 * @param {string} taskId
 * @param {string} stateFilePath
 */
function recordAgent(workflowId, phase, agentType, taskId, stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  if (!state.phases[phase]) {
    throw new Error(`Phase ${phase} not found`);
  }

  const now = new Date().toISOString();

  state.phases[phase].agents[agentType] = {
    taskId,
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    artifacts: [],
    metadata: {},
  };

  writeState(stateFilePath, state);
}

/**
 * Mark an agent as completed
 * @param {string} workflowId
 * @param {string} phase
 * @param {string} agentType
 * @param {object} metadata - Agent completion metadata
 * @param {string} stateFilePath
 */
function markAgentComplete(
  workflowId,
  phase,
  agentType,
  metadata = {},
  stateFilePath = DEFAULT_STATE_FILE
) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  if (!state.phases[phase] || !state.phases[phase].agents[agentType]) {
    throw new Error(`Agent ${agentType} in phase ${phase} not found`);
  }

  const now = new Date().toISOString();

  state.phases[phase].agents[agentType].status = 'completed';
  state.phases[phase].agents[agentType].completedAt = now;
  state.phases[phase].agents[agentType].metadata = metadata;

  // Store artifacts if provided
  if (metadata.artifacts) {
    state.phases[phase].agents[agentType].artifacts = metadata.artifacts;
  }

  writeState(stateFilePath, state);
}

/**
 * Evaluate quality gate for a phase
 * @param {string} workflowId
 * @param {string} phase
 * @param {string} stateFilePath
 * @returns {{ passed: boolean, checks: string[], failedChecks: string[] }}
 */
function evaluateGate(workflowId, phase, stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  if (!state.phases[phase]) {
    throw new Error(`Phase ${phase} not found`);
  }

  const checks = [];
  const failedChecks = [];

  // Gate 1: All agents in phase must be completed
  const agents = state.phases[phase].agents || {};
  const agentKeys = Object.keys(agents);

  if (agentKeys.length === 0) {
    failedChecks.push('No agents assigned to phase');
  } else {
    const allCompleted = agentKeys.every(key => agents[key].status === 'completed');
    if (allCompleted) {
      checks.push('All agents completed');
    } else {
      failedChecks.push('Not all agents completed');
    }
  }

  const passed = failedChecks.length === 0;

  // Record gate evaluation in state
  const now = new Date().toISOString();
  state.phases[phase].gate = {
    passed,
    checks,
    failedChecks,
    checkedAt: now,
  };

  writeState(stateFilePath, state);

  return {
    passed,
    checks,
    failedChecks,
  };
}

/**
 * Mark workflow as complete
 * @param {string} workflowId
 * @param {string} stateFilePath
 */
function completeWorkflow(workflowId, stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const now = new Date().toISOString();

  state.currentPhase = 'COMPLETE';
  state.completedAt = now;

  writeState(stateFilePath, state);
}

/**
 * Get artifacts from a phase for handoff
 * @param {string} workflowId
 * @param {string} phase
 * @param {string} stateFilePath
 * @returns {string[]} Array of artifact paths
 */
function getPhaseArtifacts(workflowId, phase, stateFilePath = DEFAULT_STATE_FILE) {
  const state = readState(stateFilePath);

  if (!state || state.workflowId !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  if (!state.phases[phase]) {
    throw new Error(`Phase ${phase} not found`);
  }

  const artifacts = [];
  const agents = state.phases[phase].agents || {};

  Object.values(agents).forEach(agent => {
    if (agent.artifacts && Array.isArray(agent.artifacts)) {
      artifacts.push(...agent.artifacts);
    }
  });

  return artifacts;
}

module.exports = {
  DEFAULT_STATE_FILE,
  createWorkflow,
  getActiveWorkflow,
  advancePhase,
  recordAgent,
  markAgentComplete,
  evaluateGate,
  completeWorkflow,
  getPhaseArtifacts,
};
