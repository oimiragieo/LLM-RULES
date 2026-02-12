#!/usr/bin/env node
'use strict';

/**
 * UserPromptSubmit orchestrator
 *
 * Runs UserPromptSubmit hooks in a deterministic order to avoid race/ordering
 * issues from multiple parallel command hooks.
 *
 * Policy:
 * - Side-effect hooks should not emit stdout on allow path.
 * - If any child blocks (non-zero exit), forward its stdout block payload and exit non-zero.
 * - On child execution errors, fail-open and continue to next hook.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const HOOK_ORDER = [
  '.claude/hooks/reflection/force-step0-execution.cjs',
  '.claude/hooks/session/state-reset.cjs',
  '.claude/hooks/routing/user-prompt-unified.cjs',
  '.claude/hooks/session/drift-detector.cjs',
];

function stderrLog(message) {
  process.stderr.write(`[user-prompt-orchestrator] ${message}\n`);
}

function runChildHook(hookPath, stdinData) {
  const absPath = path.isAbsolute(hookPath) ? hookPath : path.join(PROJECT_ROOT, hookPath);
  return cp.spawnSync('node', [absPath], {
    input: stdinData,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
}

function main() {
  let stdinData = '';
  try {
    stdinData = fs.readFileSync(0, 'utf8');
  } catch (_err) {
    // No input available; nothing to orchestrate.
    process.exit(0);
    return;
  }

  for (const hookPath of HOOK_ORDER) {
    const result = runChildHook(hookPath, stdinData);

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    // Child process execution failure (not hook block) -> fail-open.
    if (result.error) {
      stderrLog(`child execution failed for ${hookPath}: ${result.error.message}`);
      continue;
    }

    // Non-zero means block/failure. Forward child output and stop.
    if ((result.status ?? 0) !== 0) {
      const payload = (result.stdout || '').trim();
      if (payload.length > 0) {
        process.stdout.write(payload.endsWith('\n') ? payload : payload + '\n');
      } else {
        process.stdout.write(
          JSON.stringify({
            block: true,
            message: `Blocked by ${hookPath} (non-zero exit code ${result.status})`,
          }) + '\n'
        );
      }
      process.exit(result.status || 1);
      return;
    }
  }

  // All hooks allowed.
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { HOOK_ORDER, runChildHook };
