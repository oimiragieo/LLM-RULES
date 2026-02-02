#!/usr/bin/env node
/**
 * Memory Health Check Hook
 * ========================
 *
 * Triggers on UserPromptSubmit to check memory system health.
 * Warns if:
 * - learnings.md > 35KB (recommend archival at 40KB)
 * - codebase_map.json > 400 entries (prune at 500)
 * - sessions directory getting large (legacy)
 * - MTM approaching limit (8+ sessions)
 * - patterns.json or gotchas.json getting too large
 *
 * Also auto-archives and auto-prunes when thresholds are exceeded.
 *
 * Phase 2 Integration: Monitors STM/MTM/LTM memory tiers
 * Phase 3 Integration: Smart pruning with utility-based scoring
 * Phase 4 Integration: Metrics dashboard logging
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');

// Import memory manager functions and shared project root (MEMORY_SYSTEM.md: use project-root.cjs)
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Smart pruning thresholds
const SMART_PRUNE_CONFIG = {
  PATTERNS_WARN_COUNT: 40,
  PATTERNS_MAX_COUNT: 50,
  GOTCHAS_WARN_COUNT: 40,
  GOTCHAS_MAX_COUNT: 50,
};

function getMemoryManagerPath() {
  // Try relative to this hook file first
  const relPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-manager.cjs');
  if (fs.existsSync(relPath)) {
    return relPath;
  }
  // Fallback to project root
  return path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-manager.cjs');
}

function getMemoryTiersPath() {
  // Try relative to this hook file first
  const relPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-tiers.cjs');
  if (fs.existsSync(relPath)) {
    return relPath;
  }
  // Fallback to project root
  return path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-tiers.cjs');
}

function getSmartPrunerPath() {
  // Try relative to this hook file first
  const relPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'smart-pruner.cjs');
  if (fs.existsSync(relPath)) {
    return relPath;
  }
  // Fallback to project root
  return path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'smart-pruner.cjs');
}

function getMemoryDashboardPath() {
  // Try relative to this hook file first
  const relPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-dashboard.cjs');
  if (fs.existsSync(relPath)) {
    return relPath;
  }
  // Fallback to project root
  return path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-dashboard.cjs');
}

function main() {
  const memoryManagerPath = getMemoryManagerPath();
  const memoryTiersPath = getMemoryTiersPath();
  const smartPrunerPath = getSmartPrunerPath();

  if (!fs.existsSync(memoryManagerPath)) {
    // Memory manager not available - skip silently
    process.exit(0);
  }

  const {
    getMemoryHealth,
    checkAndArchiveLearnings,
    pruneCodebaseMap,
    getMemoryDir,
    CONFIG,
  } = require(memoryManagerPath);

  // Try to load memory tiers
  let memoryTiers = null;
  if (fs.existsSync(memoryTiersPath)) {
    try {
      memoryTiers = require(memoryTiersPath);
    } catch (_e) {
      // Memory tiers not available - continue without
    }
  }

  // Try to load smart pruner
  let smartPruner = null;
  if (fs.existsSync(smartPrunerPath)) {
    try {
      smartPruner = require(smartPrunerPath);
    } catch (_e) {
      // Smart pruner not available - continue without
    }
  }

  // Try to load memory dashboard for metrics logging
  const memoryDashboardPath = getMemoryDashboardPath();
  let memoryDashboard = null;
  if (fs.existsSync(memoryDashboardPath)) {
    try {
      memoryDashboard = require(memoryDashboardPath);
    } catch (e) {
      console.error(`[MemoryHealthCheck] Failed to load memory dashboard: ${e.message}`);
    }
  }

  // Get health status
  const health = getMemoryHealth(PROJECT_ROOT);

  // Output health status
  const output = {
    status: health.status,
    warnings: [...health.warnings],
    metrics: {
      learningsSizeKB: health.learningsSizeKB,
      codebaseMapEntries: health.codebaseMapEntries,
      sessionsCount: health.sessionsCount,
    },
    // LanceDB mock mode: run pnpm run memory:dashboard to see embedding (mock vs real) status
    lancedbMockMode: null,
  };

  // Phase 2: Add tier health metrics
  if (memoryTiers) {
    const tierHealth = memoryTiers.getTierHealth(PROJECT_ROOT);
    output.tiers = {
      stm: tierHealth.stm,
      mtm: tierHealth.mtm,
      ltm: tierHealth.ltm,
    };

    // Add tier warnings to overall warnings
    if (tierHealth.mtm.warnings && tierHealth.mtm.warnings.length > 0) {
      output.warnings.push(...tierHealth.mtm.warnings);
      if (output.status === 'healthy') {
        output.status = 'warning';
      }
    }
  }

  // Auto-remediation if over hard thresholds
  const autoActions = [];

  // Check if learnings.md needs archival (over 40KB)
  if (health.learningsSizeKB > CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB) {
    const archiveResult = checkAndArchiveLearnings(PROJECT_ROOT);
    if (archiveResult.archived) {
      autoActions.push(
        `Archived ${Math.round(archiveResult.archivedBytes / 1024)}KB of learnings.md`
      );
    }
  }

  // Check if codebase_map needs pruning (over 500 entries)
  if (health.codebaseMapEntries > CONFIG.CODEBASE_MAP_MAX_ENTRIES) {
    const pruneResult = pruneCodebaseMap(PROJECT_ROOT);
    if (pruneResult.totalPruned > 0) {
      autoActions.push(`Pruned ${pruneResult.totalPruned} stale codebase_map entries`);
    }
  }

  // Phase 2: Auto-summarize MTM if at limit
  if (
    memoryTiers &&
    output.tiers &&
    output.tiers.mtm.sessionCount >= memoryTiers.CONFIG.MTM_MAX_SESSIONS
  ) {
    const summarizeResult = memoryTiers.summarizeOldSessions(PROJECT_ROOT);
    if (summarizeResult.summarized > 0) {
      autoActions.push(`Summarized ${summarizeResult.summarized} old MTM sessions to LTM`);
    }
  }

  // Phase 3: Smart pruning for patterns and gotchas
  if (smartPruner) {
    const memoryDir = getMemoryDir(PROJECT_ROOT);

    // Check patterns.json
    const patternsPath = path.join(memoryDir, 'patterns.json');
    if (fs.existsSync(patternsPath)) {
      try {
        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        output.metrics.patternsCount = patterns.length;

        if (patterns.length > SMART_PRUNE_CONFIG.PATTERNS_WARN_COUNT) {
          output.warnings.push(
            `patterns.json has ${patterns.length} entries (threshold: ${SMART_PRUNE_CONFIG.PATTERNS_WARN_COUNT})`
          );
          output.status = 'warning';
        }

        // Auto-prune if over max
        if (patterns.length > SMART_PRUNE_CONFIG.PATTERNS_MAX_COUNT) {
          const result = smartPruner.deduplicateAndPrune(patterns, {
            targetCount: SMART_PRUNE_CONFIG.PATTERNS_MAX_COUNT,
            similarityThreshold: 0.4,
          });
          atomicWriteJSONSync(patternsPath, result.kept);
          if (result.deduplicated > 0 || result.removed.length > 0) {
            autoActions.push(
              `Smart-pruned patterns.json: ${result.deduplicated} deduped, ${result.removed.length} pruned`
            );
          }
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            hook: 'memory-health-check',
            event: 'patterns_prune_error',
            error: e.message,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    // Check gotchas.json
    const gotchasPath = path.join(memoryDir, 'gotchas.json');
    if (fs.existsSync(gotchasPath)) {
      try {
        const gotchas = JSON.parse(fs.readFileSync(gotchasPath, 'utf8'));
        output.metrics.gotchasCount = gotchas.length;

        if (gotchas.length > SMART_PRUNE_CONFIG.GOTCHAS_WARN_COUNT) {
          output.warnings.push(
            `gotchas.json has ${gotchas.length} entries (threshold: ${SMART_PRUNE_CONFIG.GOTCHAS_WARN_COUNT})`
          );
          output.status = 'warning';
        }

        // Auto-prune if over max
        if (gotchas.length > SMART_PRUNE_CONFIG.GOTCHAS_MAX_COUNT) {
          const result = smartPruner.deduplicateAndPrune(gotchas, {
            targetCount: SMART_PRUNE_CONFIG.GOTCHAS_MAX_COUNT,
            similarityThreshold: 0.4,
          });
          atomicWriteJSONSync(gotchasPath, result.kept);
          if (result.deduplicated > 0 || result.removed.length > 0) {
            autoActions.push(
              `Smart-pruned gotchas.json: ${result.deduplicated} deduped, ${result.removed.length} pruned`
            );
          }
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            hook: 'memory-health-check',
            event: 'gotchas_prune_error',
            error: e.message,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  }

  output.autoActions = autoActions;

  // Pending reflection requests (Router must perform Step 0 to process them)
  const reflectionSpawnPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'reflection-spawn-request.json'
  );
  if (fs.existsSync(reflectionSpawnPath)) {
    try {
      const raw = fs.readFileSync(reflectionSpawnPath, 'utf8').trim();
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr) && arr.length > 0) {
        output.pendingReflectionRequests = arr.length;
      }
    } catch (_e) {
      // ignore parse errors
    }
  }

  // Phase 4: Save metrics to history (resilient: try/catch, fallback JSONL)
  output.metricsLogged = false;
  const writeFallbackMetrics = errMsg => {
    try {
      const metricsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'metrics');
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }
      const fallbackPath = path.join(metricsDir, 'fallback.jsonl');
      const line =
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'health_check',
          status: output.status,
          warningsCount: (output.warnings && output.warnings.length) || 0,
          ...(errMsg ? { metricsError: errMsg } : {}),
        }) + '\n';
      fs.appendFileSync(fallbackPath, line);
    } catch (_e) {
      // ignore fallback write failure
    }
  };

  if (memoryDashboard) {
    try {
      const metrics = memoryDashboard.collectMetrics(PROJECT_ROOT);
      const metricsPath = memoryDashboard.saveMetrics(metrics, PROJECT_ROOT);
      memoryDashboard.cleanupOldMetrics(PROJECT_ROOT);
      output.metricsLogged = true;
      output.metricsPath = metricsPath;

      if (process.env.METRICS_DEBUG === 'true') {
        console.error(
          JSON.stringify({
            hook: 'memory-health-check',
            event: 'metrics_saved',
            metricsPath,
            timestamp: new Date().toISOString(),
          })
        );
      }
    } catch (e) {
      output.metricsError = e.message;
      console.error(
        JSON.stringify({
          hook: 'memory-health-check',
          event: 'metrics_logging_error',
          error: e.message,
          timestamp: new Date().toISOString(),
        })
      );
      writeFallbackMetrics(e.message);
    }
  } else {
    output.metricsError = 'dashboard not loaded';
    writeFallbackMetrics('dashboard not loaded');
  }

  // Format user-friendly message
  if (output.status === 'warning' || autoActions.length > 0) {
    console.log('[MEMORY HEALTH CHECK]');

    if (output.warnings.length > 0) {
      console.log('Warnings:');
      for (const warning of output.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    if (autoActions.length > 0) {
      console.log('Auto-actions taken:');
      for (const action of autoActions) {
        console.log(`  - ${action}`);
      }
    }

    // Phase 2: Show tier metrics
    if (output.tiers && memoryTiers) {
      console.log('Memory Tiers:');
      console.log(`  - STM: ${output.tiers.stm.sessionCount} session(s)`);
      console.log(
        `  - MTM: ${output.tiers.mtm.sessionCount}/${memoryTiers.CONFIG.MTM_MAX_SESSIONS} sessions`
      );
      console.log(`  - LTM: ${output.tiers.ltm.summaryCount} summaries`);
    }

    console.log('');
  }

  // Return JSON result for programmatic access
  if (process.env.MEMORY_HEALTH_JSON) {
    console.log(JSON.stringify(output, null, 2));
  }

  process.exit(0);
}

// Allow direct execution or require
if (require.main === module) {
  main();
}

module.exports = { main };
