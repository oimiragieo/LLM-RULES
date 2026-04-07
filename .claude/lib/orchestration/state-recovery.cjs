'use strict';

/**
 * State Recovery
 *
 * Atomic state persistence and crash recovery for the mission orchestrator.
 *
 * Exports:
 * - saveState(workspacePath, stateUpdate)
 *   Atomically merges stateUpdate into state.json (write-to-.tmp-then-rename).
 *   Creates state.json if it does not exist. Returns the updated state object.
 *
 * - recoverState(workspacePath)
 *   Loads existing state.json, identifies features stuck in `in_progress`
 *   (orphaned at crash), transitions them through in_progress->failed->pending
 *   for re-dispatch. Updates completedFeatures count by scanning features.json.
 *   Persists the corrected state and returns it.
 */

const fs = require('node:fs');
const path = require('node:path');

const { FeaturesStateMachine } = require('../mission/features-state-machine.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Atomic JSON write: write to .tmp file then rename to prevent corruption.
 *
 * @param {string} filePath - Target file path
 * @param {object} data     - Object to serialize
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read and parse a JSON file safely.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * @param {string} filePath
 * @returns {object|null}
 */
function readJSONSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// saveState
// ---------------------------------------------------------------------------

/**
 * Atomically update state.json in the workspace.
 *
 * Reads the existing state.json (if present), merges stateUpdate into it,
 * and writes the result atomically using the write-to-.tmp-then-rename pattern.
 * If state.json does not yet exist, the result contains only stateUpdate fields.
 *
 * @param {string} workspacePath - Path to the mission workspace directory
 * @param {object} stateUpdate   - State fields to merge into state.json
 * @returns {object} The updated (merged) state object
 */
function saveState(workspacePath, stateUpdate) {
  const statePath = path.join(path.normalize(workspacePath), 'state.json');

  // Read existing state or start with empty object
  const existing = readJSONSafe(statePath) || {};

  // Merge: stateUpdate fields overwrite existing fields
  const updated = { ...existing, ...stateUpdate };

  // Write atomically
  atomicWriteJSON(statePath, updated);

  return updated;
}

// ---------------------------------------------------------------------------
// recoverState
// ---------------------------------------------------------------------------

/**
 * Load existing state.json and recover from a crash.
 *
 * Recovery steps:
 * 1. Load state.json — required; throws if missing.
 * 2. Load features.json from the workspace (workspace copy).
 * 3. Find features whose status is `in_progress` (orphaned at crash).
 * 4. For each orphaned feature: transition in_progress -> failed -> pending.
 * 5. Count completed features from the updated features list.
 * 6. Update completedFeatures in state.json and persist atomically.
 * 7. Return the recovered state.
 *
 * @param {string} workspacePath - Path to the mission workspace directory
 * @returns {object} The recovered state object
 * @throws {Error} If state.json does not exist or cannot be read
 */
function recoverState(workspacePath) {
  const normPath = path.normalize(workspacePath);
  const statePath = path.join(normPath, 'state.json');
  const featuresPath = path.join(normPath, 'features.json');

  // 1. Load state.json — required for recovery
  if (!fs.existsSync(statePath)) {
    const err = new Error(`state.json not found at: ${statePath}`);
    err.code = 'STATE_NOT_FOUND';
    throw err;
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (parseErr) {
    const err = new Error(`Failed to parse state.json: ${parseErr.message}`);
    err.code = 'STATE_PARSE_ERROR';
    throw err;
  }

  // 2. Load and process features.json if it exists in the workspace
  if (fs.existsSync(featuresPath)) {
    // Load FeaturesStateMachine for state transitions
    const machine = new FeaturesStateMachine(featuresPath);
    machine.load();

    // 3. Find orphaned in_progress features (crashed workers)
    const orphaned = machine.getAllFeatures().filter(f => f.status === 'in_progress');

    // 4. Transition each orphaned feature: in_progress -> failed -> pending
    for (const feature of orphaned) {
      machine.transition(feature.id, 'failed');
      machine.transition(feature.id, 'pending');
    }

    // 5. Count completed features from the updated (in-memory) list
    const completedCount = machine.getAllFeatures().filter(f => f.status === 'completed').length;

    // 6. Update completedFeatures and persist state atomically
    state.completedFeatures = completedCount;
    atomicWriteJSON(statePath, state);
  }

  // 7. Return recovered state
  return state;
}

// ---------------------------------------------------------------------------
// Feature-flagged: node-repair strategy selection for failed tasks
// ---------------------------------------------------------------------------

/**
 * Select a repair strategy for a failed task using node-repair module.
 * Returns { strategy: 'retry'|'decompose'|'escalate', reason: string }
 *
 * @param {{ taskId: string, failureType: string, attemptCount: number, maxAttempts?: number }} opts
 * @returns {{ strategy: string, reason: string }}
 */
function selectTaskRepairStrategy(opts) {
  if (process.env.NODE_REPAIR !== 'true') {
    return { strategy: 'escalate', reason: 'Node repair disabled' };
  }
  try {
    const { selectRepairStrategy } = require('../utils/node-repair.cjs');
    return selectRepairStrategy(opts);
  } catch {
    return { strategy: 'escalate', reason: 'Node repair module unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Feature-flagged: pipeline pause/resume controller
// ---------------------------------------------------------------------------

/**
 * Create a PauseResumeController for a pipeline.
 * Returns null if feature is disabled.
 *
 * @param {string} pipelineId
 * @returns {object|null}
 */
function createPipelineController(pipelineId) {
  if (process.env.PIPELINE_PAUSE_RESUME !== 'true') return null;
  try {
    const { PauseResumeController } = require('./pause-resume.cjs');
    return new PauseResumeController(pipelineId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { saveState, recoverState, selectTaskRepairStrategy, createPipelineController };
