#!/usr/bin/env node
/**
 * FORCE-STEP0-EXECUTION HOOK
 * ===========================
 *
 * Trigger: UserPromptSubmit (BEFORE any router logic)
 * Purpose: Ensures reflection processing happens BEFORE TaskList/routing
 *
 * CRITICAL: This hook runs at UserPromptSubmit level to BLOCK all router operations
 * when pending reflections exist. Unlike reflection-step0-guard.cjs (which blocks
 * TaskList), this hook prevents the Router from ignoring Step 0 entirely.
 *
 * ENFORCEMENT: Always blocks (no modes) - pending reflections MUST be processed first
 *
 * Environment:
 * - REFLECTION_ENABLED=false to disable all reflection
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputAsync } = require('../../lib/utils/hook-input.cjs');
const { readSpawnRequestsFile } = require('../../lib/reflection/spawn-request-contract.cjs');
const {
  buildStep0ReminderMessage,
} = require('../../lib/reflection/reflection-reminder-message.cjs');
const { atomicWriteSync } = require('../../lib/utils/atomic-write.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const SPAWN_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics', 'spawn-log.jsonl');
const EXIT_ALLOW = 0;
const EXIT_BLOCK = 2;

/** Log to stderr only (stdout reserved for hook output). */
function stderrLog(level, message, meta = {}) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      component: 'hook:force-step0-execution',
      ...meta,
    })
  );
}

function readSpawnRequests(filePath) {
  const parsed = readSpawnRequestsFile(filePath);
  if (!Array.isArray(parsed)) {
    stderrLog('warn', 'Failed to read spawn requests');
    return [];
  }
  return parsed;
}

function isTaskNotificationPrompt(hookInput) {
  const prompt = String(hookInput?.prompt || hookInput?.message || '');
  if (!prompt) return false;
  return (
    prompt.includes('<task-notification>') &&
    prompt.includes('</task-notification>') &&
    prompt.includes('<task-id>')
  );
}

function isBypassPermissionsMode(hookInput) {
  return Boolean(hookInput && hookInput.permission_mode === 'bypassPermissions');
}

function getPendingReflectionState() {
  const requests = readSpawnRequests(SPAWN_REQUEST_PATH);
  const pendingCount = requests.length;
  const reminderExists = fs.existsSync(REMINDER_PATH);
  let cleanedStaleReminder = false;

  // reminder file is advisory only; if no pending requests it must not block
  if (pendingCount === 0 && reminderExists) {
    try {
      fs.unlinkSync(REMINDER_PATH);
      cleanedStaleReminder = true;
    } catch (_err) {
      // best effort
    }
  }

  return {
    pendingCount,
    reminderExists,
    cleanedStaleReminder,
    hasPending: pendingCount > 0,
  };
}

function hasPendingReflections() {
  const state = getPendingReflectionState();
  if (state.hasPending) {
    stderrLog('info', `Pending reflections detected: ${state.pendingCount} spawn requests`);
    return true;
  }
  return false;
}

function logToSpawnLog(event) {
  try {
    const entry = JSON.stringify(event);
    fs.appendFileSync(SPAWN_LOG_PATH, entry + '\n', 'utf8');
  } catch (err) {
    stderrLog('warn', 'Failed to log to spawn-log.jsonl', { error: err.message });
  }
}

function writeReminderFile(pendingCount) {
  try {
    const content = buildStep0ReminderMessage(pendingCount);
    atomicWriteSync(REMINDER_PATH, content, 'utf8');
  } catch (err) {
    stderrLog('warn', 'Failed to write reflection reminder file', { error: err.message });
  }
}

async function main() {
  // Skip if reflection system is disabled
  if (process.env.REFLECTION_ENABLED === 'false') {
    stderrLog('info', 'Reflection system disabled, skipping Step 0 check');
    process.exit(EXIT_ALLOW);
  }

  let hookInput = null;
  try {
    hookInput = await parseHookInputAsync();
  } catch (_err) {
    // best effort; continue without input-specific logic
  }

  if (isTaskNotificationPrompt(hookInput)) {
    stderrLog('info', 'Skipping Step 0 check for internal task notification payload');
    process.exit(EXIT_ALLOW);
  }

  stderrLog('info', 'Checking for pending reflections (Step 0)');

  const pendingState = getPendingReflectionState();
  if (!pendingState.hasPending) {
    if (pendingState.cleanedStaleReminder) {
      stderrLog('info', 'Cleared stale reflection reminder (0 pending requests)');
    }
    stderrLog('info', 'No pending reflections, proceeding with normal flow');
    process.exit(0);
  }

  // BLOCK: Pending reflections must be processed first
  const requestCount = pendingState.pendingCount;

  if (isBypassPermissionsMode(hookInput)) {
    stderrLog(
      'warn',
      'Pending reflections detected; bypassPermissions active, emitting advisory only',
      {
        spawnRequestCount: requestCount,
      }
    );
    logToSpawnLog({
      event: 'step0_bypass_advisory',
      timestamp: new Date().toISOString(),
      reason: 'pending_reflections_bypass_mode',
      spawn_request_count: requestCount,
      action: 'allow_with_advisory',
    });
    process.exit(EXIT_ALLOW);
  }

  stderrLog('error', 'BLOCKING: Pending reflections must be processed before proceeding', {
    reminderFileExists: fs.existsSync(REMINDER_PATH),
    spawnRequestCount: requestCount,
  });

  logToSpawnLog({
    event: 'step0_block',
    timestamp: new Date().toISOString(),
    reason: 'pending_reflections',
    reminder_file_exists: fs.existsSync(REMINDER_PATH),
    spawn_request_count: requestCount,
    action: 'blocking_all_router_operations_until_reflections_processed',
  });
  writeReminderFile(requestCount);

  // Exit with error to block the tool call
  console.log(
    JSON.stringify({
      block: true,
      message:
        `STEP 0 REQUIRED: ${requestCount} pending reflection request(s) detected. ` +
        'Read .claude/context/runtime/reflection-reminder.txt and ' +
        '.claude/context/runtime/reflection-spawn-request.json, spawn reflection-agent ' +
        'for each request (or first batch), then clear reminder file and clear spawn request file. ' +
        'See CLAUDE.md Section 0 for Step 0 protocol.',
    })
  );

  process.exit(EXIT_BLOCK);
}

if (require.main === module) {
  main().catch(() => {
    process.exit(0);
  });
}

module.exports = {
  hasPendingReflections,
  readSpawnRequests,
  getPendingReflectionState,
  isTaskNotificationPrompt,
  isBypassPermissionsMode,
  writeReminderFile,
  EXIT_ALLOW,
  EXIT_BLOCK,
};
