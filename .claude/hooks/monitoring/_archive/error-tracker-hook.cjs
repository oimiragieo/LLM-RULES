#!/usr/bin/env node
/**
 * Error Tracker Hook Wrapper
 *
 * Turns hooks/monitoring/error-tracker.cjs (library-style) into a runnable hook command.
 *
 * Event: PostToolUse
 * Matcher: (wired via .claude/settings.json)
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
} = require('../../lib/utils/hook-input.cjs');

const errorTracker = require('./error-tracker.cjs');

function coerceError(toolOutput) {
  if (!toolOutput) return null;

  // Structured output: { error: { message, name, stack? } }
  if (toolOutput && typeof toolOutput === 'object' && toolOutput.error) {
    const e = toolOutput.error;
    const message =
      (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ||
      (typeof e === 'string' && e) ||
      'Unknown error';
    const err = new Error(message);
    if (e && typeof e === 'object') {
      if (typeof e.name === 'string') err.name = e.name;
      if (typeof e.stack === 'string') err.stack = e.stack;
    }
    return err;
  }

  // String output: heuristic (avoid spamming logs)
  if (typeof toolOutput === 'string') {
    const firstLine = toolOutput.split('\n')[0] || '';
    const looksLikeError =
      firstLine.startsWith('Error:') ||
      firstLine.startsWith('[ERROR]') ||
      firstLine.startsWith('ERROR:') ||
      firstLine.includes('Unhandled error') ||
      firstLine.includes('Unhandled exception');
    if (!looksLikeError) return null;
    return new Error(firstLine.slice(0, 500));
  }

  return null;
}

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const tool = getToolName(hookInput) || 'unknown';
    const params = getToolInput(hookInput) || {};
    const toolOutput = getToolOutput(hookInput);

    const err = coerceError(toolOutput);
    errorTracker.postToolUse(tool, params, { error: err }, { sessionId: hookInput.session_id });
  } catch (_e) {
    // Monitoring must never block tool use
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
