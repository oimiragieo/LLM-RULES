#!/usr/bin/env node
/**
 * Router State Module
 *
 * Manages router/agent mode state for the write-blocking system.
 * Uses file-based persistence to track whether we're in router mode
 * (no Task spawned) or agent mode (Task has been spawned).
 *
 * State Flow:
 *   UserPromptSubmit → resetToRouterMode() → mode: "router"
 *   PostToolUse(Task) → enterAgentMode() → mode: "agent"
 *   PreToolUse(Edit/Write) → isInAgentContext() → check mode
 *
 * ENFORCEMENT MODES (ROUTER_WRITE_GUARD):
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   ROUTER_WRITE_GUARD=warn
 *   ROUTER_WRITE_GUARD=off
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { invalidateCache } = require('../../lib/utils/state-cache.cjs');
const { readRouterStateFile } = require('../../lib/runtime/state-contracts.cjs');

// Resolve project root deterministically from this file location:
// <project>/.claude/hooks/routing/router-state.cjs -> <project>
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Get the path to the router state file.
 * Respects ROUTER_STATE_FILE env var for testing.
 */
function getStateFilePath() {
  return (
    process.env.ROUTER_STATE_FILE ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json')
  );
}

/**
 * Ensure the runtime directory exists
 */
function ensureRuntimeDir() {
  const dir = path.dirname(getStateFilePath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Valid complexity levels
 */
const VALID_COMPLEXITY_LEVELS = ['trivial', 'low', 'medium', 'high', 'epic'];

// =============================================================================
// Optimistic Concurrency Constants
// =============================================================================

/**
 * Maximum number of retries for optimistic concurrency
 * Security: Prevents infinite loops/DoS
 */
const MAX_RETRIES = 5;

/**
 * Base backoff delay in milliseconds for retry
 * Uses exponential backoff: BASE_BACKOFF * 2^(retry-1)
 */
const BASE_BACKOFF = 100;

/**
 * Get default state
 */
function getDefaultState() {
  return {
    mode: 'router',
    lastReset: null,
    taskSpawned: false,
    taskSpawnedAt: null,
    taskDescription: null,
    sessionId: process.env.CLAUDE_SESSION_ID || null,
    // TaskList-first: must call TaskList() before Task() in same session
    taskListCalledSincePrompt: false,
    // Complexity tracking fields
    complexity: 'trivial',
    requiresPlannerFirst: false,
    plannerSpawned: false,
    requiresSecurityReview: false,
    securitySpawned: false,
    architectSpawned: false,
    // TaskUpdate tracking fields
    lastTaskUpdateCall: null,
    lastTaskUpdateTaskId: null,
    lastTaskUpdateStatus: null,
    taskUpdatesThisSession: 0,
    // Spawn task_id tracking (for spawn_end event logging)
    currentSpawnTaskId: null,
    // Optimistic concurrency version field
    version: 0,
  };
}

/**
 * Get current state from file
 * SEC-AUDIT-016 FIX #5: TTL-based cache (5-second) to reduce file I/O
 * @returns {Object} Current state object
 */
function getState() {
  const now = Date.now();

  // SEC-AUDIT-016 FIX #5: Simple TTL cache (5 seconds)
  // Check if we have a cached value that's still valid
  if (getState._cache && getState._cacheTimestamp && now - getState._cacheTimestamp < 5000) {
    return getState._cache;
  }

  // Cache miss or expired - read from file
  const state = loadStateFromFile();

  // Update cache
  getState._cache = state;
  getState._cacheTimestamp = now;

  return state;
}

/**
 * Save state to file atomically
 * SEC-AUDIT-016 FIX #5: Invalidates TTL cache in addition to file cache
 * Uses atomic write (temp file + rename) to prevent corruption on crash
 * Invalidates cache to ensure subsequent reads get fresh data
 * @param {Object} state - State to save
 */
function saveState(state) {
  const stateFile = getStateFilePath();
  try {
    ensureRuntimeDir();
    // Atomic write: write to temp file, then rename
    // Prevents data corruption if process crashes mid-write
    atomicWriteJSONSync(stateFile, state);
    // Invalidate cache so subsequent getState() calls see the new data
    invalidateCache(stateFile);
    // SEC-AUDIT-016 FIX #5: Clear TTL cache
    delete getState._cache;
    delete getState._cacheTimestamp;
  } catch (e) {
    // Best effort - don't fail the hook if state can't be saved
    console.error('[router-state] Warning: Could not save state:', e.message);
  }
}

/**
 * Validate and normalize version number
 * Security: Prevents version manipulation attacks
 * @param {any} version - Version value to validate
 * @returns {number} Valid non-negative integer version
 */
function validateVersion(version) {
  // Handle non-numbers
  if (typeof version !== 'number') {
    return 0;
  }
  // Handle special numeric values
  if (!Number.isFinite(version)) {
    return 0;
  }
  // Handle negative values
  if (version < 0) {
    return 0;
  }
  // Floor to handle floats
  return Math.floor(version);
}

/**
 * Read state directly from file (bypasses cache)
 * Uses safeParseJSON to prevent prototype pollution (SEC-AUDIT-016 FIX #3)
 * @returns {Object} Current state from file
 */
function loadStateFromFile() {
  const stateFile = getStateFilePath();
  try {
    ensureRuntimeDir();
    // SEC-AUDIT-016 FIX #3: Use safeParseJSON for prototype pollution protection
    // readRouterStateFile internally uses safeParseJSON
    return readRouterStateFile(stateFile, getDefaultState());
  } catch (_e) {
    // On any error, return default
  }
  return getDefaultState();
}

/**
 * Synchronous sleep for exponential backoff
 *
 * SEC-AUDIT-016 FIX #2: Uses Atomics.wait() for proper blocking without CPU spin.
 * No fallback to busy-wait (fails early if Atomics unavailable).
 *
 * @param {number} ms - Milliseconds to sleep
 * @throws {Error} If Atomics.wait is unavailable (Node.js <16.9)
 */
function syncSleep(ms) {
  // SEC-AUDIT-016 FIX #2: Only use Atomics.wait (no busy-wait fallback)
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
    try {
      // Create a shared buffer that will never be signaled (timeout-only)
      const sharedBuffer = new SharedArrayBuffer(4);
      const int32 = new Int32Array(sharedBuffer);
      // Atomics.wait blocks the thread without CPU spin
      Atomics.wait(int32, 0, 0, ms);
      return;
    } catch (e) {
      // Log error and throw to caller
      process.stderr.write(
        `[router-state] ERROR: Atomics.wait failed: ${e.message}\n` +
          `Node.js 16.9+ required for synchronous sleep. Use async operations or upgrade Node.js.\n`
      );
      throw new Error('Atomics.wait unavailable - Node.js 16.9+ required');
    }
  }
  // No Atomics available - fail early
  process.stderr.write(
    `[router-state] ERROR: SharedArrayBuffer/Atomics not available\n` +
      `Node.js 16.9+ required for synchronous sleep. Use async operations or upgrade Node.js.\n`
  );
  throw new Error('Atomics.wait unavailable - Node.js 16.9+ required');
}

/**
 * Save state with optimistic concurrency control and retry
 *
 * SEC-AUDIT-016 FIX #4: Atomic file operations using write-then-rename pattern.
 * SEC-AUDIT-016 FIX #6: Bounded retry with stderr logging on exhaustion.
 *
 * Uses read-modify-write pattern with version checking:
 * 1. Read current state
 * 2. Check version
 * 3. Merge updates
 * 4. Increment version
 * 5. Re-read and verify version hasn't changed
 * 6. Write atomically (temp file + rename)
 *
 * On conflict (version changed), retry with exponential backoff
 *
 * Security safeguards:
 * - Max 5 retries (DoS protection) - SEC-AUDIT-016 FIX #6
 * - Version validated as positive integer (manipulation prevention)
 * - Exponential backoff (thundering herd prevention)
 * - Stderr logging on retry exhaustion - SEC-AUDIT-016 FIX #6
 *
 * @param {Object} updates - Fields to update in state
 * @param {number} [maxRetries=MAX_RETRIES] - Maximum retries (default: 5)
 * @returns {Object} Merged state that was saved
 * @throws {Error} If save fails after all retries
 */
function saveStateWithRetry(updates, maxRetries = MAX_RETRIES) {
  const stateFile = getStateFilePath();

  for (let i = 0; i < maxRetries; i++) {
    // Apply exponential backoff on retries (skip first attempt)
    if (i > 0) {
      const backoffMs = BASE_BACKOFF * Math.pow(2, i - 1);
      try {
        syncSleep(backoffMs);
      } catch (e) {
        // SEC-AUDIT-016 FIX #6: Log sleep failure
        process.stderr.write(
          `[router-state] Warning: syncSleep failed on retry ${i + 1}/${maxRetries}: ${e.message}\n`
        );
        // Continue to next iteration (skip sleep)
      }
    }

    // Step 1: Read current state directly from file
    const current = loadStateFromFile();

    // Step 2: Validate and normalize version
    const currentVersion = validateVersion(current.version);

    // Step 3: Merge updates with current state
    const merged = {
      ...current,
      ...updates,
      // Step 4: Increment version
      version: currentVersion + 1,
    };

    // Step 5: Re-read to check for conflicts (TOCTOU check)
    const recheck = loadStateFromFile();
    const recheckVersion = validateVersion(recheck.version);

    // If version changed since we read, someone else wrote - retry
    if (recheckVersion !== currentVersion) {
      // SEC-AUDIT-016 FIX #6: Log conflict detection
      if (process.env.METRICS_DEBUG === 'true' || process.env.MEMORY_DEBUG === 'true') {
        process.stderr.write(
          `[router-state] Conflict detected on attempt ${i + 1}/${maxRetries}: ` +
            `expected version ${currentVersion}, found ${recheckVersion}\n`
        );
      }
      continue; // Conflict detected, retry
    }

    // Step 6: Write atomically (SEC-AUDIT-016 FIX #4)
    // atomicWriteJSONSync already uses write-then-rename pattern
    try {
      ensureRuntimeDir();
      atomicWriteJSONSync(stateFile, merged);
      invalidateCache(stateFile);
      return merged;
    } catch (e) {
      // SEC-AUDIT-016 FIX #6: Log write failure
      if (process.env.METRICS_DEBUG === 'true' || process.env.MEMORY_DEBUG === 'true') {
        process.stderr.write(
          `[router-state] Write failed on attempt ${i + 1}/${maxRetries}: ${e.message}\n`
        );
      }
      // Write failed, retry
      continue;
    }
  }

  // SEC-AUDIT-016 FIX #6: All retries exhausted - stderr logging
  const errorMsg = `Save failed after ${maxRetries} retries - concurrent modification conflict`;
  process.stderr.write(
    `[router-state] CRITICAL: ${errorMsg}\n` +
      `File: ${stateFile}\n` +
      `Updates: ${JSON.stringify(updates)}\n` +
      `Consider increasing MAX_RETRIES or investigating concurrent access patterns.\n`
  );
  throw new Error(errorMsg);
}

/**
 * Reset to router mode (called on UserPromptSubmit)
 * This indicates a new user prompt has started, so we're back to router context.
 * Uses saveStateWithRetry for safe concurrent updates.
 */
function resetToRouterMode() {
  // Get current version to preserve it
  const current = loadStateFromFile();
  const currentVersion = validateVersion(current.version);

  const state = {
    mode: 'router',
    lastReset: new Date().toISOString(),
    taskSpawned: false,
    taskSpawnedAt: null,
    taskDescription: null,
    sessionId: process.env.CLAUDE_SESSION_ID || null,
    taskListCalledSincePrompt: false,
    // Reset complexity tracking fields
    complexity: 'trivial',
    requiresPlannerFirst: false,
    plannerSpawned: false,
    requiresSecurityReview: false,
    securitySpawned: false,
    architectSpawned: false,
    // Reset TaskUpdate tracking fields
    lastTaskUpdateCall: null,
    lastTaskUpdateTaskId: null,
    lastTaskUpdateStatus: null,
    taskUpdatesThisSession: 0,
    // Increment version
    version: currentVersion + 1,
  };
  saveState(state);
  return state;
}

/**
 * Enter agent mode (called on PostToolUse Task)
 * This indicates a Task has been spawned, so writes are allowed.
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 * @param {string} taskDescription - Description of the spawned task (optional)
 */
function enterAgentMode(taskDescription = null) {
  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  return saveStateWithRetry({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date().toISOString(),
    taskDescription: taskDescription,
  });
}

/**
 * Exit agent mode (called on PostToolUse Task)
 * Resets mode and taskSpawned but PRESERVES planner/security spawn tracking.
 * This allows Router-First Protocol to re-engage while remembering what agents were spawned.
 */
function exitAgentMode() {
  return saveStateWithRetry({
    mode: 'router',
    taskSpawned: false,
    taskSpawnedAt: null,
    taskDescription: null,
  });
}

/**
 * Check if we're in agent context (Task has been spawned)
 * @returns {boolean} True if a Task has been spawned in the current prompt cycle
 */
function isInAgentContext() {
  const state = getState();
  return state.mode === 'agent' && state.taskSpawned === true;
}

/**
 * Check if writes should be allowed
 * Takes into account environment variable overrides
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkWriteAllowed() {
  // Check environment override
  if (process.env.ALLOW_ROUTER_WRITE === 'true') {
    // SEC-AUDIT-009 FIX: Audit log when security override is used
    console.error(
      JSON.stringify({
        hook: 'router-state',
        event: 'security_override_used',
        override: 'ALLOW_ROUTER_WRITE=true',
        timestamp: new Date().toISOString(),
        warning: 'Security enforcement disabled - Router write protection bypassed',
      })
    );
    return { allowed: true, reason: 'ALLOW_ROUTER_WRITE override' };
  }

  // Check enforcement mode
  // Default: block. Set ROUTER_WRITE_GUARD=warn for dev override
  const mode = process.env.ROUTER_WRITE_GUARD || 'block';
  if (mode === 'off') {
    return { allowed: true, reason: 'ROUTER_WRITE_GUARD=off' };
  }

  const state = getState();

  if (state.mode === 'agent' && state.taskSpawned) {
    return {
      allowed: true,
      reason: `Agent context active (task: ${state.taskDescription || 'unknown'})`,
    };
  }

  return {
    allowed: false,
    reason: 'Router context - no Task spawned',
  };
}

/**
 * Get enforcement mode
 * Default: block. Set ROUTER_WRITE_GUARD=warn for dev override
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  return process.env.ROUTER_WRITE_GUARD || 'block';
}

// ==========================================
// Complexity Tracking Functions
// ==========================================

/**
 * Set complexity level
 * Automatically sets requiresPlannerFirst to true for high/epic complexity
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 * @param {string} level - Complexity level: trivial|low|medium|high|epic
 */
function setComplexity(level) {
  if (!VALID_COMPLEXITY_LEVELS.includes(level)) {
    // Invalid level - ignore silently to maintain valid state
    return getState();
  }

  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  const updates = { complexity: level };

  // Auto-set requiresPlannerFirst for high/epic complexity
  if (level === 'high' || level === 'epic') {
    updates.requiresPlannerFirst = true;
  }

  return saveStateWithRetry(updates);
}

/**
 * Mark that the PLANNER agent has been spawned
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 */
function markPlannerSpawned() {
  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  return saveStateWithRetry({ plannerSpawned: true });
}

/**
 * Mark that the SECURITY-ARCHITECT agent has been spawned
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 */
function markSecuritySpawned() {
  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  return saveStateWithRetry({ securitySpawned: true });
}

/**
 * Mark that the ARCHITECT agent has been spawned
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 */
function markArchitectSpawned() {
  return saveStateWithRetry({ architectSpawned: true });
}

/**
 * Set whether security review is required
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 * @param {boolean} required - Whether security review is required
 */
function setSecurityRequired(required) {
  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  return saveStateWithRetry({ requiresSecurityReview: Boolean(required) });
}

/**
 * Get the current complexity level
 * @returns {string} Current complexity level
 */
function getComplexity() {
  return getState().complexity;
}

/**
 * Check if planner is required (for high/epic complexity)
 * @returns {boolean} True if planner is required before implementation
 */
function isPlannerRequired() {
  return getState().requiresPlannerFirst;
}

/**
 * Check if planner has been spawned
 * @returns {boolean} True if PLANNER agent was spawned
 */
function isPlannerSpawned() {
  return getState().plannerSpawned;
}

/**
 * Check if security review is required
 * @returns {boolean} True if security review is required
 */
function isSecurityRequired() {
  return getState().requiresSecurityReview;
}

/**
 * Check if security architect has been spawned
 * @returns {boolean} True if SECURITY-ARCHITECT agent was spawned
 */
function isSecuritySpawned() {
  return getState().securitySpawned;
}

/**
 * Check if architect has been spawned
 * @returns {boolean} True if ARCHITECT agent was spawned
 */
function isArchitectSpawned() {
  return getState().architectSpawned === true;
}

// ==========================================
// TaskUpdate Tracking Functions
// ==========================================

/**
 * Record a TaskUpdate call
 * SEC-AUDIT-016 FIX #1: Documented non-atomic counter race condition (informational only)
 * @param {string} taskId - The task ID being updated
 * @param {string} status - The status being set (in_progress, completed, etc.)
 * @returns {Object} Updated state
 */
function recordTaskUpdate(taskId, status) {
  // Get current count from state for incrementing
  const current = getState();
  const currentCount = current.taskUpdatesThisSession || 0;

  // SEC-AUDIT-016 FIX #1: Known Limitation - Non-atomic read-modify-write race condition
  // This function executes a non-atomic sequence:
  //   1. Read: getState() retrieves currentCount
  //   2. Calculate: increment value (currentCount + 1)
  //   3. Write: saveStateWithRetry() persists incremented count
  //
  // In rare concurrent scenarios (e.g., rapid TaskUpdate calls across parallel agents),
  // the taskUpdatesThisSession counter may lose updates if two reads happen before
  // either write completes. However, this is ACCEPTABLE for these reasons:
  //
  // - Purpose: Informational tracking only (metrics, diagnostics)
  // - Not security-critical: Counter is used for debugging/monitoring, not authorization
  // - Risk: Eventual count may undercount by 1-2 in rare edge cases
  // - Impact: Low - affects only audit metrics, not task execution logic
  // - Trade-off: Full atomicity would require distributed locks or consensus, adding
  //   complexity and latency to a non-critical tracking function
  //
  // Mitigation: saveStateWithRetry() ensures POSIX-atomic file operations where possible,
  // and provides retry logic for transient failures (SEC-AUDIT-016 FIX #4, #6).
  //
  // To enable debug logging of state updates: MEMORY_DEBUG=true or METRICS_DEBUG=true
  //
  // See also: Windows Atomic File Operations Security Pattern in learnings.md
  return saveStateWithRetry({
    lastTaskUpdateCall: Date.now(),
    lastTaskUpdateTaskId: taskId,
    lastTaskUpdateStatus: status,
    taskUpdatesThisSession: currentCount + 1,
  });
}

/**
 * Check if TaskUpdate was called recently (within last 60 seconds)
 * @returns {boolean} True if TaskUpdate was called within the last 60 seconds
 */
function wasTaskUpdateCalledRecently() {
  const state = getState();
  if (!state.lastTaskUpdateCall) return false;
  return Date.now() - state.lastTaskUpdateCall < 60000;
}

/**
 * Get last TaskUpdate info
 * @returns {{ timestamp: number|null, taskId: string|null, status: string|null, count: number }}
 */
function getLastTaskUpdate() {
  const state = getState();
  return {
    timestamp: state.lastTaskUpdateCall,
    taskId: state.lastTaskUpdateTaskId,
    status: state.lastTaskUpdateStatus,
    count: state.taskUpdatesThisSession || 0,
  };
}

/**
 * Reset TaskUpdate tracking (call on session start)
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 * @returns {Object} Updated state with reset TaskUpdate tracking
 */
function resetTaskUpdateTracking() {
  // SEC-AUDIT-011 FIX: Use atomic read-modify-write with version checking
  return saveStateWithRetry({
    lastTaskUpdateCall: null,
    lastTaskUpdateTaskId: null,
    lastTaskUpdateStatus: null,
    taskUpdatesThisSession: 0,
  });
}

/**
 * Invalidate the state cache
 * SEC-AUDIT-016 FIX #5: Also clear TTL cache in getState()
 * Useful for testing or when external processes modify the state file
 */
function invalidateStateCache() {
  invalidateCache(getStateFilePath());
  // SEC-AUDIT-016 FIX #5: Clear TTL cache
  delete getState._cache;
  delete getState._cacheTimestamp;
}

/**
 * Mark that TaskList() was called since last UserPromptSubmit.
 * Called from PostToolUse(TaskList) hook.
 */
function setTaskListCalled() {
  return saveStateWithRetry({ taskListCalledSincePrompt: true });
}

/**
 * Check if TaskList() has been called since last UserPromptSubmit.
 * Used by PreToolUse(Task) to enforce TaskList-first.
 * @returns {boolean}
 */
function isTaskListCalledSincePrompt() {
  const state = getState();
  return state.taskListCalledSincePrompt === true;
}

// ==========================================
// Spawn Task ID Tracking Functions
// ==========================================

/**
 * Store the current spawn task_id (generated by spawn-prompt-assembler)
 * Used to track task_id from spawn_start to spawn_end event logging
 * @param {string} taskId - Task ID for current spawn
 * @returns {Object} Updated state
 */
function setCurrentSpawnTaskId(taskId) {
  return saveStateWithRetry({ currentSpawnTaskId: taskId || null });
}

/**
 * Get the current spawn task_id
 * Used by spawn_end logging to retrieve task_id generated at spawn_start
 * @returns {string|null} Current spawn task_id or null
 */
function getCurrentSpawnTaskId() {
  const state = getState();
  return state.currentSpawnTaskId || null;
}

/**
 * Clear the current spawn task_id (after spawn_end logged)
 * @returns {Object} Updated state
 */
function clearCurrentSpawnTaskId() {
  return saveStateWithRetry({ currentSpawnTaskId: null });
}

/**
 * Update state directly (useful for testing or bulk updates)
 * @param {Object} updates - Fields to update
 */
function updateState(updates) {
  const current = getState();
  const next = { ...current, ...updates };
  saveState(next);
  return next;
}

// Export functions
module.exports = {
  // Existing exports
  getState,
  updateState,
  resetToRouterMode,
  enterAgentMode,
  exitAgentMode,
  isInAgentContext,
  checkWriteAllowed,
  getEnforcementMode,
  getStateFilePath,
  PROJECT_ROOT,
  // Complexity tracking - setters
  setComplexity,
  markPlannerSpawned,
  markSecuritySpawned,
  markArchitectSpawned,
  setSecurityRequired,
  // Complexity tracking - getters
  getComplexity,
  isPlannerRequired,
  isPlannerSpawned,
  isSecurityRequired,
  isSecuritySpawned,
  isArchitectSpawned,
  // TaskUpdate tracking
  recordTaskUpdate,
  wasTaskUpdateCalledRecently,
  getLastTaskUpdate,
  resetTaskUpdateTracking,
  // Cache management
  invalidateStateCache,
  // TaskList-first enforcement
  setTaskListCalled,
  isTaskListCalledSincePrompt,
  // Spawn task_id tracking
  setCurrentSpawnTaskId,
  getCurrentSpawnTaskId,
  clearCurrentSpawnTaskId,
  // Constants
  VALID_COMPLEXITY_LEVELS,
  // Optimistic concurrency
  saveStateWithRetry,
  MAX_RETRIES,
  BASE_BACKOFF,
};
