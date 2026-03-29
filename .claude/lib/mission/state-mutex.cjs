'use strict';

/**
 * State Mutex - Global mutex for state.json controlling orchestrator/worker turn-based access.
 *
 * States:
 * - orchestrator_turn: Only orchestrator can acquire lock
 * - worker_turn: Only designated worker can acquire lock
 *
 * Lock fields:
 * - lockedBy: ID of the lock holder
 * - lockedAt: ISO timestamp when lock was acquired
 * - designatedWorkerId: During worker_turn, the specific worker allowed to lock
 *
 * Stale lock detection:
 * - If lockedAt is older than staleThresholdMs (default 30s), lock is force-released on next acquisition
 *
 * Corruption recovery:
 * - Invalid JSON triggers backup (.corrupt.<timestamp>) and reinitialization with safe defaults
 *
 * All writes are atomic (write to .tmp then rename).
 */

const fs = require('node:fs');
const path = require('node:path');

// Default stale lock threshold (30 seconds)
const DEFAULT_STALE_THRESHOLD_MS = 30000;

// Safe default state for reinitialization
const SAFE_DEFAULTS = {
  turn: 'orchestrator_turn',
  lockedBy: null,
  lockedAt: null,
  designatedWorkerId: null,
  staleThresholdMs: DEFAULT_STALE_THRESHOLD_MS,
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
 * Initialize a fresh state.json file with safe defaults
 *
 * @param {string} statePath - Path to state.json
 * @param {Object} options - Optional overrides
 */
function initializeState(statePath, options = {}) {
  const state = {
    ...SAFE_DEFAULTS,
    ...options,
  };

  // Ensure directory exists
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  atomicWriteJSON(statePath, state);
}

/**
 * Load and parse state.json with corruption handling
 *
 * @param {string} statePath - Path to state.json
 * @returns {Object} - { state, recovered }
 */
function loadState(statePath) {
  // Check if file exists
  if (!fs.existsSync(statePath)) {
    // File doesn't exist - create with defaults
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: true };
  }

  // Try to read and parse
  let content;
  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_readErr) {
    // Can't read file - backup and reinitialize
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: false };
  }

  // Handle empty file
  if (!content || content.trim() === '') {
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: false };
  }

  // Try to parse JSON
  let state;
  try {
    state = JSON.parse(content);
  } catch (_parseErr) {
    // Invalid JSON - backup and reinitialize
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: false };
  }

  // Validate required fields exist
  if (typeof state.turn !== 'string' || !state.turn) {
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: false };
  }

  // Ensure turn is valid
  if (state.turn !== 'orchestrator_turn' && state.turn !== 'worker_turn') {
    createCorruptionBackup(statePath);
    initializeState(statePath);
    return { state: { ...SAFE_DEFAULTS }, recovered: true, created: false };
  }

  // Normalize null-like values
  state.lockedBy = state.lockedBy || null;
  state.lockedAt = state.lockedAt || null;
  state.designatedWorkerId = state.designatedWorkerId || null;
  state.staleThresholdMs = state.staleThresholdMs || DEFAULT_STALE_THRESHOLD_MS;

  return { state, recovered: false, created: false };
}

/**
 * Check if a lock is stale
 *
 * @param {Object} state - Current state
 * @returns {boolean} - True if lock is stale
 */
function isLockStale(state) {
  if (!state.lockedAt) {
    return false;
  }

  const lockTime = new Date(state.lockedAt).getTime();
  const now = Date.now();
  const threshold = state.staleThresholdMs || DEFAULT_STALE_THRESHOLD_MS;

  return now - lockTime > threshold;
}

/**
 * State Mutex class for managing turn-based access to state.json
 */
class StateMutex {
  /**
   * @param {string} statePath - Path to state.json file
   */
  constructor(statePath) {
    this.statePath = path.normalize(statePath);
  }

  /**
   * Load state from disk (with corruption recovery)
   * @returns {Object} - State object
   */
  _load() {
    const { state, recovered, created } = loadState(this.statePath);
    this._recovered = recovered;
    this._created = created;
    return state;
  }

  /**
   * Persist state to disk with atomic write
   * @param {Object} state - State to persist
   */
  _persist(state) {
    atomicWriteJSON(this.statePath, state);
  }

