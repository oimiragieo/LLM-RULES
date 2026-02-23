#!/usr/bin/env node
/**
 * Memory Scheduler - Automated Maintenance System
 * ================================================
 *
 * Phase 4 implementation: Automated maintenance scheduler providing:
 * - Daily maintenance tasks (STM consolidation, health check, metrics logging)
 * - Weekly optimization tasks (summarization, deduplication, pruning, reports)
 * - Manual maintenance execution
 * - Status tracking
 *
 * Integration points:
 * - memory-tiers.cjs (STM/MTM/LTM operations)
 * - memory-dashboard.cjs (metrics, health scores)
 * - memory-manager.cjs (archival, pruning)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// BUG-001 Fix: Use canonical PROJECT_ROOT to prevent nested .claude folder creation
// CRITICAL-001 FIX: Path traversal prevention
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const eventBus = require('../events/event-bus.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { createMemorySchedulerTaskRunners } = require('./memory-scheduler-tasks.cjs');

const logger = createLogger('memory-scheduler');

const { EventTypes } = require('../events/event-types.cjs');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Status file for tracking maintenance runs
  STATUS_FILE: 'maintenance-status.json',
  // Task configuration
  TASKS: {
    consolidation: { type: 'daily', description: 'Consolidate STM to MTM' },
    healthCheck: { type: 'daily', description: 'Check tier health and metrics' },
    metricsLog: { type: 'daily', description: 'Log daily metrics' },
    taskRecovery: { type: 'daily', description: 'Recover orphaned agent delegations' },
    summarization: { type: 'weekly', description: 'Summarize old MTM sessions to LTM' },
    deduplication: { type: 'weekly', description: 'Deduplicate patterns and gotchas' },
    pruning: { type: 'weekly', description: 'Prune low-utility entries' },
    archiveOldLTM: { type: 'weekly', description: 'Archive old LTM summaries to cold storage' },
    extraction: { type: 'weekly', description: 'Extract structured memories from recent MTM' },
    weeklyReport: { type: 'weekly', description: 'Generate weekly health report' },
    vectorMaintenance: { type: 'weekly', description: 'Optimize vector database' },
  },
};

const HISTORY_LIMIT = Number(process.env.MEMORY_SCHEDULER_HISTORY_LIMIT || 30);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate projectRoot parameter for path traversal safety
 * CRITICAL-001-MEMORY FIX: All functions that accept projectRoot MUST call this first
 * @param {string} projectRoot - The project root path to validate
 * @throws {Error} If path is invalid or outside PROJECT_ROOT
 */
