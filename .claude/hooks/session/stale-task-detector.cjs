#!/usr/bin/env node
'use strict';

/**
 * stale-task-detector.cjs
 * UserPromptSubmit hook: Warns about tasks left in_progress for too long.
 * Writes stale task warnings to session-gap-log.jsonl.
 * Never blocks — warning only.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = (() => {
  try {
    return require('../../lib/utils/project-root.cjs').PROJECT_ROOT;
  } catch (_e) {
    let d = __dirname;
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(d, 'package.json'))) return d;
      d = path.dirname(d);
    }
    return process.cwd();
  }
})();

const STALE_THRESHOLD_MS = Number(process.env.STALE_TASK_THRESHOLD_MS || 15 * 60 * 1000); // 15 min
const GAP_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'session-gap-log.jsonl');
const TASKUPDATE_STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'taskupdate-first-state.json');

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function appendGapLog(entry) {
  try {
    fs.appendFileSync(GAP_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (_e) {
    // Non-critical
  }
}

function main() {
  try {
    const state = readJSON(TASKUPDATE_STATE_FILE);
    if (!state || !state.sessions) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    const now = Date.now();
    const stale = [];

    for (const [sessionId, entry] of Object.entries(state.sessions)) {
      if (entry && entry.inProgress === true && entry.updatedAt) {
        const ageMs = now - Number(entry.updatedAt);
        if (ageMs > STALE_THRESHOLD_MS) {
          const ageMin = Math.round(ageMs / 60000);
          const taskId = entry.taskId || sessionId;
          stale.push({ taskId, ageMin });
        }
      }
    }

    if (stale.length > 0) {
      for (const { taskId, ageMin } of stale) {
        const msg = `[STALE-TASK] Task "${taskId}" has been in_progress for ${ageMin}m — router may have forgotten to call TaskUpdate(completed)`;
        process.stderr.write(msg + '\n');
        appendGapLog({
          timestamp: new Date().toISOString(),
          type: 'missing_metadata',
          taskId,
          description: `Stale in_progress task detected: "${taskId}" has been in_progress for ${ageMin} minutes without completion`,
          context: 'Detected by stale-task-detector.cjs on UserPromptSubmit. Router must call TaskUpdate({ status: "completed" }) when work is done.',
          source: 'stale-task-detector'
        });
      }
    }
  } catch (_e) {
    // Never block on error
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

main();
