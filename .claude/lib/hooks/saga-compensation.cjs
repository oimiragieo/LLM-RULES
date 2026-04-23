'use strict';

/**
 * Saga Compensation Module
 *
 * Implements the SagaLLM compensating-action pattern (ArXiv 2503.11951).
 * On TaskUpdate(failed), this module:
 *   a) Finds tasks with blockedBy containing the failed taskId,
 *      removes the failed taskId from their blockedBy list, and
 *      if blockedBy becomes empty, reopens the task to "pending".
 *   b) If metadata.filesStaged is true, shells out to:
 *        git stash push -m "saga-compensation-<taskId>"
 *      to unwind partial staged changes.
 *   c) Writes a log entry to .claude/context/runtime/saga-log.jsonl.
 *
 * Safety contract:
 *   - async, non-blocking (wrapped in try/catch throughout)
 *   - errors are logged but never re-thrown (best-effort)
 *   - does NOT delete files, reset commits, or touch origin
 *   - does NOT touch memory files
 *
 * @module saga-compensation
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');

const SAGA_STATE_FILENAME = 'saga-state.json';
const SAGA_LOG_FILENAME = 'saga-log.jsonl';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sagaStatePath(runtimeDir) {
  return path.join(runtimeDir, SAGA_STATE_FILENAME);
}

function sagaLogPath(runtimeDir) {
  return path.join(runtimeDir, SAGA_LOG_FILENAME);
}

/**
 * Read saga state from disk. Returns { tasks: {} } on any error.
 * @param {string} runtimeDir
 * @returns {{ tasks: Record<string, { status: string, blockedBy: string[] }> }}
 */
function readSagaState(runtimeDir) {
  try {
    const filePath = sagaStatePath(runtimeDir);
    if (!fs.existsSync(filePath)) {
      return { tasks: {} };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = safeParseJSON(raw, null);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object') {
      return { tasks: {} };
    }
    return parsed;
  } catch (_err) {
    return { tasks: {} };
  }
}

/**
 * Write saga state to disk atomically (best-effort).
 * @param {string} runtimeDir
 * @param {object} state
 */
function writeSagaState(runtimeDir, state) {
  const filePath = sagaStatePath(runtimeDir);
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Append a single JSONL log entry to saga-log.jsonl.
 * @param {string} runtimeDir
 * @param {object} entry
 */
function appendSagaLog(runtimeDir, entry) {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(sagaLogPath(runtimeDir), line, 'utf8');
  } catch (_err) {
    // Never let logging crash compensation.
  }
}

/**
 * Build the stash label for a given taskId.
 * @param {string} taskId
 * @returns {string}
 */
function stashLabel(taskId) {
  return `saga-compensation-${taskId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform compensating actions for a failed task.
 *
 * @param {string} taskId              - The ID of the task that failed.
 * @param {object} metadata            - Task metadata from TaskUpdate input.
 *   @param {boolean} [metadata.filesStaged]  - Whether the task staged files.
 *   @param {string}  [metadata.status]       - If 'completed', compensation is skipped.
 * @param {string} [runtimeDir]        - Override for the runtime directory (used in tests).
 * @param {boolean} [dryRun]           - If true, skips real git commands but records intent.
 *
 * @returns {Promise<{
 *   reopened: string[],
 *   stashAttempted: boolean,
 *   stashLabel: string | null,
 *   errors: string[]
 * }>}
 */
async function compensateFailedTask(
  taskId,
  metadata,
  runtimeDir = DEFAULT_RUNTIME_DIR,
  dryRun = false
) {
  const result = {
    reopened: [],
    stashAttempted: false,
    stashLabel: null,
    errors: [],
  };

  // Guard: if metadata explicitly carries status=completed, this is the success
  // path — no compensation needed.
  const metaStatus = (metadata && metadata.status) || null;
  if (metaStatus && String(metaStatus).toLowerCase() === 'completed') {
    appendSagaLog(runtimeDir, {
      taskId,
      action: 'compensation_skipped',
      reason: 'status=completed (success path)',
    });
    return result;
  }

  // -------------------------------------------------------------------------
  // a) Reopen blocked-by dependents
  // -------------------------------------------------------------------------
  let state;
  try {
    state = readSagaState(runtimeDir);
  } catch (readErr) {
    result.errors.push(`readSagaState failed: ${readErr.message}`);
    state = { tasks: {} };
  }

  try {
    const tasks = state.tasks || {};
    let stateModified = false;

    for (const [depId, depTask] of Object.entries(tasks)) {
      if (!Array.isArray(depTask.blockedBy)) continue;
      const idx = depTask.blockedBy.indexOf(taskId);
      if (idx === -1) continue;

      // Remove the failed taskId from this task's blockedBy
      depTask.blockedBy = depTask.blockedBy.filter(id => id !== taskId);
      stateModified = true;

      // Only fully reopen to pending when blockedBy is now empty
      if (depTask.blockedBy.length === 0) {
        depTask.status = 'pending';
        result.reopened.push(depId);
      }
    }

    if (stateModified) {
      writeSagaState(runtimeDir, state);
    }
  } catch (reopenErr) {
    result.errors.push(`reopen dependents failed: ${reopenErr.message}`);
  }

  // -------------------------------------------------------------------------
  // b) Git stash push if filesStaged is true
  // -------------------------------------------------------------------------
  const filesStaged = metadata && metadata.filesStaged === true;
  if (filesStaged) {
    const label = stashLabel(taskId);
    result.stashAttempted = true;
    result.stashLabel = label;

    if (!dryRun) {
      try {
        const stashResult = spawnSync('git', ['stash', 'push', '-m', label], {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          shell: false,
          timeout: 10000,
          windowsHide: true,
        });
        if (stashResult.error) {
          result.errors.push(`git stash failed: ${stashResult.error.message}`);
        }
      } catch (gitErr) {
        result.errors.push(`git stash exception: ${gitErr.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // c) Write log entry
  // -------------------------------------------------------------------------
  appendSagaLog(runtimeDir, {
    taskId,
    action: 'compensation',
    reopened: result.reopened,
    stashAttempted: result.stashAttempted,
    stashLabel: result.stashLabel,
    errors: result.errors,
    metadata: {
      filesStaged: filesStaged,
      dryRun,
    },
  });

  return result;
}

module.exports = {
  compensateFailedTask,
  // Exported for testing
  stashLabel,
  SAGA_STATE_FILENAME,
  SAGA_LOG_FILENAME,
};