function validateProjectRoot(projectRoot) {
  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

/**
 * Get the memory directory path
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Get the lib directory path - always use __dirname since modules are siblings
 */
function getLibDir(_projectRoot = PROJECT_ROOT) {
  return __dirname;
}

/**
 * Safely require a module, returning null if not found
 */
function safeRequire(modulePath) {
  try {
    // Clear cache to get fresh module
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } catch (_e) {
    return null;
  }
}

/**
 * Get status file path
 */
function getStatusPath(projectRoot = PROJECT_ROOT) {
  return path.join(getMemoryDir(projectRoot), CONFIG.STATUS_FILE);
}

/**
 * Read maintenance status
 */
function readStatus(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const statusPath = getStatusPath(projectRoot);
  try {
    if (fs.existsSync(statusPath)) {
      const content = fs.readFileSync(statusPath, 'utf8');
      return safeParseJSON(content, null);
    }
  } catch (e) {
    logger.debug('readStatus failed', { error: e.message });
  }
  return { lastDaily: null, lastWeekly: null, history: [] };
}

/**
 * Write maintenance status
 */
function writeStatus(status, projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const statusPath = getStatusPath(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  atomicWriteSync(statusPath, JSON.stringify(status, null, 2) + '\n');
}

// ============================================================================
// Individual Task Runners
// ============================================================================
const {
  runTask,
  runConsolidation,
  runHealthCheck,
  runMetricsLog,
  runExtraction,
  runRotation,
  runSummarization,
  runDeduplication,
  runPruning,
  runArchiveOldLTM,
  runWeeklyReport,
  runTaskRecovery,
  runVectorMaintenance,
} = createMemorySchedulerTaskRunners({
  PROJECT_ROOT,
  validateProjectRoot,
  getMemoryDir,
  getLibDir,
  safeRequire,
  readStatus,
  writeStatus,
  spawnSync,
  fs,
  path,
  safeParseJSON,
});

// ============================================================================
// Maintenance Runners
// ============================================================================

/**
 * Run daily maintenance tasks
 */
async function runDailyMaintenance(projectRoot = PROJECT_ROOT) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const tasks = [];

  // Run daily tasks
  tasks.push(await runConsolidation(projectRoot));
  tasks.push(runHealthCheck(projectRoot));
  tasks.push(runMetricsLog(projectRoot));
  tasks.push(await runTaskRecovery(projectRoot));

  // Update status
  const status = readStatus(projectRoot);
  status.lastDaily = timestamp;
  status.lastRun = timestamp;
  status.history.unshift({
    type: 'daily',
    timestamp,
    tasks: tasks.map(t => ({ type: t.type, success: t.success })),
  });
  // Keep only last 30 history entries
  if (status.history.length > HISTORY_LIMIT) {
    status.history = status.history.slice(0, HISTORY_LIMIT);
  }
  writeStatus(status, projectRoot);

  // Get health check result
  const healthCheckTask = tasks.find(t => t.type === 'healthCheck');

  const result = {
    maintenanceType: 'daily',
    timestamp,
    tasks,
    healthCheck: healthCheckTask
      ? {
          healthScore: healthCheckTask.healthScore,
          recommendations: healthCheckTask.recommendations,
        }
      : null,
  };

  try {
    const taskSummaries = tasks.map(t => ({ type: t.type, success: t.success }));
    const failures = taskSummaries.filter(t => t.success === false);
    if (failures.length > 0) {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'memory-scheduler',
        error: `daily_maintenance_failed:${failures.map(f => f.type).join(',')}`,
      });
    } else {
      eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'memory-scheduler',
        output: {
          maintenanceType: result.maintenanceType,
          tasks: taskSummaries,
        },
        duration: Date.now() - startTime,
      });
    }
  } catch (_e) {
    // Best-effort
  }

  return result;
}

/**
 * Run weekly maintenance tasks (includes daily tasks)
 */
async function runWeeklyMaintenance(projectRoot = PROJECT_ROOT) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const tasks = [];

  // Run daily tasks first
  tasks.push(await runConsolidation(projectRoot));
  tasks.push(runHealthCheck(projectRoot));
  tasks.push(runMetricsLog(projectRoot));
  tasks.push(await runTaskRecovery(projectRoot));

  // Run weekly tasks
  tasks.push(runRotation(projectRoot));
  tasks.push(await runSummarization(projectRoot));
  tasks.push(runDeduplication(projectRoot));
  tasks.push(runPruning(projectRoot));
  tasks.push(runArchiveOldLTM(projectRoot));
  tasks.push(runExtraction(projectRoot));
  tasks.push(await runVectorMaintenance(projectRoot));
  const weeklyReportResult = await runWeeklyReport(projectRoot);
  tasks.push(weeklyReportResult);

  // Update status
  const status = readStatus(projectRoot);
  status.lastWeekly = timestamp;
  status.lastDaily = timestamp;
  status.lastRun = timestamp;
  status.history.unshift({
    type: 'weekly',
    timestamp,
    tasks: tasks.map(t => ({ type: t.type, success: t.success })),
  });
  // Keep only last 30 history entries
  if (status.history.length > HISTORY_LIMIT) {
    status.history = status.history.slice(0, HISTORY_LIMIT);
  }
  writeStatus(status, projectRoot);

  // Get health check result
  const healthCheckTask = tasks.find(t => t.type === 'healthCheck');

  const result = {
    maintenanceType: 'weekly',
    timestamp,
    tasks,
    healthCheck: healthCheckTask
      ? {
          healthScore: healthCheckTask.healthScore,
          recommendations: healthCheckTask.recommendations,
        }
      : null,
    weeklyReport: weeklyReportResult.report,
  };

  try {
    const taskSummaries = tasks.map(t => ({ type: t.type, success: t.success }));
    const failures = taskSummaries.filter(t => t.success === false);
    if (failures.length > 0) {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'memory-scheduler',
        error: `weekly_maintenance_failed:${failures.map(f => f.type).join(',')}`,
      });
    } else {
      eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'memory-scheduler',
        output: {
          maintenanceType: result.maintenanceType,
          tasks: taskSummaries,
        },
        duration: Date.now() - startTime,
      });
    }
  } catch (_e) {
    // Best-effort
  }

  return result;
}

