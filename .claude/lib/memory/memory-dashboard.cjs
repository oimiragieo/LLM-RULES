#!/usr/bin/env node
/**
 * Memory Dashboard - Unified Memory System Monitoring
 * ====================================================
 *
 * Phase 4 implementation: Unified dashboard providing:
 * - Single command to view all memory system health
 * - Aggregated metrics across all tiers and files
 * - Recommendations based on current state
 * - Historical trend tracking (stored in metrics/)
 *
 * Integration points:
 * - memory-manager.cjs (base metrics, archival, pruning)
 * - memory-tiers.cjs (STM/MTM/LTM health)
 * - smart-pruner.cjs (utility-based analysis)
 * - memory-health-check.cjs (auto-remediation)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// BUG-001 Fix: Use canonical PROJECT_ROOT to prevent nested .claude folder creation
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { summarizeOperationalSLO } = require('./memory-slo-metrics.cjs');
const {
  calculateHealthScore: calculateHealthScoreWithConfig,
  generateRecommendations: generateRecommendationsWithConfig,
} = require('./memory-dashboard-scoring.cjs');
const {
  getMemoryDir,
  getMetricsDir,
  getFileSizeKB,
  getJsonEntryCount,
  countDirFiles,
  getDirSizeKB,
  countStaleTempArtifacts,
  getFileLineCount,
  getFileStatus,
} = require('./memory-dashboard-helpers.cjs');

const logger = createLogger('memory-dashboard');

// Configuration

const CONFIG = {
  // Thresholds for health scoring
  THRESHOLDS: {
    learningsKB: { warn: 35, critical: 40 },
    patterns: { warn: 40, critical: 50 },
    gotchas: { warn: 40, critical: 50 },
    codebaseMapEntries: { warn: 400, critical: 500 },
    mtmSessions: { warn: 8, critical: 10 },
  },
  // Metrics history retention (days)
  METRICS_RETENTION_DAYS: 30,
  // Health score weights
  HEALTH_WEIGHTS: {
    learnings: 0.2,
    patterns: 0.15,
    gotchas: 0.15,
    codebaseMap: 0.25,
    mtm: 0.25,
  },
};

function calculateHealthScore(metrics, config = CONFIG) {
  return calculateHealthScoreWithConfig(metrics, config);
}

function generateRecommendations(metrics, config = CONFIG) {
  return generateRecommendationsWithConfig(metrics, config);
}

// Helper Functions

/**
 * Get the memory directory path
 */
