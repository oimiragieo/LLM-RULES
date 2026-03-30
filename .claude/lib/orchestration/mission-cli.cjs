'use strict';

/**
 * Mission CLI Entry Point
 *
 * Production mission orchestrator entry point. Provides lifecycle management
 * functions for starting, monitoring, pausing, and resuming missions.
 *
 * Exports:
 * - startMission({featuresPath, missionPath, workingDirectory, options})
 * - getMissionStatus(workspacePath)
 * - pauseMission(workspacePath)
 * - resumeMission(workspacePath)
 */

const fs = require('node:fs');
const path = require('node:path');

const { provisionWorkspace } = require('../mission/workspace-provisioner.cjs');

/**
 * Atomically write a JSON object to a file.
 * Writes to a .tmp file first, then renames to prevent corruption.
 *
 * @param {string} filePath - Target file path
 * @param {Object} data - Data to serialize and write
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read and parse a JSON file.
 *
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON content
 */
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Initialize state.json in the given workspace.
 *
 * @param {string} statePath - Path where state.json will be written
 * @param {Object} fields - State fields to write
 * @returns {Object} The written state object
 */
function initializeState(statePath, fields) {
  atomicWriteJSON(statePath, fields);
  return fields;
}

/**
 * Start a new mission.
 *
 * Provisions a UUID workspace directory under workingDirectory/missions/<uuid>/,
 * creates handoffs/ and progress/ subdirectories, copies features.json into the
 * workspace, and creates state.json with initial mission state.
 *
 * @param {Object} params
 * @param {string} params.featuresPath - Path to the source features.json
 * @param {string} params.missionPath - Path to the mission.md file
 * @param {string} params.workingDirectory - Root directory for workspace creation
 * @param {Object} [params.options] - Additional options (reserved for future use)
 * @returns {{ missionId: string, workspacePath: string, state: Object }}
 */
function startMission({
  featuresPath,
  missionPath: _missionPath,
  workingDirectory,
  options: _options = {},
}) {
  // 1. Provision workspace with handoffs/ and other standard subdirs
  const { missionId, workspacePath } = provisionWorkspace({ rootPath: workingDirectory });

  // 2. Create progress/ subdirectory (in addition to provisioner's standard subdirs)
  const progressPath = path.join(workspacePath, 'progress');
  fs.mkdirSync(progressPath, { recursive: true });

  // 3. Copy features.json into workspace
  const destFeaturesPath = path.join(workspacePath, 'features.json');
  fs.copyFileSync(featuresPath, destFeaturesPath);

  // 4. Count total features for state tracking
  const featuresData = readJSON(featuresPath);
  const totalFeatures = Array.isArray(featuresData.features) ? featuresData.features.length : 0;

  // 5. Create state.json via initializeState
  const statePath = path.join(workspacePath, 'state.json');
  const stateFields = {
    missionId,
    state: 'running',
    workingDirectory,
    workerSessionIds: [],
    completedFeatures: 0,
    totalFeatures,
  };
  const state = initializeState(statePath, stateFields);

  return { missionId, workspacePath, state };
}

/**
 * Get current mission status by reading state.json.
 *
 * @param {string} workspacePath - Path to the mission workspace directory
 * @returns {Object} The current state object from state.json
 */
function getMissionStatus(workspacePath) {
  const statePath = path.join(workspacePath, 'state.json');
  return readJSON(statePath);
}

/**
 * Pause a running mission by setting state to 'paused'.
 *
 * @param {string} workspacePath - Path to the mission workspace directory
 * @returns {Object} The updated state object
 */
function pauseMission(workspacePath) {
  const statePath = path.join(workspacePath, 'state.json');
  const current = readJSON(statePath);
  current.state = 'paused';
  atomicWriteJSON(statePath, current);
  return current;
}

/**
 * Resume a paused mission by setting state to 'running'.
 *
 * @param {string} workspacePath - Path to the mission workspace directory
 * @returns {Object} The updated state object
 */
function resumeMission(workspacePath) {
  const statePath = path.join(workspacePath, 'state.json');
  const current = readJSON(statePath);
  current.state = 'running';
  atomicWriteJSON(statePath, current);
  return current;
}

module.exports = {
  startMission,
  getMissionStatus,
  pauseMission,
  resumeMission,
  initializeState,
  atomicWriteJSON,
};
