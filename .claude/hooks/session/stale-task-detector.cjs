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
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

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
const STALE_EMISSION_COOLDOWN_MS = Number(
  process.env.STALE_TASK_EMISSION_COOLDOWN_MS || 60 * 60 * 1000 // 1h default
);
const STALE_TASK_HARD_PRUNE_MS = Number(
  process.env.STALE_TASK_HARD_PRUNE_MS || 7 * 24 * 60 * 60 * 1000 // 7 days default
);
const GAP_LOG_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'session-gap-log.jsonl'
);
const TASKUPDATE_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'taskupdate-first-state.json'
);

const STALE_EMISSION_COOLDOWN_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'stale-task-emission-cooldown.json'
);
const STALE_TASKS_QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'stale-tasks.json'
);

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return safeParseJSON(fs.readFileSync(filePath, 'utf8'), null);
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

/**
 * Atomically write/merge stale task entries to stale-tasks.json.
 * Uses write-to-.tmp-then-rename pattern to avoid partial writes.
 * Kill switch: STALE_TASK_AUTO_QUEUE=off disables queue writing.
 *
 * @param {Array<{taskId: string, ageMin: number, detectedAt: string, subject: string}>} newEntries
 */
function readCooldown() {
  try {
    if (!fs.existsSync(STALE_EMISSION_COOLDOWN_FILE)) return {};
    return safeParseJSON(fs.readFileSync(STALE_EMISSION_COOLDOWN_FILE, 'utf8'), null) || {};
  } catch (_e) {
    return {};
  }
}

function writeCooldown(map) {
  try {
    const tmp = STALE_EMISSION_COOLDOWN_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8');
    fs.renameSync(tmp, STALE_EMISSION_COOLDOWN_FILE);
  } catch (_e) {
    // Non-critical: cooldown write failure does not affect detection
  }
}

