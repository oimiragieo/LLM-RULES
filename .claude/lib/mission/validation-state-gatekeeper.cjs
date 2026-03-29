'use strict';

/**
 * Validation State Gatekeeper
 *
 * Manages validation-state.json tracking assertion pass/fail states.
 *
 * Valid states: pending, passed, failed, blocked
 *
 * Valid transitions:
 * - pending -> passed
 * - pending -> failed
 * - pending -> blocked
 * - failed -> passed (re-validation)
 * - failed -> blocked
 * - blocked -> pending
 *
 * Invalid: passed -> pending rejected (passed is terminal)
 *
 * canComplete(featureId) returns {allowed, blocking[]} - true only when all linked assertions are passed.
 * revalidate(featureId) re-runs only failed assertions.
 *
 * Atomic persistence via write-temp-rename.
 * Corruption detected on load: backup as .corrupt.<timestamp>, reinitialize all assertions as pending.
 * Orphaned assertion IDs (in state but not contract) logged as warnings and excluded.
 * New contract IDs auto-added as pending.
 * Concurrent updates serialized via write queue.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseValidationContract, getRuleIds } = require('./validation-contract-parser.cjs');

// Valid assertion states
const VALID_STATES = ['pending', 'passed', 'failed', 'blocked'];

// Valid state transitions (from -> [allowed to states])
// passed is a terminal state - no outgoing transitions
const VALID_TRANSITIONS = {
  pending: ['passed', 'failed', 'blocked'],
  failed: ['passed', 'blocked', 'pending'],
  blocked: ['pending'],
  passed: [], // Terminal state
};

// Default assertion structure
const DEFAULT_ASSERTION = {
  status: 'pending',
  updatedAt: null,
  validatedAtMilestone: null,
};

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
    state = JSON.parse(content);
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

/**
 * Validation State Gatekeeper class
 */
class ValidationStateGatekeeper {
  /**
   * @param {string} statePath - Path to validation-state.json file
   * @param {Object} options - Optional configuration
   * @param {string} options.contractPath - Path to validation-contract.md for sync
   */
  constructor(statePath, options = {}) {
    this.statePath = path.normalize(statePath);
    this.contractPath = options.contractPath ? path.normalize(options.contractPath) : null;

    // Write queue for concurrent updates
    this._writeQueue = [];
    this._writeInProgress = false;

    // Load state on construction
    this._load();
  }

  /**
   * Load state from disk (with corruption recovery)
   */
  _load() {
    const { state, recovered, created } = loadState(this.statePath);
    this._state = state;
    this._recovered = recovered;
    this._created = created;
  }

  /**
   * Persist state to disk with atomic write
   */
  _persist() {
    atomicWriteJSON(this.statePath, this._state);
  }