function collectMetrics(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const staleTempArtifacts = countStaleTempArtifacts(memoryDir);
  const slo = summarizeOperationalSLO(projectRoot);

  // File metrics
  const learningsSizeKB = getFileSizeKB(path.join(memoryDir, 'learnings.md'));
  const patternsCount = getJsonEntryCount(path.join(memoryDir, 'patterns.json'));
  const gotchasCount = getJsonEntryCount(path.join(memoryDir, 'gotchas.json'));
  const codebaseMapEntries = getJsonEntryCount(path.join(memoryDir, 'codebase_map.json'));
  const sessionsCount = countDirFiles(path.join(memoryDir, 'sessions'), /^session_\d{3}\.json$/);

  // Tier metrics
  const stmSessions = countDirFiles(path.join(memoryDir, 'stm'), /\.json$/);
  const mtmSessions = countDirFiles(path.join(memoryDir, 'mtm'), /\.json$/);
  const ltmSummaries = countDirFiles(path.join(memoryDir, 'ltm'), /\.json$/);

  // Cold storage and maintenance status
  let lastColdArchive = null;
  let lastWeekly = null;
  try {
    const statusPath = path.join(memoryDir, 'maintenance-status.json');
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      lastColdArchive = status.lastColdArchive ?? null;
      lastWeekly = status.lastWeekly ?? null;
    }
  } catch (_e) {
    // ignore
  }
  const coldDir = path.join(memoryDir, 'archive', 'cold');
  const coldFileCount = fs.existsSync(coldDir)
    ? fs.readdirSync(coldDir).filter(f => /\.jsonl$/.test(f)).length
    : 0;
  const coldSizeKB = getDirSizeKB(coldDir, /\.jsonl$/);

  let entityCount = 0;
  let relationshipCount = 0;
  const dbPath = path.join(projectRoot, '.claude', 'context', 'data', 'memory.db');
  if (fs.existsSync(dbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      try {
        entityCount = db.prepare('SELECT COUNT(*) AS c FROM entities').get()?.c || 0;
        relationshipCount =
          db.prepare('SELECT COUNT(*) AS c FROM entity_relationships').get()?.c || 0;
      } finally {
        db.close();
      }
    } catch (_e) {
      // best-effort
    }
  }

  // Calculate totals
  const totalEntries = patternsCount + gotchasCount + codebaseMapEntries;

  // Calculate total size
  let totalSizeKB = learningsSizeKB;
  totalSizeKB += getFileSizeKB(path.join(memoryDir, 'patterns.json'));
  totalSizeKB += getFileSizeKB(path.join(memoryDir, 'gotchas.json'));
  totalSizeKB += getFileSizeKB(path.join(memoryDir, 'codebase_map.json'));
  totalSizeKB += getFileSizeKB(path.join(memoryDir, 'decisions.md'));
  totalSizeKB += getFileSizeKB(path.join(memoryDir, 'issues.md'));

  // Calculate health score
  const healthScore = calculateHealthScore(
    {
      learningsSizeKB,
      patternsCount,
      gotchasCount,
      codebaseMapEntries,
      mtmSessionCount: mtmSessions,
    },
    CONFIG
  );

  // Generate recommendations
  const recommendations = generateRecommendations(
    {
      learningsSizeKB,
      patternsCount,
      gotchasCount,
      codebaseMapEntries,
      mtmSessionCount: mtmSessions,
      legacySessionsCount: sessionsCount,
    },
    CONFIG
  );

  if (!slo.pass.writeLatency) {
    recommendations.push(
      `SLO breach: write latency p95 is ${slo.p95.writeLatencyMs}ms (target <= ${slo.targets.writeP95Ms}ms)`
    );
  }
  if (!slo.pass.lockWait) {
    recommendations.push(
      `SLO breach: lock wait p95 is ${slo.p95.lockWaitMs}ms (target <= ${slo.targets.lockWaitP95Ms}ms)`
    );
  }
  if (!slo.pass.parseFailures) {
    recommendations.push(
      `SLO breach: parse failure rate is ${(slo.parseFailureRate * 100).toFixed(2)}% (target <= ${(slo.targets.parseFailureRate * 100).toFixed(2)}%)`
    );
  }
  if (staleTempArtifacts > 0) {
    recommendations.push(
      `Operational hygiene: found ${staleTempArtifacts} stale temp/lock artifact(s) under memory/`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalEntries,
      totalSizeKB,
      healthScore,
      entityCount,
      relationshipCount,
    },
    tiers: {
      stm: { sessions: stmSessions, sizeKB: 0 },
      mtm: { sessions: mtmSessions, sizeKB: 0 },
      ltm: { summaries: ltmSummaries, sizeKB: 0 },
    },
    cold: {
      lastColdArchive,
      lastWeekly,
      fileCount: coldFileCount,
      sizeKB: coldSizeKB,
    },
    slo: {
      ...slo,
      staleTempArtifacts,
    },
    files: {
      'learnings.md': {
        sizeKB: learningsSizeKB,
        lines: getFileLineCount(path.join(memoryDir, 'learnings.md')),
        status: getFileStatus(learningsSizeKB, CONFIG.THRESHOLDS.learningsKB),
      },
      'patterns.json': {
        entries: patternsCount,
        status: getFileStatus(patternsCount, CONFIG.THRESHOLDS.patterns),
      },
      'gotchas.json': {
        entries: gotchasCount,
        status: getFileStatus(gotchasCount, CONFIG.THRESHOLDS.gotchas),
      },
      'codebase_map.json': {
        entries: codebaseMapEntries,
        status: getFileStatus(codebaseMapEntries, CONFIG.THRESHOLDS.codebaseMapEntries),
      },
      'sessions/ (legacy)': {
        count: sessionsCount,
        status: 'healthy',
      },
    },
    recommendations,
  };
}

/**
 * Get file line count
 */
function saveMetrics(metrics, projectRoot = PROJECT_ROOT) {
  const metricsDir = getMetricsDir(projectRoot);
  const today = new Date().toISOString().split('T')[0];
  const metricsPath = path.join(metricsDir, `${today}.json`);

  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n');
  return metricsPath;
}

/**
 * Get metrics history for the last N days
 */
function getMetricsHistory(days = 7, projectRoot = PROJECT_ROOT) {
  const metricsDir = getMetricsDir(projectRoot);
  const history = [];

  try {
    const files = fs
      .readdirSync(metricsDir)
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
      .sort()
      .reverse()
      .slice(0, days);

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(metricsDir, file), 'utf8'));
        history.push({
          date: file.replace('.json', ''),
          ...data,
        });
      } catch (e) {
        logger.debug('getMetricsHistory parsing error', {
          function: 'getMetricsHistory',
          context: 'parsing file',
          file: file,
          error: e.message,
        });
      }
    }
  } catch (e) {
    logger.debug('getMetricsHistory reading directory error', {
      function: 'getMetricsHistory',
      context: 'reading directory',
      error: e.message,
    });
  }

  return history;
}

