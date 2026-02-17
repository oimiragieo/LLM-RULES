#!/usr/bin/env node
/**
 * Workflow Path Resolution Utilities
 * ====================================
 *
 * Centralises the resolution order for workflow state file paths so that all
 * workflow hooks and tools use a single, consistent strategy:
 *
 *   1. Explicit env var (highest priority – test isolation / overrides)
 *   2. PROJECT_ROOT from project-root.cjs (deterministic, __dirname-anchored)
 *   3. Hardcoded __dirname-relative fallback (safety net only)
 *
 * Using a helper function (rather than module-level constants) ensures that
 * callers always receive the correct path even when the env var is set after
 * module load, e.g. in test suites that mutate process.env per test.
 *
 * @module workflow-paths
 */

'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('./project-root.cjs');

/** Default runtime dir relative to project root */
const RUNTIME_REL = path.join('.claude', 'context', 'runtime');

/**
 * Resolve the path to the workflow state file.
 *
 * Resolution order (first defined wins):
 *   1. process.env.WORKFLOW_STATE_FILE
 *   2. <PROJECT_ROOT>/.claude/context/runtime/workflow-state.json
 *
 * @returns {string} Absolute path to workflow-state.json
 */
function getWorkflowStatePath() {
  if (process.env.WORKFLOW_STATE_FILE) {
    return process.env.WORKFLOW_STATE_FILE;
  }
  return path.join(PROJECT_ROOT, RUNTIME_REL, 'workflow-state.json');
}

/**
 * Resolve the path to the phase-advance signal file.
 *
 * Resolution order (first defined wins):
 *   1. process.env.PHASE_ADVANCE_FILE
 *   2. <PROJECT_ROOT>/.claude/context/runtime/phase-advance.json
 *
 * @returns {string} Absolute path to phase-advance.json
 */
function getPhaseAdvancePath() {
  if (process.env.PHASE_ADVANCE_FILE) {
    return process.env.PHASE_ADVANCE_FILE;
  }
  return path.join(PROJECT_ROOT, RUNTIME_REL, 'phase-advance.json');
}

module.exports = {
  getWorkflowStatePath,
  getPhaseAdvancePath,
};
