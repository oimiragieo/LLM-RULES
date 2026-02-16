#!/usr/bin/env node
/**
 * Unified Write PreToolUse Hook Bundle
 * Consolidates 8 hooks for Edit|Write|NotebookEdit into a single process.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HOOKS = [
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'validation', 'agent-template-contract-validator.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'unified-pre-write-hook.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'evolution', 'evolution-state-guard.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'evolution', 'research-enforcement.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'evolution', 'quality-gate-validator.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'adaptive-quality-gate.cjs'),
];

function runHook(scriptPath, input) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function tryParseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  const { success, data } = safeParseJSON(trimmed, null);
  return success ? data : null;
}

function applyHookOutput(currentInput, hookStdout) {
  const parsed = tryParseJson(hookStdout);
  if (!parsed || !parsed.tool_input || typeof parsed.tool_input !== 'object') {
    return currentInput;
  }

  const parent = tryParseJson(currentInput);
  if (!parent || typeof parent !== 'object') {
    return currentInput;
  }

  parent.tool_input = parsed.tool_input;
  return JSON.stringify(parent);
}

async function main() {
  let currentInput = '';
  try {
    currentInput = require('fs').readFileSync(0, 'utf8');
  } catch (_err) {
    process.exit(0);
  }

  for (const hookPath of HOOKS) {
    const res = runHook(hookPath, currentInput);

    if (res.error) {
      console.error(`[write-pretool-bundle] Failed to run hook: ${hookPath}`);
      console.error(String(res.error.message || res.error));
      process.exit(1);
    }

    if (res.status !== 0) {
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.status || 1);
    }

    currentInput = applyHookOutput(currentInput, res.stdout);
  }

  // Preserve hook chain behavior by returning potentially transformed input.
  process.stdout.write(currentInput);
}

if (require.main === module) {
  main();
}

module.exports = {
  HOOKS,
  tryParseJson,
  applyHookOutput,
  main,
};
