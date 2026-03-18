#!/usr/bin/env node
'use strict';

/**
 * Trajectory IR Normalizer (Feature F4)
 * ======================================
 * Normalizes session log entries into the canonical Trajectory IR schema
 * for cross-session analysis of agent behavior patterns.
 *
 * Usage:
 *   const { normalizeSessionLog, createTrajectory, addStep } = require('./trajectory-normalizer.cjs');
 */

/**
 * Create a new trajectory record.
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.agentType
 * @param {string} [params.taskId]
 * @param {string} [params.model='sonnet']
 * @returns {Object} Trajectory IR object
 */
function createTrajectory({ sessionId, agentType, taskId, model }) {
  return {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    ended_at: null,
    agent_type: agentType,
    task_id: taskId || null,
    model: model || 'sonnet',
    steps: [],
    outcome: 'partial',
    metrics: {
      total_steps: 0,
      total_duration_ms: 0,
      tool_calls: 0,
      errors: 0,
      tokens_used: null,
      files_modified: 0,
    },
    metadata: {},
  };
}

/**
 * Add a step to a trajectory.
 * @param {Object} trajectory - Trajectory IR object
 * @param {Object} step
 * @param {string} step.action_type
 * @param {string} [step.tool_name]
 * @param {string} [step.input_summary]
 * @param {string} [step.output_summary]
 * @param {number} [step.duration_ms]
 * @param {boolean} step.success
 * @param {string} [step.error_category]
 * @returns {Object} Updated trajectory
 */
function addStep(trajectory, step) {
  const stepNumber = trajectory.steps.length + 1;
  const normalizedStep = {
    step_number: stepNumber,
    timestamp: new Date().toISOString(),
    action_type: step.action_type,
    tool_name: step.tool_name || null,
    input_summary: (step.input_summary || '').substring(0, 200),
    output_summary: (step.output_summary || '').substring(0, 200),
    duration_ms: step.duration_ms || null,
    success: Boolean(step.success),
    error_category: step.error_category || null,
  };

  trajectory.steps.push(normalizedStep);

  // Update metrics
  trajectory.metrics.total_steps = stepNumber;
  if (normalizedStep.duration_ms) {
    trajectory.metrics.total_duration_ms += normalizedStep.duration_ms;
  }
  if (normalizedStep.action_type === 'tool_call') {
    trajectory.metrics.tool_calls++;
  }
  if (!normalizedStep.success) {
    trajectory.metrics.errors++;
  }

  return trajectory;
}

/**
 * Finalize a trajectory with outcome and end time.
 * @param {Object} trajectory
 * @param {'success'|'failure'|'partial'|'timeout'|'cancelled'} outcome
 * @param {Object} [finalMetrics]
 * @returns {Object} Finalized trajectory
 */
function finalizeTrajectory(trajectory, outcome, finalMetrics) {
  trajectory.ended_at = new Date().toISOString();
  trajectory.outcome = outcome;
  if (finalMetrics) {
    Object.assign(trajectory.metrics, finalMetrics);
  }
  return trajectory;
}

/**
 * Normalize raw session gap log entries into trajectory steps.
 * @param {Array<Object>} gapLogEntries - Entries from session-gap-log.jsonl
 * @param {string} sessionId
 * @param {string} agentType
 * @returns {Object} Trajectory IR object
 */
function normalizeSessionLog(gapLogEntries, sessionId, agentType) {
  const trajectory = createTrajectory({ sessionId, agentType });

  for (const entry of gapLogEntries) {
    addStep(trajectory, {
      action_type: mapGapTypeToActionType(entry.type),
      tool_name: entry.tool || null,
      input_summary: entry.description || '',
      output_summary: entry.context || '',
      success: entry.type !== 'error' && entry.type !== 'hook-warning',
      error_category: entry.type === 'error' ? entry.errorCategory || 'unknown' : null,
    });
  }

  return trajectory;
}

/**
 * Map gap log entry types to trajectory action types.
 * @param {string} gapType
 * @returns {string}
 */
function mapGapTypeToActionType(gapType) {
  const mapping = {
    'tool-call': 'tool_call',
    'task-spawn': 'task_spawn',
    'task-update': 'task_update',
    'skill-invoke': 'skill_invoke',
    error: 'error',
    'hook-warning': 'error',
    deviation: 'decision',
    cleanup: 'observation',
    'stale-task': 'observation',
  };
  return mapping[gapType] || 'observation';
}

module.exports = {
  createTrajectory,
  addStep,
  finalizeTrajectory,
  normalizeSessionLog,
};
