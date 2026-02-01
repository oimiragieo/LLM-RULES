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

async function main() {
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
    process.exit(0);
  } catch (_e) {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
