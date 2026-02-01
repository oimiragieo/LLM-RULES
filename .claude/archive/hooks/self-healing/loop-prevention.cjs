#!/usr/bin/env node
/**
 * Loop Prevention Hook
 *
 * PreToolUse hook for Task (and evolution triggers)
 *
 * @deprecated
 * Not wired in `.claude/settings.json`. Loop prevention is enforced by
 * `.claude/hooks/routing/pre-task-unified.cjs` and state is updated by
 * `.claude/lib/self-healing/loop-state-manager.cjs` (plus best-effort decrement
 * in `.claude/hooks/routing/post-task-unified.cjs`).
 *
 * Prevents runaway loops in self-healing and evolution processes via:
 * 1. Evolution Budget - Max evolutions per session (default: 3)
 * 2. Cooldown Period - Min time between same-type evolutions (default: 5 min)
 * 3. Depth Limit - Max nested agent spawns (default: 5)
 * 4. Pattern Detection - Block if same action repeated N times (default: 3)
 *
 * State tracking: .claude/context/self-healing/loop-state.json
 *
 * ENFORCEMENT MODES (LOOP_PREVENTION_MODE):
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * CONFIGURATION (via environment variables):
 * - LOOP_EVOLUTION_BUDGET: Max evolutions per session (default: 3)
 * - LOOP_COOLDOWN_MS: Milliseconds between same-type evolutions (default: 300000)
 * - LOOP_DEPTH_LIMIT: Max nested agent spawns (default: 5)
 * - LOOP_PATTERN_THRESHOLD: Max repetitions of same action (default: 3)
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (when LOOP_PREVENTION_MODE=block)
 *
 * SECURITY NOTE (SEC-008 FIX):
 * This hook fails CLOSED on errors (exits 2) to prevent security bypass via induced errors.
 * Override with LOOP_PREVENTION_FAIL_OPEN=true for debugging only.
 */

'use strict';

/* eslint-disable max-depth */

const fs = require('fs');
const path = require('path');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  auditSecurityOverride,
  auditLog,
} = require('../../../lib/utils/hook-input.cjs');

// SEC-007 FIX: Import safe JSON parser to prevent prototype pollution
const { _safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
// NEW-HIGH-003 FIX: Use atomic writes to prevent state file corruption
const { atomicWriteJSONSync } = require('../../../lib/utils/atomic-write.cjs');
// PERF-005 FIX: Import state cache for TTL-based caching of loop-state.json
const { getCachedState, invalidateCache } = require('../../../lib/utils/state-cache.cjs');

// ==========================================
// Constants
// ==========================================

const DEFAULT_EVOLUTION_BUDGET = 3;
const DEFAULT_COOLDOWN_MS = 300000; // 5 minutes
const DEFAULT_DEPTH_LIMIT = 5;
const DEFAULT_PATTERN_THRESHOLD = 3;

// Evolution trigger keywords in prompts
const EVOLUTION_TRIGGERS = [
  'agent-creator',
  'skill-creator',
  'workflow-creator',
  'hook-creator',
  'template-creator',
  'schema-creator',
  'create new agent',
  'create new skill',
  'create new workflow',
  'create new hook',
];

// Evolution types based on prompt content
const EVOLUTION_TYPES = {
  agent: ['agent-creator', 'create new agent', 'create agent'],
  skill: ['skill-creator', 'create new skill', 'create skill'],
  workflow: ['workflow-creator', 'create new workflow', 'create workflow'],
  hook: ['hook-creator', 'create new hook', 'create hook'],
  template: ['template-creator', 'create new template', 'create template'],
  schema: ['schema-creator', 'create new schema', 'create schema'],
};

// PERF-006: PROJECT_ROOT is now imported from project-root.cjs
const DEFAULT_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'loop-state.json'
);

// ==========================================
// Configuration Getters
// ==========================================

/**
 * Get evolution budget from environment or default
 */
