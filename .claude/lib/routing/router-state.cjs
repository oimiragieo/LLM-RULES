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

// Resolve project root deterministically from this file location:
// <project>/.claude/hooks/routing/router-state.cjs -> <project>
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// =============================================================================
// SEC-007: Safe JSON Parsing
// =============================================================================

/**
 * Safely parse JSON to prevent prototype pollution
 *
 * Uses Object.create(null) intermediate to strip __proto__ and constructor
 *
 * @param {string} content - JSON string to parse
 * @returns {Object|null} Parsed object or null on error
 */
function safeJSONParse(content) {
  try {
    const parsed = JSON.parse(content);

    // Only process objects (not arrays, primitives)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Create clean object without prototype
      const clean = Object.create(null);

      // Copy only own enumerable properties, excluding dangerous keys
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      for (const key of Object.keys(parsed)) {
        if (!dangerousKeys.includes(key)) {
          clean[key] = parsed[key];
        }
      }

      // Return as regular object
      return Object.assign({}, clean);
    }

    return parsed;
  } catch (_e) {
    return null;
  }
}
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');

/**
 * Ensure the runtime directory exists
 */
function ensureRuntimeDir() {
  const dir = path.dirname(STATE_FILE);
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
 * Uses SEC-007 safe JSON parsing to prevent prototype pollution
 * @returns {Object} Current state object
 */
function getState() {
  // Read directly from disk for correctness.
  // Hooks run in separate Node processes, so cross-hook in-memory caching is ineffective.
  return loadStateFromFile();
}

/**
 * Save state to file atomically
 * Uses atomic write (temp file + rename) to prevent corruption on crash
 * Invalidates cache to ensure subsequent reads get fresh data
 * @param {Object} state - State to save
 */
function saveState(state) {
  try {
    ensureRuntimeDir();
    // Atomic write: write to temp file, then rename
    // Prevents data corruption if process crashes mid-write
    atomicWriteJSONSync(STATE_FILE, state);
    // Invalidate cache so subsequent getState() calls see the new data
    invalidateCache(STATE_FILE);
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
 * Used for conflict detection in optimistic concurrency
 * @returns {Object} Current state from file
 */
function loadStateFromFile() {
  try {
    ensureRuntimeDir();
    if (!fs.existsSync(STATE_FILE)) {
      return getDefaultState();
    }
    const content = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = safeJSONParse(content);
    if (parsed) {
      return { ...getDefaultState(), ...parsed };
    }
  } catch (_e) {
    // On any error, return default
  }
  return getDefaultState();
}

/**
 * Synchronous sleep for exponential backoff
 *
 * SEC-AUDIT-020 FIX: Uses Atomics.wait() when available to properly block
 * the thread without CPU spin. Falls back to busy-wait on older Node.js.
 *
 * @param {number} ms - Milliseconds to sleep
 */
function syncSleep(ms) {
  // Use Atomics.wait for proper blocking (Node.js v16+)
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
    try {
      // Create a shared buffer that will never be signaled (timeout-only)
      const sharedBuffer = new SharedArrayBuffer(4);
      const int32 = new Int32Array(sharedBuffer);
      // Atomics.wait blocks the thread without CPU spin
      Atomics.wait(int32, 0, 0, ms);
      return;
    } catch (_e) {
      // Fall through to busy-wait if Atomics.wait fails
    }
  }
  // Fallback to busy-wait for older Node.js versions
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait - only used when Atomics.wait unavailable
  }
}

/**
 * Save state with optimistic concurrency control and retry
 *
 * Uses read-modify-write pattern with version checking:
 * 1. Read current state
 * 2. Check version
 * 3. Merge updates
 * 4. Increment version
 * 5. Re-read and verify version hasn't changed
 * 6. Write atomically
 *
 * On conflict (version changed), retry with exponential backoff
 *
 * Security safeguards:
 * - Max 5 retries (DoS protection)
 * - Version validated as positive integer (manipulation prevention)
 * - Exponential backoff (thundering herd prevention)
 *
 * @param {Object} updates - Fields to update in state
 * @param {number} [retries=MAX_RETRIES] - Maximum retries (default: 5)
 * @returns {Object} Merged state that was saved
 * @throws {Error} If save fails after all retries
 */
function saveStateWithRetry(updates, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    // Apply exponential backoff on retries (skip first attempt)
    if (i > 0) {
      const backoffMs = BASE_BACKOFF * Math.pow(2, i - 1);
      syncSleep(backoffMs);
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

    // Step 5: Re-read to check for conflicts
    const recheck = loadStateFromFile();
    const recheckVersion = validateVersion(recheck.version);

    // If version changed since we read, someone else wrote - retry
    if (recheckVersion !== currentVersion) {
      continue; // Conflict detected, retry
    }

    // Step 6: Write atomically
    try {
      ensureRuntimeDir();
      atomicWriteJSONSync(STATE_FILE, merged);
      invalidateCache(STATE_FILE);
      return merged;
    } catch (_e) {
      // Write failed, retry
      continue;
    }
  }

  // All retries exhausted
  throw new Error(`Save failed after ${retries} retries - concurrent modification conflict`);
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

// ==========================================
// TaskUpdate Tracking Functions
// ==========================================

/**
 * Record a TaskUpdate call
 * SEC-AUDIT-011 FIX: Uses saveStateWithRetry for atomic updates
 * @param {string} taskId - The task ID being updated
 * @param {string} status - The status being set (in_progress, completed, etc.)
 * @returns {Object} Updated state
 */
function recordTaskUpdate(taskId, status) {
  // Get current count from state for incrementing
  const current = getState();
  const currentCount = current.taskUpdatesThisSession || 0;

  // SEC-AUDIT-011 Known Limitation: Non-atomic read-modify-write race condition
  // Lines 574-583 execute a non-atomic sequence:
  //   1. Read: getState() retrieves currentCount (line 574)
  //   2. Calculate: increment value (line 575)
  //   3. Write: saveStateWithRetry() persists incremented count (lines 578-583)
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
  // and provides retry logic for transient failures. On Windows NTFS, atomicity is best-effort.
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
 * Useful for testing or when external processes modify the state file
 */
function invalidateStateCache() {
  invalidateCache(STATE_FILE);
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

// Export functions
module.exports = {
  // Existing exports
  getState,
  resetToRouterMode,
  enterAgentMode,
  exitAgentMode,
  isInAgentContext,
  checkWriteAllowed,
  getEnforcementMode,
  STATE_FILE,
  PROJECT_ROOT,
  // Complexity tracking - setters
  setComplexity,
  markPlannerSpawned,
  markSecuritySpawned,
  setSecurityRequired,
  // Complexity tracking - getters
  getComplexity,
  isPlannerRequired,
  isPlannerSpawned,
  isSecurityRequired,
  isSecuritySpawned,
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
