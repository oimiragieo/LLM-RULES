'use strict';

/**
 * Conditional Task Execution
 *
 * Evaluates conditions on tasks to determine whether they should execute.
 * Supports:
 *   - ALWAYS: unconditional execution (default)
 *   - IF_SUCCESS: execute only if previous task completed successfully
 *   - IF_FAILURE: execute only if previous task failed
 *   - IF_OUTPUT_MATCHES: execute if previous output matches a pattern
 *   - CUSTOM: user-supplied evaluation function
 *
 * Backward compatible: tasks without conditions always execute.
 *
 * @module conditional-executor
 */

const ConditionType = Object.freeze({
  ALWAYS: 'always',
  IF_SUCCESS: 'if_success',
  IF_FAILURE: 'if_failure',
  IF_OUTPUT_MATCHES: 'if_output_matches',
  CUSTOM: 'custom',
});

/**
 * Evaluate a condition against execution context.
 *
 * @param {Object|null|undefined} condition
 * @param {Object} ctx - execution context (previousTask, etc.)
 * @returns {{ execute: boolean, reason: string }}
 */
function evaluateCondition(condition, ctx) {
  if (!condition) {
    return { execute: true, reason: 'no condition (default: always)' };
  }

  const type = condition.type || ConditionType.ALWAYS;

  switch (type) {
    case ConditionType.ALWAYS:
      return { execute: true, reason: 'always' };

    case ConditionType.IF_SUCCESS: {
      const prev = ctx.previousTask;
      if (!prev) {
        return { execute: false, reason: 'no previous task found' };
      }
      if (prev.status === 'completed') {
        return { execute: true, reason: 'previous task completed successfully' };
      }
      return {
        execute: false,
        reason: `previous task not completed (status: ${prev.status})`,
      };
    }

    case ConditionType.IF_FAILURE: {
      const prev = ctx.previousTask;
      if (!prev) {
        return { execute: false, reason: 'no previous task found' };
      }
      if (prev.status === 'failed') {
        return { execute: true, reason: 'previous task failed' };
      }
      return {
        execute: false,
        reason: `previous task did not fail (status: ${prev.status})`,
      };
    }

    case ConditionType.IF_OUTPUT_MATCHES: {
      const prev = ctx.previousTask;
      if (!prev || !prev.metadata || !prev.metadata.summary) {
        return { execute: false, reason: 'no previous task output to match' };
      }
      const summary = prev.metadata.summary;
      const pattern = condition.pattern || '';
      let matches = false;
      if (condition.regex) {
        try {
          matches = new RegExp(pattern).test(summary);
        } catch {
          return { execute: false, reason: `invalid regex pattern: ${pattern}` };
        }
      } else {
        matches = summary.includes(pattern);
      }
      return {
        execute: matches,
        reason: matches
          ? `output matches pattern "${pattern}"`
          : `output does not match pattern "${pattern}"`,
      };
    }

    case ConditionType.CUSTOM: {
      if (typeof condition.evaluate !== 'function') {
        return {
          execute: false,
          reason: 'custom condition evaluate is not a function',
        };
      }
      try {
        const result = condition.evaluate(ctx);
        return {
          execute: Boolean(result),
          reason: result ? 'custom condition passed' : 'custom condition returned false',
        };
      } catch (err) {
        return {
          execute: false,
          reason: `custom condition error: ${err.message}`,
        };
      }
    }

    default:
      return {
        execute: false,
        reason: `unknown condition type: ${type}`,
      };
  }
}

/**
 * Determine whether a task should execute based on its condition.
 *
 * @param {{ id: string, condition?: Object }} task
 * @param {Object} ctx - execution context
 * @returns {{ execute: boolean, taskId: string, conditionType?: string, reason: string, skipped?: boolean }}
 */
function shouldExecuteTask(task, ctx) {
  const condResult = evaluateCondition(task.condition || null, ctx);
  return {
    execute: condResult.execute,
    taskId: task.id,
    conditionType: task.condition?.type,
    reason: condResult.reason,
    ...(condResult.execute ? {} : { skipped: true }),
  };
}

module.exports = {
  evaluateCondition,
  shouldExecuteTask,
  ConditionType,
};
