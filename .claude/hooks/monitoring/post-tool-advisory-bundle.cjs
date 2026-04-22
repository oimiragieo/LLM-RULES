#!/usr/bin/env node
'use strict';

/**
 * post-tool-advisory-bundle.cjs — PostToolUse consolidated advisory hook
 *
 * Consolidates 5 PostToolUse wildcard (matcher: "") advisory scripts into a
 * single process to reduce process-spawn overhead per tool call:
 *
 *   1. post-tool-metrics-unified.cjs  — metrics, error tracking, anomaly detection
 *   2. context-window-monitor.cjs     — context window usage warnings
 *   3. hook-error-detector.cjs        — stale worktree hook path detection
 *   4. recurring-issue-detector.cjs   — recurring error pattern detection
 *   5. spend-guard-trigger.cjs        — per-session spend ceiling advisory
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

// Sub-module 5: token-governor — spend ceiling check (spend-guard-trigger consolidation)
const { checkSpendCeiling } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'token-governor.cjs')
);

// ─── Invariant checker event accumulator (resets per-process) ────────────────
const invariantEvents = [];

// ─── Sub-function 5 helper: spend-guard-trigger ──────────────────────────────
// Extracted to reduce complexity of main(). Returns advisory string or null.
function runSpendGuard(sessionId) {
  if ((process.env.SPEND_GUARD || '').toLowerCase() === 'off') return null;
  try {
    const spendResult = checkSpendCeiling(sessionId);
    if (!spendResult.downgrade) return null;
    const costStr =
      typeof spendResult.sessionCostUsd === 'number'
        ? `$${spendResult.sessionCostUsd.toFixed(2)}`
        : '(unknown)';
    const ceilingStr =
      typeof spendResult.ceilingUsd === 'number'
        ? `$${spendResult.ceilingUsd.toFixed(2)}`
        : '(unknown)';
    const advisory =
      `[spend-guard] Session cost ${costStr} exceeds ceiling ${ceilingStr}. ` +
      `Downgrading next spawn to haiku. ` +
      `See .claude/context/runtime/spend-guard-override.json`;
    process.stderr.write(`[spend-guard] ADVISORY: ${advisory}\n`);
    return advisory;
  } catch (_err) {
    return null;
  }
}

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

  // ── Sub-function 5: spend-guard-trigger ──────────────────────────────────
  // Checks per-session spend ceiling; emits downgrade-to-haiku advisory when
  // the configured ceiling is reached. Kill switch: SPEND_GUARD=off.
  const spendAdvisory = runSpendGuard(safeInput.session_id || 'default');
  if (spendAdvisory) {
    // Override additionalContext — spend advisory takes precedence
    additionalContext = spendAdvisory;
  }

  // ── Sub-function 7: nyquist-validator (feature-flagged) ───────────────────
  // Validates plan coverage after Write/Edit to plan files.
  if (process.env.NYQUIST_VALIDATION === 'true') {
    try {
      const toolName = safeInput.tool_name || safeInput.tool || '';
      const toolInput = safeInput.tool_input || safeInput.input || {};
      const filePath = toolInput.file_path || toolInput.path || '';
      if ((toolName === 'Write' || toolName === 'Edit') && filePath.includes('/plans/')) {
        const { validateCoverage } = require(
          path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'nyquist-validator.cjs')
        );
        const result = validateCoverage(filePath);
        if (result.coverageScore < 0.5 && result.totalTasks > 0) {
          process.stderr.write(
            `[nyquist-validator] ADVISORY: Plan coverage ${(result.coverageScore * 100).toFixed(0)}% ` +
              `(${result.coveredTasks}/${result.totalTasks} tasks have verify steps). ` +
              `Uncovered: ${result.uncoveredTasks.slice(0, 3).join(', ')}${result.uncoveredTasks.length > 3 ? '...' : ''}\n`
          );
        }
      }
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }
  }

  // ── Sub-function 8: invariant-checker (feature-flagged) ──────────────────
  // Validates tool events against routing invariants (banned tools, TaskUpdate).
  if (process.env.INVARIANT_CHECK === 'true') {
    try {
      const { checkInvariants, BUILT_IN_INVARIANTS } = require(
        path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'invariant-checker.cjs')
      );
      const toolName = safeInput.tool_name || safeInput.tool || '';
      const agentType = safeInput.agent_type || process.env.AGENT_TYPE || '';
      invariantEvents.push({ agent: agentType, tool: toolName, type: 'tool_use' });
      const result = checkInvariants({ events: invariantEvents, invariants: BUILT_IN_INVARIANTS });
      if (!result.passed) {
        for (const v of result.violations) {
          process.stderr.write(`[invariant-checker] ADVISORY: ${v.rule} — ${v.reason}\n`);
        }
      }
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }
  }

  // ── Sub-function 9: task-output-chain capture (feature-flagged) ──────────
  // Captures task outputs from TaskUpdate(completed) metadata for downstream chaining.
  if (process.env.TASK_OUTPUT_CHAIN === 'true') {
    try {
      const toolName = safeInput.tool_name || safeInput.tool || '';
      const toolInput = safeInput.tool_input || safeInput.input || {};
      if (toolName === 'TaskUpdate' && toolInput.status === 'completed' && toolInput.metadata) {
        const taskOutputChain = require(
          path.join(PROJECT_ROOT, '.claude', 'lib', 'orchestration', 'task-output-chain.cjs')
        );
        const taskId = toolInput.taskId || toolInput.task_id || '';
        if (taskId) {
          for (const [key, value] of Object.entries(toolInput.metadata)) {
            taskOutputChain.setTaskOutput(taskId, key, value);
          }
        }
      }
    } catch (_err) {
      // Error in this sub-function must not prevent others from running
    }
  }

  // ─── Output ───────────────────────────────────────────────────────────────
  const output = additionalContext ? { allow: true, additionalContext } : { allow: true };
  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

main();