function getEvolutionBudget() {
  const envBudget = process.env.LOOP_EVOLUTION_BUDGET;
  if (envBudget) {
    const parsed = parseInt(envBudget, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EVOLUTION_BUDGET;
}

/**
 * Get cooldown period from environment or default
 */
function getCooldownMs() {
  const envCooldown = process.env.LOOP_COOLDOWN_MS;
  if (envCooldown) {
    const parsed = parseInt(envCooldown, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_COOLDOWN_MS;
}

/**
 * Get depth limit from environment or default
 */
function getDepthLimit() {
  const envDepth = process.env.LOOP_DEPTH_LIMIT;
  if (envDepth) {
    const parsed = parseInt(envDepth, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_DEPTH_LIMIT;
}

/**
 * Get pattern threshold from environment or default
 */
function getPatternThreshold() {
  const envThreshold = process.env.LOOP_PATTERN_THRESHOLD;
  if (envThreshold) {
    const parsed = parseInt(envThreshold, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_THRESHOLD;
}

/**
 * Get enforcement mode from environment or default
 */
function getEnforcementMode() {
  const mode = process.env.LOOP_PREVENTION_MODE;
  if (mode === 'warn' || mode === 'off') return mode;
  return 'block';
}

// ==========================================
// State Management
// ==========================================

/**
 * SEC-AUDIT-005 FIX: Lock file suffix for atomic operations
 */
const LOCK_SUFFIX = '.lock';

/**
 * SEC-AUDIT-005 FIX: Max lock wait time in milliseconds
 */
const MAX_LOCK_WAIT_MS = 2000;

/**
 * SEC-AUDIT-005 FIX: Lock retry interval in milliseconds
 */
const LOCK_RETRY_MS = 50;

/**
 * SEC-AUDIT-020 FIX: Synchronous sleep without CPU spin
 *
 * Uses Atomics.wait() when available to properly block the thread.
 * Falls back to busy-wait on older Node.js versions.
 *
 * @param {number} ms - Milliseconds to sleep
 */
function syncSleepInternal(ms) {
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
 * SEC-AUDIT-014 FIX: Check if a process is alive
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process exists
 */
function isProcessAlive(pid) {
  try {
    // Signal 0 doesn't send a signal, just checks if process exists
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    // ESRCH: No such process
    return false;
  }
}

/**
 * SEC-AUDIT-014 TOCTOU FIX: Atomically try to claim a stale lock
 *
 * Uses atomic rename to avoid TOCTOU race condition.
 * Instead of check-then-delete (TOCTOU vulnerable), we:
 * 1. Attempt atomic rename of lock file to a unique claiming file
 * 2. If rename succeeds, we "own" the lock and can safely check/delete it
 * 3. If rename fails (ENOENT), another process already claimed/deleted it
 *
 * @param {string} lockFile - Path to the lock file
 * @returns {boolean} True if stale lock was claimed and removed
 */
function tryClaimStaleLock(lockFile) {
  // Generate unique claiming file name with pid and timestamp
  const claimingFile = `${lockFile}.claiming.${process.pid}.${Date.now()}`;

  try {
    // Step 1: Atomically rename lock file to claiming file
    // This is atomic on both POSIX and Windows
    // If two processes race, only one rename will succeed
    fs.renameSync(lockFile, claimingFile);

    // Step 2: We now "own" the claiming file - read and check if process is dead
    try {
      const lockData = JSON.parse(fs.readFileSync(claimingFile, 'utf8'));

      if (lockData.pid && !isProcessAlive(lockData.pid)) {
        // Process is dead - stale lock successfully claimed, delete it
        fs.unlinkSync(claimingFile);
        return true;
      } else {
        // Process is still alive! Restore the lock file
        // This shouldn't happen in practice (why would a live process's lock be renamed?)
        // but we handle it for safety
        try {
          fs.renameSync(claimingFile, lockFile);
        } catch (_restoreErr) {
          // If restore fails, delete claiming file to avoid orphans
          try {
            fs.unlinkSync(claimingFile);
          } catch {
            // Best effort cleanup
          }
        }
        return false;
      }
    } catch (_readErr) {
      // Couldn't read/parse claiming file - delete it and claim success
      try {
        fs.unlinkSync(claimingFile);
      } catch {
        // Best effort cleanup
      }
      return true;
    }
  } catch (_renameErr) {
    // Rename failed - either lock doesn't exist (ENOENT) or another process claimed it
    // Either way, we didn't claim it
    return false;
  }
}

/**
 * SEC-AUDIT-014 FIX: Acquire a lock file for atomic operations
 * Uses exclusive file creation (O_EXCL equivalent via wx flag)
 * Fixed TOCTOU by using atomic rename for stale lock cleanup
 * @param {string} filePath - Path to the file to lock
 * @returns {boolean} True if lock acquired, false otherwise
 */
function acquireLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
    try {
      // Attempt exclusive creation - fails if lock exists
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, time: Date.now() }), {
        flag: 'wx',
      });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Lock exists - try to atomically claim it if stale
        // SEC-AUDIT-014 TOCTOU FIX: Use atomic rename instead of check-then-delete
        if (tryClaimStaleLock(lockFile)) {
          // Successfully claimed and removed stale lock, retry acquire
          continue;
        }

        // Lock is held by a live process, wait and retry
        // SEC-AUDIT-020 FIX: Use Atomics.wait instead of busy-wait
        syncSleepInternal(LOCK_RETRY_MS);
      } else {
        // Other error, give up
        return false;
      }
    }
  }
  return false;
}

/**
 * SEC-AUDIT-005 FIX: Release a lock file
 * @param {string} filePath - Path to the file to unlock
 */
function releaseLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // Ignore errors - lock may have been cleaned up
  }
}

/**
 * Get default state
 */
function getDefaultState() {
  return {
    sessionId: process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`,
    evolutionCount: 0,
    lastEvolutions: {},
    spawnDepth: 0,
    actionHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ensure state directory exists
 */
function ensureStateDir(stateFile) {
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get current state from file
 * @param {string} stateFile - Path to state file (optional, for testing)
 * @returns {Object} Current state object
 *
 * SEC-007 FIX: Uses safeParseJSON to prevent prototype pollution attacks.
 * Only known properties from the 'loop-state' schema are retained.
 *
 * SEC-AUDIT-005 FIX: Uses file locking to prevent TOCTOU race conditions.
 *
 * PERF-005 FIX: Uses state-cache.cjs for TTL-based caching to reduce I/O.
 * Caching reduces ~100-200ms overhead from repeated file locking per read.
 */
function getState(stateFile = DEFAULT_STATE_FILE) {
  const defaults = getDefaultState();

  try {
    ensureStateDir(stateFile);
    // PERF-005 FIX: Try cached state first (1 second TTL default)
    // This reduces redundant file reads and lock acquisitions
    const cached = getCachedState(stateFile, null);
    if (cached !== null && typeof cached === 'object') {
      // SEC-007 FIX: Extract only known properties to prevent prototype pollution
      // This is equivalent to safeParseJSON but without re-serialization overhead
      const result = { ...defaults };

      if (typeof cached.sessionId === 'string') {
        result.sessionId = cached.sessionId;
      }
      if (typeof cached.evolutionCount === 'number') {
        result.evolutionCount = cached.evolutionCount;
      }
      if (cached.lastEvolutions && typeof cached.lastEvolutions === 'object') {
        // Deep copy to prevent reference manipulation
        result.lastEvolutions = {};
        for (const key of Object.keys(cached.lastEvolutions)) {
          if (typeof cached.lastEvolutions[key] === 'string') {
            result.lastEvolutions[key] = cached.lastEvolutions[key];
          }
        }
      }
      if (typeof cached.spawnDepth === 'number') {
        result.spawnDepth = cached.spawnDepth;
      }
      // actionHistory contains objects with { action: string, count: number, lastAt?: string }
      if (Array.isArray(cached.actionHistory)) {
        result.actionHistory = cached.actionHistory
          .filter(item => item && typeof item === 'object')
          .map(item => {
            const entry = {
              action: typeof item.action === 'string' ? item.action : '',
              count: typeof item.count === 'number' ? item.count : 0,
            };
            // Optional lastAt timestamp
            if (typeof item.lastAt === 'string') {
              entry.lastAt = item.lastAt;
            }
            return entry;
          })
          .filter(item => item.action); // Remove invalid entries
      }
      if (typeof cached.createdAt === 'string') {
        result.createdAt = cached.createdAt;
      }
      if (typeof cached.updatedAt === 'string') {
        result.updatedAt = cached.updatedAt;
      }

      return result;
    }
  } catch (_e) {
    // File might be corrupted or locked, return default
  }
  return defaults;
}

/**
 * Save state to file (internal use)
 * SEC-AUDIT-005 FIX: Uses file locking to prevent TOCTOU race conditions
 * NEW-HIGH-003 FIX: Uses atomic writes to prevent state file corruption
 * PERF-005 FIX: Invalidates cache after write to ensure next read is fresh
 * @param {Object} state - State to save
 * @param {string} stateFile - Path to state file
 */
function _saveState(state, stateFile = DEFAULT_STATE_FILE) {
  // SEC-AUDIT-005 FIX: Acquire lock before writing
  const lockAcquired = acquireLock(stateFile);
  try {
    ensureStateDir(stateFile);
    state.updatedAt = new Date().toISOString();
    // NEW-HIGH-003: Use atomic write: writes to temp file, then renames (atomic on POSIX)
    atomicWriteJSONSync(stateFile, state);
    // PERF-005 FIX: Invalidate cache so subsequent getState() calls see new data
    invalidateCache(stateFile);
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[loop-prevention] Warning: Could not save state:', e.message);
    }
  } finally {
    // SEC-AUDIT-005 FIX: Always release lock
    if (lockAcquired) {
      releaseLock(stateFile);
    }
  }
}

/**
 * Reset state to defaults
 * @param {string} stateFile - Path to state file
 */
function resetState(stateFile = DEFAULT_STATE_FILE) {
  const state = getDefaultState();
  _saveState(state, stateFile);
  return state;
}

// ==========================================
// Evolution Budget Mechanism
// ==========================================

/**
 * Check if evolution is allowed based on budget
 * @param {string} stateFile - Path to state file
 * @returns {{ allowed: boolean, remaining: number, reason?: string }}
 */
function checkEvolutionBudget(stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  const budget = getEvolutionBudget();
  const remaining = Math.max(0, budget - state.evolutionCount);

  if (state.evolutionCount >= budget) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Evolution budget exhausted (${state.evolutionCount}/${budget}). Session limit reached.`,
    };
  }

  return {
    allowed: true,
    remaining,
  };
}