function writeStaleTasksQueue(newEntries) {
  if ((process.env.STALE_TASK_AUTO_QUEUE || '').trim().toLowerCase() === 'off') return;
  if (!newEntries || newEntries.length === 0) return;
  try {
    const runtimeDir = path.dirname(STALE_TASKS_QUEUE_PATH);
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }

    // Read existing queue (if any) to avoid duplicates
    let existing = { tasks: [] };
    if (fs.existsSync(STALE_TASKS_QUEUE_PATH)) {
      const parsed = safeParseJSON(fs.readFileSync(STALE_TASKS_QUEUE_PATH, 'utf8'), null);
      if (parsed && Array.isArray(parsed.tasks)) {
        existing = parsed;
      }
    }

    const existingIds = new Set(existing.tasks.map(t => t.taskId));
    const toAdd = newEntries.filter(e => {
      if (existingIds.has(e.taskId)) return false;
      existingIds.add(e.taskId);
      return true;
    });
    if (toAdd.length === 0) return;

    const merged = { tasks: [...existing.tasks, ...toAdd] };
    const tmp = STALE_TASKS_QUEUE_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
    fs.renameSync(tmp, STALE_TASKS_QUEUE_PATH);
  } catch (queueErr) {
    process.stderr.write('[stale-task-detector] queue write failed: ' + queueErr.message + '\n');
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

    // F-LIFECYCLE: hard-prune orphan entries older than STALE_TASK_HARD_PRUNE_MS
    let stateMutated = false;
    for (const [sid, sentry] of Object.entries(state.sessions)) {
      if (sentry && sentry.updatedAt) {
        const entryAge = now - Number(sentry.updatedAt);
        if (entryAge > STALE_TASK_HARD_PRUNE_MS) {
          delete state.sessions[sid];
          stateMutated = true;
        }
      }
    }
    if (stateMutated) {
      try {
        const tmp = TASKUPDATE_STATE_FILE + '.tmp.' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(tmp, TASKUPDATE_STATE_FILE);
      } catch (_e) {
        // Non-critical: state flush failure; entries will be re-pruned next run
      }
    }

    for (const [sessionId, entry] of Object.entries(state.sessions)) {
      if (entry && entry.inProgress === true && entry.updatedAt) {
        const ageMs = now - Number(entry.updatedAt);
        if (ageMs > STALE_THRESHOLD_MS) {
          const ageMin = Math.round(ageMs / 60000);
          const taskId = entry.taskId || sessionId;
          const subject = entry.subject || '';
          stale.push({ taskId, ageMin, subject });
        }
      }
    }

    if (stale.length > 0) {
      // F-LIFECYCLE: apply per-task cooldown to suppress duplicate emissions
      const cooldown = readCooldown();
      const now2 = Date.now();
      const fresh = stale.filter(({ taskId }) => {
        const last = Number(cooldown[taskId] || 0);
        return now2 - last > STALE_EMISSION_COOLDOWN_MS;
      });
      if (fresh.length > 0) {
        for (const { taskId } of fresh) cooldown[taskId] = now2;
        writeCooldown(cooldown);
      }
      // Only process fresh (non-cooldown-suppressed) entries
      const staleFresh = fresh;

      const detectedAt = new Date().toISOString();
      const queueEntries = [];

      for (const { taskId, ageMin, subject } of staleFresh) {
        const msg = `[STALE-TASK] Task "${taskId}" has been in_progress for ${ageMin}m — router may have forgotten to call TaskUpdate(completed)`;
        process.stderr.write(msg + '\n');
        appendGapLog({
          timestamp: detectedAt,
          type: 'missing_metadata',
          taskId,
          description: `Stale in_progress task detected: "${taskId}" has been in_progress for ${ageMin} minutes without completion`,
          context:
            'Detected by stale-task-detector.cjs on UserPromptSubmit. Router must call TaskUpdate({ status: "completed" }) when work is done.',
          source: 'stale-task-detector',
        });
        queueEntries.push({ taskId, ageMin, detectedAt, subject });
      }

      writeStaleTasksQueue(queueEntries);
    }
  } catch (_e) {
    // Never block on error
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

/**
 * Detect stale tasks from a task list.
 * Exported for testability.
 *
 * @param {Array<{id: string, subject: string, status: string, updatedAt?: string}>} tasks
 * @param {number} [thresholdMs] - Stale threshold in ms (default: STALE_THRESHOLD_MS)
 * @returns {string[]} Warning messages for stale tasks
 */
function detectStaleTasks(tasks, thresholdMs) {
  const threshold = thresholdMs != null ? thresholdMs : STALE_THRESHOLD_MS;
  if (!Array.isArray(tasks)) return [];
  const now = Date.now();
  const warnings = [];

  for (const task of tasks) {
    if (!task || task.status !== 'in_progress') continue;
    if (!task.updatedAt) continue;
    const ageMs = now - new Date(task.updatedAt).getTime();
    if (isNaN(ageMs) || ageMs <= threshold) continue;
    const ageMin = Math.round(ageMs / 60000);
    const taskId = task.id || 'unknown';
    const subject = task.subject || '';
    warnings.push(
      `[STALE-TASK] Task #${taskId} "${subject}" has been in_progress for ${ageMin}m — router may have forgotten to call TaskUpdate(completed)`
    );
  }

  return warnings;
}

/**
 * Run stale task detection without writing to stdout (for use by consolidated bundles).
 * Writes warnings to stderr and updates the stale-tasks queue.
 * Does NOT call process.exit(). Safe to call from consolidated bundles.
 */
function runDetection() {
  try {
    const state = readJSON(TASKUPDATE_STATE_FILE);
    if (!state || !state.sessions) return;

    const now = Date.now();
    const stale = [];

    for (const [sessionId, entry] of Object.entries(state.sessions)) {
      if (entry && entry.inProgress === true && entry.updatedAt) {
        const ageMs = now - Number(entry.updatedAt);
        if (ageMs > STALE_THRESHOLD_MS) {
          const ageMin = Math.round(ageMs / 60000);
          const taskId = entry.taskId || sessionId;
          const subject = entry.subject || '';
          stale.push({ taskId, ageMin, subject });
        }
      }
    }

    if (stale.length > 0) {
      const detectedAt = new Date().toISOString();
      const queueEntries = [];

      for (const { taskId, ageMin, subject } of stale) {
        const msg = `[STALE-TASK] Task "${taskId}" has been in_progress for ${ageMin}m — router may have forgotten to call TaskUpdate(completed)`;
        process.stderr.write(msg + '\n');
        appendGapLog({
          timestamp: detectedAt,
          type: 'missing_metadata',
          taskId,
          description: `Stale in_progress task detected: "${taskId}" has been in_progress for ${ageMin} minutes without completion`,
          context:
            'Detected by stale-task-detector.cjs on UserPromptSubmit. Router must call TaskUpdate({ status: "completed" }) when work is done.',
          source: 'stale-task-detector',
        });
        queueEntries.push({ taskId, ageMin, detectedAt, subject });
      }

      writeStaleTasksQueue(queueEntries);
    }
  } catch (_e) {
    // Never block on error
  }
}

module.exports = { detectStaleTasks, runDetection };

if (require.main === module) {
  main();
}