  /**
   * Acquire lock if turn matches requester type
   *
   * @param {Object} options - Acquisition options
   * @param {string} options.requesterType - 'orchestrator' or 'worker'
   * @param {string} options.requesterId - ID of the requester
   * @returns {Object} - { acquired, turn, staleLockReleased?, recovered? }
   * @throws {Error} With code TURN_VIOLATION, DESIGNATED_WORKER_MISMATCH, or LOCK_HELD
   */
  acquireLock(options) {
    const { requesterType, requesterId } = options;
    const state = this._load();
    const result = { acquired: false, turn: state.turn };

    // Check for recovery
    if (this._recovered) {
      result.recovered = true;
    }

    // Check if lock is currently held
    if (state.lockedBy && !isLockStale(state)) {
      // Fresh lock is held by someone else
      const error = new Error(
        `Lock is held by ${state.lockedBy} since ${state.lockedAt}`
      );
      error.code = 'LOCK_HELD';
      error.details = {
        lockedBy: state.lockedBy,
        lockedAt: state.lockedAt,
        requesterId,
      };
      throw error;
    }

    // Check for stale lock release
    if (state.lockedBy && isLockStale(state)) {
      result.staleLockReleased = true;
      // Clear stale lock
      state.lockedBy = null;
      state.lockedAt = null;
    }

    // Validate turn matches requester type
    if (state.turn === 'orchestrator_turn') {
      if (requesterType !== 'orchestrator') {
        // Worker trying to acquire during orchestrator_turn
        const error = new Error(
          `Worker cannot acquire lock during orchestrator_turn`
        );
        error.code = 'TURN_VIOLATION';
        error.details = {
          turn: state.turn,
          requesterType,
          requesterId,
        };
        throw error;
      }
      // Orchestrator can acquire during orchestrator_turn
      state.lockedBy = requesterId;
      state.lockedAt = new Date().toISOString();
      result.acquired = true;
    } else if (state.turn === 'worker_turn') {
      if (requesterType !== 'worker') {
        // Orchestrator trying to acquire during worker_turn
        const error = new Error(
          `Orchestrator cannot acquire lock during worker_turn`
        );
        error.code = 'TURN_VIOLATION';
        error.details = {
          turn: state.turn,
          requesterType,
          requesterId,
        };
        throw error;
      }

      // Worker must match designatedWorkerId
      if (state.designatedWorkerId && state.designatedWorkerId !== requesterId) {
        const error = new Error(
          `Worker ${requesterId} is not designated for this turn (expected ${state.designatedWorkerId})`
        );
        error.code = 'DESIGNATED_WORKER_MISMATCH';
        error.details = {
          designatedWorkerId: state.designatedWorkerId,
          requesterId,
        };
        throw error;
      }

      // Worker matches designated ID (or no designation)
      state.lockedBy = requesterId;
      state.lockedAt = new Date().toISOString();
      result.acquired = true;
    }

    // Persist state if lock acquired
    if (result.acquired) {
      this._persist(state);
    }

    return result;
  }

  /**
   * Release lock
   *
   * @param {Object} options - Release options
   * @param {string} options.requesterId - ID of the requester releasing
   * @returns {Object} - { released: true }
   * @throws {Error} With code NOT_LOCK_OWNER if requester doesn't hold the lock
   */
  releaseLock(options) {
    const { requesterId } = options;
    const state = this._load();

    // Verify requester owns the lock
    if (state.lockedBy !== requesterId) {
      const error = new Error(
        `Requester ${requesterId} does not hold the lock (held by ${state.lockedBy})`
      );
      error.code = 'NOT_LOCK_OWNER';
      error.details = {
        lockedBy: state.lockedBy,
        requesterId,
      };
      throw error;
    }

    // Clear lock fields
    state.lockedBy = null;
    state.lockedAt = null;

    // Persist
    this._persist(state);

    return { released: true };
  }

  /**
   * Transition to a new turn state
   *
   * @param {string} newTurn - 'orchestrator_turn' or 'worker_turn'
   * @param {Object} options - Transition options
   * @param {string} [options.designatedWorkerId] - For worker_turn, the designated worker
   * @returns {Object} - { transitioned: true, turn: newTurn }
   * @throws {Error} With code LOCK_HELD if lock is currently held
   */
  transitionTurn(newTurn, options = {}) {
    const { designatedWorkerId } = options;
    const state = this._load();

    // Validate turn value
    if (newTurn !== 'orchestrator_turn' && newTurn !== 'worker_turn') {
      const error = new Error(`Invalid turn value: ${newTurn}`);
      error.code = 'INVALID_TURN';
      error.details = { turn: newTurn };
      throw error;
    }

    // Can't transition while lock is held
    if (state.lockedBy && !isLockStale(state)) {
      const error = new Error(
        `Cannot transition turn while lock is held by ${state.lockedBy}`
      );
      error.code = 'LOCK_HELD';
      error.details = {
        lockedBy: state.lockedBy,
        lockedAt: state.lockedAt,
      };
      throw error;
    }

    // Update turn and designation
    state.turn = newTurn;
    state.designatedWorkerId = newTurn === 'worker_turn' ? designatedWorkerId : null;

    // Clear any stale lock state
    if (state.lockedBy) {
      state.lockedBy = null;
      state.lockedAt = null;
    }

    // Persist
    this._persist(state);

    return { transitioned: true, turn: newTurn };
  }

  /**
   * Get current state without acquiring lock
   *
   * @returns {Object} - Current state object
   */
  getState() {
    return this._load();
  }

  /**
   * Check if lock is currently held
   *
   * @returns {boolean} - True if locked
   */
  isLocked() {
    const state = this._load();
    return state.lockedBy !== null && !isLockStale(state);
  }
}

/**
 * Convenience function to acquire lock
 *
 * @param {string} statePath - Path to state.json
 * @param {Object} options - Acquisition options
 * @returns {Object} - { acquired, turn, ... }
 */
function acquireLock(statePath, options) {
  const mutex = new StateMutex(statePath);
  return mutex.acquireLock(options);
}

/**
 * Convenience function to release lock
 *
 * @param {string} statePath - Path to state.json
 * @param {Object} options - Release options
 * @returns {Object} - { released: true }
 */
function releaseLock(statePath, options) {
  const mutex = new StateMutex(statePath);
  return mutex.releaseLock(options);
}

module.exports = {
  StateMutex,
  acquireLock,
  releaseLock,
  initializeState,
  loadState,
  isLockStale,
  atomicWriteJSON,
  SAFE_DEFAULTS,
  DEFAULT_STALE_THRESHOLD_MS,
};
