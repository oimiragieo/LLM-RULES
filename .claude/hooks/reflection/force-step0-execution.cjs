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

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const SPAWN_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics', 'spawn-log.jsonl');

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
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    stderrLog('warn', 'Failed to read spawn requests', { error: err.message });
    return [];
  }
}

function hasPendingReflections() {
  // Check for reminder file
  if (fs.existsSync(REMINDER_PATH)) {
    stderrLog('info', 'Pending reflections detected: reminder file exists');
    return true;
  }

  // Check for spawn requests
  const requests = readSpawnRequests(SPAWN_REQUEST_PATH);
  if (requests.length > 0) {
    stderrLog('info', `Pending reflections detected: ${requests.length} spawn requests`);
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

function main() {
  // Skip if reflection system is disabled
  if (process.env.REFLECTION_ENABLED === 'false') {
    stderrLog('info', 'Reflection system disabled, skipping Step 0 check');
    process.exit(0);
  }

  stderrLog('info', 'Checking for pending reflections (Step 0)');

  if (!hasPendingReflections()) {
    stderrLog('info', 'No pending reflections, proceeding with normal flow');
    process.exit(0);
  }

  // BLOCK: Pending reflections must be processed first
  const requestCount = readSpawnRequests(SPAWN_REQUEST_PATH).length;

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

  // Exit with error to block the tool call
  console.log(
    JSON.stringify({
      block: true,
      message: `STEP 0 REQUIRED: ${requestCount} pending reflection request(s) detected. ` +
        'Read .claude/context/runtime/reflection-reminder.txt and ' +
        '.claude/context/runtime/reflection-spawn-request.json, spawn reflection-agent ' +
        'for each request (or first batch), then delete reminder file and clear spawn request file. ' +
        'See CLAUDE.md Section 0 for Step 0 protocol.',
    })
  );

  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  hasPendingReflections,
  readSpawnRequests,
};