/**
 * Cleanup old metrics files (keep last 30 days)
 */
function cleanupOldMetrics(projectRoot = PROJECT_ROOT) {
  const metricsDir = getMetricsDir(projectRoot);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.METRICS_RETENTION_DAYS);

  let removedCount = 0;

  try {
    const files = fs.readdirSync(metricsDir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));

    for (const file of files) {
      const dateStr = file.replace('.json', '');
      const fileDate = new Date(dateStr);

      if (fileDate < cutoffDate) {
        fs.unlinkSync(path.join(metricsDir, file));
        removedCount++;
      }
    }
  } catch (e) {
    logger.debug('cleanupOldMetrics error', {
      function: 'cleanupOldMetrics',
      error: e.message,
    });
  }

  return removedCount;
}

// Unified Dashboard

/**
 * Get complete dashboard with all sections
 */
/**
 * Get semantic search status (async). Used by dashboard CLI to show embedding status.
 * @param {string} projectRoot
 * @returns {Promise<{status: string, mode?: string, reason?: string} | null>}
 */
async function getLanceDBStatus(projectRoot = PROJECT_ROOT) {
  if (process.env.MEMORY_SEMANTIC_SEARCH === 'off') {
    return { status: 'disabled', reason: 'MEMORY_SEMANTIC_SEARCH=off' };
  }
  try {
    const { MemoryVectorStore } = require('./lancedb-client.cjs');
    const store = new MemoryVectorStore({
      persistDirectory: path.join(projectRoot, '.claude', 'context', 'data', 'lancedb'),
    });
    await store.initialize();
    try {
      if (typeof store.getEmbeddingStatus === 'function') {
        const status = store.getEmbeddingStatus();
        if (status && status.status !== 'ready') return status;
        if (typeof store.getTableVectorDimension === 'function') {
          const tableDim = await store.getTableVectorDimension();
          const embedDim = await store.getEmbeddingDimension();
          if (Number.isFinite(tableDim) && Number.isFinite(embedDim) && tableDim !== embedDim) {
            return {
              status: 'unavailable',
              reason: `embedding dimension mismatch (table ${tableDim} vs model ${embedDim})`,
            };
          }
        }
        return status;
      }
      return null;
    } finally {
      if (typeof store.close === 'function') {
        await store.close().catch(() => {});
      }
    }
  } catch (e) {
    return { status: 'unavailable', reason: e.message };
  }
}

function getDashboard(projectRoot = PROJECT_ROOT) {
  const metrics = collectMetrics(projectRoot);

  // Save metrics for history tracking
  saveMetrics(metrics, projectRoot);

  // Cleanup old metrics
  cleanupOldMetrics(projectRoot);

  return metrics;
}

/**
 * Format dashboard as readable text
 */
