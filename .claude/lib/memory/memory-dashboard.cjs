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

// BUG-001 Fix: Import findProjectRoot to prevent nested .claude folder creation
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// ============================================================================
// Configuration
// ============================================================================

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the memory directory path
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Get the metrics directory path
 */
function getMetricsDir(projectRoot = PROJECT_ROOT) {
  const metricsDir = path.join(getMemoryDir(projectRoot), 'metrics');
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }
  return metricsDir;
}

/**
 * Safely get file size in KB
 */
function getFileSizeKB(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return Math.round(fs.statSync(filePath).size / 1024);
    }
  } catch (e) {
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'getFileSizeKB',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
  return 0;
}

/**
 * Safely parse JSON file and return entry count
 */
function getJsonEntryCount(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return data.length;
      }
      if (data.discovered_files) {
        return Object.keys(data.discovered_files).length;
      }
    }
  } catch (e) {
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'getJsonEntryCount',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
  return 0;
}

/**
 * Count files in a directory matching a pattern
 */
function countDirFiles(dirPath, pattern = /\.json$/) {
  try {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => pattern.test(f)).length;
    }
  } catch (e) {
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'countDirFiles',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
  return 0;
}

// ============================================================================
// Health Score Calculation
// ============================================================================

/**
 * Calculate health score for a single metric
 * Returns 1.0 for healthy, 0.5-1.0 for warning zone, 0-0.5 for critical
 */
function calculateMetricScore(value, threshold) {
  if (value <= threshold.warn * 0.7) {
    return 1.0; // Well under warn threshold
  }
  if (value <= threshold.warn) {
    // Approaching warn threshold: 0.8 - 1.0
    const ratio = value / threshold.warn;
    return 1.0 - (ratio - 0.7) * (0.2 / 0.3);
  }
  if (value <= threshold.critical) {
    // In warning zone: 0.5 - 0.8
    const ratio = (value - threshold.warn) / (threshold.critical - threshold.warn);
    return 0.8 - ratio * 0.3;
  }
  // Over critical: 0 - 0.5
  const overRatio = Math.min((value - threshold.critical) / threshold.critical, 1);
  return 0.5 - overRatio * 0.5;
}

/**
 * Calculate overall health score (0-1)
 * Based on weighted average of all metrics
 */
function calculateHealthScore(metrics) {
  const {
    learningsSizeKB = 0,
    patternsCount = 0,
    gotchasCount = 0,
    codebaseMapEntries = 0,
    mtmSessionCount = 0,
  } = metrics;

  const scores = {
    learnings: calculateMetricScore(learningsSizeKB, CONFIG.THRESHOLDS.learningsKB),
    patterns: calculateMetricScore(patternsCount, CONFIG.THRESHOLDS.patterns),
    gotchas: calculateMetricScore(gotchasCount, CONFIG.THRESHOLDS.gotchas),
    codebaseMap: calculateMetricScore(codebaseMapEntries, CONFIG.THRESHOLDS.codebaseMapEntries),
    mtm: calculateMetricScore(mtmSessionCount, CONFIG.THRESHOLDS.mtmSessions),
  };

  // Weighted average
  let totalScore = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(CONFIG.HEALTH_WEIGHTS)) {
    totalScore += scores[key] * weight;
    totalWeight += weight;
  }

  return Math.round((totalScore / totalWeight) * 100) / 100;
}

// ============================================================================
// Recommendation Generation
// ============================================================================

/**
 * Generate recommendations based on current metrics
 */
function generateRecommendations(metrics) {
  const {
    learningsSizeKB = 0,
    patternsCount = 0,
    gotchasCount = 0,
    codebaseMapEntries = 0,
    mtmSessionCount = 0,
  } = metrics;

  const recommendations = [];

  // Learnings.md recommendations
  if (learningsSizeKB >= CONFIG.THRESHOLDS.learningsKB.critical) {
    recommendations.push(
      `CRITICAL: learnings.md is ${learningsSizeKB}KB - run archival immediately`
    );
  } else if (learningsSizeKB >= CONFIG.THRESHOLDS.learningsKB.warn) {
    recommendations.push(
      `Consider archiving learnings.md (${learningsSizeKB}KB approaching ${CONFIG.THRESHOLDS.learningsKB.critical}KB threshold)`
    );
  }

  // Patterns recommendations
  if (patternsCount >= CONFIG.THRESHOLDS.patterns.critical) {
    recommendations.push(
      `CRITICAL: patterns.json has ${patternsCount} entries - run deduplication and pruning`
    );
  } else if (patternsCount >= CONFIG.THRESHOLDS.patterns.warn) {
    recommendations.push(
      `Consider pruning patterns.json (${patternsCount} entries approaching ${CONFIG.THRESHOLDS.patterns.critical} threshold)`
    );
  }

  // Gotchas recommendations
  if (gotchasCount >= CONFIG.THRESHOLDS.gotchas.critical) {
    recommendations.push(
      `CRITICAL: gotchas.json has ${gotchasCount} entries - run deduplication and pruning`
    );
  } else if (gotchasCount >= CONFIG.THRESHOLDS.gotchas.warn) {
    recommendations.push(
      `Consider pruning gotchas.json (${gotchasCount} entries approaching ${CONFIG.THRESHOLDS.gotchas.critical} threshold)`
    );
  }

  // Codebase map recommendations
  if (codebaseMapEntries >= CONFIG.THRESHOLDS.codebaseMapEntries.critical) {
    recommendations.push(
      `CRITICAL: codebase_map.json has ${codebaseMapEntries} entries - run TTL pruning`
    );
  } else if (codebaseMapEntries >= CONFIG.THRESHOLDS.codebaseMapEntries.warn) {
    recommendations.push(
      `Consider pruning codebase_map.json (${codebaseMapEntries} entries approaching ${CONFIG.THRESHOLDS.codebaseMapEntries.critical} threshold)`
    );
  }

  // MTM recommendations
  if (mtmSessionCount >= CONFIG.THRESHOLDS.mtmSessions.critical) {
    recommendations.push(
      `CRITICAL: MTM has ${mtmSessionCount} sessions - run summarization to LTM immediately`
    );
  } else if (mtmSessionCount >= CONFIG.THRESHOLDS.mtmSessions.warn) {
    recommendations.push(
      `Consider summarizing MTM sessions to LTM (${mtmSessionCount} sessions approaching ${CONFIG.THRESHOLDS.mtmSessions.critical} limit)`
    );
  }

  return recommendations;
}

