'use strict';

/**
 * Failure types that can be resolved by decomposing the task into subtasks.
 * A task is "decomposable" when the failure indicates the task scope is too large
 * or too complex, rather than a transient or permissions-based error.
 */
const DECOMPOSABLE_FAILURE_TYPES = new Set([
  'complexity_overload',
  'task_too_large',
  'scope_too_wide',
  'token_limit_exceeded',
  'context_overflow',
]);

/**
 * Selects the appropriate repair strategy for a failed task node.
 *
 * Strategy rules:
 * - attemptCount < maxAttempts → retry
 * - attemptCount >= maxAttempts && decomposable failureType → decompose
 * - otherwise → escalate
 *
 * @param {{ taskId: string, failureType: string, attemptCount: number, maxAttempts?: number }} opts
 * @returns {{ strategy: 'retry' | 'decompose' | 'escalate', reason: string }}
 */
function selectRepairStrategy({ taskId, failureType, attemptCount, maxAttempts = 2 }) {
  if (attemptCount < maxAttempts) {
    return {
      strategy: 'retry',
      reason: `Task ${taskId} failed with '${failureType}' (attempt ${attemptCount}/${maxAttempts}); retrying`,
    };
  }

  if (DECOMPOSABLE_FAILURE_TYPES.has(failureType)) {
    return {
      strategy: 'decompose',
      reason: `Task ${taskId} exhausted ${maxAttempts} attempts with decomposable failure '${failureType}'; breaking into subtasks`,
    };
  }

  return {
    strategy: 'escalate',
    reason: `Task ${taskId} exhausted ${maxAttempts} attempts with non-decomposable failure '${failureType}'; escalating to human`,
  };
}

module.exports = { selectRepairStrategy, DECOMPOSABLE_FAILURE_TYPES };