  /**
   * Process write queue for concurrent updates
   */
  async _processWriteQueue() {
    if (this._writeInProgress || this._writeQueue.length === 0) {
      return;
    }

    this._writeInProgress = true;

    while (this._writeQueue.length > 0) {
      const { operation, resolve, reject } = this._writeQueue.shift();

      try {
        const result = operation();
        this._persist();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this._writeInProgress = false;
  }

  /**
   * Get current state (read-only copy)
   * @returns {Object} - State object
   */
  getState() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * Get assertion status by ID
   * @param {string} assertionId - Assertion ID
   * @returns {Object|null} - Assertion object or null
   */
  getAssertion(assertionId) {
    const assertion = this._state.assertions[assertionId];
    return assertion ? { ...assertion } : null;
  }

  /**
   * Transition an assertion to a new status
   *
   * @param {string} assertionId - Assertion ID to transition
   * @param {string} newStatus - Target status
   * @returns {Object} - { success: true, previousStatus, newStatus, updatedAt }
   * @throws {Error} With code for invalid transitions or unknown assertions
   */
  transition(assertionId, newStatus) {
    // Validate status value
    if (!VALID_STATES.includes(newStatus)) {
      const error = new Error(`Invalid status value: ${newStatus}`);
      error.code = 'INVALID_STATUS';
      error.details = { status: newStatus, validStates: VALID_STATES };
      throw error;
    }

    // Check assertion exists
    const assertion = this._state.assertions[assertionId];
    if (!assertion) {
      const error = new Error(`Assertion not found: ${assertionId}`);
      error.code = 'ASSERTION_NOT_FOUND';
      error.details = { assertionId };
      throw error;
    }

    const currentStatus = assertion.status;

    // Check if current state is terminal (passed)
    if (VALID_TRANSITIONS[currentStatus].length === 0) {
      const error = new Error(
        `Invalid transition: ${currentStatus} is a terminal state, cannot transition to ${newStatus}`
      );
      error.code = 'INVALID_TRANSITION';
      error.details = { assertionId, from: currentStatus, to: newStatus, reason: 'terminal' };
      throw error;
    }

    // Check if transition is valid
    if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
      const error = new Error(
        `Invalid transition: cannot go from ${currentStatus} to ${newStatus}`
      );
      error.code = 'INVALID_TRANSITION';
      error.details = { assertionId, from: currentStatus, to: newStatus };
      throw error;
    }

    // Update assertion
    const now = new Date().toISOString();
    this._state.assertions[assertionId] = {
      ...assertion,
      status: newStatus,
      updatedAt: now,
    };

    // Persist
    this._persist();

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus,
      updatedAt: now,
    };
  }

  /**
   * Async version of transition for concurrent operations
   * Uses write queue for serialization
   *
   * @param {string} assertionId - Assertion ID to transition
   * @param {string} newStatus - Target status
   * @returns {Promise<Object>} - Transition result
   */
  async transitionAsync(assertionId, newStatus) {
    return new Promise((resolve, reject) => {
      this._writeQueue.push({
        operation: () => this.transition(assertionId, newStatus),
        resolve,
        reject,
      });

      // Trigger queue processing
      this._processWriteQueue();
    });
  }

  /**
   * Check if a feature can be marked as complete
   * Returns true only when all linked assertions are passed
   *
   * @param {string[]} assertionIds - Array of assertion IDs the feature fulfills
   * @returns {Object} - { allowed: boolean, blocking: string[] }
   */
  canComplete(assertionIds) {
    const blocking = [];

    for (const id of assertionIds) {
      const assertion = this._state.assertions[id];

      // Unknown assertion or non-passed status blocks
      if (!assertion || assertion.status !== 'passed') {
        blocking.push(id);
      }
    }

    return {
      allowed: blocking.length === 0,
      blocking,
    };
  }

  /**
   * Get all assertions with failed status
   * @returns {string[]} - Array of failed assertion IDs
   */
  getFailedAssertions() {
    const failed = [];

    for (const [id, assertion] of Object.entries(this._state.assertions)) {
      if (assertion.status === 'failed') {
        failed.push(id);
      }
    }

    return failed;
  }

  /**
   * Prepare for re-validation by resetting failed assertions to pending
   * Returns the list of assertions that need to be re-run
   *
   * @param {string[]} assertionIds - Array of assertion IDs to potentially re-run
   * @returns {Object} - { toRerun: string[] }
   */
  revalidate(assertionIds) {
    const toRerun = [];

    for (const id of assertionIds) {
      const assertion = this._state.assertions[id];

      if (assertion && assertion.status === 'failed') {
        // Reset to pending
        const now = new Date().toISOString();
        this._state.assertions[id] = {
          ...assertion,
          status: 'pending',
          updatedAt: now,
        };
        toRerun.push(id);
      }
    }

    // Persist changes
    if (toRerun.length > 0) {
      this._persist();
    }

    return { toRerun };
  }

