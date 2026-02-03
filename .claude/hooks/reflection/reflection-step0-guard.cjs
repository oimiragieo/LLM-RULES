#!/usr/bin/env node
/**
 * Reflection Step 0 Guard
 * =======================
 *
 * Trigger: PreToolUse(TaskList)
 *
 * Warns or blocks when pending reflection spawn requests exist and the Router
 * attempts TaskList before performing Step 0.
 *
 * ENFORCEMENT MODES:
 * - block (default): Block TaskList until pending reflections are handled
 * - warn: Allow TaskList but emit warning
 * - off: Disabled
 *
 * Environment:
 * - REFLECTION_STEP0_ENFORCEMENT=block|warn|off
 * - REFLECTION_ENABLED=false to disable all reflection
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getEnforcementMode,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const { createHookLogger } = require('../../lib/utils/hook-logger.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');
const hookLog = createHookLogger('reflection-step0-guard');

function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function hasPendingReflections() {
  if (fs.existsSync(REMINDER_PATH)) {
    return true;
  }
  const requests = readSpawnRequests(SPAWN_REQUEST_PATH);
  return Array.isArray(requests) && requests.length > 0;
}

async function main() {
  const startTime = Date.now();
  try {
    if (process.env.REFLECTION_ENABLED === 'false') {
      process.exit(0);
    }

    const mode = getEnforcementMode('REFLECTION_STEP0_ENFORCEMENT', 'block');
    if (mode === 'off') {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    if (toolName !== 'TaskList') {
      process.exit(0);
    }

    hookLog.logStart('TaskList');

    if (!hasPendingReflections()) {
      hookLog.logEnd('TaskList', { status: 'no_pending' });
      process.exit(0);
    }

    const message =
      'Pending reflection requests exist. Perform Step 0 before TaskList: read ' +
      'reflection-reminder.txt, review reflection-spawn-request.json, spawn reflection-agent, then clear files. ' +
      'Set REFLECTION_STEP0_ENFORCEMENT=warn to soften enforcement.';

    auditLog('reflection-step0-guard', {
      level: mode === 'block' ? 'error' : 'warn',
      message: 'Reflection Step 0 pending before TaskList.',
      enforcement: mode,
    });

    if (mode === 'block') {
      hookLog.logBlock('TaskList', 'reflection_step0_pending');
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'TaskList',
          duration: Date.now() - startTime,
          reason: 'reflection_step0_pending',
        });
      } catch (_e) {
        // Best-effort
      }
      console.log(formatResult('block', message));
      process.exit(2);
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'TaskList',
        output: {
          status: 'warn',
          reason: 'reflection_step0_pending',
        },
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // Best-effort
    }
    hookLog.logEnd('TaskList', { status: 'warn', reason: 'reflection_step0_pending' });
    console.log(formatResult('warn', message));
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'reflection-step0-guard',
        error: err.message,
      });
    } catch (_e) {
      // Best-effort
    }
    hookLog.logFail('TaskList', err);
    if (process.env.DEBUG_HOOKS) {
      console.error('[reflection-step0-guard] Error:', err.message);
    }
    // Fail open: do not block TaskList if the guard itself fails.
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  hasPendingReflections,
  readSpawnRequests,
};
