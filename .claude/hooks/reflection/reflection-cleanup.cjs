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
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const {
  removeRequests,
  readSpawnRequestsFile,
  removeStaleRequests,
} = require('../../lib/reflection/spawn-request-contract.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const MAX_REFLECTION_AGE_MS = Number(process.env.REFLECTION_MAX_AGE_HOURS || 24) * 60 * 60 * 1000;

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
// SPAWN_REQUEST_PATH_OVERRIDE allows tests to redirect to a temp file
const SPAWN_REQUEST_PATH =
  process.env.SPAWN_REQUEST_PATH_OVERRIDE ||
  path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const REFLECTION_LOG_PATH =
  process.env.REFLECTION_LOG_FILE_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'reflection-log.jsonl');

/**
 * Filter out reflection IDs that have already been processed (logged in reflection-log.jsonl).
 * Best-effort: returns all IDs on failure.
 */
function deduplicateProcessedIds(verifiedIds) {
  try {
    if (!fs.existsSync(REFLECTION_LOG_PATH)) return verifiedIds;
    const logContent = fs.readFileSync(REFLECTION_LOG_PATH, 'utf8');
    const alreadyProcessed = new Set();
    for (const line of logContent.split('\n').filter(Boolean)) {
      try {
        const entry = safeParseJSON(line);
        if (Array.isArray(entry.processedReflectionIds)) {
          entry.processedReflectionIds.forEach(id => alreadyProcessed.add(id));
        }
      } catch (_) {
        /* skip malformed lines */
      }
    }
    return verifiedIds.filter(id => !alreadyProcessed.has(id));
  } catch (_) {
    return verifiedIds;
  }
}

async function main() {
  try {
    const input = await parseHookInputAsync({ timeout: 300 });
    if (!input) process.exit(0);

    const toolName = getToolName(input);
    const toolInput = getToolInput(input);

    // Stale-entry prune: runs on every PostToolUse, regardless of tool type.
    // Prevents queue entries from persisting across sessions when agents complete
    // without emitting processedReflectionIds in TaskUpdate metadata (the primary
    // drain path). Acts as a safety-net side-channel.
    const stalePruneCount = removeStaleRequests(SPAWN_REQUEST_PATH, MAX_REFLECTION_AGE_MS);
    if (stalePruneCount > 0) {
      auditLog('reflection-cleanup', 'pruned_stale_requests', {
        count: stalePruneCount,
        maxAgeHours: MAX_REFLECTION_AGE_MS / (60 * 60 * 1000),
      });
      appendJsonl(REFLECTION_LOG_PATH, {
        trigger: 'stale_prune',
        timestamp: new Date().toISOString(),
        processedReflectionIds: [],
        stalePruneCount,
        source: 'cleanup_stale',
      });
    }

    if (toolName !== 'TaskUpdate') process.exit(0);

    const status = toolInput.status || toolInput.state;
    if (status !== 'completed') process.exit(0);

    const taskId = toolInput.taskId || toolInput.task_id || toolInput.id;
    if (!taskId) process.exit(0);

    // If the taskId matches a reflection request ID (or is part of a batch)
    const processedIds = toolInput.metadata?.processedReflectionIds;

    if (Array.isArray(processedIds) && processedIds.length > 0) {
      // Issue 2 fix: Verify ACK — check that the IDs actually exist in the spawn request file
      // before removing, to prevent silent data loss if the TaskUpdate hook fired on a stale batch.
      const currentRequests = readSpawnRequestsFile(SPAWN_REQUEST_PATH);
      const currentIdSet = new Set(currentRequests.map(r => r.id));
      const verifiedIds = processedIds.filter(id => currentIdSet.has(id));

      // Issue 3 fix: Dedup — check reflection log for already-processed IDs to prevent
      // duplicate processing when both env var and reflection queue trigger cleanup.
      const dedupedIds = deduplicateProcessedIds(verifiedIds);

      if (dedupedIds.length > 0) {
        removeRequests(SPAWN_REQUEST_PATH, dedupedIds);
        auditLog('reflection-cleanup', 'removed_processed_requests', {
          count: dedupedIds.length,
          skippedUnverified: processedIds.length - verifiedIds.length,
          skippedDuplicate: verifiedIds.length - dedupedIds.length,
        });
        // Append to reflection log so step0-guard can filter these IDs on the next run,
        // even if the spawn-request.json update races with session startup.
        appendJsonl(REFLECTION_LOG_PATH, {
          trigger: 'cleanup',
          timestamp: new Date().toISOString(),
          processedReflectionIds: dedupedIds,
          source: 'cleanup',
        });
      } else {
        auditLog('reflection-cleanup', 'skipped_all_ids', {
          reason: 'all IDs either unverified or already processed',
          totalRequested: processedIds.length,
        });
      }
    } else if (taskId.startsWith('task_completion:') || taskId.startsWith('session_end:')) {
      // Legacy fallback
      removeRequests(SPAWN_REQUEST_PATH, [taskId]);
      auditLog('reflection-cleanup', 'removed_legacy_request', { taskId });
      appendJsonl(REFLECTION_LOG_PATH, {
        trigger: 'cleanup',
        timestamp: new Date().toISOString(),
        processedReflectionIds: [taskId],
        source: 'cleanup_legacy',
      });
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
  } catch (err) {
    process.stderr.write(`[reflection-cleanup] Error: ${err.message}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