  /**
   * Sync state with validation contract
   * - Add new assertions from contract as pending
   * - Log warnings for orphaned assertions (in state but not in contract)
   *
   * @returns {Object[]} - Array of warnings
   */
  syncWithContract() {
    const warnings = [];

    if (!this.contractPath) {
      return warnings;
    }

    // Parse contract
    const parseResult = parseValidationContract(this.contractPath);
    const contractIds = new Set(getRuleIds(parseResult));

    // Find orphaned assertions (in state but not in contract)
    for (const id of Object.keys(this._state.assertions)) {
      if (!contractIds.has(id)) {
        warnings.push({
          code: 'ORPHANED_ASSERTION',
          message: `Assertion ${id} exists in state but not in contract`,
          details: { assertionId: id },
        });
      }
    }

    // Add new assertions from contract as pending
    const now = new Date().toISOString();
    for (const id of contractIds) {
      if (!this._state.assertions[id]) {
        this._state.assertions[id] = {
          ...DEFAULT_ASSERTION,
          updatedAt: now,
        };
        warnings.push({
          code: 'NEW_ASSERTION',
          message: `New assertion ${id} added from contract as pending`,
          details: { assertionId: id },
        });
      }
    }

    // Persist changes
    if (warnings.length > 0) {
      this._persist();
    }

    return warnings;
  }

  /**
   * Add a new assertion manually
   *
   * @param {string} assertionId - Assertion ID to add
   * @param {Object} options - Optional overrides
   * @returns {Object} - The created assertion
   */
  addAssertion(assertionId, options = {}) {
    if (this._state.assertions[assertionId]) {
      const error = new Error(`Assertion already exists: ${assertionId}`);
      error.code = 'ASSERTION_EXISTS';
      error.details = { assertionId };
      throw error;
    }

    const now = new Date().toISOString();
    const assertion = {
      ...DEFAULT_ASSERTION,
      ...options,
      updatedAt: now,
    };

    this._state.assertions[assertionId] = assertion;
    this._persist();

    return { ...assertion };
  }

  /**
   * Get all assertion IDs
   * @returns {string[]} - Array of assertion IDs
   */
  getAssertionIds() {
    return Object.keys(this._state.assertions);
  }

  /**
   * Get assertions by status
   * @param {string} status - Status to filter by
   * @returns {string[]} - Array of assertion IDs with that status
   */
  getAssertionsByStatus(status) {
    const result = [];

    for (const [id, assertion] of Object.entries(this._state.assertions)) {
      if (assertion.status === status) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Check if state was recovered from corruption
   * @returns {boolean}
   */
  wasRecovered() {
    return this._recovered;
  }
}

/**
 * Convenience function to create a gatekeeper
 *
 * @param {string} statePath - Path to validation-state.json
 * @param {Object} options - Optional configuration
 * @returns {ValidationStateGatekeeper}
 */
function createGatekeeper(statePath, options = {}) {
  return new ValidationStateGatekeeper(statePath, options);
}

/**
 * Convenience function to check if a feature can complete
 *
 * @param {string} statePath - Path to validation-state.json
 * @param {string[]} assertionIds - Array of assertion IDs
 * @returns {Object} - { allowed, blocking }
 */
function canComplete(statePath, assertionIds) {
  const gatekeeper = new ValidationStateGatekeeper(statePath);
  return gatekeeper.canComplete(assertionIds);
}

/**
 * Convenience function to transition an assertion
 *
 * @param {string} statePath - Path to validation-state.json
 * @param {string} assertionId - Assertion ID
 * @param {string} newStatus - Target status
 * @returns {Object} - Transition result
 */
function transitionAssertion(statePath, assertionId, newStatus) {
  const gatekeeper = new ValidationStateGatekeeper(statePath);
  return gatekeeper.transition(assertionId, newStatus);
}

module.exports = {
  ValidationStateGatekeeper,
  createGatekeeper,
  canComplete,
  transitionAssertion,
  initializeState,
  loadState,
  atomicWriteJSON,
  VALID_STATES,
  VALID_TRANSITIONS,
  DEFAULT_ASSERTION,
};