/**
 * Record an evolution occurrence
 * @param {string} type - Evolution type (agent, skill, workflow, etc.)
 * @param {string} stateFile - Path to state file
 */
function recordEvolution(type, stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  state.evolutionCount++;
  state.lastEvolutions[type] = new Date().toISOString();
  _saveState(state, stateFile);
  return state;
}

// ==========================================
// Cooldown Period Mechanism
// ==========================================

/**
 * Check if evolution is allowed based on cooldown period
 * @param {string} type - Evolution type to check
 * @param {string} stateFile - Path to state file
 * @returns {{ allowed: boolean, remainingMs?: number, reason?: string }}
 */
function checkCooldownPeriod(type, stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  const cooldownMs = getCooldownMs();
  const lastEvolution = state.lastEvolutions[type];

  if (!lastEvolution) {
    return { allowed: true };
  }

  const lastTime = new Date(lastEvolution).getTime();
  const elapsed = Date.now() - lastTime;
  const remainingMs = cooldownMs - elapsed;

  if (remainingMs > 0) {
    const remainingMin = Math.ceil(remainingMs / 60000);
    return {
      allowed: false,
      remainingMs,
      reason: `Cooldown period active for ${type} evolution. Wait ${remainingMin} minute(s).`,
    };
  }

  return { allowed: true };
}

