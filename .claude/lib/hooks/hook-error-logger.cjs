'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Appends a hook block event to .claude/context/runtime/hook-errors.jsonl
 *
 * Called by all blocking hooks to provide a side-channel log that Claude Code
 * debug logs do NOT capture (they only log the error marker, not the body).
 *
 * This file breaks the P1 observability gap where agents see they were blocked
 * but not WHY, causing blind retries and 26-retry / 19-min stall patterns.
 *
 * @param {object} params
 * @param {string} params.hookName  - The name of the hook that blocked (e.g. 'pre-tool-unified')
 * @param {string} params.tool      - The tool that was blocked (e.g. 'Write', 'TaskUpdate', 'Bash')
 * @param {string} params.reason    - Machine/human-readable block reason
 * @param {string} params.hint      - "What to do instead" — breaks the retry loop
 * @param {object} [params.context] - Optional extra context (file path, task ID, command snippet, etc.)
 */
function logHookBlock({ hookName, tool, reason, hint, context = {} }) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      hookName: String(hookName || ''),
      tool: String(tool || ''),
      reason: String(reason || ''),
      hint: String(hint || ''),
      ...context,
    };
    const logPath = path.join(__dirname, '..', '..', 'context', 'runtime', 'hook-errors.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) {
    // Never let logging crash a hook — errors here are silently ignored.
  }
}

module.exports = { logHookBlock };
