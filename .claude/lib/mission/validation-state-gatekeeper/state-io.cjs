'use strict';

/**
 * Validation state IO — atomic write, corruption backup, initialize, load.
 * Extracted from validation-state-gatekeeper.cjs as part of H-09 split.
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../utils/safe-json.cjs');
const { VALID_STATES, DEFAULT_ASSERTION } = require('./constants.cjs');

/**
 * Atomic write: write to .tmp file then rename
 * Prevents corruption from mid-write crashes
 *
 * @param {string} filePath - Target file path
 * @param {Object} data - Data to write
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2);

  // Write to temp file first
  fs.writeFileSync(tmpPath, content, 'utf8');

  // Rename is atomic on most filesystems
  fs.renameSync(tmpPath, filePath);
}

/**
 * Create backup of corrupted state file
 *
 * @param {string} filePath - Path to the corrupted file
 * @returns {string} - Path to the backup file
 */
function createCorruptionBackup(filePath) {
  const timestamp = Date.now();
  const backupPath = `${filePath}.corrupt.${timestamp}`;

  if (fs.existsSync(filePath)) {
    // Copy (not rename) so we can still write a new file at the original path
    const content = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(backupPath, content, 'utf8');
  }

  return backupPath;
}

/**
 * Initialize a fresh validation-state.json file with empty assertions
 *
 * @param {string} statePath - Path to validation-state.json
 */
function initializeState(statePath) {
  const state = {
    assertions: {},
  };

  // Ensure directory exists
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  atomicWriteJSON(statePath, state);
}

/**
 * Load and parse validation-state.json with corruption handling
 *
 * @param {string} statePath - Path to validation-state.json
 * @returns {Object} - { state, recovered }
 */
function loadState(statePath) {
  // Check if file exists
  if (!fs.existsSync(statePath)) {
    // File doesn't exist - create with defaults
    initializeState(statePath);
    return { state: { assertions: {} }, recovered: true, created: true };
  }

  // Try to read and parse
  let content;
  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_readErr) {
    // Can't read file - backup and reinitialize
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { assertions: {} }, recovered: true, created: false };
  }

  // Handle empty file
  if (!content || content.trim() === '') {
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { assertions: {} }, recovered: true, created: false };
  }

  // Try to parse JSON
  let state;
  try {
    state = safeParseJSON(content, null);
  } catch (_parseErr) {
    // Invalid JSON - backup and reinitialize
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { assertions: {} }, recovered: true, created: false };
  }

  // Validate required fields exist
  if (typeof state !== 'object' || state === null) {
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { assertions: {} }, recovered: true, created: false };
  }

  // Ensure assertions field exists
  if (!state.assertions || typeof state.assertions !== 'object') {
    state.assertions = {};
  }

  // Validate each assertion has a valid status
  let hasInvalidStatus = false;
  for (const [id, assertion] of Object.entries(state.assertions)) {
    if (!assertion || typeof assertion !== 'object') {
      state.assertions[id] = { ...DEFAULT_ASSERTION };
      hasInvalidStatus = true;
    } else if (!VALID_STATES.includes(assertion.status)) {
      state.assertions[id] = { ...DEFAULT_ASSERTION, ...assertion, status: 'pending' };
      hasInvalidStatus = true;
    }
  }

  // If we fixed invalid data, persist the corrected state
  if (hasInvalidStatus) {
    atomicWriteJSON(statePath, state);
  }

  return { state, recovered: false, created: false };
}

module.exports = {
  atomicWriteJSON,
  createCorruptionBackup,
  initializeState,
  loadState,
};