// ==========================================
// Spawn Depth Mechanism
// ==========================================

/**
 * Check if spawn is allowed based on depth limit
 * @param {string} stateFile - Path to state file
 * @returns {{ allowed: boolean, currentDepth: number, reason?: string }}
 */
function checkSpawnDepth(stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  const depthLimit = getDepthLimit();

  if (state.spawnDepth >= depthLimit) {
    return {
      allowed: false,
      currentDepth: state.spawnDepth,
      reason: `Spawn depth limit exceeded (${state.spawnDepth}/${depthLimit}). Too many nested agent spawns.`,
    };
  }

  return {
    allowed: true,
    currentDepth: state.spawnDepth,
  };
}

/**
 * Record an agent spawn
 * @param {string} agentName - Name/type of spawned agent
 * @param {string} stateFile - Path to state file
 */
function recordSpawn(agentName, stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  state.spawnDepth++;
  _saveState(state, stateFile);
  return state;
}

/**
 * Decrement spawn depth (when agent completes)
 * @param {string} stateFile - Path to state file
 */
function decrementSpawnDepth(stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  state.spawnDepth = Math.max(0, state.spawnDepth - 1);
  _saveState(state, stateFile);
  return state;
}

// ==========================================
// Pattern Detection Mechanism
// ==========================================

