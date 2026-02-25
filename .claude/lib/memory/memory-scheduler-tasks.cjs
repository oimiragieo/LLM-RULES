'use strict';

/**
 * Build memory scheduler task runners with injected runtime dependencies.
 * @param {Object} deps
 * @returns {Object}
 */
function createMemorySchedulerTaskRunners(deps) {
  const {
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
  } = deps;

  async function runConsolidation(projectRoot = PROJECT_ROOT) {
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
      const consolidateResult = await memoryTiers.consolidateSessionWithLock(
        'current',
        projectRoot
      );
      result.success =
        consolidateResult.success === true || consolidateResult.error === 'No STM session found';
      result.details = consolidateResult;
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

  function runHealthCheck(projectRoot = PROJECT_ROOT) {
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

  function runMetricsLog(projectRoot = PROJECT_ROOT) {
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

  function runExtraction(projectRoot = PROJECT_ROOT) {
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
        windowsHide: true,
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
        const rotateResult = memoryRotator.rotateIfNeeded(filePath, { thresholdKB: 20 });
        if (rotateResult.rotated) totalRotated++;
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

  async function runSummarization(projectRoot = PROJECT_ROOT) {
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
      const summaryResult = await memoryTiers.summarizeOldSessions(projectRoot);
      result.success = true;
      result.details = summaryResult;
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

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

        const dedupResult = smartPruner.deduplicateFile(filePath, { threshold: 0.6 });
        totalDeduped += dedupResult.duplicatesRemoved;

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

  function runPruning(projectRoot = PROJECT_ROOT) {
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
      const archiveResult = memoryManager.checkAndArchiveLearnings(projectRoot);
      result.archival = archiveResult;
      const pruneResult = memoryManager.pruneCodebaseMap(projectRoot);
      result.codebaseMapPruned = pruneResult.totalPruned;
      result.success = true;
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

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

      const status = readStatus(projectRoot);
      status.lastColdArchive = result.timestamp;
      writeStatus(status, projectRoot);
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

  async function runWeeklyReport(projectRoot = PROJECT_ROOT) {
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
      const history = dashboard.getMetricsHistory(7, projectRoot);
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

  async function runTaskRecovery(projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const result = {
      type: 'taskRecovery',
      timestamp: new Date().toISOString(),
      success: false,
      recoveredCount: 0,
      details: null,
    };

    try {
      const TaskRouter = safeRequire(
        path.join(PROJECT_ROOT, '.claude', 'lib', 'workflow', 'task-router.cjs')
      );
      if (!TaskRouter) {
        result.details = 'task-router.cjs not available';
        return result;
      }

      const router = new TaskRouter();
      await router.initialize();
      const recovered = await router.recoverOrphanedDelegations();

      result.success = true;
      result.recoveredCount = recovered.length;
      result.details = { recoveredIds: recovered.map(r => r.taskId) };
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

  async function runVectorMaintenance(projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const result = {
      type: 'vectorMaintenance',
      timestamp: new Date().toISOString(),
      success: false,
      details: null,
    };

    try {
      const { MemoryVectorStore } =
        safeRequire(path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'lancedb-client.cjs')) ||
        {};
      if (!MemoryVectorStore) {
        result.details = 'lancedb-client.cjs not available';
        return result;
      }

      const store = new MemoryVectorStore({
        persistDirectory: path.join(projectRoot, '.claude', 'context', 'data', 'lancedb'),
      });
      const maintenanceResult = await store.optimize();
      result.success = maintenanceResult.status !== 'failed';
      result.details = maintenanceResult;
    } catch (e) {
      result.details = e.message;
    }

    return result;
  }

  async function runTask(taskName, projectRoot = PROJECT_ROOT) {
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
      case 'taskRecovery':
        return runTaskRecovery(projectRoot);
      case 'vectorMaintenance':
        return runVectorMaintenance(projectRoot);
      default:
        return { type: taskName, success: false, details: `Unknown task: ${taskName}` };
    }
  }

  return {
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
  };
}

module.exports = {
  createMemorySchedulerTaskRunners,
};