function formatDashboard(dashboard) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('MEMORY SYSTEM DASHBOARD');
  lines.push('='.repeat(60));
  lines.push(`Timestamp: ${dashboard.timestamp}`);
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`  Total Entries: ${dashboard.summary.totalEntries}`);
  lines.push(`  Total Size: ${dashboard.summary.totalSizeKB} KB`);
  lines.push(`  Health Score: ${(dashboard.summary.healthScore * 100).toFixed(0)}%`);
  if (dashboard.summary.entityCount !== undefined) {
    lines.push(`  Entities: ${dashboard.summary.entityCount}`);
  }
  if (dashboard.summary.relationshipCount !== undefined) {
    lines.push(`  Relationships: ${dashboard.summary.relationshipCount}`);
  }
  lines.push('');

  // LanceDB / semantic search
  if (dashboard.semanticStatus) {
    const status = dashboard.semanticStatus;
    if (status.status === 'ready') {
      lines.push(`Semantic search: enabled (${status.mode || 'transformers'})`);
      lines.push('');
    } else if (status.status === 'disabled') {
      lines.push(`Semantic search: disabled (${status.reason || 'disabled'})`);
      lines.push('');
    } else if (status.status === 'unavailable') {
      const reason = status.reason ? `: ${status.reason}` : '';
      lines.push(`Semantic search: disabled (embeddings unavailable${reason})`);
      lines.push('');
    }
  }

  if (dashboard.slo) {
    lines.push('OPERATIONAL SLOS');
    lines.push('-'.repeat(40));
    lines.push(
      `  Write latency p95: ${dashboard.slo.p95.writeLatencyMs} ms (target <= ${dashboard.slo.targets.writeP95Ms} ms)`
    );
    lines.push(
      `  Lock wait p95: ${dashboard.slo.p95.lockWaitMs} ms (target <= ${dashboard.slo.targets.lockWaitP95Ms} ms)`
    );
    lines.push(
      `  Parse failure rate: ${(dashboard.slo.parseFailureRate * 100).toFixed(2)}% (target <= ${(dashboard.slo.targets.parseFailureRate * 100).toFixed(2)}%)`
    );
    lines.push(`  Stale temp artifacts: ${dashboard.slo.staleTempArtifacts}`);
    lines.push(`  SLO status: ${dashboard.slo.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
  }

  // Tiers
  lines.push('MEMORY TIERS');
  lines.push('-'.repeat(40));
  lines.push(`  STM (Short-Term): ${dashboard.tiers.stm.sessions} session(s)`);
  lines.push(`  MTM (Mid-Term): ${dashboard.tiers.mtm.sessions} sessions`);
  lines.push(`  LTM (Long-Term): ${dashboard.tiers.ltm.summaries} summaries`);
  if (dashboard.cold) {
    lines.push(
      `  Cold: ${dashboard.cold.fileCount} archive(s), ${dashboard.cold.sizeKB || 0} KB, last: ${dashboard.cold.lastColdArchive || 'never'}`
    );
  }
  lines.push('');

  // Files
  lines.push('MEMORY FILES');
  lines.push('-'.repeat(40));
  for (const [file, info] of Object.entries(dashboard.files)) {
    const status = info.status || 'healthy';
    const statusIcon = status === 'critical' ? '[!]' : status === 'warning' ? '[~]' : '[ok]';
    if (info.sizeKB !== undefined) {
      lines.push(`  ${statusIcon} ${file}: ${info.sizeKB} KB`);
    } else if (info.entries !== undefined) {
      lines.push(`  ${statusIcon} ${file}: ${info.entries} entries`);
    } else if (info.count !== undefined) {
      lines.push(`  ${statusIcon} ${file}: ${info.count} files`);
    }
  }
  lines.push('');

  // Recommendations
  if (dashboard.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS');
    lines.push('-'.repeat(40));
    for (const rec of dashboard.recommendations) {
      lines.push(`  - ${rec}`);
    }
    lines.push('');
  } else {
    lines.push('STATUS: All systems healthy');
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

// CLI Interface

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const runWithLanceDBStatus = async outputFn => {
    const dashboard = getDashboard();
    const status = await getLanceDBStatus().catch(() => null);
    dashboard.semanticStatus = status;
    outputFn(dashboard);
  };

  switch (command) {
    case 'metrics':
      console.log(JSON.stringify(collectMetrics(), null, 2));
      break;

    case 'health':
      runWithLanceDBStatus(dashboard => console.log(formatDashboard(dashboard)));
      break;

    case 'json':
      runWithLanceDBStatus(dashboard => console.log(JSON.stringify(dashboard, null, 2)));
      break;

    case 'history': {
      const days = parseInt(args[1] || '7', 10);
      const history = getMetricsHistory(days);
      console.log(JSON.stringify(history, null, 2));
      break;
    }

    case 'score': {
      const metrics = collectMetrics();
      console.log(`Health Score: ${(metrics.summary.healthScore * 100).toFixed(0)}%`);
      break;
    }

    default:
      console.log(`
Memory Dashboard - Unified Memory System Monitoring

Commands:
  health           Show full dashboard (default)
  metrics          Show metrics as JSON
  json             Show dashboard as JSON
  history [days]   Show metrics history (default: 7 days)
  score            Show just the health score

Examples:
  node memory-dashboard.cjs health
  node memory-dashboard.cjs json
  node memory-dashboard.cjs history 30
  node memory-dashboard.cjs score
`);
      // Default to health display
      if (!command) {
        runWithLanceDBStatus(dashboard => console.log(formatDashboard(dashboard)));
      }
  }
}

// Exports

module.exports = {
  CONFIG,
  // Core functions
  collectMetrics,
  calculateHealthScore,
  generateRecommendations,
  // History functions
  saveMetrics,
  getMetricsHistory,
  cleanupOldMetrics,
  // Unified dashboard
  getDashboard,
  formatDashboard,
  getLanceDBStatus,
  // Helpers (for testing)
  getMemoryDir,
  getMetricsDir,
  countStaleTempArtifacts,
};
