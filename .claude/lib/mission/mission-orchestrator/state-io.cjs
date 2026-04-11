'use strict';

/**
 * Mission Orchestrator — State I/O helpers
 *
 * Atomic load/save for state.json, features.json, and validation-state.json.
 * Used by feature-selection.cjs and orchestrator-factory.cjs.
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../utils/safe-json.cjs');

/**
 * Load mission state from disk.
 * @param {string} missionDir - Mission bundle directory
 * @returns {{ state: object, features: object[], validationState: object }}
 */
function loadMissionState(missionDir) {
  const statePath = path.join(missionDir, 'state.json');
  const featuresPath = path.join(missionDir, 'features.json');
  const validationPath = path.join(missionDir, 'validation-state.json');

  const state = safeParseJSON(fs.readFileSync(statePath, 'utf8'), {});
  const featuresDoc = safeParseJSON(fs.readFileSync(featuresPath, 'utf8'), {});
  const validationState = fs.existsSync(validationPath)
    ? safeParseJSON(fs.readFileSync(validationPath, 'utf8'), { assertions: {} })
    : { assertions: {} };

  return { state, features: featuresDoc.features || [], validationState };
}

/**
 * Save mission state to disk atomically.
 * @param {string} missionDir - Mission bundle directory
 * @param {object} state - State object to write
 */
function saveMissionState(missionDir, state) {
  const statePath = path.join(missionDir, 'state.json');
  const tmpPath = statePath + '.tmp.' + Date.now();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, statePath);
}

/**
 * Save features document to disk atomically.
 * @param {string} missionDir - Mission bundle directory
 * @param {object[]} features - Features array
 */
function saveFeaturesDoc(missionDir, features) {
  const featuresPath = path.join(missionDir, 'features.json');
  const tmpPath = featuresPath + '.tmp.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify({ features }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, featuresPath);
}

module.exports = {
  loadMissionState,
  saveMissionState,
  saveFeaturesDoc,
};