// ============================================================================
// Metrics Collection
// ============================================================================

/**
 * Collect all metrics from the memory system
 */
function collectMetrics(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);

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
  const coldDir = path.join(memoryDir, 'cold');
  const coldFileCount = fs.existsSync(coldDir)
    ? fs.readdirSync(coldDir).filter(f => /\.jsonl\.gz$/.test(f)).length
    : 0;

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
  const healthScore = calculateHealthScore({
    learningsSizeKB,
    patternsCount,
    gotchasCount,
    codebaseMapEntries,
    mtmSessionCount: mtmSessions,
  });

  // Generate recommendations
  const recommendations = generateRecommendations({
    learningsSizeKB,
    patternsCount,
    gotchasCount,
    codebaseMapEntries,
    mtmSessionCount: mtmSessions,
  });

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalEntries,
      totalSizeKB,
      healthScore,
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
      'sessions/': {
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
function getFileLineCount(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.split('\n').length;
    }
  } catch (e) {
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'getFileLineCount',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
  return 0;
}

/**
 * Get status string based on value and threshold
 */
function getFileStatus(value, threshold) {
  if (value >= threshold.critical) return 'critical';
  if (value >= threshold.warn) return 'warning';
  return 'healthy';
}

// ============================================================================
// Metrics History
// ============================================================================

/**
 * Save metrics to daily file.
 * getMetricsDir() ensures the metrics directory exists before write.
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
        if (process.env.METRICS_DEBUG === 'true') {
          console.error(
            JSON.stringify({
              module: 'memory-dashboard',
              function: 'getMetricsHistory',
              context: 'parsing file',
              file: file,
              error: e.message,
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    }
  } catch (e) {
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'getMetricsHistory',
          context: 'reading directory',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
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
    if (process.env.METRICS_DEBUG === 'true') {
      console.error(
        JSON.stringify({
          module: 'memory-dashboard',
          function: 'cleanupOldMetrics',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  return removedCount;
}

// ============================================================================
// Unified Dashboard
// ============================================================================

/**
 * Get complete dashboard with all sections
 */
/**
 * Get LanceDB mock mode status (async). Used by dashboard CLI to show embedding status.
 * @param {string} projectRoot
 * @returns {Promise<boolean|null>} true if mock mode, false if real embeddings, null if unavailable
 */
async function getLanceDBMockStatus(projectRoot = PROJECT_ROOT) {
  try {
    const { MemoryVectorStore } = require('./lancedb-client.cjs');
    const store = new MemoryVectorStore({
      persistDirectory: path.join(projectRoot, '.claude', 'data', 'lancedb'),
    });
    await store.initialize();
    return store.isMockMode();
  } catch (_e) {
    return null;
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
  lines.push('');

  // LanceDB / semantic search
  if (dashboard.lancedbMockMode === true) {
    lines.push('LanceDB: mock mode - semantic search uses keyword fallback');
    lines.push('');
  } else if (dashboard.lancedbMockMode === false) {
    lines.push('LanceDB: real embeddings (semantic search active)');
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
      `  Cold: ${dashboard.cold.fileCount} archive(s), last: ${dashboard.cold.lastColdArchive || 'never'}`
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

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const runWithLanceDBStatus = async outputFn => {
    const dashboard = getDashboard();
    const lancedbMock = await getLanceDBMockStatus().catch(() => null);
    dashboard.lancedbMockMode = lancedbMock;
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

// ============================================================================
// Exports
// ============================================================================

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
  getLanceDBMockStatus,
  // Helpers (for testing)
  getMemoryDir,
  getMetricsDir,
};
