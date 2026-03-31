#!/usr/bin/env node
'use strict';

/**
 * hook-error-detector.cjs — PostToolUse hook
 *
 * Detects MODULE_NOT_FOUND errors that indicate a stale worktree path is
 * cached in the hook resolver. When detected, writes a signal file so the
 * next session startup can trigger a prune + recover cycle.
 *
 * Behaviour:
 * - Reads PostToolUse result from stdin
 * - Checks for MODULE_NOT_FOUND errors referencing .claude/worktrees/ paths
 * - Appends an entry to the session gap log
 * - Writes a signal file (.claude/context/runtime/hook-recovery-needed.txt)
 * - Always exits 0 (fail-open — advisory hook)
 *
 * Registration: settings.json PostToolUse (matcher: "")
 *
 * @module hook-error-detector
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = process.cwd();
const RUNTIME_DIR =
  process.env.HOOK_ERROR_DETECTOR_RUNTIME_DIR ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const GAP_LOG = path.join(RUNTIME_DIR, 'session-gap-log.jsonl');
const SIGNAL_FILE = path.join(RUNTIME_DIR, 'hook-recovery-needed.txt');

function isWorktreeModuleError(text) {
  return (
    typeof text === 'string' &&
    text.includes('MODULE_NOT_FOUND') &&
    text.includes('.claude/worktrees/')
  );
}

function run(input) {
  try {
    const data = safeParseJSON(input, {});
    const errorText =
      (data && data.tool_result && data.tool_result.error) ||
      (data && data.error) ||
      (data && data.stderr) ||
      (data && data.output && data.output.error) ||
      '';

    if (!isWorktreeModuleError(errorText)) {
      process.exit(0);
    }

    // Ensure runtime dir exists
    try {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    } catch (_e) {
      // Non-fatal
    }

    // Append to gap log
    try {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'hook-error',
        agent: 'hook-error-detector',
        description: 'MODULE_NOT_FOUND referencing .claude/worktrees/ — stale hook path detected',
        context: errorText.slice(0, 500),
      });
      fs.appendFileSync(GAP_LOG, entry + '\n', 'utf8');
    } catch (_e) {
      // Non-fatal
    }

    // Write signal file so next session startup triggers recovery
    try {
      fs.writeFileSync(SIGNAL_FILE, new Date().toISOString(), 'utf8');
    } catch (_e) {
      // Non-fatal
    }

    process.stderr.write(
      '[hook-error-detector] Stale worktree hook path detected — recovery signal written\n'
    );
  } catch (_err) {
    // Fail-open: advisory hook must never block
  }

  process.exit(0);
}

/**
 * Process already-parsed hook input without reading stdin or calling process.exit.
 * Exported for use by consolidated bundles.
 *
 * @param {Object} hookInput - Already-parsed hook input object
 */
function processHookInput(hookInput) {
  try {
    const errorText =
      (hookInput && hookInput.tool_result && hookInput.tool_result.error) ||
      (hookInput && hookInput.error) ||
      (hookInput && hookInput.stderr) ||
      (hookInput && hookInput.output && hookInput.output.error) ||
      '';

    if (!isWorktreeModuleError(errorText)) return;

    // Ensure runtime dir exists
    try {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    } catch (_e) {
      // Non-fatal
    }

    // Append to gap log
    try {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'hook-error',
        agent: 'hook-error-detector',
        description: 'MODULE_NOT_FOUND referencing .claude/worktrees/ — stale hook path detected',
        context: errorText.slice(0, 500),
      });
      fs.appendFileSync(GAP_LOG, entry + '\n', 'utf8');
    } catch (_e) {
      // Non-fatal
    }

    // Write signal file so next session startup triggers recovery
    try {
      fs.writeFileSync(SIGNAL_FILE, new Date().toISOString(), 'utf8');
    } catch (_e) {
      // Non-fatal
    }

    process.stderr.write(
      '[hook-error-detector] Stale worktree hook path detected — recovery signal written\n'
    );
  } catch (_err) {
    // Fail-open: advisory hook must never block
  }
}

if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    inputData += chunk;
  });
  process.stdin.on('end', () => {
    run(inputData);
  });
  process.stdin.on('error', () => {
    process.exit(0);
  });
}

module.exports = { run, processHookInput, isWorktreeModuleError };
