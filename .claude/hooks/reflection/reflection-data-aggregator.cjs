#!/usr/bin/env node
/**
 * Reflection Data Aggregator Hook
 * ================================
 *
 * PostToolUse hook on TaskUpdate. When a task completes (status=completed),
 * aggregates tool-call metrics and error data for that task and writes
 * a reflection-data JSON file for downstream reflection-agent consumption.
 *
 * Fail-open: exits 0 on all errors (advisory hook).
 *
 * Trigger: PostToolUse TaskUpdate
 *
 * @module reflection-data-aggregator
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const HOOK_NAME = 'reflection-data-aggregator';

/**
 * Read the last N lines of a file efficiently.
 * Returns an array of non-empty strings.
 */
function readLastLines(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch (_err) {
    return [];
  }
}

/**
 * Parse JSONL lines into objects, skipping malformed lines.
 */
function parseJsonlLines(lines) {
  const results = [];
  for (const line of lines) {
    const parsed = safeParseJSON(line, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      results.push(parsed);
    }
  }
  return results;
}

/**
 * Core processing logic — exported for testability.
 *
 * @param {Object} hookInput - Parsed hook input
 * @param {string} [projectRoot] - Override for project root (testing)
 * @returns {{ written: boolean, reason: string, outputPath?: string }}
 */
function processHookInput(hookInput, projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');

  // Only act on TaskUpdate
  const toolName = getToolName(hookInput);
  if (toolName !== 'TaskUpdate') {
    return { written: false, reason: 'not_taskupdate' };
  }

  const toolInput = getToolInput(hookInput);
  const status = toolInput.status || toolInput.taskStatus;
  if (status !== 'completed') {
    return { written: false, reason: 'not_completed' };
  }

  const taskId = toolInput.taskId || toolInput.task_id || 'unknown';
  const agentType =
    toolInput.owner || toolInput.agentType || toolInput.metadata?.agentType || 'unknown';

  // --- 1. Read hook-metrics.jsonl (last 200 lines), filter by taskId ---
  const hookMetricsPath = path.join(metricsDir, 'hook-metrics.jsonl');
  const hookMetricsLines = readLastLines(hookMetricsPath, 200);
  const hookMetrics = parseJsonlLines(hookMetricsLines);
  const taskMetrics = hookMetrics.filter(m => m.taskId === taskId || m.task_id === taskId);

  // --- 2. Read error-metrics.jsonl (last 50 lines), filter by taskId ---
  const errorMetricsPath = path.join(metricsDir, 'error-metrics.jsonl');
  const errorMetricsLines = readLastLines(errorMetricsPath, 50);
  const errorMetrics = parseJsonlLines(errorMetricsLines);
  const taskErrors = errorMetrics.filter(e => e.taskId === taskId || e.task_id === taskId);

  // --- 3. Aggregate tool calls ---
  const toolBreakdown = Object.create(null);
  for (const m of taskMetrics) {
    const tool = m.tool || m.tool_name || 'unknown';
    toolBreakdown[tool] = (toolBreakdown[tool] || 0) + 1;
  }

  const errorDetails = taskErrors.map(e => ({
    tool: e.tool || e.tool_name || null,
    errorType: e.errorType || e.type || null,
    message: e.message || e.error || null,
    timestamp: e.timestamp || null,
  }));

  // --- 4. Check completion metadata ---
  const metadata = toolInput.metadata || {};
  const hasSummary = Boolean(metadata.summary);
  const hasFilesModified =
    Array.isArray(metadata.filesModified) && metadata.filesModified.length > 0;

  // --- 5. Build aggregated reflection data ---
  const reflectionData = {
    taskId,
    agentType,
    aggregatedAt: new Date().toISOString(),
    toolCalls: {
      total: taskMetrics.length,
      breakdown: toolBreakdown,
    },
    errors: {
      count: taskErrors.length,
      details: errorDetails,
    },
    completionMetadata: {
      hasSummary,
      hasFilesModified,
      summary: metadata.summary || null,
      filesModified: metadata.filesModified || null,
    },
  };

  // --- 6. Write to runtime dir ---
  fs.mkdirSync(runtimeDir, { recursive: true });
  const sanitizedTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = path.join(runtimeDir, `reflection-data-${sanitizedTaskId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(reflectionData, null, 2), 'utf8');

  return { written: true, reason: 'ok', outputPath };
}

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      console.log(formatResult({}));
      process.exit(0);
      return;
    }

    const result = processHookInput(hookInput);
    if (process.env.DEBUG_HOOKS === 'true') {
      debugLog(HOOK_NAME, 'processed', result);
    }

    console.log(formatResult({}));
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG_HOOKS === 'true') {
      debugLog(HOOK_NAME, 'error', err);
    }
    // Fail-open
    console.log(formatResult({}));
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { processHookInput };
