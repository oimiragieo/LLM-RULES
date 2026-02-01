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
 */

'use strict';

const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  getToolOutput,
} = require('../../lib/utils/hook-input.cjs');

const metricsCollector = require('./metrics-collector.cjs');

function main() {
  const startedAt = Date.now();

  try {
    const hookInput = parseHookInputSync();
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
