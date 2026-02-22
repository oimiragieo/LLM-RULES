#!/usr/bin/env node
'use strict';
/**
 * Reflection Degradation Alert CLI Tool (Track 5.2)
 *
 * Reads reflection-log.jsonl, computes per-agent average quality scores
 * over a time window, and writes reflection-alert.json when agents
 * score below a configured threshold.
 *
 * Corrections applied:
 *  - atomicWriteJSONSync for alert file (not fs.writeFileSync)
 *  - wrapCLITool wrapping for consistent error handling + audit log
 *  - safeParseJSON returns value directly (not { data, success })
 *  - SE-04: no await-in-forEach (uses for...of)
 *
 * Usage:
 *   node reflection-degradation-alert.cjs [--log-file <path>] [--alert-file <path>]
 *     [--threshold <0-1>] [--min-samples <n>] [--window-hours <n>]
 *
 * Catalog entry: see .claude/context/artifacts/catalogs/tool-catalog.md
 * Script: pnpm metrics:reflection:alert
 */

const fs = require('fs');
const path = require('path');

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const DEFAULT_LOG = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'reflection-log.jsonl');
const DEFAULT_ALERT = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'reflection-alert.json'
);
const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Compute per-agent average quality scores from reflection log entries.
 *
 * @param {Array<{ agentType?: string, qualityScore?: number }>} entries
 * @returns {Record<string, { average: number, count: number, total: number }>}
 */
function computeAgentAverages(entries) {
  const agg = {};

  for (const entry of entries) {
    const agentType = entry.agentType;
    if (!agentType || typeof agentType !== 'string') continue;
    const score = entry.qualityScore;
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;

    if (!agg[agentType]) {
      agg[agentType] = { total: 0, count: 0, average: 0 };
    }
    agg[agentType].total += score;
    agg[agentType].count += 1;
    agg[agentType].average = agg[agentType].total / agg[agentType].count;
  }

  return agg;
}

/**
 * Find agents whose average score is below the threshold (with enough samples).
 *
 * @param {Record<string, { average: number, count: number }>} averages
 * @param {{ threshold?: number, minSamples?: number }} [opts]
 * @returns {Array<{ agentType: string, average: number, count: number }>}
 */
function findDegradedAgents(averages, opts = {}) {
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_THRESHOLD;
  const minSamples = typeof opts.minSamples === 'number' ? opts.minSamples : DEFAULT_MIN_SAMPLES;

  const degraded = [];
  for (const [agentType, stats] of Object.entries(averages)) {
    if (stats.count < minSamples) continue;
    if (stats.average < threshold) {
      degraded.push({ agentType, average: stats.average, count: stats.count });
    }
  }
  return degraded;
}

/**
 * Parse a CLI argument from process.argv.
 * @param {string[]} argv
 * @param {string} flag
 * @param {string|undefined} defaultValue
 * @returns {string|undefined}
 */
function getArg(argv, flag, defaultValue) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return defaultValue;
}

/**
 * Main degradation check logic.
 * Reads log, computes averages, finds degraded agents, writes alert if needed.
 *
 * @param {{
 *   logFile?: string,
 *   alertFile?: string,
 *   threshold?: number,
 *   minSamples?: number,
 *   windowMs?: number,
 * }} [opts]
 * @returns {Promise<{ degradedAgents: Array<object> } | null>}
 */
async function runDegradationCheck(opts = {}) {
  const logFile = opts.logFile || DEFAULT_LOG;
  const alertFile = opts.alertFile || DEFAULT_ALERT;
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_THRESHOLD;
  const minSamples = typeof opts.minSamples === 'number' ? opts.minSamples : DEFAULT_MIN_SAMPLES;
  const windowMs =
    typeof opts.windowMs === 'number' ? opts.windowMs : DEFAULT_WINDOW_HOURS * 60 * 60 * 1000;

  if (!fs.existsSync(logFile)) return null;

  const raw = fs.readFileSync(logFile, 'utf8');
  if (!raw || raw.trim() === '') return null;

  const nowMs = Date.now();
  const cutoffMs = nowMs - windowMs;

  // Parse JSONL — SE-02: use safeParseJSON (returns value directly)
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map(line => safeParseJSON(line, null))
    .filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      // Filter by time window
      const ts = Date.parse(String(entry.timestamp || ''));
      if (!Number.isFinite(ts)) return true; // no timestamp → include
      return ts >= cutoffMs;
    });

  if (entries.length === 0) return null;

  const averages = computeAgentAverages(entries);
  const degradedAgents = findDegradedAgents(averages, { threshold, minSamples });

  if (degradedAgents.length === 0) return null;

  const alert = {
    generatedAt: new Date(nowMs).toISOString(),
    threshold,
    minSamples,
    windowMs,
    degradedAgents,
  };

  // SE-02: use atomicWriteJSONSync (not fs.writeFileSync)
  atomicWriteJSONSync(alertFile, alert);

  return alert;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const wrappedMain = wrapCLITool(async () => {
  const argv = process.argv;
  const logFile = getArg(argv, '--log-file', DEFAULT_LOG);
  const alertFile = getArg(argv, '--alert-file', DEFAULT_ALERT);
  const threshold = Number(getArg(argv, '--threshold', String(DEFAULT_THRESHOLD)));
  const minSamples = Number(getArg(argv, '--min-samples', String(DEFAULT_MIN_SAMPLES)));
  const windowHours = Number(getArg(argv, '--window-hours', String(DEFAULT_WINDOW_HOURS)));

  const result = await runDegradationCheck({
    logFile,
    alertFile,
    threshold,
    minSamples,
    windowMs: windowHours * 60 * 60 * 1000,
  });

  if (!result) {
    console.log('No reflection degradation detected.');
  } else {
    console.log(`Alert written: ${result.degradedAgents.length} degraded agent(s) → ${alertFile}`);
    for (const agent of result.degradedAgents) {
      console.log(`  ${agent.agentType}: avg=${agent.average.toFixed(3)} (n=${agent.count})`);
    }
  }
}, 'reflection-degradation-alert');

if (require.main === module) {
  wrappedMain();
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

module.exports = {
  computeAgentAverages,
  findDegradedAgents,
  runDegradationCheck,
};