/**
 * Run maintenance by type or specific task
 */
async function runMaintenance(type, projectRoot = PROJECT_ROOT) {
  switch (type) {
    case 'daily':
      return runDailyMaintenance(projectRoot);
    case 'weekly':
      return runWeeklyMaintenance(projectRoot);
    default:
      // Run specific task
      const startTime = Date.now();
      const taskResult = await runTask(type, projectRoot);

      // Update status
      const status = readStatus(projectRoot);
      status.lastRun = new Date().toISOString();
      status.history.unshift({
        type: 'task',
        taskName: type,
        timestamp: taskResult.timestamp,
        success: taskResult.success,
      });
      if (status.history.length > HISTORY_LIMIT) {
        status.history = status.history.slice(0, HISTORY_LIMIT);
      }
      writeStatus(status, projectRoot);

      const result = {
        maintenanceType: 'task',
        task: type,
        ...taskResult,
      };

      try {
        if (result.success === false) {
          eventBus.emit(EventTypes.TOOL_FAILED, {
            type: EventTypes.TOOL_FAILED,
            timestamp: new Date().toISOString(),
            toolName: 'memory-scheduler',
            error: `maintenance_task_failed:${result.task}`,
          });
        } else {
          eventBus.emit(EventTypes.TOOL_COMPLETED, {
            type: EventTypes.TOOL_COMPLETED,
            timestamp: new Date().toISOString(),
            toolName: 'memory-scheduler',
            output: {
              maintenanceType: result.maintenanceType,
              task: result.task,
              success: result.success,
            },
            duration: Date.now() - startTime,
          });
        }
      } catch (_e) {
        // Best-effort
      }

      return result;
  }
}

/**
 * Get maintenance status
 */
