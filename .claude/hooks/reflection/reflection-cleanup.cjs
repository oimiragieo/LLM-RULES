#!/usr/bin/env node
/**
 * Hook: reflection-cleanup.cjs
 * Trigger: PostToolUse(TaskUpdate:completed)
 * Purpose: Automatically remove processed reflection requests from the JSON file
 * when the reflection-agent successfully completes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/hook-input.cjs');
const { parseHookInputAsync, getToolName, getToolInput, auditLog } = require('../../lib/utils/hook-input.cjs');
const { removeRequests, readSpawnRequestsFile } = require('../../lib/reflection/spawn-request-contract.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');

async function main() {
  try {
    const input = await parseHookInputAsync({ timeout: 300 });
    if (!input) process.exit(0);

    const toolName = getToolName(input);
    const toolInput = getToolInput(input);

    if (toolName !== 'TaskUpdate') process.exit(0);
    
    const status = toolInput.status || toolInput.state;
    if (status !== 'completed') process.exit(0);

    const taskId = toolInput.taskId || toolInput.task_id || toolInput.id;
    if (!taskId) process.exit(0);

    // If the taskId matches a reflection request ID (or is part of a batch)
    const processedIds = toolInput.metadata?.processedReflectionIds;
    
    if (Array.isArray(processedIds) && processedIds.length > 0) {
      removeRequests(SPAWN_REQUEST_PATH, processedIds);
      auditLog('reflection-cleanup', 'removed_processed_requests', { count: processedIds.length });
    } else if (taskId.startsWith('task_completion:') || taskId.startsWith('session_end:')) {
      // Legacy fallback
      removeRequests(SPAWN_REQUEST_PATH, [taskId]);
      auditLog('reflection-cleanup', 'removed_legacy_request', { taskId });
    }

    // Clean up reminder file if no pending requests remain
    const remaining = readSpawnRequestsFile(SPAWN_REQUEST_PATH);
    if (remaining.length === 0 && fs.existsSync(REMINDER_PATH)) {
      try {
        fs.unlinkSync(REMINDER_PATH);
        auditLog('reflection-cleanup', 'removed_reminder_file');
      } catch (_err) {
        // best effort
      }
    }

    process.exit(0);
  } catch (_err) {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