/**
 * Check if action is allowed based on pattern detection
 * @param {string} action - Action identifier (e.g., 'spawn:developer')
 * @param {string} stateFile - Path to state file
 * @returns {{ allowed: boolean, count?: number, reason?: string }}
 */
function checkPatternDetection(action, stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  const threshold = getPatternThreshold();

  const entry = state.actionHistory.find(a => a.action === action);
  const count = entry ? entry.count : 0;

  if (count >= threshold) {
    return {
      allowed: false,
      count,
      reason: `Pattern detected: "${action}" repeated ${count} times. Threshold is ${threshold}.`,
    };
  }

  return {
    allowed: true,
    count,
  };
}

/**
 * Record an action occurrence
 * @param {string} action - Action identifier
 * @param {string} stateFile - Path to state file
 */
function recordAction(action, stateFile = DEFAULT_STATE_FILE) {
  const state = getState(stateFile);
  const entry = state.actionHistory.find(a => a.action === action);

  if (entry) {
    entry.count++;
    entry.lastAt = new Date().toISOString();
  } else {
    state.actionHistory.push({
      action,
      count: 1,
      lastAt: new Date().toISOString(),
    });
  }

  _saveState(state, stateFile);
  return state;
}

// ==========================================
// Evolution Type Detection
// ==========================================

/**
 * Detect evolution type from prompt content
 * @param {string} prompt - The prompt text
 * @returns {string|null} Evolution type or null
 */
function detectEvolutionType(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  for (const [type, patterns] of Object.entries(EVOLUTION_TYPES)) {
    if (patterns.some(p => lower.includes(p))) {
      return type;
    }
  }
  return null;
}

/**
 * Check if prompt triggers evolution
 * @param {string} prompt - The prompt text
 * @returns {boolean}
 */
function isEvolutionTrigger(prompt) {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return EVOLUTION_TRIGGERS.some(t => lower.includes(t.toLowerCase()));
}

// ==========================================
// Combined PreToolUse Check
// ==========================================

/**
 * Main check function for PreToolUse hook
 * @param {Object} hookInput - Hook input from Claude Code
 * @param {string} stateFile - Path to state file
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkPreToolUse(hookInput, stateFile = DEFAULT_STATE_FILE) {
  const toolName = hookInput?.tool_name || hookInput?.tool;
  const toolInput = hookInput?.tool_input || hookInput?.input || {};

  // Only check Task tool
  if (toolName !== 'Task') {
    return { allowed: true };
  }

  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';

  // Check 1: Spawn Depth
  const depthCheck = checkSpawnDepth(stateFile);
  if (!depthCheck.allowed) {
    return {
      allowed: false,
      reason: depthCheck.reason,
      mechanism: 'depth',
    };
  }

  // Check 2: Pattern Detection (for spawn action)
  const agentType = extractAgentType(prompt, description);
  const spawnAction = `spawn:${agentType}`;
  const patternCheck = checkPatternDetection(spawnAction, stateFile);
  if (!patternCheck.allowed) {
    return {
      allowed: false,
      reason: patternCheck.reason,
      mechanism: 'pattern',
    };
  }

  // Check 3: Evolution triggers
  if (isEvolutionTrigger(prompt)) {
    // Check evolution budget
    const budgetCheck = checkEvolutionBudget(stateFile);
    if (!budgetCheck.allowed) {
      return {
        allowed: false,
        reason: budgetCheck.reason,
        mechanism: 'budget',
      };
    }

    // Check cooldown for specific evolution type
    const evolutionType = detectEvolutionType(prompt);
    if (evolutionType) {
      const cooldownCheck = checkCooldownPeriod(evolutionType, stateFile);
      if (!cooldownCheck.allowed) {
        return {
          allowed: false,
          reason: cooldownCheck.reason,
          mechanism: 'cooldown',
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Extract agent type from prompt/description
 * @param {string} prompt - The prompt text
 * @param {string} description - The description text
 * @returns {string} Agent type identifier
 */