function getMaintenanceStatus(projectRoot = PROJECT_ROOT) {
  return readStatus(projectRoot);
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'daily':
      console.log('Running daily maintenance...\n');
      const dailyResult = await runDailyMaintenance();
      console.log(JSON.stringify(dailyResult, null, 2));
      break;

    case 'weekly':
      console.log('Running weekly maintenance...\n');
      const weeklyResult = await runWeeklyMaintenance();
      console.log(JSON.stringify(weeklyResult, null, 2));
      break;

    case 'run':
      if (args[1]) {
        console.log(`Running ${args[1]} maintenance...\n`);
        const result = await runMaintenance(args[1]);
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error('Usage: memory-scheduler.cjs run <type>');
        console.error(
          'Types: daily, weekly, consolidation, healthCheck, summarization, deduplication, pruning, archiveOldLTM, extraction'
        );
        return 1;
      }
      break;

    case 'status': {
      const chalk = {
        green: t => `\x1b[32m${t}\x1b[0m`,
        red: t => `\x1b[31m${t}\x1b[0m`,
        yellow: t => `\x1b[33m${t}\x1b[0m`,
        blue: t => `\x1b[34m${t}\x1b[0m`,
        gray: t => `\x1b[90m${t}\x1b[0m`,
        bold: t => `\x1b[1m${t}\x1b[0m`,
      };
      chalk.green.bold = t => chalk.bold(chalk.green(t));
      chalk.red.bold = t => chalk.bold(chalk.red(t));
      chalk.yellow.bold = t => chalk.bold(chalk.yellow(t));

      const status = getMaintenanceStatus();

      console.log(chalk.bold('\n🧠 Memory Scheduler Status'));
      console.log(chalk.gray('================================================='));
      console.log(
        `⏱️  ${chalk.blue('Last Run')}:      ${status.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}`
      );
      console.log(
        `📅 ${chalk.blue('Last Daily')}:    ${status.lastDaily ? new Date(status.lastDaily).toLocaleString() : 'Never'}`
      );
      console.log(
        `📆 ${chalk.blue('Last Weekly')}:   ${status.lastWeekly ? new Date(status.lastWeekly).toLocaleString() : 'Never'}`
      );

      if (status.history && status.history.length > 0) {
        console.log(chalk.gray('-------------------------------------------------'));
        console.log(chalk.bold(`Recent Operations (Last ${Math.min(status.history.length, 5)}):`));

        for (const entry of status.history.slice(0, 5)) {
          const timeStr = new Date(entry.timestamp).toLocaleTimeString();
          const typeStr = entry.type.padEnd(6);

          if (entry.tasks && Array.isArray(entry.tasks)) {
            const fails = entry.tasks.filter(t => !t.success).map(t => t.type);
            const statusIcon = fails.length === 0 ? chalk.green('✅ OK') : chalk.red('❌ FAIL');
            const failStr = fails.length > 0 ? chalk.red(`(Failed: ${fails.join(', ')})`) : '';
            console.log(`  [${chalk.gray(timeStr)}] ${typeStr} ${statusIcon} ${failStr}`);
          } else {
            const statusIcon = entry.success ? chalk.green('✅ OK') : chalk.red('❌ FAIL');
            console.log(`  [${chalk.gray(timeStr)}] ${typeStr} ${statusIcon}`);
          }
        }
      }
      console.log(chalk.gray('=================================================\n'));
      break;
    }

    case 'task':
      if (args[1]) {
        console.log(`Running task: ${args[1]}...\n`);
        const taskResult = await runTask(args[1]);
        console.log(JSON.stringify(taskResult, null, 2));
      } else {
        console.error('Usage: memory-scheduler.cjs task <task-name>');
        console.error(
          'Tasks: consolidation, healthCheck, metricsLog, summarization, deduplication, pruning, archiveOldLTM, extraction, weeklyReport'
        );
        return 1;
      }
      break;

    default:
      console.log(`
Memory Scheduler - Automated Maintenance System

Commands:
  daily            Run daily maintenance tasks
  weekly           Run weekly maintenance tasks (includes daily)
  run <type>       Run specific maintenance type
  task <name>      Run a specific task
  status           Show maintenance status

Daily Tasks:
  - consolidation  Consolidate STM to MTM
  - healthCheck    Check tier health and metrics
  - metricsLog     Log daily metrics

Weekly Tasks (in addition to daily):
  - summarization  Summarize old MTM sessions to LTM
  - deduplication  Deduplicate patterns and gotchas
  - pruning        Prune low-utility entries and archive
  - archiveOldLTM  Archive old LTM summaries to cold storage
  - extraction     Extract structured memories from recent MTM
  - weeklyReport   Generate weekly health report

Examples:
  node memory-scheduler.cjs daily
  node memory-scheduler.cjs weekly
  node memory-scheduler.cjs run healthCheck
  node memory-scheduler.cjs task deduplication
  node memory-scheduler.cjs status
`);
  }

  return 0;
}

if (require.main === module) {
  main()
    .then(code => {
      if (typeof code === 'number' && code !== 0) {
        process.exitCode = code;
      }
    })
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exitCode = 1;
    });
}

module.exports = {
  CONFIG,
  // Task runners
  runTask,
  runConsolidation,
  runHealthCheck,
  runMetricsLog,
  runExtraction,
  runRotation,
  runSummarization,
  runDeduplication,
  runPruning,
  runArchiveOldLTM,
  runWeeklyReport,
  // Maintenance runners
  runDailyMaintenance,
  runWeeklyMaintenance,
  runMaintenance,
  // Status
  getMaintenanceStatus,
  // Helpers
  getMemoryDir,
  readStatus,
  writeStatus,
};
