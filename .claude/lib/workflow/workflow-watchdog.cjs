'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { withWorkflowStateLock } = require('./workflow-state-lock.cjs');

const DEFAULT_DLQ_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'dlq.jsonl');

/**
 * Sweeps workflow state for blocked or timed out phases and moves them to DLQ
 * @param {string} stateFilePath
 * @param {string} dlqPath
 * @param {number} slaMs
 */
async function runWatchdogOnce(
  stateFilePath = path.join(PROJECT_ROOT, '.claude', 'context', 'workflow-state.json'),
  dlqPath = DEFAULT_DLQ_PATH,
  slaMs = 300000 // 5 minutes Default
) {
  if (!fs.existsSync(stateFilePath)) return { swept: 0 };

  return withWorkflowStateLock(async () => {
    let rawState;
    try {
      rawState = safeParseJSON(fs.readFileSync(stateFilePath, 'utf8'), null);
    } catch (_err) {
      // Ignore read errors - state file may not exist
    }

    if (!rawState || !rawState.phases) return { swept: 0 };

    let stateMutated = false;
    let swept = 0;
    const now = Date.now();

    for (const phaseKey of Object.keys(rawState.phases)) {
      const phase = rawState.phases[phaseKey];
      if (phase.status === 'in_progress' && phase.startedAt) {
        const startMs =
          typeof phase.startedAt === 'string'
            ? new Date(phase.startedAt).getTime()
            : phase.startedAt;
        if (Number.isFinite(startMs) && now - startMs > slaMs) {
          // SLA breached. Mark as timed out.
          const dlqEntry = {
            timestamp: new Date().toISOString(),
            workflowId: rawState.workflowId || 'unknown',
            phase: phaseKey,
            reason: 'BLOCKED_TIMEOUT',
            taskId: phase.taskId || null,
          };

          // Write to DLQ atomically
          const logDir = path.dirname(dlqPath);
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          fs.appendFileSync(dlqPath, JSON.stringify(dlqEntry) + '\n', 'utf8');

          // Set phase to blocked timeout
          phase.status = 'BLOCKED_TIMEOUT';
          stateMutated = true;
          swept++;
        }
      }
    }

    if (stateMutated) {
      // Safe to write as we hold the DLQ and workflow lock
      atomicWriteJSONSync(stateFilePath, rawState);
    }

    return { swept };
  });
}

module.exports = {
  runWatchdogOnce,
};
