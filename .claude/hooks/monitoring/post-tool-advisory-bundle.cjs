#!/usr/bin/env node
'use strict';

/**
 * post-tool-advisory-bundle.cjs — PostToolUse consolidated advisory hook
 *
 * Consolidates 4 PostToolUse wildcard (matcher: "") advisory scripts into a
 * single process to reduce process-spawn overhead per tool call:
 *
 *   1. post-tool-metrics-unified.cjs  — metrics, error tracking, anomaly detection
 *   2. context-window-monitor.cjs     — context window usage warnings
 *   3. hook-error-detector.cjs        — stale worktree hook path detection
 *   4. recurring-issue-detector.cjs   — recurring error pattern detection
 *
 * Error isolation: each sub-function is wrapped in its own try/catch.
 * A throw in one sub-function NEVER prevents others from executing.
 *
 * Always exits 0 (advisory/fail-open hook).
 * Marked async: true in settings.json.
 *
 * Registration: settings.json PostToolUse (matcher: "")
 *
 * Fulfills: VAL-HO-005, VAL-HO-012
 *
 * @module post-tool-advisory-bundle
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Shared utilities ─────────────────────────────────────────────────────────

const { parseHookInputAsync } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'hook-input.cjs')
);

// ─── Sub-module imports ───────────────────────────────────────────────────────

// Sub-module 1: post-tool-metrics-unified — metrics, error tracking, anomaly detection
const metricsUnified = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'metrics', 'post-tool-metrics-unified.cjs')
);

// Sub-module 2: context-window-monitor — token usage advisory warnings
const contextWindowMonitor = require('./context-window-monitor.cjs');

// Sub-module 3: hook-error-detector — stale worktree MODULE_NOT_FOUND detection
const hookErrorDetector = require('./hook-error-detector.cjs');

// Sub-module 4: recurring-issue-detector — recurring error pattern detection
const recurringIssueDetector = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'monitoring', 'recurring-issue-detector.cjs')
);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  let hookInput = null;

  try {
    hookInput = await parseHookInputAsync();
  } catch (_err) {
    // Fail-open: malformed stdin must not crash the bundle
  }

  const safeInput = hookInput || {};

  // ── Sub-function 1: post-tool-metrics-unified ─────────────────────────────
  // Collects tool execution metrics, tracks errors, detects anomalies.
  try {
    metricsUnified.collectMetrics(safeInput, startedAt);
    metricsUnified.trackErrors(safeInput);
    metricsUnified.detectAnomalies(safeInput);
    metricsUnified.recordPeriodicFindingsSnapshot();
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 2: context-window-monitor ────────────────────────────────
  // Reads token usage and emits a warning if context window is running low.
  let additionalContext;
  try {
    const usage = contextWindowMonitor.readTokenUsage();
    if (usage) {
      const { tokensUsed, budget, usagePct } = usage;
      const warning = contextWindowMonitor.buildWarningMessage(usagePct, tokensUsed, budget);
      if (warning) {
        additionalContext = warning;
      }
    }
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 3: hook-error-detector ──────────────────────────────────
  // Detects MODULE_NOT_FOUND errors referencing stale .claude/worktrees/ paths.
  try {
    hookErrorDetector.processHookInput(safeInput);
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ── Sub-function 4: recurring-issue-detector ──────────────────────────────
  // Every 50th invocation, scans error-metrics.jsonl for recurring patterns.
  try {
    recurringIssueDetector.processHookInput(safeInput);
  } catch (_err) {
    // Error in this sub-function must not prevent others from running
  }

  // ─── Output ───────────────────────────────────────────────────────────────
  const output = additionalContext ? { allow: true, additionalContext } : { allow: true };
  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

main();
