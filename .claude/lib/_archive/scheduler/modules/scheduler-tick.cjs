'use strict';

const { spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { loadStore, saveStore, computeNextRunAt } = require('./scheduler-store.cjs');

const logger = createLogger('scheduler-tick');

function runTaskCommand(command, projectRoot) {
  if (!command) return { success: false, error: 'missing_command' };

  // SEC-LIB-002 FIX: Implement command allowlist to prevent arbitrary command execution
  // NOTE: This scheduler subsystem is deprecated and will be archived.
  // If re-enabled, implement proper command validation or HMAC integrity verification.
  const ALLOWED_COMMANDS = ['npm', 'pnpm', 'node', 'git'];

  // Extract the base command (first word before space or entire command)
  const baseCommand = command.split(/\s+/)[0];

  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    logger.warn('blocked_command', {
      command: baseCommand,
      reason: 'not_in_allowlist',
    });
    return {
      success: false,
      error: 'command_not_allowed',
    };
  }

  // SEC-LIB-002 FIX: Use shell: false for command execution
  // Parse command into array for safer execution
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    shell: false, // CRITICAL: Disable shell to prevent injection
    stdio: 'inherit',
  });

  if (result.error) {
    return { success: false, error: result.error.message };
  }
  return {
    success: result.status === 0,
    error: result.status === 0 ? null : `exit_${result.status}`,
  };
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
