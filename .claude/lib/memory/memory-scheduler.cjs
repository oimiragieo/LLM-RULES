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

// BUG-001 Fix: Import findProjectRoot to prevent nested .claude folder creation
// CRITICAL-001 FIX: Path traversal prevention
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const eventBus = require('../events/event-bus.cjs');
const { createLogger } = require('../utils/logger.cjs');

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
    summarization: { type: 'weekly', description: 'Summarize old MTM sessions to LTM' },
    deduplication: { type: 'weekly', description: 'Deduplicate patterns and gotchas' },
    pruning: { type: 'weekly', description: 'Prune low-utility entries' },
    archiveOldLTM: { type: 'weekly', description: 'Archive old LTM summaries to cold storage' },
    extraction: { type: 'weekly', description: 'Extract structured memories from recent MTM' },
    weeklyReport: { type: 'weekly', description: 'Generate weekly health report' },
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

/**
 * Run consolidation task (STM -> MTM)
 */
function runConsolidation(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const memoryTiers = safeRequire(path.join(libDir, 'memory-tiers.cjs'));

  const result = {
    type: 'consolidation',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!memoryTiers) {
    result.details = 'memory-tiers.cjs not available';
    return result;
  }

  try {
    const stmDir = memoryTiers.getTierPath('STM', projectRoot);
    const stmPath = path.join(stmDir, 'session_current.json');
    if (!fs.existsSync(stmPath)) {
      result.success = true;
      result.details = { skipped: true, reason: 'No active STM session' };
      return result;
    }
    const consolidateResult = memoryTiers.consolidateSession('current', projectRoot);
    // Treat "no STM to consolidate" as success so maintenance history does not show failure
    result.success =
      consolidateResult.success === true || consolidateResult.error === 'No STM session found';
    result.details = consolidateResult;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run health check task
 */
function runHealthCheck(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const dashboard = safeRequire(path.join(libDir, 'memory-dashboard.cjs'));

  const result = {
    type: 'healthCheck',
    timestamp: new Date().toISOString(),
    success: false,
    healthScore: null,
    recommendations: [],
  };

  if (!dashboard) {
    result.details = 'memory-dashboard.cjs not available';
    return result;
  }

  try {
    const metrics = dashboard.collectMetrics(projectRoot);
    result.success = true;
    result.healthScore = metrics.summary.healthScore;
    result.recommendations = metrics.recommendations;
    result.details = metrics.summary;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run metrics logging task
 */
function runMetricsLog(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const dashboard = safeRequire(path.join(libDir, 'memory-dashboard.cjs'));

  const result = {
    type: 'metricsLog',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!dashboard) {
    result.details = 'memory-dashboard.cjs not available';
    return result;
  }

  try {
    const metrics = dashboard.collectMetrics(projectRoot);
    const savedPath = dashboard.saveMetrics(metrics, projectRoot);
    dashboard.cleanupOldMetrics(projectRoot);
    result.success = true;
    result.details = { savedPath, metrics: metrics.summary };
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run memory extraction pipeline task
 */
function runExtraction(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const result = {
    type: 'extraction',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  try {
    const cliPath = path.join(projectRoot, '.claude', 'tools', 'cli', 'memory-extract.cjs');
    if (!fs.existsSync(cliPath)) {
      result.details = 'memory-extract.cjs not available';
      return result;
    }

    const proc = spawnSync(process.execPath, [cliPath, '--json'], {
      encoding: 'utf8',
    });
    if (proc.status !== 0) {
      result.details = proc.stderr || 'memory-extract failed';
      return result;
    }

    const output = (proc.stdout || '').trim();
    if (!output && proc.stderr) {
      result.details = proc.stderr.trim();
    } else {
      try {
        result.success = true;
        result.details = output ? safeParseJSON(output, null) : { status: 'ok' };
      } catch (parseErr) {
        result.success = false;
        result.details = `memory-extract JSON parse failed: ${parseErr.message}${
          proc.stderr ? ` | stderr: ${proc.stderr.trim()}` : ''
        }`;
      }
    }
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run rotation task (hot -> warm archival when files exceed threshold)
 */
function runRotation(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const memoryRotator = safeRequire(path.join(libDir, 'memory-rotator.cjs'));

  const result = {
    type: 'rotation',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!memoryRotator) {
    result.details = 'memory-rotator.cjs not available';
    return result;
  }

  try {
    const memoryDir = getMemoryDir(projectRoot);
    const memoryFiles = ['learnings.md', 'decisions.md', 'issues.md'];
    let totalRotated = 0;

    for (const file of memoryFiles) {
      const filePath = path.join(memoryDir, file);
      if (!fs.existsSync(filePath)) continue;

      // Rotate if file exceeds threshold
      const rotateResult = memoryRotator.rotateIfNeeded(filePath, { thresholdKB: 20 });
      if (rotateResult.rotated) {
        totalRotated++;
      }
    }

    result.success = true;
    result.details = {
      filesChecked: memoryFiles.length,
      filesRotated: totalRotated,
    };
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run summarization task (MTM -> LTM)
 */
function runSummarization(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const memoryTiers = safeRequire(path.join(libDir, 'memory-tiers.cjs'));

  const result = {
    type: 'summarization',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!memoryTiers) {
    result.details = 'memory-tiers.cjs not available';
    return result;
  }

  try {
    const summaryResult = memoryTiers.summarizeOldSessions(projectRoot);
    result.success = true;
    result.details = summaryResult;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run deduplication task (uses smart-pruner)
 */
function runDeduplication(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const smartPruner = safeRequire(path.join(libDir, 'smart-pruner.cjs'));

  const result = {
    type: 'deduplication',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!smartPruner) {
    result.details = 'smart-pruner.cjs not available';
    return result;
  }

  try {
    const memoryDir = getMemoryDir(projectRoot);
    const memoryFiles = ['learnings.md', 'decisions.md', 'issues.md'];
    let totalDeduped = 0;
    let totalPruned = 0;

    for (const file of memoryFiles) {
      const filePath = path.join(memoryDir, file);
      if (!fs.existsSync(filePath)) continue;

      // Deduplicate file
      const dedupResult = smartPruner.deduplicateFile(filePath, { threshold: 0.6 });
      totalDeduped += dedupResult.duplicatesRemoved;

      // Prune resolved entries (for issues.md)
      if (file === 'issues.md') {
        const pruneResult = smartPruner.pruneResolvedEntries(filePath);
        totalPruned += pruneResult.removed;
      }
    }

    result.success = true;
    result.details = {
      filesProcessed: memoryFiles.length,
      duplicatesRemoved: totalDeduped,
      resolvedIssuesPruned: totalPruned,
    };
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run pruning task
 */
function runPruning(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const memoryManager = safeRequire(path.join(libDir, 'memory-manager.cjs'));

  const result = {
    type: 'pruning',
    timestamp: new Date().toISOString(),
    success: false,
    archival: null,
    codebaseMapPruned: 0,
  };

  if (!memoryManager) {
    result.details = 'memory-manager.cjs not available';
    return result;
  }

  try {
    // Archive learnings.md if needed
    const archiveResult = memoryManager.checkAndArchiveLearnings(projectRoot);
    result.archival = archiveResult;

    // Prune codebase_map.json
    const pruneResult = memoryManager.pruneCodebaseMap(projectRoot);
    result.codebaseMapPruned = pruneResult.totalPruned;

    result.success = true;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run warm -> cold archiving task.
 * Archives old warm storage files to cold JSONL format with sensitive scrubbing.
 */
function runArchiveOldLTM(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const coldStorage = safeRequire(path.join(libDir, 'cold-storage.cjs'));

  const result = {
    type: 'archiveOldLTM',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  if (!coldStorage) {
    result.details = 'cold-storage.cjs not available';
    return result;
  }

  try {
    const memoryDir = getMemoryDir(projectRoot);
    const archiveResult = coldStorage.archiveWarmToCold(memoryDir, { maxAgeDays: 30 });

    result.success = true;
    result.details = {
      archivedFiles: archiveResult.archivedFiles,
      archivedEntries: archiveResult.archivedEntries,
    };

    // Record lastColdArchive for reporting
    const status = readStatus(projectRoot);
    status.lastColdArchive = result.timestamp;
    writeStatus(status, projectRoot);
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run weekly report generation
 */
function runWeeklyReport(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const libDir = getLibDir(projectRoot);
  const dashboard = safeRequire(path.join(libDir, 'memory-dashboard.cjs'));

  const result = {
    type: 'weeklyReport',
    timestamp: new Date().toISOString(),
    success: false,
    report: null,
  };

  if (!dashboard) {
    result.details = 'memory-dashboard.cjs not available';
    return result;
  }

  try {
    // Get last 7 days of metrics history
    const history = dashboard.getMetricsHistory(7, projectRoot);

    // Calculate trends
    const report = {
      period: {
        start:
          history.length > 0
            ? history[history.length - 1].date
            : new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
      },
      dataPoints: history.length,
      averageHealthScore:
        history.length > 0
          ? history.reduce((sum, h) => sum + (h.summary?.healthScore || 0), 0) / history.length
          : 0,
      trend: 'stable',
      currentMetrics: dashboard.collectMetrics(projectRoot),
    };

    // Determine trend
    if (history.length >= 2) {
      const first = history[history.length - 1].summary?.healthScore || 0;
      const last = history[0].summary?.healthScore || 0;
      if (last - first > 0.05) report.trend = 'improving';
      else if (first - last > 0.05) report.trend = 'declining';
    }

    result.success = true;
    result.report = report;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}

/**
 * Run a specific task by name
 */
function runTask(taskName, projectRoot = PROJECT_ROOT) {
  switch (taskName) {
    case 'consolidation':
      return runConsolidation(projectRoot);
    case 'healthCheck':
      return runHealthCheck(projectRoot);
    case 'metricsLog':
      return runMetricsLog(projectRoot);
    case 'rotation':
      return runRotation(projectRoot);
    case 'summarization':
      return runSummarization(projectRoot);
    case 'deduplication':
      return runDeduplication(projectRoot);
    case 'pruning':
      return runPruning(projectRoot);
    case 'archiveOldLTM':
      return runArchiveOldLTM(projectRoot);
    case 'extraction':
      return runExtraction(projectRoot);
    case 'weeklyReport':
      return runWeeklyReport(projectRoot);
    default:
      return { type: taskName, success: false, details: `Unknown task: ${taskName}` };
  }
}

// ============================================================================
// Maintenance Runners
// ============================================================================

/**
 * Run daily maintenance tasks
 */
function runDailyMaintenance(projectRoot = PROJECT_ROOT) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const tasks = [];

  // Run daily tasks
  tasks.push(runConsolidation(projectRoot));
  tasks.push(runHealthCheck(projectRoot));
  tasks.push(runMetricsLog(projectRoot));

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
function runWeeklyMaintenance(projectRoot = PROJECT_ROOT) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const tasks = [];

  // Run daily tasks first
  tasks.push(runConsolidation(projectRoot));
  tasks.push(runHealthCheck(projectRoot));
  tasks.push(runMetricsLog(projectRoot));

  // Run weekly tasks
  tasks.push(runRotation(projectRoot));
  tasks.push(runSummarization(projectRoot));
  tasks.push(runDeduplication(projectRoot));
  tasks.push(runPruning(projectRoot));
  tasks.push(runArchiveOldLTM(projectRoot));
  tasks.push(runExtraction(projectRoot));
  const weeklyReportResult = runWeeklyReport(projectRoot);
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
function runMaintenance(type, projectRoot = PROJECT_ROOT) {
  switch (type) {
    case 'daily':
      return runDailyMaintenance(projectRoot);
    case 'weekly':
      return runWeeklyMaintenance(projectRoot);
    default:
      // Run specific task
      const startTime = Date.now();
      const taskResult = runTask(type, projectRoot);

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

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'daily':
      console.log('Running daily maintenance...\n');
      const dailyResult = runDailyMaintenance();
      console.log(JSON.stringify(dailyResult, null, 2));
      break;

    case 'weekly':
      console.log('Running weekly maintenance...\n');
      const weeklyResult = runWeeklyMaintenance();
      console.log(JSON.stringify(weeklyResult, null, 2));
      break;

    case 'run':
      if (args[1]) {
        console.log(`Running ${args[1]} maintenance...\n`);
        const result = runMaintenance(args[1]);
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error('Usage: memory-scheduler.cjs run <type>');
        console.error(
          'Types: daily, weekly, consolidation, healthCheck, summarization, deduplication, pruning, archiveOldLTM, extraction'
        );
      }
      break;

    case 'status':
      console.log(JSON.stringify(getMaintenanceStatus(), null, 2));
      break;

    case 'task':
      if (args[1]) {
        console.log(`Running task: ${args[1]}...\n`);
        const taskResult = runTask(args[1]);
        console.log(JSON.stringify(taskResult, null, 2));
      } else {
        console.error('Usage: memory-scheduler.cjs task <task-name>');
        console.error(
          'Tasks: consolidation, healthCheck, metricsLog, summarization, deduplication, pruning, archiveOldLTM, extraction, weeklyReport'
        );
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
}

// ============================================================================
// Exports
// ============================================================================

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