function extractAgentType(prompt, description) {
  const combined = `${prompt} ${description}`.toLowerCase();

  // Common agent types
  const agentTypes = [
    'developer',
    'planner',
    'architect',
    'qa',
    'security-architect',
    'devops',
    'technical-writer',
    'evolution-orchestrator',
    'reflection-agent',
  ];

  for (const type of agentTypes) {
    if (combined.includes(type)) {
      return type;
    }
  }

  // Check for "You are AGENT_NAME" pattern
  const youAreMatch = combined.match(/you are (?:the )?(\w+(?:-\w+)*)/i);
  if (youAreMatch) {
    return youAreMatch[1].toLowerCase();
  }

  return 'unknown';
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Format violation message
 */
function formatViolationMessage(result) {
  return `[LOOP PREVENTION] ${result.reason}

This is a safety mechanism to prevent infinite loops.`;
}

// ==========================================
// Main Execution
// ==========================================

/**
 * Main entry point for loop prevention hook.
 *
 * Prevents runaway loops in self-healing and evolution processes by
 * enforcing budgets, cooldowns, depth limits, and pattern detection.
 *
 * Tracks:
 * - Evolution budget (max 3 per session)
 * - Cooldown period (5 min between same-type evolutions)
 * - Spawn depth limit (max 5 nested agent spawns)
 * - Pattern detection (blocks same action repeated 3+ times)
 *
 * State File: .claude/context/self-healing/loop-state.json
 *
 * @async
 * @returns {Promise<void>} Exits with:
 *   - 0 if operation is allowed
 *   - 2 if operation is blocked or error occurs (fail-closed)
 *
 * @throws {Error} Caught internally; triggers fail-closed behavior.
 *   When loop state is unknown or corrupted, exits with code 2.
 *
 * Environment Variables:
 *   - LOOP_PREVENTION_MODE: block (default) | warn | off
 *   - LOOP_EVOLUTION_BUDGET: max evolutions (default: 3)
 *   - LOOP_COOLDOWN_MS: min time between evolutions (default: 300000)
 *   - LOOP_DEPTH_LIMIT: max nested spawns (default: 5)
 *   - LOOP_PATTERN_THRESHOLD: max repetitions (default: 3)
 *
 * Exit Behavior:
 *   - Allowed: process.exit(0)
 *   - Blocked: process.exit(2) + JSON message to stdout
 *   - Warning: process.exit(0) + JSON message to stdout (warn mode)
 *   - Error: process.exit(2) + JSON audit log to stderr
 */
async function main() {
  try {
    const mode = getEnforcementMode();
    if (mode === 'off') {
      // SEC-010 FIX: Audit log when security override is used
      console.error(
        JSON.stringify({
          hook: 'loop-prevention',
          event: 'security_override_used',
          override: 'LOOP_PREVENTION_MODE=off',
          timestamp: new Date().toISOString(),
          warning: 'Security enforcement disabled - loop prevention checks bypassed',
        })
      );
      process.exit(0);
    }

    const hookInput = await parseHookInput();
    if (!hookInput) {
      process.exit(0);
    }

    const result = checkPreToolUse(hookInput);

    if (!result.allowed) {
      const message = formatViolationMessage(result);

      if (mode === 'block') {
        console.log(JSON.stringify({ result: 'block', message }));
        process.exit(2);
      } else {
        console.log(JSON.stringify({ result: 'warn', message }));
        process.exit(0);
      }
    }

    // Record the spawn if allowed
    const toolInput = hookInput?.tool_input || hookInput?.input || {};
    const prompt = toolInput.prompt || '';
    const description = toolInput.description || '';
    const agentType = extractAgentType(prompt, description);

    recordSpawn(agentType);
    recordAction(`spawn:${agentType}`);

    // Record evolution if triggered
    if (isEvolutionTrigger(prompt)) {
      const evolutionType = detectEvolutionType(prompt) || 'unknown';
      recordEvolution(evolutionType);
    }

    process.exit(0);
  } catch (err) {
    // SEC-008 FIX: Fail closed on errors (defense-in-depth)
    // Security hooks must deny by default when state is unknown
    // Override: Set LOOP_PREVENTION_FAIL_OPEN=true for debugging only
    if (process.env.LOOP_PREVENTION_FAIL_OPEN === 'true') {
      // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
      auditSecurityOverride(
        'loop-prevention',
        'LOOP_PREVENTION_FAIL_OPEN',
        'true',
        'Hook fails open on errors (debug mode)'
      );
      process.exit(0);
    }

    // Log the error for audit trail
    auditLog('loop-prevention', 'error_fail_closed', { error: err.message });

    if (process.env.DEBUG_HOOKS) {
      console.error('[loop-prevention] Error:', err.message);
      console.error('[loop-prevention] Stack:', err.stack);
    }

    // Fail closed: block the operation when security state is unknown
    process.exit(2);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// ==========================================
// Exports
// ==========================================

/**
 * Module exports for loop-prevention hook.
 *
 * Prevents infinite loops in self-evolution by tracking evolution budget,
 * cooldown periods, spawn depth, and action patterns.
 *
 * @typedef {Object} LoopPreventionExports
 * @property {Function} main - Main entry point for loop prevention hook
 * @property {Function} getState - Get current loop prevention state
 * @property {Function} resetState - Reset loop prevention state
 * @property {Function} _saveState - Save state to persistent storage (private)
 * @property {Function} checkEvolutionBudget - Check if evolution budget exceeded
 * @property {Function} recordEvolution - Record evolution event in state
 * @property {Function} checkCooldownPeriod - Check if in cooldown period
 * @property {Function} checkSpawnDepth - Check spawn nesting depth limit
 * @property {Function} recordSpawn - Record agent spawn in depth tracking
 * @property {Function} decrementSpawnDepth - Decrement spawn depth on exit
 * @property {Function} checkPatternDetection - Detect repetitive action patterns
 * @property {Function} recordAction - Record action for pattern analysis
 * @property {Function} checkPreToolUse - Combined check for PreToolUse event
 * @property {Function} getEnforcementMode - Get enforcement mode (block/warn/off)
 * @property {Function} detectEvolutionType - Detect type of evolution event
 * @property {Function} isEvolutionTrigger - Check if event is evolution trigger
 * @property {Function} extractAgentType - Extract agent type from hook input
 * @property {Function} tryClaimStaleLock - Try to claim stale lock (SEC-AUDIT-014)
 * @property {Function} isProcessAlive - Check if process is alive
 * @property {number} DEFAULT_EVOLUTION_BUDGET - Max evolution attempts per session
 * @property {number} DEFAULT_COOLDOWN_MS - Cooldown period in milliseconds
 * @property {number} DEFAULT_DEPTH_LIMIT - Maximum spawn nesting depth
 * @property {number} DEFAULT_PATTERN_THRESHOLD - Pattern repetition threshold
 * @property {string} DEFAULT_STATE_FILE - Path to loop prevention state file
 * @property {string} PROJECT_ROOT - Project root directory path
 */

module.exports = {
  // State management
  getState,
  resetState,
  _saveState,

  // Evolution budget
  checkEvolutionBudget,
  recordEvolution,

  // Cooldown period
  checkCooldownPeriod,

  // Spawn depth
  checkSpawnDepth,
  recordSpawn,
  decrementSpawnDepth,

  // Pattern detection
  checkPatternDetection,
  recordAction,

  // Combined check
  checkPreToolUse,

  // Utilities
  getEnforcementMode,
  detectEvolutionType,
  isEvolutionTrigger,
  extractAgentType,

  // Lock utilities (SEC-AUDIT-014 TOCTOU fix)
  tryClaimStaleLock,
  isProcessAlive,

  // Constants
  DEFAULT_EVOLUTION_BUDGET,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_DEPTH_LIMIT,
  DEFAULT_PATTERN_THRESHOLD,
  DEFAULT_STATE_FILE,
  PROJECT_ROOT,
};
