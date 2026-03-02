#!/usr/bin/env node
'use strict';

/**
 * Task PreToolUse Orchestrator
 *
 * Runs PreToolUse(Task) hooks in a deterministic order with strict fail-fast policy.
 * Prevents subsequent successful hooks from neutralizing an earlier block decision.
 *
 * Policy:
 * - Fail-Fast: If any hook exits non-zero (block), stop immediately and exit non-zero.
 * - State Preservation: Accumulates tool_input modifications throughout the chain.
 * - Final Output: Emits the final tool_input if modified, otherwise silent (allows original).
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const TASK_HOOKS = [
  '.claude/hooks/routing/spawn-prompt-assembler.cjs',
  '.claude/hooks/routing/pre-task-unified.cjs',
  '.claude/hooks/safety/spawn-prompt-validator.cjs',
  '.claude/hooks/routing/routing-guard.cjs',
];

function stderrLog(message) {
  process.stderr.write(`[task-pretool-orchestrator] ${message}\n`);
}

function runChildHook(hookPath, stdinData) {
  const absPath = path.isAbsolute(hookPath) ? hookPath : path.join(PROJECT_ROOT, hookPath);

  if (!fs.existsSync(absPath)) {
    stderrLog(`CRITICAL: Hook not found: ${hookPath} (resolved to: ${absPath})`);
    return { status: 2, stdout: '', error: new Error(`Hook file missing: ${absPath}`) };
  }

  return cp.spawnSync(process.execPath, [absPath], {
    input: stdinData,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024, // 10MB — prevent hang on large spawn prompt output
  });
}

function main() {
  const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

  let rawStdin = '';
  try {
    rawStdin = fs.readFileSync(0, 'utf8');
  } catch (_err) {
    process.exit(0);
    return;
  }

  if (!rawStdin || !rawStdin.trim()) {
    process.exit(0);
    return;
  }

  const initialHookInput = safeParseJSON(rawStdin);
  if (!initialHookInput || typeof initialHookInput !== 'object') {
    process.exit(0);
    return;
  }

  const currentHookInput = { ...initialHookInput };
  let modified = false;

  for (const hookPath of TASK_HOOKS) {
    const result = runChildHook(hookPath, JSON.stringify(currentHookInput));

    // Forward stderr for visibility
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error) {
      stderrLog(`CRITICAL: Execution error for ${hookPath}: ${result.error.message}`);
      process.exit(2);
      return;
    }

    // NON-ZERO EXIT = BLOCK. Stop everything.
    if ((result.status ?? 0) !== 0) {
      stderrLog(`CRITICAL: Hook ${hookPath} failed or blocked with status ${result.status}`);

      const payload = (result.stdout || '').trim();
      if (payload && payload.startsWith('{')) {
        // Forward the block/deny JSON payload
        process.stdout.write(payload.endsWith('\n') ? payload : payload + '\n');
      }

      process.exit(result.status || 2);
      return;
    }

    // SUCCESS = Check for tool_input modification
    if (result.stdout && result.stdout.trim().startsWith('{')) {
      const output = safeParseJSON(result.stdout);

      // If hook returned a new tool_input, update our state for the next hook
      if (output.tool_input || output.input) {
        currentHookInput.tool_input = output.tool_input || output.input;
        modified = true;
      }
      // If it returned a permissionDecision:allow but no tool_input, we just continue with current state
    }
  }

  // All hooks allowed. Output final tool_input ONLY if it was modified.
  if (modified) {
    process.stdout.write(JSON.stringify({ tool_input: currentHookInput.tool_input }) + '\n');
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}
