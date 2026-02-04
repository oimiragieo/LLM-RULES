'use strict';

const { spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const {
  loadStore,
  saveStore,
  computeNextRunAt,
} = require('./scheduler-store.cjs');

const logger = createLogger('scheduler-tick');

function runTaskCommand(command, projectRoot) {
  if (!command) return { success: false, error: 'missing_command' };
  const result = spawnSync(command, {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) {
    return { success: false, error: result.error.message };
  }
  return { success: result.status === 0, error: result.status === 0 ? null : `exit_${result.status}` };
}

function runTick(projectRoot = PROJECT_ROOT) {
  const store = loadStore(projectRoot);
  const now = Date.now();
  const dueTasks = (store.tasks || []).filter(task => {
    if (!task.nextRunAt) return false;
    const next = Date.parse(task.nextRunAt);
    return Number.isFinite(next) && next <= now;
  });
  if (dueTasks.length === 0) {
    store.meta.lastTickAt = new Date(now).toISOString();
    saveStore(store, projectRoot);
    return { executed: 0, due: 0 };
  }

  const executed = [];
  for (const task of dueTasks) {
    let outcome = { success: true };
    if (task.payload && task.payload.command) {
      outcome = runTaskCommand(task.payload.command, projectRoot);
    }
    executed.push({ id: task.id, success: outcome.success });
    if (task.type !== 'cron') {
      task.nextRunAt = null;
    } else {
      task.nextRunAt = computeNextRunAt(task, now);
    }
    if (!outcome.success) {
      logger.warn('task_failed', { id: task.id, error: outcome.error });
    }
  }

  store.meta.lastTickAt = new Date(now).toISOString();
  saveStore(store, projectRoot);
  return { executed: executed.length, due: dueTasks.length };
}

module.exports = { runTick };

if (require.main === module) {
  const result = runTick();
  const executed = result.executed || 0;
  process.stdout.write(`Scheduler tick complete. Executed: ${executed}\n`);
}
