'use strict';
/**
 * Workflow Watchdog DLQ (Track 1.2)
 *
 * Monitors workflow state for stalled phases and writes stall events
 * to a Dead Letter Queue (DLQ) for inspection.
 *
 * Corrections applied:
 *  - safeParseJSON returns value directly (not { data, success })
 *  - appendJsonl from jsonl-utils.cjs for DLQ writes
 *  - atomicWriteJSONSync from atomic-write.cjs for state writes
 *  - SE-03: Only called from advisory hook (exit 0 on any error)
 *  - SE-02: Uses safeParseJSON for all JSON reads
 *
 * Wire step: This library module is invoked from workflow-watchdog-hook.cjs
 * (a standalone hook file registered via hook-creator skill in settings.json).
 */

const fs = require('fs');
const path = require('path');

const { safeParseJSON } = require('../utils/safe-json.cjs');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Detect stalled phases from a workflow phases object.
 *
 * Phases is an object map (not array), per schema:
 *   { "implement": { "status": "in_progress", "startedAt": "ISO-8601" }, ... }
 *
 * @param {Record<string, { status: string, startedAt: string }>} phases
 * @param {number} nowMs - Current timestamp (ms)
 * @param {number} thresholdMs - How long a phase must run before being flagged
 * @returns {Array<{ phaseKey: string, status: string, elapsedMs: number, startedAt: string }>}
 */
function detectStalledPhases(phases, nowMs, thresholdMs) {
  if (!phases || typeof phases !== 'object') return [];

  const stalled = [];
  const STALL_STATUSES = new Set(['in_progress', 'pending']);

  for (const [phaseKey, phase] of Object.entries(phases)) {
    if (!phase || !STALL_STATUSES.has(phase.status)) continue;

    const startedAtMs = Date.parse(String(phase.startedAt || ''));
    if (!Number.isFinite(startedAtMs)) continue; // invalid date → skip (SE graceful)

    const elapsedMs = nowMs - startedAtMs;
    if (elapsedMs >= thresholdMs) {
      stalled.push({
        phaseKey,
        status: phase.status,
        elapsedMs,
        startedAt: phase.startedAt,
        thresholdMs,
      });
    }
  }

  return stalled;
}

/**
 * Write a single stall entry to the DLQ JSONL file.
 * Uses appendJsonl for correct JSONL format (one object per line, no double-serialize).
 *
 * @param {string} dlqPath
 * @param {object} entry
 */
function writeToDLQ(dlqPath, entry) {
  appendJsonl(dlqPath, entry);
}

/**
 * Run one watchdog check cycle.
 * Reads workflow state, detects stalled phases, writes to DLQ.
 * Advisory-only: never throws.
 *
 * @param {{ projectRoot?: string, thresholdMs?: number }} [opts]
 * @returns {Promise<{ stalledCount: number } | null>}
 */
async function runWatchdogOnce(opts = {}) {
  try {
    const projectRoot = opts.projectRoot || PROJECT_ROOT;
    const thresholdMs = Number(opts.thresholdMs) || DEFAULT_THRESHOLD_MS;

    const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
    const stateFile = path.join(runtimeDir, 'workflow-state.json');
    const dlqPath = path.join(runtimeDir, 'workflow-watchdog-dlq.jsonl');
    const watchdogStatePath = path.join(runtimeDir, 'workflow-watchdog-state.json');

    if (!fs.existsSync(stateFile)) return null;

    const rawContent = fs.readFileSync(stateFile, 'utf8');
    // SE-02: use safeParseJSON (returns value directly, not { data, success })
    const state = safeParseJSON(rawContent, null);
    if (!state || typeof state.phases !== 'object') return null;

    const nowMs = Date.now();
    const stalledPhases = detectStalledPhases(state.phases, nowMs, thresholdMs);

    if (stalledPhases.length === 0) return { stalledCount: 0 };

    // Write each stalled phase to DLQ
    for (const phase of stalledPhases) {
      writeToDLQ(dlqPath, {
        ...phase,
        timestamp: new Date(nowMs).toISOString(),
        workflowStatus: state.status || 'unknown',
        source: 'workflow-watchdog',
      });
    }

    // Update watchdog state atomically (SE-02: atomicWriteJSONSync)
    try {
      const watchdogState = {
        lastRunAt: new Date(nowMs).toISOString(),
        lastStalledCount: stalledPhases.length,
        lastStalledPhases: stalledPhases.map(p => p.phaseKey),
      };
      atomicWriteJSONSync(watchdogStatePath, watchdogState);
    } catch (_writeErr) {
      // State write failure is non-critical (advisory only)
    }

    return { stalledCount: stalledPhases.length };
  } catch (_err) {
    // SE-03: never throw — watchdog is advisory only
    return null;
  }
}

module.exports = {
  runWatchdogOnce,
  detectStalledPhases,
  writeToDLQ,
};
