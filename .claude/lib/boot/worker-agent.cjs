/**
 * Worker Agent Entry Point
 * ========================
 *
 * Minimal headless loop for maintenance + indexing + queue processing.
 * Opt-in only: set WORKER_ENABLED=1 to run.
 */

'use strict';

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { IndexManager } = require('../code-indexing/index-manager.cjs');
const eventBus = require('../events/event-bus.cjs');
const { EventTypes } = require('../events/event-types.cjs');

const DEFAULT_INTERVAL_MS = 60000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 10000;
const BACKOFF_BASE_MS = parseInt(process.env.WORKER_BACKOFF_BASE_MS || '30000', 10);
const BACKOFF_MAX_MS = parseInt(process.env.WORKER_BACKOFF_MAX_MS || '300000', 10);

const projectRoot = process.env.WORKER_PROJECT_ROOT || PROJECT_ROOT || process.cwd();
const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
const heartbeatPath = path.join(runtimeDir, 'worker-heartbeat.json');
const lockFile = path.join(projectRoot, '.claude', 'context', 'code-index', '.indexing.lock');
const maintenanceStatusPath = path.join(
  projectRoot,
  '.claude',
  'context',
  'memory',
  'maintenance-status.json'
);
const metricsPath = path.join(projectRoot, '.claude', 'context', 'metrics', 'worker.jsonl');

const WORKER_ENABLED = process.env.WORKER_ENABLED === '1' || process.env.WORKER_ENABLED === 'true';
const WORKER_ONCE = process.env.WORKER_ONCE === '1' || process.env.WORKER_ONCE === 'true';
const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || '', 10) || DEFAULT_INTERVAL_MS;
const WORKER_METRICS = process.env.WORKER_METRICS !== 'off';
const WORKER_EVENTS = process.env.WORKER_EVENTS !== 'off';
const WORKER_METRICS_MAX_LINES = Number(process.env.WORKER_METRICS_MAX_LINES || 1000);
const TASKS = new Set(
  (process.env.WORKER_TASKS || 'maintenance,index,reflection')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
);

function isTaskEnabled(name) {
  return TASKS.has(name);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

async function writeHeartbeat(status, tasks) {
  await ensureDir(runtimeDir);
  const payload = {
    lastTick: nowIso(),
    status,
    tasks,
  };
  await fs.writeFile(heartbeatPath, JSON.stringify(payload, null, 2));
}

async function appendJsonl(filePath, payload) {
  const line = JSON.stringify(payload) + '\n';
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, line);
  if (Number.isFinite(WORKER_METRICS_MAX_LINES) && WORKER_METRICS_MAX_LINES > 0) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.trim().split('\n');
      if (lines.length > WORKER_METRICS_MAX_LINES) {
        const trimmed = lines.slice(-WORKER_METRICS_MAX_LINES).join('\n') + '\n';
        await fs.writeFile(filePath, trimmed);
      }
    } catch (_err) {
      // Best-effort
    }
  }
}

async function runNode(scriptPath, args = []) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => {
      stdout += data.toString();
    });
    child.stderr.on('data', data => {
      stderr += data.toString();
    });
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function shouldRunWeekly() {
  try {
    const raw = await fs.readFile(maintenanceStatusPath, 'utf8');
    const status = JSON.parse(raw);
    if (!status.lastWeekly) return true;
    const lastWeekly = new Date(status.lastWeekly).getTime();
    if (Number.isNaN(lastWeekly)) return true;
    return Date.now() - lastWeekly >= WEEK_MS;
  } catch (_err) {
    return true;
  }
}

async function runMaintenanceTask() {
  const start = Date.now();
  const shouldWeekly = await shouldRunWeekly();
  const args = [path.join(projectRoot, '.claude', 'lib', 'memory', 'memory-scheduler.cjs')];
  args.push(shouldWeekly ? 'weekly' : 'daily');
  const result = await runNode(args[0], args.slice(1));
  const durationMs = Date.now() - start;
  const ok = result.code === 0;
  return {
    ok,
    durationMs,
    mode: shouldWeekly ? 'weekly' : 'daily',
    stderr: result.stderr || null,
  };
}

async function canProceedIndexing() {
  try {
    const stats = await fs.stat(lockFile);
    const lockAge = Date.now() - stats.mtimeMs;
    if (lockAge > LOCK_TIMEOUT_MS) {
      await fs.unlink(lockFile).catch(() => {});
      return true;
    }
    return false;
  } catch (_err) {
    return true;
  }
}

async function createLock() {
  try {
    await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), {
      flag: 'wx',
    });
    return true;
  } catch (_err) {
    return false;
  }
}

async function removeLock() {
  await fs.unlink(lockFile).catch(() => {});
}

async function runIndexTask() {
  const start = Date.now();
  const metadataPath = path.join(projectRoot, '.claude', 'context', 'code-index', 'metadata.json');
  const exists = await fs
    .access(metadataPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return { ok: true, skipped: true, reason: 'index_missing', durationMs: 0 };
  }

  const proceed = await canProceedIndexing();
  if (!proceed) {
    return { ok: true, skipped: true, reason: 'lock_active', durationMs: 0 };
  }

  const hasLock = await createLock();
  if (!hasLock) {
    return { ok: true, skipped: true, reason: 'lock_failed', durationMs: 0 };
  }

  try {
    const manager = new IndexManager({ projectRoot });
    const result = await manager.incrementalUpdate();
    return {
      ok: true,
      durationMs: Date.now() - start,
      updateType: result.updateType,
      filesAdded: result.filesAdded || 0,
      filesModified: result.filesModified || 0,
      filesDeleted: result.filesDeleted || 0,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: error.message,
    };
  } finally {
    await removeLock();
  }
}

