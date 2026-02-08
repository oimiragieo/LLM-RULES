#!/usr/bin/env node
/**
 * Metrics Collector Hook Wrapper
 *
 * Turns hooks/monitoring/metrics-collector.cjs (library-style) into a runnable hook command.
 *
 * Note: Claude Code does not provide a stable cross-process correlation id for
 * PreToolUse/PostToolUse, so this wrapper measures the hook wrapper execution time
 * (not the underlying tool duration).
 *
 * Event: PostToolUse
 * Matcher: (wired via .claude/settings.json)
 *
 * FIX-RS-003: Changed from parseHookInputSync() to parseHookInputAsync() because
 * Claude Code sends hook input via stdin, not argv[2]. The sync version only checks
 * argv[2] and returns null, causing metrics to never be collected.
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
} = require('../../lib/utils/hook-input.cjs');

const metricsCollector = require('./metrics-collector.cjs');

async function main() {
  const startedAt = Date.now();

  try {
    // FIX-RS-003: Use async parsing to read from stdin (where Claude Code sends hook input)
    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const tool = getToolName(hookInput) || 'unknown';
    const params = getToolInput(hookInput) || {};
    const output = getToolOutput(hookInput);

    const result =
      output && typeof output === 'object' && !Array.isArray(output) ? output : { output };

    const context = {
      sessionId: hookInput.session_id,
      _metricsStartTime: startedAt,
    };

    metricsCollector.postToolUse(tool, params, result, context);
  } catch (_e) {
    // Monitoring must never block tool use
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
