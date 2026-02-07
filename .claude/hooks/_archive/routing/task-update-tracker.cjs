'use strict';

/**
 * task-update-tracker.cjs
 *
 * @deprecated PERF-003 #2 (2026-01-28): Functionality consolidated into
 * unified-reflection-handler.cjs. This file is no longer registered in
 * settings.json. The TaskUpdate tracking is now done via:
 * - handleTaskCompletion() - for status='completed' events
 * - handleTaskUpdate() - for status='in_progress' and other events
 *
 * Kept for reference/rollback only. Can be deleted after verification.
 *
 * PostToolUse hook that tracks TaskUpdate calls.
 * Records to router-state.cjs so task-completion-guard can verify
 * agents are properly updating task status.
 *
 * Trigger: PostToolUse(TaskUpdate)
 */

const routerState = require('./router-state.cjs');

// PERF-006/PERF-007: Use shared hook-input.cjs utility
const { parseHookInputAsync, getToolInput } = require('../../lib/utils/hook-input.cjs');

/**
 * Main execution function.
 */
async function main() {
  try {
    // PERF-006/PERF-007: Use shared hook-input.cjs utility
    const input = await parseHookInputAsync();

    if (!input) {
      process.exit(0);
      return;
    }

    // PostToolUse provides tool_input with the parameters (using shared helper)
    const toolInput = getToolInput(input);

    // Extract taskId and status from TaskUpdate call
    const taskId = toolInput.taskId;
    const status = toolInput.status;

    if (taskId && status) {
      // Record to router-state
      routerState.recordTaskUpdate(taskId, status);

      if (process.env.DEBUG_HOOKS) {
        console.error(
          `[task-update-tracker] Recorded TaskUpdate: taskId=${taskId}, status=${status}`
        );
      }
    }

    // Always allow - this is just tracking, not enforcement
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('task-update-tracker error:', err.message);
    }
    // Fail open - tracking errors should not block
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = { main };