async function runReflectionTask() {
  const start = Date.now();
  const scriptPath = path.join(
    projectRoot,
    '.claude',
    'hooks',
    'reflection',
    'reflection-queue-processor.cjs'
  );
  const result = await runNode(scriptPath, []);
  return {
    ok: result.code === 0,
    durationMs: Date.now() - start,
    stderr: result.stderr || null,
  };
}

async function runTick() {
  const start = Date.now();
  const tasks = {};
  let status = 'ok';

  if (isTaskEnabled('maintenance')) {
    const maintenance = await runMaintenanceTask();
    tasks.maintenance = maintenance;
    if (!maintenance.ok) status = 'partial-fail';
  }

  if (isTaskEnabled('index')) {
    const index = await runIndexTask();
    tasks.index = index;
    if (!index.ok) status = 'partial-fail';
  }

  if (isTaskEnabled('reflection')) {
    const reflection = await runReflectionTask();
    tasks.reflection = reflection;
    if (!reflection.ok) status = 'partial-fail';
  }

  await writeHeartbeat(status, tasks);

  const durationMs = Date.now() - start;
  const summary = {
    timestamp: nowIso(),
    status,
    durationMs,
    tasks: {
      maintenance: tasks.maintenance
        ? {
            ok: tasks.maintenance.ok,
            durationMs: tasks.maintenance.durationMs,
            skipped: tasks.maintenance.skipped,
            reason: tasks.maintenance.reason,
          }
        : null,
      index: tasks.index
        ? {
            ok: tasks.index.ok,
            durationMs: tasks.index.durationMs,
            skipped: tasks.index.skipped,
            reason: tasks.index.reason,
          }
        : null,
      reflection: tasks.reflection
        ? {
            ok: tasks.reflection.ok,
            durationMs: tasks.reflection.durationMs,
            skipped: tasks.reflection.skipped,
            reason: tasks.reflection.reason,
          }
        : null,
    },
  };

  if (WORKER_METRICS) {
    try {
      await appendJsonl(metricsPath, summary);
    } catch (_err) {
      // best-effort
    }
  }

  if (WORKER_EVENTS) {
    try {
      const eventType = status === 'ok' ? EventTypes.TOOL_COMPLETED : EventTypes.TOOL_FAILED;
      const payload = {
        type: eventType,
        timestamp: summary.timestamp,
        toolName: 'worker-loop',
        output: summary.tasks,
        duration: durationMs,
      };
      if (eventType === EventTypes.TOOL_FAILED) {
        payload.error = 'worker_loop_partial_fail';
      }
      eventBus.emit(eventType, payload);
    } catch (_err) {
      // best-effort
    }
  }

  return { status, tasks };
}

const { createLogger } = require('../utils/logger.cjs');
const logger = createLogger('worker-agent');

let timeoutId = null;
let stopping = false;
let running = false;

async function stop() {
  logger.info('Stopping worker agent...');
  stopping = true;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (running) {
    // Wait for current tick? Or just let it finish.
    // Lock release happens in finally block of runTick wrapper
  } else {
    // If not running, ensure lock is released (safeguard)
    await removeLock();
  }
}

async function start() {
  if (!WORKER_ENABLED) {
    logger.info('WORKER_ENABLED not set; exiting.');
    return;
  }

  logger.info('Starting agent worker loop...');

  let consecutiveFailures = 0;

  const tick = async () => {
    if (running || stopping) return;
    running = true;
    try {
      const result = await runTick();
      if (result.status === 'partial-fail') {
        consecutiveFailures += 1;
        logger.warn('Worker tick partial failure', { tasks: result.tasks });
      } else {
        consecutiveFailures = 0;
        logger.info('Worker tick completed', { durationMs: result.tasks?.durationMs });
      }
    } catch (error) {
      consecutiveFailures += 1;
      logger.error('Worker tick failed', { error: error.message });
      await writeHeartbeat('partial-fail', { error: { ok: false, error: error.message } });
    } finally {
      running = false;
      if (WORKER_ONCE) {
        process.exit(0);
      }
    }
  };

  const computeDelay = () => {
    if (consecutiveFailures === 0) return INTERVAL_MS;
    const backoff = Math.min(
      BACKOFF_MAX_MS,
      BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1)
    );
    return Math.max(INTERVAL_MS, backoff);
  };

  async function tickWithSchedule() {
    await tick();
    scheduleNext();
  }

  const scheduleNext = () => {
    if (WORKER_ONCE || stopping) return;
    timeoutId = setTimeout(tickWithSchedule, computeDelay());
  };

  // Handle signals if this is the main process
  if (require.main === module) {
    process.on('SIGINT', async () => {
      await stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await stop();
      process.exit(0);
    });
  }

  await tickWithSchedule();
}

if (require.main === module) {
  start().catch(async error => {
    logger.fatal('Worker failed to start', { error: error.message });
    await writeHeartbeat('partial-fail', { error: { ok: false, error: error.message } });
    process.exit(1);
  });
}

module.exports = {
  start,
  stop,
};
