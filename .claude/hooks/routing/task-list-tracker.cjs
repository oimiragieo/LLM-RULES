#!/usr/bin/env node
/**
 * PostToolUse(TaskList) Hook
 *
 * Records that TaskList() was called since the last UserPromptSubmit.
 * Used by PreToolUse(Task) (pre-task-unified.cjs) to enforce TaskList-first:
 * TaskList() must be called before Task() in the same session.
 *
 * Event: PostToolUse
 * Matcher: TaskList
 *
 * Exit code: 0 (always allow; this is a post-tool hook)
 */

'use strict';

const { parseHookInputAsync, getToolName } = require('../../lib/utils/hook-input.cjs');
const routerState = require('./router-state.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }
    const toolName = getToolName(hookInput);
    if (toolName !== 'TaskList') {
      process.exit(0);
    }
    routerState.setTaskListCalled();
    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'TaskList',
        duration: Date.now() - startTime,
        output: {
          status: 'ok',
        },
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(0);
  } catch (_e) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'task-list-tracker',
        error: _e.message,
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
